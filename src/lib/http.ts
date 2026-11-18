export class RobotsDisallowedError extends Error {
  constructor(public url: string) {
    super(`robots.txt disallows ${url}`);
    this.name = 'RobotsDisallowedError';
  }
}

export class HttpBlockedError extends Error {
  constructor(
    public url: string,
    public status: number,
  ) {
    super(`blocked with HTTP ${status}: ${url}`);
    this.name = 'HttpBlockedError';
  }
}

export interface HttpClient {
  get(url: string): Promise<{ status: number; text: string }>;
  /** Number of requests actually sent (robots.txt included). */
  readonly requestCount: number;
}

export type HttpClientOptions = {
  userAgent: string;
  minIntervalMs: number;
  timeoutMs: number;
  maxRetries: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

type RobotsRules = { allow: string[]; disallow: string[] };
const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000;
/** Shorter cache when robots.txt itself failed, so a transient outage doesn't pause a source for a day. */
const ROBOTS_ERROR_TTL_MS = 60 * 60 * 1000;
const MAX_REDIRECTS = 3;
/** "Stop asking": 403/429, plus fmkorea's non-standard 430 (too many requests). Never retried. */
const BLOCKED_STATUSES = new Set([403, 429, 430]);

/** Minimal robots.txt parser: groups for `*` and our UA token, Allow/Disallow prefixes. */
export function parseRobots(body: string, userAgent: string): RobotsRules {
  const token = userAgent.split('/')[0].toLowerCase();
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === 'allow' && value) current.allow.push(value);
    if (field === 'disallow' && value) current.disallow.push(value);
  }
  const specific = groups.filter((g) => g.agents.includes(token));
  const chosen = specific.length > 0 ? specific : groups.filter((g) => g.agents.includes('*'));
  return { allow: chosen.flatMap((g) => g.allow), disallow: chosen.flatMap((g) => g.disallow) };
}

/** Longest matching rule wins; Allow wins ties. Supports `*` and trailing `$`. */
export function isAllowed(rules: RobotsRules, pathAndQuery: string): boolean {
  const longest = (patterns: string[]) =>
    patterns.filter((p) => matches(p, pathAndQuery)).reduce((m, p) => Math.max(m, p.length), -1);
  const a = longest(rules.allow);
  const d = longest(rules.disallow);
  return d < 0 || a >= d;
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp('^' + body.split('*').map(escapeRe).join('.*') + (anchored ? '$' : ''));
  return re.test(path);
}

function escapeRe(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

/** Charset from Content-Type, else from a <meta> in the first 4KB, else UTF-8 (some Korean sites are EUC-KR). */
async function decodeBody(res: Response): Promise<string> {
  const bytes = new Uint8Array(await res.arrayBuffer());
  const fromHeader = res.headers.get('content-type')?.match(/charset=["']?([\w-]+)/i)?.[1];
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
  const fromMeta = head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  const charset = (fromHeader ?? fromMeta ?? 'utf-8').toLowerCase();
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes); // unknown label
  }
}

/** Shared client for all outbound crawling: robots check, per-host spacing, timeout, retries. */
export function createHttpClient(opts: HttpClientOptions): HttpClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const lastRequestAt = new Map<string, number>();
  const robotsCache = new Map<string, { rules: RobotsRules; expiresAt: number }>();
  let requestCount = 0;

  async function rawGet(url: string, redirect: RequestRedirect = 'manual'): Promise<Response> {
    const host = new URL(url).host;
    const last = lastRequestAt.get(host);
    if (last !== undefined) {
      const wait = last + opts.minIntervalMs - now();
      if (wait > 0) await sleep(wait);
    }
    lastRequestAt.set(host, now());
    requestCount++;
    return fetchImpl(url, {
      headers: { 'user-agent': opts.userAgent },
      signal: AbortSignal.timeout(opts.timeoutMs),
      redirect,
    });
  }

  async function robotsFor(origin: string): Promise<RobotsRules> {
    const cached = robotsCache.get(origin);
    if (cached && now() < cached.expiresAt) return cached.rules;
    const DENY_ALL: RobotsRules = { allow: [], disallow: ['/'] };
    let rules: RobotsRules = { allow: [], disallow: [] };
    let ttl = ROBOTS_TTL_MS;
    try {
      // RFC 9309: follow redirects for robots.txt; 4xx = no rules; 5xx/429/unreachable = assume full disallow.
      const res = await rawGet(`${origin}/robots.txt`, 'follow');
      if (res.status === 200) rules = parseRobots(await res.text(), opts.userAgent);
      else if (res.status === 401 || res.status === 403) rules = DENY_ALL;
      else if (res.status === 429 || res.status >= 500) {
        rules = DENY_ALL;
        ttl = ROBOTS_ERROR_TTL_MS;
      }
    } catch {
      rules = DENY_ALL;
      ttl = ROBOTS_ERROR_TTL_MS;
    }
    robotsCache.set(origin, { rules, expiresAt: now() + ttl });
    return rules;
  }

  return {
    get requestCount() {
      return requestCount;
    },
    async get(url: string) {
      return getChecked(url, 0);
    },
  };

  /** Every hop, including redirect targets, passes the robots.txt check. */
  async function getChecked(url: string, hops: number): Promise<{ status: number; text: string }> {
      const u = new URL(url);
      const rules = await robotsFor(u.origin);
      if (!isAllowed(rules, u.pathname + u.search)) throw new RobotsDisallowedError(url);

      let lastError: unknown;
      for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
        try {
          const res = await rawGet(url);
          if (BLOCKED_STATUSES.has(res.status)) throw new HttpBlockedError(url, res.status);
          const location = res.headers.get('location');
          if (res.status >= 300 && res.status < 400 && location) {
            if (hops >= MAX_REDIRECTS) throw new Error(`too many redirects: ${url}`);
            return getChecked(new URL(location, url).toString(), hops + 1);
          }
          if (res.status >= 500) {
            lastError = new Error(`HTTP ${res.status}: ${url}`);
            continue;
          }
          return { status: res.status, text: await decodeBody(res) };
        } catch (err) {
          if (err instanceof HttpBlockedError || err instanceof RobotsDisallowedError) throw err;
          lastError = err;
        }
      }
      throw lastError;
  }
}
