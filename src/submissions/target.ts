import type { DB } from '../db/client';
import { sources } from '../db/schema';
import { getAdapter } from '../sources/registry';
import { matchDcinside } from '../sources/manual-dcinside';
import { canonicalizeUrl } from '../core/normalize';

export const MAX_URL_LENGTH = 500;

export type SubmissionTarget = {
  sourceId: number;
  sourceKey: string;
  mode: 'auto' | 'manual';
  canonicalUrl: string;
  externalId: string;
};
export type TargetError = { error: 'invalid_url' | 'unsupported_site' };

/** URL-only matchers for sources that accept manual (no-fetch) submissions. */
const MANUAL_MATCHERS: Record<string, (u: URL) => { externalId: string; canonicalUrl: string } | null> = {
  dcinside: matchDcinside,
};

/**
 * Which source a submitted URL belongs to, and how it will be handled. Only URLs of known sources
 * pass, and only their canonical form is ever requested later (no arbitrary fetches → no SSRF).
 */
export async function resolveSubmissionTarget(db: DB, raw: string): Promise<SubmissionTarget | TargetError> {
  if (raw.length > MAX_URL_LENGTH) return { error: 'invalid_url' };
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { error: 'invalid_url' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'invalid_url' };

  for (const s of await db.select().from(sources)) {
    const manual = (s.config as { manualSubmission?: unknown }).manualSubmission === true;
    if (manual && MANUAL_MATCHERS[s.key]) {
      const m = MANUAL_MATCHERS[s.key](url);
      if (m) return { sourceId: s.id, sourceKey: s.key, mode: 'manual', ...m };
      continue;
    }
    if (s.status !== 'ACTIVE' && s.status !== 'DEGRADED') continue;
    let adapter;
    try {
      adapter = getAdapter(s.adapterKey);
    } catch {
      continue; // no adapter (e.g. fixture in production)
    }
    const hit = adapter.matchUrl(url);
    if (!hit) continue;
    const canonicalUrl = adapter.canonicalUrlFor?.(url) ?? canonicalizeUrl(url.toString(), adapter.canonicalRules);
    return { sourceId: s.id, sourceKey: s.key, mode: 'auto', canonicalUrl, externalId: hit.externalId };
  }
  return { error: 'unsupported_site' };
}
