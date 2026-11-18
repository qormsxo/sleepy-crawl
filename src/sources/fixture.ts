import samples from './fixtures/popular.json';
import type { ParsedPost, RawPost, SourceAdapter } from './types';

const HOST = 'fixture.local';

function parse(raw: RawPost): ParsedPost {
  if (!raw.postedAtRaw) return { ...raw, postedAt: null, precision: null };
  const d = new Date(raw.postedAtRaw);
  return Number.isNaN(d.getTime()) ? { ...raw, postedAt: null, precision: null } : { ...raw, postedAt: d, precision: 'exact' };
}

/** Development/demo source backed by hand-written sample posts. Disabled in production (registry). */
export const fixtureAdapter: SourceAdapter = {
  key: 'fixture',
  capabilities: { popular: true, search: false, fetchPost: true },
  canonicalRules: { stripParams: ['ref'] },

  matchUrl(url) {
    if (url.hostname !== HOST) return null;
    const m = url.pathname.match(/^\/p\/([^/]+)$/);
    return m ? { externalId: m[1] } : null;
  },

  async *listPopular() {
    for (const raw of samples as RawPost[]) yield parse(raw);
  },

  async fetchPost(_ctx, ref) {
    const raw = (samples as RawPost[]).find((s) => s.externalId === ref.externalId);
    if (!raw) throw new Error(`fixture post not found: ${ref.externalId}`);
    return parse(raw);
  },
};
