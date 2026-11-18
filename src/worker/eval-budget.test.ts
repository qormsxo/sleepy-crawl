import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../tests/helpers/db';
import { seed } from '@/db/seed';
import { evaluations, posts, promptVersions, settings, sources } from '@/db/schema';
import { evalBudgetResumeAt, kstDayStart } from './eval-budget';

describe('kstDayStart', () => {
  it('returns KST midnight as UTC', () => {
    expect(kstDayStart(new Date('2026-11-18T16:30:00Z')).toISOString()).toBe('2026-11-18T15:00:00.000Z');
  });
});

describe('evalBudgetResumeAt', () => {
  it('returns next KST midnight once the daily limit is reached, null before', async () => {
    const db = await createTestDb();
    await seed(db);
    await db.update(settings).set({ value: 2 }).where(eq(settings.key, 'daily_eval_limit'));
    const [s] = await db.select().from(sources);
    const [pv] = await db.select().from(promptVersions);
    const [p] = await db
      .insert(posts)
      .values({ sourceId: s.id, canonicalUrl: 'https://x/1', sourceTimezone: 'Asia/Seoul', primaryPath: 'POPULAR' })
      .returning();
    const now = new Date('2026-11-18T16:30:00Z');
    const row = { postId: p.id, promptVersionId: pv.id, finalDecision: 'HIDDEN' as const, createdAt: now };

    await db.insert(evaluations).values(row);
    expect(await evalBudgetResumeAt(db, now)).toBeNull();
    await db.insert(evaluations).values(row);
    expect((await evalBudgetResumeAt(db, now))?.toISOString()).toBe('2026-11-19T15:00:00.000Z');
  });
});
