const TRACKING_PARAMS = ['fbclid', 'gclid'];

export type CanonicalRules = { stripParams?: string[]; hostMap?: Record<string, string> };

/** Stable URL used as a duplicate key. */
export function canonicalizeUrl(raw: string, rules: CanonicalRules = {}): string {
  const url = new URL(raw);
  url.hash = '';
  const host = url.hostname.toLowerCase();
  url.hostname = rules.hostMap?.[host] ?? host;

  const strip = new Set([...TRACKING_PARAMS, ...(rules.stripParams ?? [])]);
  const kept = [...url.searchParams.entries()]
    .filter(([k]) => !k.startsWith('utm_') && !strip.has(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = new URLSearchParams(kept).toString();

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  return url.toString();
}

/** Short, single-line excerpt. Never stores more than `max` characters (+ ellipsis). */
export function makePreview(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const chars = Array.from(flat);
  return chars.length <= max ? flat : chars.slice(0, max).join('') + '…';
}
