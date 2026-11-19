import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../tests/helpers/db';
import { seed } from '@/db/seed';
import type { DB } from '@/db/client';
import { evaluations, posts, promptVersions, reevalRequests, sources } from '@/db/schema';
import { crawlSource } from '@/pipeline/crawl';
import { evaluatePost } from '@/pipeline/evaluate';
import { fixtureAdapter } from '@/sources/fixture';
import { createFakeLlm } from '@/llm/fake';
import { DEFAULT_WEIGHTS } from '@/core/constants';
import { createAdmin } from './auth';
import { activateVersion, compareVersions, createVersionFrom, processReevalRequests, requestReeval } from './prompts';

const NOW = new Date('2026-11-19T04:00:00+09:00');
let db: DB;
let adminId: number;
let v1: number;

function evalJson(pct: number) {
  const scores = Object.fromEntries(Object.entries(DEFAULT_WEIGHTS).map(([k, w]) => [k, Math.round((w * pct) / 100)]));
  return {
    is_candidate: true, score: Object.values(scores).reduce((a, b) => a + b, 0), categories: ['ABSURD'], reason: `${pct}점 이유`, scores,
    scores_reason: Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((k) => [k, ''])),
    safety: { is_safe: true, flags: [], uncertain: false }, decision: 'PUBLISH',
  };
}

beforeEach(async () => {
  db = await createTestDb();
  await seed(db);
  adminId = await createAdmin(db, 'admin@example.com', 'correct horse battery');
  [{ id: v1 }] = await db.select({ id: promptVersions.id }).from(promptVersions).where(eq(promptVersions.active, true));
  const [{ id }] = await db.select({ id: sources.id }).from(sources).where(eq(sources.key, 'fixture'));
  await crawlSource(db, id, { adapter: fixtureAdapter, now: NOW, enqueueEval: async () => {} });
});

const postIds = async () => (await db.select({ id: posts.id }).from(posts).orderBy(posts.id)).map((r) => r.id);

describe('createVersionFrom', () => {
  it('copies the base version with edits and starts inactive', async () => {
    const v2 = await createVersionFrom(db, adminId, v1, { name: 'v2', systemPrompt: '새 시스템 프롬프트', thresholds: { publish: 75, review: 55 } });
    const [row] = await db.select().from(promptVersions).where(eq(promptVersions.id, v2));
    expect(row).toMatchObject({ name: 'v2', active: false, systemPrompt: '새 시스템 프롬프트', thresholds: { publish: 75, review: 55 } });
    expect(row.weights).toEqual(DEFAULT_WEIGHTS);
  });

  it('validates weights, thresholds and name', async () => {
    await expect(createVersionFrom(db, adminId, v1, { name: 'bad', weights: { ...DEFAULT_WEIGHTS, humor: -1 } })).rejects.toThrow();
    await expect(createVersionFrom(db, adminId, v1, { name: 'bad', weights: { absurdity: 10 } as never })).rejects.toThrow();
    await expect(createVersionFrom(db, adminId, v1, { name: 'bad', thresholds: { publish: 40, review: 60 } })).rejects.toThrow();
    await expect(createVersionFrom(db, adminId, v1, { name: 'v1' })).rejects.toThrow();
  });
});

describe('activateVersion', () => {
  it('always leaves exactly one active version, even when called concurrently', async () => {
    const v2 = await createVersionFrom(db, adminId, v1, { name: 'v2' });
    const v3 = await createVersionFrom(db, adminId, v1, { name: 'v3' });
    await Promise.allSettled([activateVersion(db, adminId, v2), activateVersion(db, adminId, v3)]);
    const active = await db.select().from(promptVersions).where(eq(promptVersions.active, true));
    expect(active).toHaveLength(1);
    await activateVersion(db, adminId, v1);
    expect((await db.select().from(promptVersions).where(eq(promptVersions.active, true)))[0].id).toBe(v1);
  });
});

describe('re-evaluation', () => {
  it('evaluates with the chosen version without touching post status, then compares', async () => {
    const ids = (await postIds()).slice(0, 3);
    for (const id of ids) await evaluatePost(db, id, { llm: createFakeLlm([evalJson(90)]), adapter: fixtureAdapter, now: NOW });
    const before = await db.select({ id: posts.id, status: posts.status }).from(posts);

    const v2 = await createVersionFrom(db, adminId, v1, { name: 'v2', thresholds: { publish: 95, review: 50 } });
    await requestReeval(db, adminId, v2, { postIds: ids });
    await processReevalRequests(db, { llm: createFakeLlm([evalJson(90)]), now: NOW, adapter: fixtureAdapter, max: 10 });

    expect(await db.select({ id: posts.id, status: posts.status }).from(posts)).toEqual(before);
    const reevals = await db.select().from(evaluations).where(eq(evaluations.purpose, 'REEVAL'));
    expect(reevals).toHaveLength(3);
    expect(reevals.every((e) => e.promptVersionId === v2 && e.finalDecision === 'REVIEW')).toBe(true);
    expect((await db.select().from(reevalRequests))[0].status).toBe('DONE');

    const rows = await compareVersions(db, v1, v2);
    expect(rows).toHaveLength(3);
    // Same answer from the model; only the new threshold (publish ≥ 95) changes the decision.
    expect(rows[0]).toMatchObject({ a: { decision: 'PUBLISHED' }, b: { decision: 'REVIEW' }, changed: true });
    expect(rows[0].a.score).toBe(rows[0].b.score);
  });

  it('re-evaluates admin-decided posts too (comparison only)', async () => {
    const [id] = await postIds();
    await db.update(posts).set({ status: 'HIDDEN', statusSource: 'ADMIN' }).where(eq(posts.id, id));
    await requestReeval(db, adminId, v1, { postIds: [id] });
    await processReevalRequests(db, { llm: createFakeLlm([evalJson(90)]), now: NOW, adapter: fixtureAdapter, max: 10 });
    expect((await db.select().from(posts).where(eq(posts.id, id)))[0].status).toBe('HIDDEN');
    expect(await db.select().from(evaluations).where(eq(evaluations.purpose, 'REEVAL'))).toHaveLength(1);
  });

  it('processes at most `max` posts per call and resumes later', async () => {
    const ids = (await postIds()).slice(0, 5);
    await requestReeval(db, adminId, v1, { postIds: ids });
    await processReevalRequests(db, { llm: createFakeLlm([evalJson(60)]), now: NOW, adapter: fixtureAdapter, max: 2 });
    expect((await db.select().from(reevalRequests))[0]).toMatchObject({ status: 'RUNNING' });
    await processReevalRequests(db, { llm: createFakeLlm([evalJson(60)]), now: NOW, adapter: fixtureAdapter, max: 10 });
    expect((await db.select().from(reevalRequests))[0]).toMatchObject({ status: 'DONE' });
    expect(await db.select().from(evaluations).where(eq(evaluations.purpose, 'REEVAL'))).toHaveLength(5);
  });

  it('picks recent posts when no ids are given, capped', async () => {
    const id = await requestReeval(db, adminId, v1, { recent: 4 });
    const [r] = await db.select().from(reevalRequests).where(eq(reevalRequests.id, id));
    expect(r.postIds).toHaveLength(4);
  });
});

describe('re-evaluation budget (review fix)', () => {
  it('counts re-evaluations against daily_eval_limit too', async () => {
    const { settings } = await import('@/db/schema');
    await db.update(settings).set({ value: 2 }).where(eq(settings.key, 'daily_eval_limit'));
    const ids = (await postIds()).slice(0, 5);
    await requestReeval(db, adminId, v1, { postIds: ids });
    const done = await processReevalRequests(db, { llm: createFakeLlm([evalJson(60)]), now: NOW, adapter: fixtureAdapter, max: 10 });
    expect(done).toBe(2);
    expect(await db.select().from(evaluations).where(eq(evaluations.purpose, 'REEVAL'))).toHaveLength(2);
  });
});
