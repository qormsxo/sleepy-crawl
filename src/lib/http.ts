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

/** Shared client for all outbound crawling: robots check, per-host spacing, timeout, retries. */
export function createHttpClient(opts: HttpClientOptions): HttpClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const lastRequestAt = new Map<string, number>();
  const robotsCache = new Map<string, { rules: RobotsRules; fetchedAt: number }>();
  let requestCount = 0;

  async function rawGet(url: string): Promise<Response> {
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
      redirect: 'follow',
    });
  }

  async function robotsFor(origin: string): Promise<RobotsRules> {
    const cached = robotsCache.get(origin);
    if (cached && now() - cached.fetchedAt < ROBOTS_TTL_MS) return cached.rules;
    let rules: RobotsRules = { allow: [], disallow: [] };
    try {
      const res = await rawGet(`${origin}/robots.txt`);
      if (res.status === 200) rules = parseRobots(await res.text(), opts.userAgent);
      else if (res.status === 401 || res.status === 403) rules = { allow: [], disallow: ['/'] };
    } catch {
      // Unreachable robots.txt: be conservative and refuse the whole host this round.
      rules = { allow: [], disallow: ['/'] };
    }
    robotsCache.set(origin, { rules, fetchedAt: now() });
    return rules;
  }

  return {
    get requestCount() {
      return requestCount;
    },
    async get(url: string) {
      const u = new URL(url);
      const rules = await robotsFor(u.origin);
      if (!isAllowed(rules, u.pathname + u.search)) throw new RobotsDisallowedError(url);

      let lastError: unknown;
      for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
        try {
          const res = await rawGet(url);
          if (res.status === 429 || res.status === 403) throw new HttpBlockedError(url, res.status);
          if (res.status >= 500) {
            lastError = new Error(`HTTP ${res.status}: ${url}`);
            continue;
          }
          return { status: res.status, text: await res.text() };
        } catch (err) {
          if (err instanceof HttpBlockedError) throw err;
          lastError = err;
        }
      }
      throw lastError;
    },
  };
}
