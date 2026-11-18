import { eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { postDiscoveries, sources, submissions } from '../db/schema';
import { getAdapter } from '../sources/registry';
import type { ParsedPost, SourceAdapter } from '../sources/types';
import type { HttpClient } from '../lib/http';
import type { LlmClient } from '../llm/types';
import { getSetting } from '../lib/settings';
import { defaultHttpClient, loadActiveKeywords, localDate, lookupKnown, markSeen, storePost } from '../pipeline/crawl';
import { evaluatePost } from '../pipeline/evaluate';

export type ProcessDeps = {
  now: Date;
  llm: LlmClient;
  enqueueEval: (postId: number) => Promise<void>;
  http?: HttpClient;
  adapterFor?: (adapterKey: string) => SourceAdapter;
};

type Outcome =
  | { status: 'PROCESSED' | 'DUPLICATE'; postId: number }
  | { status: 'REJECTED'; reason: string };

/**
 * Turn one RECEIVED submission into a post (or a rejection). Same rules as crawling: night window,
 * max age, dedupe. Auto: the source's own page is fetched through the polite HTTP client. Manual:
 * nothing is fetched; the submitter's excerpt is evaluated once and then erased.
 */
export async function processSubmission(db: DB, id: number, deps: ProcessDeps): Promise<void> {
  const [sub] = await db.select().from(submissions).where(eq(submissions.id, id));
  if (!sub || sub.status !== 'RECEIVED' || !sub.sourceId || !sub.externalId || !sub.canonicalUrl) return;
  const [source] = await db.select().from(sources).where(eq(sources.id, sub.sourceId));

  let outcome: Outcome;
  try {
    outcome = sub.mode === 'manual' ? await processManual(db, sub, source, deps) : await processAuto(db, sub, source, deps);
  } finally {
    // The manual excerpt is only kept until this point, whatever happened.
    if (sub.mode === 'manual') await db.update(submissions).set({ manualExcerpt: null }).where(eq(submissions.id, id));
  }

  await db
    .update(submissions)
    .set({
      status: outcome.status,
      processedAt: deps.now,
      ...(outcome.status === 'REJECTED' ? { rejectReason: outcome.reason } : { postId: outcome.postId }),
    })
    .where(eq(submissions.id, id));
}

type Sub = typeof submissions.$inferSelect;
type Source = typeof sources.$inferSelect;

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
  const known = await alreadyKnown(db, sub);
  if (known) return known;

  const adapter = (deps.adapterFor ?? getAdapter)(source.adapterKey);
  const ctx = { http: deps.http ?? defaultHttpClient(), config: source.config, now: deps.now, timezone: source.timezone };
  let page: ParsedPost;
  try {
    page = await adapter.fetchPost(ctx, { url: sub.canonicalUrl!, externalId: sub.externalId });
  } catch {
    return { status: 'REJECTED', reason: 'fetch_failed' };
  }
  if (!page.postedAt) return { status: 'REJECTED', reason: 'no_time' };

  const outcome = await store(db, sub, source, { ...page, externalId: sub.externalId, url: sub.canonicalUrl! }, deps.now, false);
  if (outcome.status === 'PROCESSED') await deps.enqueueEval(outcome.postId);
  return outcome;
}

async function processManual(db: DB, sub: Sub, source: Source, deps: ProcessDeps): Promise<Outcome> {
  const known = await alreadyKnown(db, sub);
  if (known) return known;

  const item: ParsedPost = {
    externalId: sub.externalId,
    url: sub.canonicalUrl!,
    title: sub.manualTitle ?? '',
    bodyText: sub.manualExcerpt ?? '',
    postedAtRaw: sub.manualPostedAt?.toISOString() ?? null,
    postedAt: sub.manualPostedAt,
    precision: 'approximate', // typed by a person, unverifiable
  };
  const outcome = await store(db, sub, source, item, deps.now, true);
  if (outcome.status === 'PROCESSED') {
    // Evaluate now, while the excerpt still exists; it is erased right after.
    await evaluatePost(db, outcome.postId, { llm: deps.llm, now: deps.now, bodyOverride: sub.manualExcerpt ?? '' });
  }
  return outcome;
}
