import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../tests/helpers/db';
import { seed } from '@/db/seed';
import type { DB } from '@/db/client';
import { adminAuditLog, crawlRuns, keywords, posts, settings, sources } from '@/db/schema';
import { crawlSource } from '@/pipeline/crawl';
import { fixtureAdapter } from '@/sources/fixture';
import { createAdmin } from './auth';
import { dashboardStats } from './stats';
import { createSource, deleteSource, unpauseSource, updateSource } from './sources';
import { createKeyword, deleteKeyword, updateKeyword } from './keywords';
import { EDITABLE_SETTINGS, updateSettings } from './settings';

const NOW = new Date('2026-11-19T04:00:00+09:00');
let db: DB;
let adminId: number;
const sourceId = async (key: string) => (await db.select({ id: sources.id }).from(sources).where(eq(sources.key, key)))[0].id;

beforeEach(async () => {
  db = await createTestDb();
  await seed(db);
  adminId = await createAdmin(db, 'admin@example.com', 'correct horse battery');
});

describe('dashboardStats', () => {
  it('summarizes counts, per-source, KR/Reddit share, per-path results and recent runs', async () => {
    await crawlSource(db, await sourceId('fixture'), { adapter: fixtureAdapter, now: NOW, enqueueEval: async () => {} });
    const ids = (await db.select({ id: posts.id }).from(posts).orderBy(posts.id)).map((r) => r.id);
    await db.update(posts).set({ status: 'PUBLISHED', score: 80 }).where(eq(posts.id, ids[0]));
    await db.update(posts).set({ status: 'REVIEW', score: 60 }).where(eq(posts.id, ids[1]));
    await db.update(posts).set({ status: 'HIDDEN', score: 20 }).where(eq(posts.id, ids[2]));
    const s = await dashboardStats(db, NOW);
    expect(s.totals).toMatchObject({ collected: 11, published: 1, review: 1, hidden: 1, pending: 8 });
    expect(s.perSource.find((x) => x.key === 'fixture')?.collected).toBe(11);
    expect(s.regionShare).toMatchObject({ krTarget: 80, krActual: 100, globalActual: 0 });
    expect(s.perPath.find((x) => x.path === 'POPULAR')).toMatchObject({ count: 11, avgScore: 53, publishRate: 9 });
    expect(s.recentRuns[0]).toMatchObject({ sourceKey: 'fixture', status: 'SUCCEEDED' });
  });
});

describe('sources', () => {
  it('updates status/interval/config with validation and logs it', async () => {
    const id = await sourceId('inven');
    await updateSource(db, adminId, id, { status: 'DISABLED', intervalOverride: 20, config: { lists: ['https://www.inven.co.kr/board/webzine/2097?my=chu'], maxDetailFetches: 5 } });
    const [s] = await db.select().from(sources).where(eq(sources.id, id));
    expect(s).toMatchObject({ status: 'DISABLED', intervalOverride: 20, config: { maxDetailFetches: 5 } });
    expect(await db.select().from(adminAuditLog)).toHaveLength(1);
  });

  it('rejects an invalid config and keeps the old one', async () => {
    const id = await sourceId('inven');
    const [before] = await db.select().from(sources).where(eq(sources.id, id));
    await expect(updateSource(db, adminId, id, { config: { lists: 'https://x' } as never })).rejects.toThrow();
    await expect(updateSource(db, adminId, id, { config: { lists: ['not a url'] } })).rejects.toThrow();
    await expect(updateSource(db, adminId, id, { config: { maxDetailFetches: -1 } })).rejects.toThrow();
    const [after] = await db.select().from(sources).where(eq(sources.id, id));
    expect(after.config).toEqual(before.config);
  });

  it('creates sources only for adapters that exist in code', async () => {
    await expect(createSource(db, adminId, { key: 'newsite', name: '새 사이트', adapterKey: 'nope' })).rejects.toThrow(/adapter/);
    const id = await createSource(db, adminId, { key: 'ruliweb2', name: '루리웹 두번째', adapterKey: 'ruliweb', config: { lists: ['https://bbs.ruliweb.com/best/humor_only'] } });
    const [s] = await db.select().from(sources).where(eq(sources.id, id));
    expect(s).toMatchObject({ status: 'DISABLED', adapterKey: 'ruliweb' });
  });

  it('deletes only sources without history; otherwise asks to disable', async () => {
    const fresh = await createSource(db, adminId, { key: 'tmp', name: '임시', adapterKey: 'inven', config: { lists: ['https://www.inven.co.kr/board/webzine/2097'] } });
    await deleteSource(db, adminId, fresh);
    expect(await db.select().from(sources).where(eq(sources.id, fresh))).toHaveLength(0);
    const fx = await sourceId('fixture');
    await db.insert(crawlRuns).values({ sourceId: fx });
    await expect(deleteSource(db, adminId, fx)).rejects.toThrow(/disable/);
  });

  it('unpauses a paused source', async () => {
    const id = await sourceId('fmkorea');
    await db.update(sources).set({ pausedUntil: new Date(NOW.getTime() + 3_600_000), consecutiveFailures: 3 }).where(eq(sources.id, id));
    await unpauseSource(db, adminId, id);
    const [s] = await db.select().from(sources).where(eq(sources.id, id));
    expect(s).toMatchObject({ pausedUntil: null, consecutiveFailures: 0 });
  });
});

describe('keywords', () => {
  it('creates, updates and deletes memes; rejects duplicates and bad dates', async () => {
    const id = await createKeyword(db, adminId, { kind: 'MEME', keyword: '럭키비키', aliases: ['원영적 사고'], description: '긍정 회로', startsOn: '2026-11-01', endsOn: '2026-12-31', active: true, priority: 5 });
    await expect(createKeyword(db, adminId, { kind: 'MEME', keyword: '럭키비키' })).rejects.toThrow();
    await expect(createKeyword(db, adminId, { kind: 'MEME', keyword: 'x', startsOn: '2026-12-31', endsOn: '2026-01-01' })).rejects.toThrow(/date/);
    await updateKeyword(db, adminId, id, { active: false });
    expect((await db.select().from(keywords).where(eq(keywords.id, id)))[0]).toMatchObject({ active: false, aliases: ['원영적 사고'] });
    await deleteKeyword(db, adminId, id);
    expect(await db.select().from(keywords).where(eq(keywords.id, id))).toHaveLength(0);
  });
});

describe('settings', () => {
  it('updates only known keys within range', async () => {
    await updateSettings(db, adminId, { crawl_interval_minutes: 15, followup_until_hour: 12 });
    const rows = Object.fromEntries((await db.select().from(settings)).map((r) => [r.key, r.value]));
    expect(rows).toMatchObject({ crawl_interval_minutes: 15, followup_until_hour: 12 });
    await expect(updateSettings(db, adminId, { followup_until_hour: 30 })).rejects.toThrow();
    await expect(updateSettings(db, adminId, { crawl_interval_minutes: 0 })).rejects.toThrow();
    await expect(updateSettings(db, adminId, { hacked: 1 } as never)).rejects.toThrow();
    expect(Object.keys(EDITABLE_SETTINGS)).toContain('max_post_age_hours');
  });
});
