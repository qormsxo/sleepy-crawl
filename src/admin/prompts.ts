import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/client';
import { evaluations, posts, promptVersions, reevalRequests } from '../db/schema';
import { POST_STATUSES, SCORE_KEYS, type PostStatus } from '../core/constants';
import type { LlmClient } from '../llm/types';
import type { SourceAdapter } from '../sources/types';
import { evaluatePost } from '../pipeline/evaluate';
import { evalBudgetResumeAt } from '../worker/eval-budget';
import { audit } from './audit';

const weightsSchema = z
  .object(Object.fromEntries(SCORE_KEYS.map((k) => [k, z.number().int().min(0).max(100)])) as Record<(typeof SCORE_KEYS)[number], z.ZodNumber>)
  .strict()
  .refine((w) => Object.values(w).reduce((a, b) => a + b, 0) > 0, 'weights must not all be zero');
const thresholdsSchema = z
  .object({ publish: z.number().int().min(0).max(100), review: z.number().int().min(0).max(100) })
  .refine((t) => t.publish >= t.review, 'publish threshold must be ≥ review threshold');
const textMap = z.record(z.string(), z.string().max(2000));

const editSchema = z.object({
  name: z.string().trim().min(1).max(50),
  systemPrompt: z.string().min(1).max(20000).optional(),
  evalPrompt: z.string().min(1).max(20000).optional(),
  criteria: textMap.optional(),
  categoryDescriptions: textMap.optional(),
  exclusions: z.string().max(5000).optional(),
  weights: weightsSchema.optional(),
  thresholds: thresholdsSchema.optional(),
});
export type VersionEdits = z.input<typeof editSchema>;

export async function listVersions(db: DB) {
  return db.select().from(promptVersions).orderBy(desc(promptVersions.id));
}

/** New, inactive version: a copy of `baseId` with the given edits. Old versions are never modified. */
export async function createVersionFrom(db: DB, adminId: number, baseId: number, edits: VersionEdits): Promise<number> {
  const e = editSchema.parse(edits);
  const [base] = await db.select().from(promptVersions).where(eq(promptVersions.id, baseId));
  if (!base) throw new Error(`prompt version ${baseId} not found`);
  const [row] = await db
    .insert(promptVersions)
    .values({
      name: e.name,
      systemPrompt: e.systemPrompt ?? base.systemPrompt,
      evalPrompt: e.evalPrompt ?? base.evalPrompt,
      criteria: e.criteria ?? base.criteria,
      categoryDescriptions: e.categoryDescriptions ?? base.categoryDescriptions,
      exclusions: e.exclusions ?? base.exclusions,
      weights: e.weights ?? base.weights,
      thresholds: e.thresholds ?? base.thresholds,
      active: false,
      createdBy: String(adminId),
    })
    .returning({ id: promptVersions.id }); // name is unique
  await audit(db, adminId, 'prompt.create', `prompt:${row.id}`, { base: baseId, name: e.name });
  return row.id;
}

/** Exactly one active version: swap in one transaction (a partial unique index backs this up). */
export async function activateVersion(db: DB, adminId: number, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [target] = await tx.select({ id: promptVersions.id }).from(promptVersions).where(eq(promptVersions.id, id));
    if (!target) throw new Error(`prompt version ${id} not found`);
    await tx.update(promptVersions).set({ active: false }).where(eq(promptVersions.active, true));
    await tx.update(promptVersions).set({ active: true }).where(eq(promptVersions.id, id));
  });
  await audit(db, adminId, 'prompt.activate', `prompt:${id}`, {});
}

export const MAX_REEVAL_POSTS = 200;

/** Queue a comparison run. Picks explicit ids, or the most recent N posts (optionally of one status). */
export async function requestReeval(
  db: DB,
  adminId: number,
  versionId: number,
  pick: { postIds?: number[]; recent?: number; status?: PostStatus },
): Promise<number> {
  let ids = pick.postIds ?? [];
  if (!ids.length) {
    const n = Math.min(Math.max(pick.recent ?? 20, 1), MAX_REEVAL_POSTS);
    const status = pick.status && (POST_STATUSES as readonly string[]).includes(pick.status) ? pick.status : undefined;
    ids = (
      await db
        .select({ id: posts.id })
        .from(posts)
        .where(status ? eq(posts.status, status) : undefined)
        .orderBy(desc(posts.id))
        .limit(n)
    ).map((r) => r.id);
  }
  ids = [...new Set(ids)].slice(0, MAX_REEVAL_POSTS);
  const [row] = await db
    .insert(reevalRequests)
    .values({ promptVersionId: versionId, postIds: ids, createdBy: adminId })
    .returning({ id: reevalRequests.id });
  await audit(db, adminId, 'prompt.reeval', `prompt:${versionId}`, { request: row.id, posts: ids.length });
  return row.id;
}

/** Worker side: evaluate up to `max` posts from pending requests (oldest first), within the daily LLM budget. */
export async function processReevalRequests(
  db: DB,
  /** `adapter` overrides the source's own adapter (tests). */
  deps: { llm: LlmClient; now: Date; max: number; adapter?: SourceAdapter },
): Promise<number> {
  let budget = deps.max;
  const open = await db.select().from(reevalRequests).where(inArray(reevalRequests.status, ['PENDING', 'RUNNING'])).orderBy(reevalRequests.id);
  for (const req of open) {
    const todo = req.postIds.filter((id) => !req.donePostIds.includes(id));
    const done = [...req.donePostIds];
    for (const postId of todo) {
      if (budget <= 0 || (await evalBudgetResumeAt(db, deps.now))) break;
      budget--;
      try {
        await evaluatePost(db, postId, {
          llm: deps.llm,
          now: deps.now,
          promptVersionId: req.promptVersionId,
          purpose: 'REEVAL',
          adapter: deps.adapter,
        });
      } catch {
        // Post gone or source paused: count it as done so one bad post can't stall the request.
      }
      done.push(postId);
    }
    const finished = done.length >= req.postIds.length;
    await db
      .update(reevalRequests)
      .set({ donePostIds: done, status: finished ? 'DONE' : 'RUNNING', finishedAt: finished ? deps.now : null })
      .where(eq(reevalRequests.id, req.id));
    if (budget <= 0) break;
  }
  return deps.max - budget;
}

type Side = { score: number | null; categories: string[] | null; decision: string; reason: string | null };

/** Latest successful evaluation per post under versions a and b, for posts evaluated by both. */
export async function compareVersions(db: DB, a: number, b: number, postIds?: number[]) {
  const rows = await db
    .select({
      postId: evaluations.postId,
      versionId: evaluations.promptVersionId,
      score: evaluations.score,
      categories: evaluations.categories,
      decision: evaluations.finalDecision,
      reason: evaluations.reason,
      title: posts.title,
    })
    .from(evaluations)
    .innerJoin(posts, eq(posts.id, evaluations.postId))
    .where(
      and(
        inArray(evaluations.promptVersionId, [a, b]),
        isNull(evaluations.error),
        postIds?.length ? inArray(evaluations.postId, postIds) : undefined,
      ),
    )
    .orderBy(desc(evaluations.id));
  const byPost = new Map<number, { title: string; a?: Side; b?: Side }>();
  for (const r of rows) {
    const entry = byPost.get(r.postId) ?? { title: r.title };
    const side: Side = { score: r.score, categories: r.categories, decision: r.decision, reason: r.reason };
    if (r.versionId === a && !entry.a) entry.a = side;
    else if (r.versionId === b && !entry.b) entry.b = side;
    byPost.set(r.postId, entry);
  }
  return [...byPost.entries()]
    .filter(([, e]) => e.a && e.b)
    .map(([postId, e]) => ({ postId, title: e.title, a: e.a!, b: e.b!, changed: e.a!.decision !== e.b!.decision }))
    .sort((x, y) => x.postId - y.postId);
}
