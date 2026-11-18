import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../tests/helpers/db';
import { seed } from '@/db/seed';
import type { DB } from '@/db/client';
import { posts, seenItems, settings, sources } from '@/db/schema';
import { crawlSource } from './crawl';
import type { ParsedPost, SourceAdapter } from '@/sources/types';

const NOW = new Date('2026-11-19T10:00:00+09:00');
const IN_WINDOW = new Date('2026-11-19T01:30:00+09:00');
const OUT_OF_WINDOW = new Date('2026-11-18T15:00:00+09:00');

type Item = { id: string; listTime: Date; realTime: Date; needsDetail: boolean; list?: number };

/** Adapter whose list times may be wrong; fetchPost returns the real time. Counts detail fetches. */
function fakeAdapter(items: Item[]) {
  const calls: string[] = [];
  const toPost = (it: Item, at: Date): ParsedPost => ({
    externalId: it.id,
    url: `https://fake.local/p/${it.id}`,
    title: `글 ${it.id}`,
    bodyText: `본문 ${it.id}`,
    postedAtRaw: at.toISOString(),
    postedAt: at,
    precision: it.needsDetail ? 'approximate' : 'minute',
    needsDetail: it.needsDetail,
  });
  const adapter: SourceAdapter = {
    key: 'fake',
    capabilities: { popular: true, search: false, fetchPost: true },
    matchUrl: () => null,
    async *listPopular() {
      for (const it of items) yield toPost(it, it.listTime);
    },
    async fetchPost(_ctx, ref) {
      calls.push(ref.externalId!);
      const it = items.find((x) => x.id === ref.externalId)!;
      return { ...toPost(it, it.realTime), precision: 'exact', needsDetail: false };
    },
  };
  return { adapter, calls };
}

let db: DB;
let sourceId: number;
const enqueueEval = async () => {};

beforeEach(async () => {
  db = await createTestDb();
  await seed(db);
  [{ id: sourceId }] = await db.select({ id: sources.id }).from(sources).where(eq(sources.key, 'fixture'));
});

describe('crawlSource with needsDetail', () => {
  it('decides the window from the post page time, not the list time', async () => {
    // List says 10:00 (out of window) but the post was really written at 01:30.
    const { adapter, calls } = fakeAdapter([{ id: 'a', listTime: NOW, realTime: IN_WINDOW, needsDetail: true }]);
    const r = await crawlSource(db, sourceId, { adapter, now: NOW, enqueueEval });
    expect(calls).toEqual(['a']);
    expect(r.inserted).toBe(1);
    const [p] = await db.select().from(posts).where(eq(posts.externalId, 'a'));
    expect(p.postedAt?.toISOString()).toBe(IN_WINDOW.toISOString());
    expect(p.postedAtPrecision).toBe('exact');
  });

  it('remembers out-of-window posts and never re-opens them', async () => {
    const { adapter, calls } = fakeAdapter([{ id: 'b', listTime: NOW, realTime: OUT_OF_WINDOW, needsDetail: true }]);
    await crawlSource(db, sourceId, { adapter, now: NOW, enqueueEval });
    await crawlSource(db, sourceId, { adapter, now: NOW, enqueueEval });
    expect(calls).toEqual(['b']);
    const seen = await db.select().from(seenItems);
    expect(seen).toMatchObject([{ externalId: 'b', outcome: 'out_of_window' }]);
    expect(await db.select().from(posts)).toHaveLength(0);
  });

  it('does not re-open posts already stored', async () => {
    const { adapter, calls } = fakeAdapter([{ id: 'c', listTime: NOW, realTime: IN_WINDOW, needsDetail: true }]);
    await crawlSource(db, sourceId, { adapter, now: NOW, enqueueEval });
    await crawlSource(db, sourceId, { adapter, now: NOW, enqueueEval });
    expect(calls).toEqual(['c']);
  });

  it('caps detail fetches per run and leaves the rest for the next run', async () => {
    await db.update(settings).set({ value: 2 }).where(eq(settings.key, 'max_detail_fetches_per_run'));
    const items = ['d1', 'd2', 'd3'].map((id) => ({ id, listTime: NOW, realTime: IN_WINDOW, needsDetail: true }));
    const { adapter, calls } = fakeAdapter(items);
    const r1 = await crawlSource(db, sourceId, { adapter, now: NOW, enqueueEval });
    expect(calls).toEqual(['d1', 'd2']);
    expect(r1.inserted).toBe(2);
    const r2 = await crawlSource(db, sourceId, { adapter, now: NOW, enqueueEval });
    expect(calls).toEqual(['d1', 'd2', 'd3']);
    expect(r2.inserted).toBe(1);
  });

  it('skips the page fetch when the list time is trustworthy', async () => {
    const { adapter, calls } = fakeAdapter([{ id: 'e', listTime: IN_WINDOW, realTime: IN_WINDOW, needsDetail: false }]);
    await crawlSource(db, sourceId, { adapter, now: NOW, enqueueEval });
    expect(calls).toEqual([]);
    expect(await db.select().from(posts)).toHaveLength(1);
  });

  it('records trusted out-of-window list items as seen too', async () => {
    const { adapter } = fakeAdapter([{ id: 'f', listTime: OUT_OF_WINDOW, realTime: OUT_OF_WINDOW, needsDetail: false }]);
    await crawlSource(db, sourceId, { adapter, now: NOW, enqueueEval });
    expect(await db.select().from(seenItems)).toMatchObject([{ externalId: 'f', outcome: 'out_of_window' }]);
  });

  it('stores a post listed twice (two boards) once', async () => {
    const { adapter, calls } = fakeAdapter([
      { id: 'g', listTime: NOW, realTime: IN_WINDOW, needsDetail: true },
      { id: 'g', listTime: NOW, realTime: IN_WINDOW, needsDetail: true },
    ]);
    await crawlSource(db, sourceId, { adapter, now: NOW, enqueueEval });
    expect(calls).toEqual(['g']);
    expect(await db.select().from(posts)).toHaveLength(1);
  });

  it('records a failed page fetch as an item error and keeps going', async () => {
    const { adapter } = fakeAdapter([
      { id: 'h', listTime: NOW, realTime: IN_WINDOW, needsDetail: true },
      { id: 'i', listTime: NOW, realTime: IN_WINDOW, needsDetail: true },
    ]);
    const failing: SourceAdapter = {
      ...adapter,
      fetchPost: async (ctx, ref) => (ref.externalId === 'h' ? Promise.reject(new Error('timeout')) : adapter.fetchPost(ctx, ref)),
    };
    const r = await crawlSource(db, sourceId, { adapter: failing, now: NOW, enqueueEval });
    expect(r.inserted).toBe(1);
    // h is retried next run: only a 'failing' attempt counter is kept, not a final 'seen'.
    expect(await db.select().from(seenItems)).toMatchObject([{ externalId: 'h', outcome: 'failing', attempts: 1 }]);
  });
});

describe('per-source page-fetch cap', () => {
  it('uses config.maxDetailFetches over the global setting', async () => {
    await db.update(sources).set({ config: { maxDetailFetches: 1 } }).where(eq(sources.id, sourceId));
    const items = ['p1', 'p2'].map((id) => ({ id, listTime: NOW, realTime: IN_WINDOW, needsDetail: true }));
    const { adapter, calls } = fakeAdapter(items);
    await crawlSource(db, sourceId, { adapter, now: NOW, enqueueEval });
    expect(calls).toEqual(['p1']);
  });
});

describe('permanently failing post pages', () => {
  it('gives up on a post page after 3 failed runs instead of fetching it forever', async () => {
    const { adapter } = fakeAdapter([{ id: 'dead', listTime: NOW, realTime: IN_WINDOW, needsDetail: true }]);
    let fetches = 0;
    const failing: SourceAdapter = { ...adapter, fetchPost: async () => { fetches++; throw new Error('HTTP 404'); } };
    for (let i = 0; i < 5; i++) await crawlSource(db, sourceId, { adapter: failing, now: NOW, enqueueEval });
    expect(fetches).toBe(3);
    expect(await db.select().from(seenItems)).toMatchObject([{ externalId: 'dead', outcome: 'failed' }]);
  });
});

describe('max post age (user decision: 48 hours)', () => {
  // NOW is 2026-11-19 10:00 KST. 01:30 KST on earlier nights:
  const night = (daysBack: number) => new Date(new Date('2026-11-19T01:30:00+09:00').getTime() - daysBack * 86_400_000);

  it('skips night posts older than 48 hours and never re-opens them', async () => {
    const { adapter, calls } = fakeAdapter([
      { id: 'recent', listTime: NOW, realTime: night(1), needsDetail: true }, // 32.5h ago
      { id: 'old', listTime: NOW, realTime: night(3), needsDetail: true }, // 80.5h ago
    ]);
    const r = await crawlSource(db, sourceId, { adapter, now: NOW, enqueueEval });
    expect(r.inserted).toBe(1);
    expect((await db.select().from(posts)).map((p) => p.externalId)).toEqual(['recent']);
    expect(await db.select().from(seenItems)).toMatchObject([{ externalId: 'old', outcome: 'too_old' }]);
    await crawlSource(db, sourceId, { adapter, now: NOW, enqueueEval });
    expect(calls.filter((c) => c === 'old')).toHaveLength(1);
  });

  it('keeps a post written the previous night (within the limit)', async () => {
    const { adapter } = fakeAdapter([{ id: 'edge', listTime: night(1), realTime: night(1), needsDetail: false }]);
    const r = await crawlSource(db, sourceId, { adapter, now: NOW, enqueueEval });
    expect(r.inserted).toBe(1);
  });

  it('applies no age limit when the setting is 0', async () => {
    await db.update(settings).set({ value: 0 }).where(eq(settings.key, 'max_post_age_hours'));
    const { adapter } = fakeAdapter([{ id: 'old', listTime: night(10), realTime: night(10), needsDetail: false }]);
    const r = await crawlSource(db, sourceId, { adapter, now: NOW, enqueueEval });
    expect(r.inserted).toBe(1);
  });

  it('is seeded as 48', async () => {
    const [s] = await db.select().from(settings).where(eq(settings.key, 'max_post_age_hours'));
    expect(s?.value).toBe(48);
  });
});
