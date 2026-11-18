import { and, eq, lt } from 'drizzle-orm';
import type { DB } from '../db/client';
import { posts, submissions } from '../db/schema';

/**
 * Posts still waiting for evaluation long after collection: their job was lost (enqueue failed)
 * or gave up (retries exhausted during an outage or a source pause). The tick re-enqueues them.
 */
export async function findStuckPending(db: DB, now: Date, olderThanMin: number): Promise<number[]> {
  const cutoff = new Date(now.getTime() - olderThanMin * 60_000);
  const rows = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.status, 'PENDING_EVAL'), lt(posts.collectedAt, cutoff)))
    .orderBy(posts.id)
    .limit(200);
  return rows.map((r) => r.id);
}

/** Submissions waiting to be processed, oldest first. */
export async function findReceivedSubmissions(db: DB, limit: number): Promise<number[]> {
  const rows = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(eq(submissions.status, 'RECEIVED'))
    .orderBy(submissions.createdAt)
    .limit(limit);
  return rows.map((r) => r.id);
}
