import { eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { postDiscoveries, posts, sources, submissions } from '../db/schema';
import { getAdapter } from '../sources/registry';
import type { ParsedPost, SourceAdapter } from '../sources/types';
import { HttpBlockedError, type HttpClient } from '../lib/http';
import type { LlmClient } from '../llm/types';
import { getSetting } from '../lib/settings';
import {
  defaultHttpClient,
  loadActiveKeywords,
  localDate,
  lookupKnown,
  markSeen,
  PAUSE_AFTER_BLOCK_MS,
  storePost,
} from '../pipeline/crawl';
import { evaluatePost } from '../pipeline/evaluate';
import { evalBudgetResumeAt } from '../worker/eval-budget';

export type ProcessDeps = {
  now: Date;
  llm: LlmClient;
  enqueueEval: (postId: number) => Promise<void>;
  http?: HttpClient;
  adapterFor?: (adapterKey: string) => SourceAdapter;
};

/** Manual submissions whose evaluation keeps failing are given up after this many attempts. */
export const MAX_MANUAL_ATTEMPTS = 3;

type Outcome =
  | { status: 'PROCESSED' | 'DUPLICATE'; postId: number }
  | { status: 'REJECTED'; reason: string }
  /** Try again on a later tick (source paused/blocked, LLM budget spent, LLM outage). */
  | { status: 'WAIT' };

type Sub = typeof submissions.$inferSelect;
type Source = typeof sources.$inferSelect;

/**
 * Turn one RECEIVED submission into a post (or a rejection). Same rules as crawling: night window,
 * max age, dedupe. Auto: the source's own page is fetched through the polite HTTP client. Manual:
 * nothing is fetched; the submitter's excerpt is evaluated, then erased once the submission is
 * finished (success, rejection, or giving up).
 */
export async function processSubmission(db: DB, id: number, deps: ProcessDeps): Promise<void> {
  const [sub] = await db.select().from(submissions).where(eq(submissions.id, id));
  if (!sub || sub.status !== 'RECEIVED' || !sub.sourceId || !sub.externalId || !sub.canonicalUrl) return;
  const [source] = await db.select().from(sources).where(eq(sources.id, sub.sourceId));

  const outcome = sub.mode === 'manual' ? await processManual(db, sub, source, deps) : await processAuto(db, sub, source, deps);
  if (outcome.status === 'WAIT') return;

  await db
    .update(submissions)
    .set({
      status: outcome.status,
      processedAt: deps.now,
      manualExcerpt: null,
      ...(outcome.status === 'REJECTED' ? { rejectReason: outcome.reason } : { postId: outcome.postId }),
    })
    .where(eq(submissions.id, id));
}

async function alreadyKnown(db: DB, sub: Sub): Promise<Outcome | null> {
  const known = await lookupKnown(db, sub.sourceId!, sub.externalId!);
  if (known?.kind === 'post') {
    await db
      .insert(postDiscoveries)
      .values({ postId: known.postId, path: 'USER_SUBMISSION', submissionId: sub.id })
      .onConflictDoNothing();
    return { status: 'DUPLICATE', postId: known.postId };
  }
  if (known?.kind === 'seen') return { status: 'REJECTED', reason: known.outcome };
  return null;
}

async function tooOld(db: DB, postedAt: Date | null, now: Date): Promise<boolean> {
  const maxAgeHours = await getSetting(db, 'max_post_age_hours', 48);
  return !!postedAt && maxAgeHours > 0 && postedAt.getTime() < now.getTime() - maxAgeHours * 3_600_000;
}

async function store(db: DB, sub: Sub, source: Source, item: ParsedPost, now: Date, requiresReview: boolean): Promise<Outcome> {
  if (await tooOld(db, item.postedAt, now)) {
    await markSeen(db, source.id, sub.externalId!, 'too_old');
    return { status: 'REJECTED', reason: 'too_old' };
  }
  const stored = await storePost(db, {
    source,
    item,
    now,
    previewMax: await getSetting(db, 'preview_max_chars', 120),
    activeKeywords: await loadActiveKeywords(db, localDate(now, source.timezone)),
    path: 'USER_SUBMISSION',
    submissionId: sub.id,
    requiresReview,
  });
  if (stored === 'out_of_window') {
    await markSeen(db, source.id, sub.externalId!, 'out_of_window');
    return { status: 'REJECTED', reason: 'out_of_window' };
  }
  return { status: stored.isNew ? 'PROCESSED' : 'DUPLICATE', postId: stored.postId };
}

async function processAuto(db: DB, sub: Sub, source: Source, deps: ProcessDeps): Promise<Outcome> {
  // An admin may have disabled the source, or the site may have asked us to back off, since receipt.
  if (source.status !== 'ACTIVE' && source.status !== 'DEGRADED') return { status: 'REJECTED', reason: 'source_unavailable' };
  const known = await alreadyKnown(db, sub);
  if (known) return known;
  if (source.pausedUntil && source.pausedUntil > deps.now) return { status: 'WAIT' };

  const adapter = (deps.adapterFor ?? getAdapter)(source.adapterKey);
  const ctx = { http: deps.http ?? defaultHttpClient(), config: source.config, now: deps.now, timezone: source.timezone };
  let page: ParsedPost;
  try {
    page = await adapter.fetchPost(ctx, { url: sub.canonicalUrl!, externalId: sub.externalId });
  } catch (err) {
    if (err instanceof HttpBlockedError) {
      await db
        .update(sources)
        .set({ pausedUntil: new Date(deps.now.getTime() + PAUSE_AFTER_BLOCK_MS) })
        .where(eq(sources.id, source.id));
      return { status: 'WAIT' };
    }
    return { status: 'REJECTED', reason: 'fetch_failed' };
  }
  if (!page.postedAt) return { status: 'REJECTED', reason: 'no_time' };

  const outcome = await store(db, sub, source, { ...page, externalId: sub.externalId, url: sub.canonicalUrl! }, deps.now, false);
  if (outcome.status === 'PROCESSED') await deps.enqueueEval(outcome.postId);
  return outcome;
}

async function processManual(db: DB, sub: Sub, source: Source, deps: ProcessDeps): Promise<Outcome> {
  // Evaluating spends LLM budget; if today's is used up, keep the excerpt and try tomorrow.
  if (await evalBudgetResumeAt(db, deps.now)) return { status: 'WAIT' };

  let postId: number;
  if (sub.postId) {
    // A previous attempt stored the post but its evaluation failed: retry that post.
    postId = sub.postId;
  } else {
    const known = await alreadyKnown(db, sub);
    if (known) return known;
    const outcome = await store(
      db,
      sub,
      source,
      {
        externalId: sub.externalId,
        url: sub.canonicalUrl!,
        title: sub.manualTitle ?? '',
        bodyText: sub.manualExcerpt ?? '',
        postedAtRaw: sub.manualPostedAt?.toISOString() ?? null,
        postedAt: sub.manualPostedAt,
        precision: 'approximate', // typed by a person, unverifiable
      },
      deps.now,
      true,
    );
    if (outcome.status !== 'PROCESSED') return outcome;
    postId = outcome.postId;
    // Remember the post before evaluating so a retry evaluates it instead of calling it a duplicate.
    await db.update(submissions).set({ postId }).where(eq(submissions.id, sub.id));
  }

  const [post] = await db.select({ status: posts.status }).from(posts).where(eq(posts.id, postId));
  if (post?.status !== 'PENDING_EVAL') return { status: 'PROCESSED', postId };

  try {
    await evaluatePost(db, postId, { llm: deps.llm, now: deps.now, bodyOverride: sub.manualExcerpt ?? '', rethrowLlmErrors: true });
    return { status: 'PROCESSED', postId };
  } catch {
    const attempts = sub.attempts + 1;
    if (attempts >= MAX_MANUAL_ATTEMPTS) return { status: 'REJECTED', reason: 'processing_failed' };
    await db.update(submissions).set({ attempts }).where(eq(submissions.id, sub.id));
    return { status: 'WAIT' };
  }
}
