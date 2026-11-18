import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../tests/helpers/db';
import { seed } from '@/db/seed';
import type { DB } from '@/db/client';
import { crawlErrors, crawlRuns, keywords, postDiscoveries, posts, sources } from '@/db/schema';
import { crawlSource } from './crawl';
import { fixtureAdapter } from '@/sources/fixture';
import type { SourceAdapter } from '@/sources/types';

const NOW = new Date('2026-11-18T19:00:00Z'); // KST 04:00, after the night of 11/18

let db: DB;
let sourceId: number;
let enqueued: number[];
const enqueueEval = async (id: number) => {
  enqueued.push(id);
};

beforeEach(async () => {
  db = await createTestDb();
  await seed(db);
  [{ id: sourceId }] = await db.select({ id: sources.id }).from(sources).where(eq(sources.key, 'fixture'));
  enqueued = [];
});

describe('crawlSource', () => {
  it('stores in-window and unknown-time posts once, skips out-of-window posts', async () => {
    const r = await crawlSource(db, sourceId, { adapter: fixtureAdapter, now: NOW, enqueueEval });
    expect(r.skippedOutOfWindow).toBe(2);
    // 14 samples - 2 out of window - 1 duplicate = 11
    expect(r.inserted).toBe(11);
    expect(await db.select().from(posts)).toHaveLength(11);
    expect(enqueued).toHaveLength(11);

    const [run] = await db.select().from(crawlRuns).where(eq(crawlRuns.id, r.runId));
    expect(run.status).toBe('SUCCEEDED');
    expect(run.newPosts).toBe(11);
  });

  it('records the duplicate as one post with one POPULAR discovery', async () => {
    await crawlSource(db, sourceId, { adapter: fixtureAdapter, now: NOW, enqueueEval });
    const [p] = await db.select().from(posts).where(eq(posts.externalId, '1'));
    expect(p.canonicalUrl).toBe('https://fixture.local/p/1');
    const d = await db.select().from(postDiscoveries).where(eq(postDiscoveries.postId, p.id));
    expect(d).toHaveLength(1);
    expect(d[0].path).toBe('POPULAR');
    expect(p.primaryPath).toBe('POPULAR');
  });

  it('is idempotent across runs', async () => {
    await crawlSource(db, sourceId, { adapter: fixtureAdapter, now: NOW, enqueueEval });
    enqueued = [];
    const r2 = await crawlSource(db, sourceId, { adapter: fixtureAdapter, now: NOW, enqueueEval });
    expect(r2.inserted).toBe(0);
    expect(enqueued).toHaveLength(0);
    expect(await db.select().from(posts)).toHaveLength(11);
    expect(await db.select().from(postDiscoveries)).toHaveLength(11);
  });

  it('stores null time for missing and future timestamps', async () => {
    await crawlSource(db, sourceId, { adapter: fixtureAdapter, now: NOW, enqueueEval });
    for (const id of ['11', '13']) {
      const [p] = await db.select().from(posts).where(eq(posts.externalId, id));
      expect(p.postedAt).toBeNull();
      expect(p.nightDate).toBeNull();
      expect(p.nightHour).toBeNull();
    }
  });

  it('computes night date/hour, preview and keyword matches', async () => {
    await crawlSource(db, sourceId, { adapter: fixtureAdapter, now: NOW, enqueueEval });
    const [p4] = await db.select().from(posts).where(eq(posts.externalId, '4'));
    expect(p4.nightDate).toBe('2026-11-18');
    expect(p4.nightHour).toBe(23);
    expect(p4.sourceTimezone).toBe('Asia/Seoul');
    expect(p4.preview.length).toBeGreaterThan(0);
    expect(Array.from(p4.preview).length).toBeLessThanOrEqual(121);
    const [kw] = await db.select().from(keywords).where(eq(keywords.keyword, '잠이 안 온다'));
    expect(p4.matchedKeywords).toContain(kw.id);

    const [p2] = await db.select().from(posts).where(eq(posts.externalId, '2'));
    expect(p2.nightDate).toBe('2026-11-18');
    expect(p2.nightHour).toBe(0);
  });

  it('records adapter failure without throwing', async () => {
    const broken: SourceAdapter = {
      ...fixtureAdapter,
      // eslint-disable-next-line require-yield
      async *listPopular() {
        throw new Error('site down');
      },
    };
    const r = await crawlSource(db, sourceId, { adapter: broken, now: NOW, enqueueEval });
    const [run] = await db.select().from(crawlRuns).where(eq(crawlRuns.id, r.runId));
    expect(run.status).toBe('FAILED');
    const errs = await db.select().from(crawlErrors);
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toContain('site down');
  });

  it('ignores inactive and expired keywords', async () => {
    await db.update(keywords).set({ active: false }).where(eq(keywords.keyword, '잠이 안 온다'));
    await crawlSource(db, sourceId, { adapter: fixtureAdapter, now: NOW, enqueueEval });
    const [p4] = await db.select().from(posts).where(eq(posts.externalId, '4'));
    expect(p4.matchedKeywords).toEqual([]);
  });
});

describe('defaultHttpClient', () => {
  it('is shared per process so robots cache and host spacing apply across calls', async () => {
    const { defaultHttpClient } = await import('./crawl');
    expect(defaultHttpClient()).toBe(defaultHttpClient());
  });
});
