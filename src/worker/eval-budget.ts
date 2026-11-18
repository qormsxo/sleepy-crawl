import { and, count, eq, gte } from 'drizzle-orm';
import type { DB } from '../db/client';
import { evaluations } from '../db/schema';
import { localParts } from '../core/time-window';
import { getSetting } from '../lib/settings';

const KST = 'Asia/Seoul';

/** Start of the current KST calendar day, as a UTC instant. */
export function kstDayStart(now: Date): Date {
  const { y, m, d } = localParts(now, KST);
  return new Date(Date.UTC(y, m - 1, d) - 9 * 60 * 60 * 1000);
}

/** When today's LIVE evaluation count has reached `daily_eval_limit`, the instant evaluation may resume; else null. */
export async function evalBudgetResumeAt(db: DB, now: Date): Promise<Date | null> {
  const limit = await getSetting(db, 'daily_eval_limit', 1000);
  const dayStart = kstDayStart(now);
  const [{ n }] = await db
    .select({ n: count() })
    .from(evaluations)
    .where(and(eq(evaluations.purpose, 'LIVE'), gte(evaluations.createdAt, dayStart)));
  return n >= limit ? new Date(dayStart.getTime() + 24 * 60 * 60 * 1000) : null;
}
