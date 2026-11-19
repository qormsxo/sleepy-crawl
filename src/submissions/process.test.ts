import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../tests/helpers/db';
import { seed } from '@/db/seed';
import type { DB } from '@/db/client';
import { postDiscoveries, posts, seenItems, sources, submissions } from '@/db/schema';
import { processSubmission } from './process';
import { crawlSource } from '@/pipeline/crawl';
import { evaluatePost } from '@/pipeline/evaluate';
import { fixtureAdapter } from '@/sources/fixture';
import type { SourceAdapter } from '@/sources/types';
import type { LlmClient, LlmRequest } from '@/llm/types';
import { DEFAULT_WEIGHTS } from '@/core/constants';

const NOW = new Date('2026-11-19T04:00:00+09:00');

/** A valid evaluation whose sub-scores are each `score`% of their weight. */
function evalJson(score: number) {
  const scores = Object.fromEntries(Object.entries(DEFAULT_WEIGHTS).map(([k, w]) => [k, Math.round((w * score) / 100)]));
  return {
    is_candidate: true, score: Object.values(scores).reduce((a, b) => a + b, 0), categories: ['ABSURD'], reason: '이유',
    scores,
    scores_reason: { absurdity: '', unexpectedness: '', originality: '', late_night_emotion: '', humor: '', shareability: '' },
    safety: { is_safe: true, flags: [], uncertain: false }, decision: 'PUBLISH',
  };
}
/** Records every prompt it sees. Default reply: a high (publishable) score. */
function spyLlm(raw: unknown = evalJson(100)): LlmClient & { seen: LlmRequest[] } {
  const seen: LlmRequest[] = [];
  return { seen, async evaluate(req) { seen.push(req); return { raw, model: 'spy', tokensIn: 0, tokensOut: 0 }; } };
}

let db: DB;
let fixtureId: number;
let dcId: number;
let enqueued: number[];
const enqueueEval = async (id: number) => { enqueued.push(id); };

async function submit(values: Partial<typeof submissions.$inferInsert>) {
  const [row] = await db.insert(submissions).values({ url: 'x', ipHash: 'h', mode: 'auto', ...values }).returning();
  return row.id;
}
const autoSub = (externalId: string) =>
  submit({ url: `https://fixture.local/p/${externalId}`, canonicalUrl: `https://fixture.local/p/${externalId}`, sourceId: fixtureId, externalId, note: '이 글은 100점짜리임' });
const manualSub = (over: Partial<typeof submissions.$inferInsert> = {}) =>
  submit({
    mode: 'manual', sourceId: dcId, externalId: 'board:programming:1', canonicalUrl: 'https://gall.dcinside.com/board/view/?id=programming&no=1',
    manualTitle: '새벽에 쓴 시', manualPostedAt: new Date('2026-11-19T01:30:00+09:00'),
    manualExcerpt: '잠이 안 와서 냉장고 불빛 아래에서 시를 써 봤다. 제목은 계란. 내용도 계란.', ...over,
  });
const sub = async (id: number) => (await db.select().from(submissions).where(eq(submissions.id, id)))[0];

beforeEach(async () => {
  db = await createTestDb();
  await seed(db);
  [{ id: fixtureId }] = await db.select({ id: sources.id }).from(sources).where(eq(sources.key, 'fixture'));
  [{ id: dcId }] = await db.select({ id: sources.id }).from(sources).where(eq(sources.key, 'dcinside'));
  enqueued = [];
});

const deps = (over: Partial<Parameters<typeof processSubmission>[2]> = {}) => ({
  now: NOW, llm: spyLlm(), enqueueEval, adapterFor: () => fixtureAdapter, ...over,
});

describe('processSubmission (auto)', () => {
  it('confirms the page, stores the post as a USER_SUBMISSION and queues evaluation', async () => {
    const id = await autoSub('2');
    await processSubmission(db, id, deps());
    const s = await sub(id);
    expect(s).toMatchObject({ status: 'PROCESSED' });
    const [p] = await db.select().from(posts).where(eq(posts.id, s.postId!));
    expect(p).toMatchObject({ externalId: '2', primaryPath: 'USER_SUBMISSION', status: 'PENDING_EVAL', requiresReview: false });
    expect(enqueued).toEqual([p.id]);
    expect(await db.select().from(postDiscoveries).where(eq(postDiscoveries.postId, p.id))).toMatchObject([{ path: 'USER_SUBMISSION', submissionId: id }]);
  });

  it('links an already collected post instead of creating a new one', async () => {
    await crawlSource(db, fixtureId, { adapter: fixtureAdapter, now: NOW, enqueueEval });
    const before = (await db.select().from(posts)).length;
    const id = await autoSub('2');
    await processSubmission(db, id, deps());
    const s = await sub(id);
    expect(s.status).toBe('DUPLICATE');
    expect((await db.select().from(posts)).length).toBe(before);
    const paths = (await db.select().from(postDiscoveries).where(eq(postDiscoveries.postId, s.postId!))).map((d) => d.path).sort();
    expect(paths).toEqual(['POPULAR', 'USER_SUBMISSION']);
  });

  it.each([
    ['9', NOW, 'out_of_window'], // written 22:59:59
    ['2', new Date(NOW.getTime() + 3 * 86_400_000), 'too_old'],
  ])('rejects post %s (%s → %s) and remembers it', async (externalId, now, reason) => {
    const id = await autoSub(externalId);
    await processSubmission(db, id, deps({ now }));
    expect(await sub(id)).toMatchObject({ status: 'REJECTED', rejectReason: reason });
    expect(await db.select().from(seenItems).where(eq(seenItems.externalId, externalId))).toMatchObject([{ outcome: reason }]);
  });

  it('rejects a post already judged during crawling without fetching it again', async () => {
    await db.insert(seenItems).values({ sourceId: fixtureId, externalId: '2', outcome: 'out_of_window' });
    let fetched = false;
    const spy: SourceAdapter = { ...fixtureAdapter, fetchPost: async (...a) => { fetched = true; return fixtureAdapter.fetchPost(...a); } };
    const id = await autoSub('2');
    await processSubmission(db, id, deps({ adapterFor: () => spy }));
    expect(fetched).toBe(false);
    expect(await sub(id)).toMatchObject({ status: 'REJECTED', rejectReason: 'out_of_window' });
  });

  it('rejects when the page cannot be read', async () => {
    const broken: SourceAdapter = { ...fixtureAdapter, fetchPost: async () => Promise.reject(new Error('HTTP 404')) };
    const id = await autoSub('2');
    await processSubmission(db, id, deps({ adapterFor: () => broken }));
    expect(await sub(id)).toMatchObject({ status: 'REJECTED', rejectReason: 'fetch_failed' });
  });

  it("never puts the submitter's note into the AI prompt", async () => {
    const id = await autoSub('2');
    await processSubmission(db, id, deps());
    const llm = spyLlm();
    await evaluatePost(db, (await sub(id)).postId!, { llm, adapter: fixtureAdapter, now: NOW });
    expect(JSON.stringify(llm.seen)).not.toContain('100점짜리');
  });
});

describe('processSubmission (manual, DCInside)', () => {
  it('never contacts the site, evaluates the typed excerpt, and always sends to review', async () => {
    const id = await manualSub();
    const llm = spyLlm(evalJson(100));
    const adapterFor = () => { throw new Error('manual submissions must not use an adapter'); };
    await processSubmission(db, id, deps({ llm, adapterFor }));
    const s = await sub(id);
    expect(s).toMatchObject({ status: 'PROCESSED', manualExcerpt: null });
    const [p] = await db.select().from(posts).where(eq(posts.id, s.postId!));
    expect(p).toMatchObject({ title: '새벽에 쓴 시', requiresReview: true, status: 'REVIEW', primaryPath: 'USER_SUBMISSION', postedAtPrecision: 'approximate' });
    expect(p.preview).toBe(''); // user decision: nothing typed by the submitter is kept, not even a preview
    expect(llm.seen[0].user).toContain('내용도 계란');
    expect(enqueued).toEqual([]);
  });

  it('rejects a manual time outside the night window', async () => {
    const id = await manualSub({ manualPostedAt: new Date('2026-11-18T15:00:00+09:00') });
    await processSubmission(db, id, deps());
    expect(await sub(id)).toMatchObject({ status: 'REJECTED', rejectReason: 'out_of_window', manualExcerpt: null });
  });

  it('marks a second manual submission of the same post as duplicate', async () => {
    await processSubmission(db, await manualSub(), deps());
    const id2 = await manualSub();
    await processSubmission(db, id2, deps());
    expect(await sub(id2)).toMatchObject({ status: 'DUPLICATE', manualExcerpt: null });
  });
});

describe('processSubmission idempotency', () => {
  it('does nothing for a submission that is not RECEIVED', async () => {
    const id = await autoSub('2');
    await db.update(submissions).set({ status: 'REJECTED', rejectReason: 'x' }).where(eq(submissions.id, id));
    await processSubmission(db, id, deps());
    expect(await sub(id)).toMatchObject({ status: 'REJECTED', rejectReason: 'x' });
  });
});

describe('processSubmission robustness (review fixes)', () => {
  it('rejects an auto submission when the source was disabled after receipt', async () => {
    await db.update(sources).set({ status: 'DISABLED' }).where(eq(sources.id, fixtureId));
    const id = await autoSub('2');
    await processSubmission(db, id, deps());
    expect(await sub(id)).toMatchObject({ status: 'REJECTED', rejectReason: 'source_unavailable' });
  });

  it('waits (stays RECEIVED, no request) while the source is paused', async () => {
    await db.update(sources).set({ pausedUntil: new Date(NOW.getTime() + 60_000) }).where(eq(sources.id, fixtureId));
    let fetched = false;
    const spy: SourceAdapter = { ...fixtureAdapter, fetchPost: async (...a) => { fetched = true; return fixtureAdapter.fetchPost(...a); } };
    const id = await autoSub('2');
    await processSubmission(db, id, deps({ adapterFor: () => spy }));
    expect(fetched).toBe(false);
    expect((await sub(id)).status).toBe('RECEIVED');
  });

  it('pauses the source and keeps the submission when the page is blocked', async () => {
    const { HttpBlockedError } = await import('@/lib/http');
    const blocked: SourceAdapter = { ...fixtureAdapter, fetchPost: async () => Promise.reject(new HttpBlockedError('https://x', 430)) };
    const id = await autoSub('2');
    await processSubmission(db, id, deps({ adapterFor: () => blocked }));
    expect((await sub(id)).status).toBe('RECEIVED');
    const [s] = await db.select().from(sources).where(eq(sources.id, fixtureId));
    expect(s.pausedUntil?.getTime()).toBe(NOW.getTime() + 3_600_000);
  });

  it('leaves a manual submission RECEIVED (excerpt kept) when the daily LLM budget is spent', async () => {
    const { settings } = await import('@/db/schema');
    await db.update(settings).set({ value: 0 }).where(eq(settings.key, 'daily_eval_limit'));
    const llm = spyLlm();
    const id = await manualSub();
    await processSubmission(db, id, deps({ llm }));
    expect(llm.seen).toHaveLength(0);
    expect(await sub(id)).toMatchObject({ status: 'RECEIVED' });
    expect((await sub(id)).manualExcerpt).not.toBeNull();
  });

  it('keeps the excerpt and retries the same post after an LLM outage, then succeeds', async () => {
    const down: LlmClient = { async evaluate() { throw new Error('503'); } };
    const id = await manualSub();
    await processSubmission(db, id, deps({ llm: down }));
    const first = await sub(id);
    expect(first.status).toBe('RECEIVED');
    expect(first.manualExcerpt).not.toBeNull();
    expect(first.postId).not.toBeNull();

    const llm = spyLlm();
    await processSubmission(db, id, deps({ llm }));
    const done = await sub(id);
    expect(done).toMatchObject({ status: 'PROCESSED', postId: first.postId, manualExcerpt: null });
    expect(llm.seen[0].user).toContain('내용도 계란');
    expect(await db.select().from(posts)).toHaveLength(1);
  });

  it('gives up after 3 failed attempts and erases the excerpt', async () => {
    const down: LlmClient = { async evaluate() { throw new Error('503'); } };
    const id = await manualSub();
    for (let i = 0; i < 3; i++) await processSubmission(db, id, deps({ llm: down }));
    expect(await sub(id)).toMatchObject({ status: 'REJECTED', rejectReason: 'processing_failed', manualExcerpt: null });
  });
});
