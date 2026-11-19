import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../tests/helpers/db';
import { seed } from '@/db/seed';
import type { DB } from '@/db/client';
import { adminAuditLog, posts, sources, submissions } from '@/db/schema';
import { crawlSource } from '@/pipeline/crawl';
import { evaluatePost } from '@/pipeline/evaluate';
import { fixtureAdapter } from '@/sources/fixture';
import { createFakeLlm } from '@/llm/fake';
import { createAdmin } from './auth';
import { listPosts, postDetail, updatePost } from './posts';
import { listSubmissions } from './submissions';

const NOW = new Date('2026-11-19T04:00:00+09:00');
let db: DB;
let adminId: number;

beforeEach(async () => {
  db = await createTestDb();
  await seed(db);
  adminId = await createAdmin(db, 'admin@example.com', 'correct horse battery');
  const [{ id }] = await db.select({ id: sources.id }).from(sources).where(eq(sources.key, 'fixture'));
  await crawlSource(db, id, { adapter: fixtureAdapter, now: NOW, enqueueEval: async () => {} });
});

const firstId = async () => (await db.select({ id: posts.id }).from(posts).orderBy(posts.id))[0].id;

describe('listPosts', () => {
  it('filters by status, newest first, with source names', async () => {
    const id = await firstId();
    await db.update(posts).set({ status: 'REVIEW' }).where(eq(posts.id, id));
    const { items } = await listPosts(db, { status: 'REVIEW' });
    expect(items.map((p) => p.id)).toEqual([id]);
    expect(items[0].sourceName).toBe('샘플 커뮤니티');
    expect((await listPosts(db, {})).items.length).toBeGreaterThan(5);
  });
});

describe('updatePost', () => {
  it('publishes with ADMIN source, sets publishedAt, and logs the change', async () => {
    const id = await firstId();
    await updatePost(db, adminId, id, { status: 'PUBLISHED', score: 88, categories: ['MEME'] }, NOW);
    const [p] = await db.select().from(posts).where(eq(posts.id, id));
    expect(p).toMatchObject({ status: 'PUBLISHED', statusSource: 'ADMIN', score: 88, categories: ['MEME'] });
    expect(p.publishedAt?.toISOString()).toBe(NOW.toISOString());
    const [log] = await db.select().from(adminAuditLog);
    expect(log).toMatchObject({ adminId, action: 'post.update', target: `post:${id}` });
    expect(log.detail).toMatchObject({ before: { status: 'PENDING_EVAL' }, after: { status: 'PUBLISHED' } });
  });

  it('keeps an existing publishedAt when re-publishing', async () => {
    const id = await firstId();
    const earlier = new Date(NOW.getTime() - 3_600_000);
    await db.update(posts).set({ status: 'PUBLISHED', publishedAt: earlier }).where(eq(posts.id, id));
    await updatePost(db, adminId, id, { status: 'PUBLISHED' }, NOW);
    const [p] = await db.select().from(posts).where(eq(posts.id, id));
    expect(p.publishedAt?.toISOString()).toBe(earlier.toISOString());
  });

  it('a post an admin hid is never changed by later automatic evaluation', async () => {
    const id = await firstId();
    await updatePost(db, adminId, id, { status: 'HIDDEN' }, NOW);
    await evaluatePost(db, id, { llm: createFakeLlm(), adapter: fixtureAdapter, now: NOW });
    const [p] = await db.select().from(posts).where(eq(posts.id, id));
    expect(p).toMatchObject({ status: 'HIDDEN', statusSource: 'ADMIN' });
  });

  it('validates score range and categories', async () => {
    const id = await firstId();
    await expect(updatePost(db, adminId, id, { score: 101 }, NOW)).rejects.toThrow();
    await expect(updatePost(db, adminId, id, { categories: ['FUNNY' as never] }, NOW)).rejects.toThrow();
    await expect(updatePost(db, adminId, id, { status: 'PENDING_EVAL' as never }, NOW)).rejects.toThrow();
  });
});

describe('postDetail', () => {
  it('includes evaluations, discoveries and the submitter note', async () => {
    const id = await firstId();
    await evaluatePost(db, id, { llm: createFakeLlm(), adapter: fixtureAdapter, now: NOW });
    await db.insert(submissions).values({ url: 'u', ipHash: 'secret-hash', mode: 'auto', postId: id, note: '진짜 웃김', status: 'DUPLICATE' });
    const d = await postDetail(db, id);
    expect(d?.evaluations).toHaveLength(1);
    expect(d?.discoveries[0].path).toBe('POPULAR');
    expect(d?.submissions[0].note).toBe('진짜 웃김');
    expect(JSON.stringify(d)).not.toContain('secret-hash');
  });
});

describe('listSubmissions', () => {
  it('filters by status and never exposes the IP hash', async () => {
    await db.insert(submissions).values([
      { url: 'a', ipHash: 'secret-hash', mode: 'auto', status: 'REJECTED', rejectReason: 'out_of_window' },
      { url: 'b', ipHash: 'secret-hash', mode: 'manual', status: 'PROCESSED' },
    ]);
    const all = await listSubmissions(db, {});
    expect(all).toHaveLength(2);
    expect((await listSubmissions(db, { status: 'REJECTED' }))[0]).toMatchObject({ url: 'a', rejectReason: 'out_of_window' });
    expect(JSON.stringify(all)).not.toContain('secret-hash');
  });
});
