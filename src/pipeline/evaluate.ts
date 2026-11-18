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
import { defaultHttpClient } from './crawl';
import { makePreview } from '../core/normalize';
import { getSetting } from '../lib/settings';

export type EvaluateDeps = {
  llm: LlmClient;
  adapter?: SourceAdapter;
  http?: HttpClient;
  now?: Date;
  /** Queue workers set this: an LLM outage is rethrown (post stays PENDING_EVAL) so the job retries with backoff. */
  rethrowLlmErrors?: boolean;
};

/** Evaluate one post with the active prompt version and apply the publish rules. */
export async function evaluatePost(db: DB, postId: number, deps: EvaluateDeps): Promise<PostStatus> {
  const now = deps.now ?? new Date();
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post) throw new Error(`post ${postId} not found`);
  if (post.statusSource === 'ADMIN') return post.status;

  const [prompt] = await db.select().from(promptVersions).where(eq(promptVersions.active, true));
  if (!prompt) throw new Error('no active prompt version');
  const [source] = await db.select().from(sources).where(eq(sources.id, post.sourceId));
  const memes = await db
    .select({ keyword: keywords.keyword, description: keywords.description })
    .from(keywords)
    .where(and(eq(keywords.kind, 'MEME'), eq(keywords.active, true)));

  // Body and comments are fetched transiently and never stored.
  let body = post.preview;
  let fetchedBody: string | null = null;
  let comments: string[] = [];
  try {
    const adapter = deps.adapter ?? getAdapter(source.adapterKey);
    const ctx = { http: deps.http ?? defaultHttpClient(), config: source.config, now, timezone: source.timezone };
    const full = await adapter.fetchPost(ctx, { url: post.canonicalUrl, externalId: post.externalId });
    fetchedBody = full.bodyText ?? null;
    body = full.bodyText ?? body;
    comments = full.comments ?? [];
  } catch {
    // Original unavailable: evaluate from title + preview only.
  }

  // List pages often carry no body: fill the card preview from the page fetched for evaluation.
  const preview =
    post.preview.trim() || (fetchedBody ? makePreview(fetchedBody, await getSetting(db, 'preview_max_chars', 120)) : '');

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
      purpose: 'LIVE',
    })
    .returning({ id: evaluations.id });

  await db
    .update(posts)
    .set({
      status,
      score: ok?.total ?? null,
      categories: ok?.value.categories ?? [],
      preview,
      reason: ok?.value.reason ?? null,
      currentEvaluationId: ev.id,
      publishedAt: status === 'PUBLISHED' ? now : null,
    })
    .where(eq(posts.id, postId));

  return status;
}
