import { and, eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { evaluations, keywords, posts, promptVersions, sources } from '../db/schema';
import type { PostStatus } from '../core/constants';
import { buildPrompt } from '../core/evaluation/prompt';
import { evaluationJsonSchema, type Weights } from '../core/evaluation/schema';
import { validateEvaluation, type ValidationResult } from '../core/evaluation/validate';
import { decideStatus } from '../core/evaluation/decide';
import { getAdapter } from '../sources/registry';
import type { SourceAdapter } from '../sources/types';
import type { HttpClient } from '../lib/http';
import type { LlmClient, LlmResponse } from '../llm/types';
import { defaultHttpClient, PAUSE_AFTER_BLOCK_MS } from './crawl';
import { HttpBlockedError } from '../lib/http';
import { similarGroupKey } from '../core/dedupe';

export class SourcePausedError extends Error {
  constructor(sourceKey: string, until: Date) {
    super(`source ${sourceKey} is paused until ${until.toISOString()}`);
    this.name = 'SourcePausedError';
  }
}
import { makePreview } from '../core/normalize';
import { getSetting } from '../lib/settings';

export type EvaluateDeps = {
  llm: LlmClient;
  adapter?: SourceAdapter;
  http?: HttpClient;
  now?: Date;
  /** Queue workers set this: an LLM outage is rethrown (post stays PENDING_EVAL) so the job retries with backoff. */
  rethrowLlmErrors?: boolean;
  /** Body supplied by a manual submission: the site is never contacted. Used only for this evaluation. */
  bodyOverride?: string;
  /** Evaluate with this prompt version instead of the active one. */
  promptVersionId?: number;
  /** REEVAL: comparison only — records an evaluation, never changes the post (설계 7-8). */
  purpose?: 'LIVE' | 'REEVAL';
};

/** Evaluate one post with the active prompt version and apply the publish rules. */
export async function evaluatePost(db: DB, postId: number, deps: EvaluateDeps): Promise<PostStatus> {
  const now = deps.now ?? new Date();
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post) throw new Error(`post ${postId} not found`);
  const purpose = deps.purpose ?? 'LIVE';
  if (purpose === 'LIVE' && post.statusSource === 'ADMIN') return post.status;

  const [prompt] = await db
    .select()
    .from(promptVersions)
    .where(deps.promptVersionId ? eq(promptVersions.id, deps.promptVersionId) : eq(promptVersions.active, true));
  if (!prompt) throw new Error(deps.promptVersionId ? `prompt version ${deps.promptVersionId} not found` : 'no active prompt version');
  const [source] = await db.select().from(sources).where(eq(sources.id, post.sourceId));
  const memes = await db
    .select({ keyword: keywords.keyword, description: keywords.description })
    .from(keywords)
    .where(and(eq(keywords.kind, 'MEME'), eq(keywords.active, true)));

  // Never touch a host that told us to back off; the queue retries this job later.
  if (deps.bodyOverride === undefined && !(source.config as { manualSubmission?: unknown }).manualSubmission && source.pausedUntil && source.pausedUntil > now) {
    throw new SourcePausedError(source.key, source.pausedUntil);
  }

  // Body and comments are fetched transiently and never stored.
  let body = post.preview;
  let fetchedBody: string | null = null;
  let comments: string[] = [];
  // Sources taking manual submissions (DCInside) must never be requested: their terms forbid crawling.
  const manualOnly = (source.config as { manualSubmission?: unknown }).manualSubmission === true;
  if (deps.bodyOverride !== undefined) {
    fetchedBody = deps.bodyOverride;
    body = deps.bodyOverride;
  } else if (manualOnly) {
    // Re-evaluation without the (erased) excerpt: judge from the stored title and preview only.
  } else try {
    const adapter = deps.adapter ?? getAdapter(source.adapterKey);
    const ctx = { http: deps.http ?? defaultHttpClient(), config: source.config, now, timezone: source.timezone };
    const full = await adapter.fetchPost(ctx, { url: post.canonicalUrl, externalId: post.externalId });
    fetchedBody = full.bodyText ?? null;
    body = full.bodyText ?? body;
    comments = full.comments ?? [];
  } catch (err) {
    if (err instanceof HttpBlockedError) {
      await db
        .update(sources)
        .set({ pausedUntil: new Date(now.getTime() + PAUSE_AFTER_BLOCK_MS) })
        .where(eq(sources.id, source.id));
      throw err; // retry after the pause rather than judging on the title alone
    }
    // Original unavailable (deleted, network error): evaluate from title + preview only.
  }

  // List pages often carry no body: fill the card preview from the page fetched for evaluation.
  // Never for manual-submission sources: the submitter's excerpt must not be kept (user decision 2026-11-19).
  const preview =
    post.preview.trim() ||
    (fetchedBody && !manualOnly ? makePreview(fetchedBody, await getSetting(db, 'preview_max_chars', 120)) : '');

  const { system, user } = buildPrompt(
    prompt,
    { title: post.title, body, comments, communityName: source.name },
    memes.map((m) => ({ keyword: m.keyword, description: m.description ?? '' })),
  );
  const weights = prompt.weights as Weights;

  let response: LlmResponse | null = null;
  let validation: ValidationResult | null = null;
  let error = '';
  let llmError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await deps.llm.evaluate({ system, user, jsonSchema: evaluationJsonSchema() });
      validation = validateEvaluation(response.raw, weights);
      llmError = null;
      if (validation.ok) break;
      error = validation.error;
    } catch (err) {
      llmError = err;
      error = err instanceof Error ? err.message : String(err);
      validation = null;
    }
  }

  if (llmError && deps.rethrowLlmErrors) throw llmError;

  const ok = validation?.ok ? validation : null;
  const status = decideStatus({
    evaluation: ok?.value ?? null,
    total: ok?.total ?? null,
    hasPostedAt: post.postedAt !== null,
    requiresReview: post.requiresReview,
    posted: post.postedAt
      ? { at: post.postedAt, precision: post.postedAtPrecision, timezone: post.sourceTimezone }
      : undefined,
    hasTitleOrPreview: post.title.trim() !== '' || preview !== '',
    thresholds: prompt.thresholds,
  });

  const [ev] = await db
    .insert(evaluations)
    .values({
      postId,
      promptVersionId: prompt.id,
      model: response?.model ?? null,
      isCandidate: ok?.value.is_candidate ?? null,
      score: ok?.total ?? null,
      scores: ok?.value.scores ?? null,
      scoresReason: ok?.value.scores_reason ?? null,
      categories: ok?.value.categories ?? null,
      reason: ok?.value.reason ?? null,
      safety: ok?.value.safety ?? null,
      llmDecision: ok?.value.decision ?? null,
      finalDecision: status,
      rawResponse: response?.raw ?? null,
      error: ok ? null : error,
      warnings: ok?.warnings ?? [],
      tokensIn: response?.tokensIn ?? null,
      tokensOut: response?.tokensOut ?? null,
      purpose,
    })
    .returning({ id: evaluations.id });

  if (purpose === 'REEVAL') return status;

  await db
    .update(posts)
    .set({
      status,
      score: ok?.total ?? null,
      categories: ok?.value.categories ?? [],
      preview,
      // The crawl-time group key may have been built from the title alone (lists carry no body).
      similarGroupId: post.title.trim() || preview ? similarGroupKey(post.title, preview) : null,
      reason: ok?.value.reason ?? null,
      currentEvaluationId: ev.id,
      // Re-evaluating an already published post must not bump it to the top of "latest".
      publishedAt: status === 'PUBLISHED' ? (post.publishedAt ?? now) : null,
    })
    .where(eq(posts.id, postId));

  return status;
}
