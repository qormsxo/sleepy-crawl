import { and, desc, eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/client';
import { evaluations, postDiscoveries, posts, sources, submissions } from '../db/schema';
import { CATEGORIES, type PostStatus } from '../core/constants';
import { audit } from './audit';

export type PostListFilter = { status?: PostStatus; sourceKey?: string; before?: number; limit?: number };

export async function listPosts(db: DB, f: PostListFilter) {
  const conds = [];
  if (f.status) conds.push(eq(posts.status, f.status));
  if (f.sourceKey) conds.push(eq(sources.key, f.sourceKey));
  if (f.before) conds.push(lt(posts.id, f.before));
  const limit = Math.min(f.limit ?? 50, 200);
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      status: posts.status,
      statusSource: posts.statusSource,
      score: posts.score,
      categories: posts.categories,
      postedAt: posts.postedAt,
      timezone: posts.sourceTimezone,
      url: posts.canonicalUrl,
      primaryPath: posts.primaryPath,
      requiresReview: posts.requiresReview,
      sourceName: sources.name,
    })
    .from(posts)
    .innerJoin(sources, eq(sources.id, posts.sourceId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(posts.id))
    .limit(limit + 1);
  return { items: rows.slice(0, limit), next: rows.length > limit ? rows[limit - 1].id : null };
}

/** Everything an admin needs to judge one post. Submitter IP hashes are deliberately left out. */
export async function postDetail(db: DB, id: number) {
  const [post] = await db
    .select({ post: posts, sourceName: sources.name, sourceKey: sources.key })
    .from(posts)
    .innerJoin(sources, eq(sources.id, posts.sourceId))
    .where(eq(posts.id, id));
  if (!post) return null;
  const evals = await db.select().from(evaluations).where(eq(evaluations.postId, id)).orderBy(desc(evaluations.id));
  const discoveries = await db.select().from(postDiscoveries).where(eq(postDiscoveries.postId, id));
  const subs = await db
    .select({ id: submissions.id, note: submissions.note, suggestedCategory: submissions.suggestedCategory, mode: submissions.mode, createdAt: submissions.createdAt })
    .from(submissions)
    .where(eq(submissions.postId, id));
  return { ...post, evaluations: evals, discoveries, submissions: subs };
}

const ADMIN_STATUSES = ['PUBLISHED', 'REVIEW', 'HIDDEN', 'BLOCKED'] as const;
const updateSchema = z.object({
  status: z.enum(ADMIN_STATUSES).optional(),
  score: z.number().int().min(0).max(100).optional(),
  categories: z.array(z.enum(CATEGORIES)).optional(),
});
export type PostUpdate = z.infer<typeof updateSchema>;

/**
 * Manual decision. Marks the post ADMIN so automatic evaluation never overrides it; publishing
 * keeps an earlier publishedAt so re-publishing doesn't bump the post to the top of the feed.
 */
export async function updatePost(db: DB, adminId: number, id: number, input: PostUpdate, now: Date = new Date()): Promise<void> {
  const change = updateSchema.parse(input);
  const [before] = await db.select().from(posts).where(eq(posts.id, id));
  if (!before) throw new Error(`post ${id} not found`);
  const status = change.status ?? before.status;
  // Marking ADMIN freezes automatic evaluation, so it needs an actual decision (not pending/failed).
  if (!(ADMIN_STATUSES as readonly string[]).includes(status)) {
    throw new Error('choose a status (공개/검토 대기/비공개/차단) for a post that has not been judged yet');
  }
  await db
    .update(posts)
    .set({
      ...change,
      statusSource: 'ADMIN',
      publishedAt: status === 'PUBLISHED' ? (before.publishedAt ?? now) : null,
    })
    .where(eq(posts.id, id));
  await audit(db, adminId, 'post.update', `post:${id}`, {
    before: { status: before.status, score: before.score, categories: before.categories },
    after: { status, score: change.score ?? before.score, categories: change.categories ?? before.categories },
  }, now);
}

