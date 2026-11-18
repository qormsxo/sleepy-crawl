import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../tests/helpers/db';
import { seed } from '@/db/seed';
import { posts, sources } from '@/db/schema';
import { findStuckPending } from './stuck';

describe('findStuckPending', () => {
  it('returns PENDING_EVAL posts collected more than N minutes ago', async () => {
    const db = await createTestDb();
    await seed(db);
    const [s] = await db.select().from(sources).where(eq(sources.key, 'fixture'));
    const now = new Date('2026-11-19T10:00:00+09:00');
    const mk = (n: number, minutesAgo: number, status: 'PENDING_EVAL' | 'PUBLISHED') =>
      db.insert(posts).values({
        sourceId: s.id, externalId: String(n), canonicalUrl: `https://x/${n}`, sourceTimezone: 'Asia/Seoul',
        primaryPath: 'POPULAR', status, collectedAt: new Date(now.getTime() - minutesAgo * 60_000),
      }).returning({ id: posts.id });
    const [old] = await mk(1, 30, 'PENDING_EVAL');
    await mk(2, 5, 'PENDING_EVAL');
    await mk(3, 30, 'PUBLISHED');
    expect(await findStuckPending(db, now, 15)).toEqual([old.id]);
  });
});

describe('findReceivedSubmissions', () => {
  it('returns RECEIVED submissions oldest first, at most `limit`', async () => {
    const { submissions } = await import('@/db/schema');
    const { findReceivedSubmissions } = await import('./stuck');
    const db = await createTestDb();
    await seed(db);
    const mk = (status: 'RECEIVED' | 'PROCESSED', minutesAgo: number) =>
      db.insert(submissions).values({ url: 'u', ipHash: 'h', mode: 'auto', status, createdAt: new Date(Date.now() - minutesAgo * 60_000) }).returning({ id: submissions.id });
    const [a] = await mk('RECEIVED', 10);
    const [b] = await mk('RECEIVED', 20);
    await mk('PROCESSED', 30);
    const [c] = await mk('RECEIVED', 5);
    expect(await findReceivedSubmissions(db, 2)).toEqual([b.id, a.id]);
    expect(await findReceivedSubmissions(db, 10)).toEqual([b.id, a.id, c.id]);
  });
});
