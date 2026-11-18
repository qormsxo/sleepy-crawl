import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../tests/helpers/db';
import { seed } from '@/db/seed';
import type { DB } from '@/db/client';
import { evaluations, posts, sources } from '@/db/schema';
import { crawlSource } from './crawl';
import { evaluatePost } from './evaluate';
import { fixtureAdapter } from '@/sources/fixture';
import { createFakeLlm } from '@/llm/fake';

const NOW = new Date('2026-11-18T19:00:00Z');

function goodEval(over: Record<string, unknown> = {}) {
  return {
    is_candidate: true,
    score: 82,
    categories: ['ABSURD', 'OVERTHINKING'],
    reason: '평범한 상황에서 지나치게 비약적인 결론을 내리는 독특한 전개.',
    scores: { absurdity: 23, unexpectedness: 18, originality: 12, late_night_emotion: 10, humor: 11, shareability: 8 },
    scores_reason: { absurdity: 'a', unexpectedness: 'b', originality: 'c', late_night_emotion: 'd', humor: 'e', shareability: 'f' },
    safety: { is_safe: true, flags: [], uncertain: false },
    decision: 'PUBLISH',
    ...over,
  };
}

const high = () =>
  goodEval({
    score: 90,
    scores: { absurdity: 25, unexpectedness: 20, originality: 15, late_night_emotion: 10, humor: 12, shareability: 8 },
  });

let db: DB;
async function postId(externalId: string) {
  const [p] = await db.select({ id: posts.id }).from(posts).where(eq(posts.externalId, externalId));
  return p.id;
}

beforeEach(async () => {
  db = await createTestDb();
  await seed(db);
  const [{ id }] = await db.select({ id: sources.id }).from(sources).where(eq(sources.key, 'fixture'));
  await crawlSource(db, id, { adapter: fixtureAdapter, now: NOW, enqueueEval: async () => {} });
});

describe('evaluatePost', () => {
  it('publishes a valid 82-point evaluation', async () => {
    const id = await postId('1');
    const status = await evaluatePost(db, id, { llm: createFakeLlm([goodEval()]), adapter: fixtureAdapter, now: NOW });
    expect(status).toBe('PUBLISHED');
    const [p] = await db.select().from(posts).where(eq(posts.id, id));
    expect(p.score).toBe(82);
    expect(p.categories).toEqual(['ABSURD', 'OVERTHINKING']);
    expect(p.publishedAt).not.toBeNull();
    const evs = await db.select().from(evaluations).where(eq(evaluations.postId, id));
    expect(evs).toHaveLength(1);
    expect(evs[0].finalDecision).toBe('PUBLISHED');
    expect(evs[0].llmDecision).toBe('PUBLISH');
    expect(p.currentEvaluationId).toBe(evs[0].id);
  });

  it('retries once after a schema violation', async () => {
    const id = await postId('1');
    const llm = createFakeLlm([{ nope: true }, goodEval()]);
    expect(await evaluatePost(db, id, { llm, adapter: fixtureAdapter, now: NOW })).toBe('PUBLISHED');
    expect(llm.calls).toBe(2);
  });

  it('marks EVAL_FAILED after two LLM errors and never publishes', async () => {
    const id = await postId('1');
    const llm = createFakeLlm([new Error('timeout'), new Error('timeout')]);
    expect(await evaluatePost(db, id, { llm, adapter: fixtureAdapter, now: NOW })).toBe('EVAL_FAILED');
    const [e] = await db.select().from(evaluations).where(eq(evaluations.postId, id));
    expect(e.error).toContain('timeout');
    const [p] = await db.select().from(posts).where(eq(posts.id, id));
    expect(p.status).toBe('EVAL_FAILED');
    expect(p.publishedAt).toBeNull();
  });

  it('blocks unsafe posts regardless of score', async () => {
    const id = await postId('1');
    const llm = createFakeLlm([high()].map((e) => ({ ...e, safety: { is_safe: false, flags: ['PERSONAL_INFO'], uncertain: false } })));
    expect(await evaluatePost(db, id, { llm, adapter: fixtureAdapter, now: NOW })).toBe('BLOCKED');
  });

  it('sends unknown-time posts to review even with a high score', async () => {
    const id = await postId('11');
    expect(await evaluatePost(db, id, { llm: createFakeLlm([high()]), adapter: fixtureAdapter, now: NOW })).toBe('REVIEW');
  });

  it('hides posts with neither title nor preview', async () => {
    const id = await postId('12');
    expect(await evaluatePost(db, id, { llm: createFakeLlm([high()]), adapter: fixtureAdapter, now: NOW })).toBe('HIDDEN');
  });

  it('leaves admin-decided posts alone', async () => {
    const id = await postId('1');
    await db.update(posts).set({ status: 'HIDDEN', statusSource: 'ADMIN' }).where(eq(posts.id, id));
    const llm = createFakeLlm([goodEval()]);
    expect(await evaluatePost(db, id, { llm, adapter: fixtureAdapter, now: NOW })).toBe('HIDDEN');
    expect(llm.calls).toBe(0);
  });

  it('still evaluates from title/preview when the body fetch fails', async () => {
    const id = await postId('1');
    const failing = { ...fixtureAdapter, fetchPost: async () => Promise.reject(new Error('gone')) };
    expect(await evaluatePost(db, id, { llm: createFakeLlm([goodEval()]), adapter: failing, now: NOW })).toBe('PUBLISHED');
  });
});

describe('evaluatePost with rethrowLlmErrors', () => {
  it('rethrows LLM outages so the queue can retry, leaving the post pending', async () => {
    const id = await postId('1');
    const llm = createFakeLlm([new Error('503'), new Error('503')]);
    await expect(evaluatePost(db, id, { llm, adapter: fixtureAdapter, now: NOW, rethrowLlmErrors: true })).rejects.toThrow('503');
    const [p] = await db.select().from(posts).where(eq(posts.id, id));
    expect(p.status).toBe('PENDING_EVAL');
    expect(await db.select().from(evaluations).where(eq(evaluations.postId, id))).toHaveLength(0);
  });

  it('still records validation failures as EVAL_FAILED (retrying will not help)', async () => {
    const id = await postId('1');
    const llm = createFakeLlm([{ bad: 1 }, { bad: 2 }]);
    expect(await evaluatePost(db, id, { llm, adapter: fixtureAdapter, now: NOW, rethrowLlmErrors: true })).toBe('EVAL_FAILED');
  });
});

describe('evaluatePost preview backfill', () => {
  it('fills an empty preview from the fetched body (list pages carry no body)', async () => {
    const id = await postId('1');
    await db.update(posts).set({ preview: '' }).where(eq(posts.id, id));
    await evaluatePost(db, id, { llm: createFakeLlm([goodEval()]), adapter: fixtureAdapter, now: NOW });
    const [p] = await db.select().from(posts).where(eq(posts.id, id));
    expect(p.preview).toContain('물 마시러 나왔다가');
    expect(Array.from(p.preview).length).toBeLessThanOrEqual(121);
  });

  it('keeps an existing preview', async () => {
    const id = await postId('1');
    await db.update(posts).set({ preview: '기존 미리보기' }).where(eq(posts.id, id));
    await evaluatePost(db, id, { llm: createFakeLlm([goodEval()]), adapter: fixtureAdapter, now: NOW });
    const [p] = await db.select().from(posts).where(eq(posts.id, id));
    expect(p.preview).toBe('기존 미리보기');
  });
});

describe('evaluatePost re-evaluation', () => {
  it('keeps the original publishedAt when an already published post is evaluated again', async () => {
    const id = await postId('1');
    await evaluatePost(db, id, { llm: createFakeLlm([goodEval()]), adapter: fixtureAdapter, now: NOW });
    const later = new Date(NOW.getTime() + 3 * 60 * 60 * 1000);
    await evaluatePost(db, id, { llm: createFakeLlm([goodEval()]), adapter: fixtureAdapter, now: later });
    const [p] = await db.select().from(posts).where(eq(posts.id, id));
    expect(p.publishedAt?.toISOString()).toBe(NOW.toISOString());
  });
});

describe('evaluatePost and blocked sites', () => {
  it('pauses the source and rethrows when the post page is blocked', async () => {
    const { HttpBlockedError } = await import('@/lib/http');
    const id = await postId('1');
    const blocked = { ...fixtureAdapter, fetchPost: async () => Promise.reject(new HttpBlockedError('https://x/p', 430)) };
    const llm = createFakeLlm([goodEval()]);
    await expect(evaluatePost(db, id, { llm, adapter: blocked, now: NOW })).rejects.toThrow(/430/);
    expect(llm.calls).toBe(0);
    const [s] = await db.select().from(sources).where(eq(sources.key, 'fixture'));
    expect(s.pausedUntil?.getTime()).toBe(NOW.getTime() + 60 * 60 * 1000);
    const [p] = await db.select().from(posts).where(eq(posts.id, id));
    expect(p.status).toBe('PENDING_EVAL');
  });

  it('does not touch a paused source: waits instead of judging on the title alone', async () => {
    const id = await postId('1');
    await db.update(sources).set({ pausedUntil: new Date(NOW.getTime() + 60_000) }).where(eq(sources.key, 'fixture'));
    let fetched = false;
    const spy = { ...fixtureAdapter, fetchPost: async (...a: Parameters<typeof fixtureAdapter.fetchPost>) => { fetched = true; return fixtureAdapter.fetchPost(...a); } };
    await expect(evaluatePost(db, id, { llm: createFakeLlm([goodEval()]), adapter: spy, now: NOW })).rejects.toThrow(/paused/);
    expect(fetched).toBe(false);
  });

  it('recomputes the similar group after filling the preview (titles alone collide)', async () => {
    const id = await postId('1');
    await db.update(posts).set({ preview: '', similarGroupId: 'title-only' }).where(eq(posts.id, id));
    await evaluatePost(db, id, { llm: createFakeLlm([goodEval()]), adapter: fixtureAdapter, now: NOW });
    const [p] = await db.select().from(posts).where(eq(posts.id, id));
    expect(p.similarGroupId).not.toBe('title-only');
  });
});
