import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../tests/helpers/db';
import { seed } from '@/db/seed';
import type { DB } from '@/db/client';
import { crawlErrors, crawlRuns, sources } from '@/db/schema';
import { crawlSource } from './crawl';
import { HttpBlockedError } from '@/lib/http';
import { fixtureAdapter } from '@/sources/fixture';
import type { SourceAdapter } from '@/sources/types';

const NOW = new Date('2026-11-19T10:00:00+09:00');
const enqueueEval = async () => {};

let db: DB;
let sourceId: number;
const source = async () => (await db.select().from(sources).where(eq(sources.id, sourceId)))[0];

const emptyAdapter: SourceAdapter = {
  ...fixtureAdapter,
  // eslint-disable-next-line require-yield
  async *listPopular() {},
};
const blockedAdapter: SourceAdapter = {
  ...fixtureAdapter,
  // eslint-disable-next-line require-yield
  async *listPopular() {
    throw new HttpBlockedError('https://ex.com/best', 429);
  },
};

beforeEach(async () => {
  db = await createTestDb();
  await seed(db);
  [{ id: sourceId }] = await db.select({ id: sources.id }).from(sources).where(eq(sources.key, 'fixture'));
});

describe('source protection', () => {
  it('treats an empty list as a failure (site layout probably changed)', async () => {
    const r = await crawlSource(db, sourceId, { adapter: emptyAdapter, now: NOW, enqueueEval });
    const [run] = await db.select().from(crawlRuns).where(eq(crawlRuns.id, r.runId));
    expect(run.status).toBe('FAILED');
    expect((await db.select().from(crawlErrors))[0].kind).toBe('empty_list');
    expect((await source()).consecutiveFailures).toBe(1);
  });

  it('pauses only this source for an hour on 403/429', async () => {
    await crawlSource(db, sourceId, { adapter: blockedAdapter, now: NOW, enqueueEval });
    expect((await source()).pausedUntil?.toISOString()).toBe(new Date(NOW.getTime() + 60 * 60 * 1000).toISOString());
    const [other] = await db.select().from(sources).where(eq(sources.key, 'inven'));
    expect(other.pausedUntil).toBeNull();
  });

  it('stops the run when a post page is blocked', async () => {
    let fetches = 0;
    const adapter: SourceAdapter = {
      ...fixtureAdapter,
      async *listPopular(ctx) {
        for await (const p of fixtureAdapter.listPopular(ctx)) yield { ...p, needsDetail: true };
      },
      async fetchPost() {
        fetches++;
        throw new HttpBlockedError('https://ex.com/p', 403);
      },
    };
    await crawlSource(db, sourceId, { adapter, now: NOW, enqueueEval });
    expect(fetches).toBe(1);
    expect((await source()).pausedUntil).not.toBeNull();
  });

  it('marks the source DEGRADED after 5 consecutive failures and recovers on success', async () => {
    for (let i = 0; i < 5; i++) await crawlSource(db, sourceId, { adapter: emptyAdapter, now: NOW, enqueueEval });
    expect(await source()).toMatchObject({ status: 'DEGRADED', consecutiveFailures: 5 });
    await crawlSource(db, sourceId, { adapter: fixtureAdapter, now: NOW, enqueueEval });
    expect(await source()).toMatchObject({ status: 'ACTIVE', consecutiveFailures: 0 });
  });

  it('does not reactivate a source an admin disabled', async () => {
    await db.update(sources).set({ status: 'DISABLED' }).where(eq(sources.id, sourceId));
    await crawlSource(db, sourceId, { adapter: fixtureAdapter, now: NOW, enqueueEval });
    expect((await source()).status).toBe('DISABLED');
  });
});
