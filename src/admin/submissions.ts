import { desc, eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { sources, submissions } from '../db/schema';

type SubmissionStatus = (typeof submissions.$inferSelect)['status'];

/** Submissions for review. The IP hash is never selected. */
export async function listSubmissions(db: DB, f: { status?: SubmissionStatus; limit?: number }) {
  return db
    .select({
      id: submissions.id,
      url: submissions.url,
      sourceName: sources.name,
      mode: submissions.mode,
      note: submissions.note,
      suggestedCategory: submissions.suggestedCategory,
      manualTitle: submissions.manualTitle,
      manualPostedAt: submissions.manualPostedAt,
      status: submissions.status,
      rejectReason: submissions.rejectReason,
      postId: submissions.postId,
      createdAt: submissions.createdAt,
      processedAt: submissions.processedAt,
    })
    .from(submissions)
    .leftJoin(sources, eq(sources.id, submissions.sourceId))
    .where(f.status ? eq(submissions.status, f.status) : undefined)
    .orderBy(desc(submissions.id))
    .limit(Math.min(f.limit ?? 100, 500));
}
