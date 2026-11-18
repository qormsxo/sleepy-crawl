import { and, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import { crawlErrors, crawlRuns, keywords, postDiscoveries, posts, seenItems, sources } from '../db/schema';
import { getAdapter } from '../sources/registry';
import type { ParsedPost, SourceAdapter } from '../sources/types';
import { createHttpClient, HttpBlockedError, type HttpClient } from '../lib/http';
import { getSetting } from '../lib/settings';
import { canonicalizeUrl, makePreview } from '../core/normalize';
import { similarGroupKey } from '../core/dedupe';
import { matchKeywords } from '../core/keywords';
import { isInNightWindow, localParts, nightDate, nightHour } from '../core/time-window';

export const USER_AGENT = 'SleepyCrawlerBot/1.0';

let sharedHttp: HttpClient | null = null;

/** One client per process: robots.txt cache and per-host spacing must span every crawl and evaluation. */
export function defaultHttpClient(): HttpClient {
  sharedHttp ??= createHttpClient({ userAgent: USER_AGENT, minIntervalMs: 3000, timeoutMs: 10_000, maxRetries: 3 });
  return sharedHttp;
}

export type CrawlDeps = {
  adapter?: SourceAdapter;
  http?: HttpClient;
  now?: Date;
  enqueueEval: (postId: number) => Promise<void>;
};

export type CrawlResult = {
  runId: number;
  found: number;
  inserted: number;
  skippedOutOfWindow: number;
  /** needsDetail items left for the next run because the per-run page-fetch cap was reached. */
  deferred: number;
  /** Night posts older than max_post_age_hours (e.g. an old post that only now reached a best list). */
  skippedTooOld: number;
};

function localDate(t: Date, tz: string): string {
  const { y, m, d } = localParts(t, tz);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** One crawl run for one source: list → time filter → normalize → dedupe → store → enqueue evaluation. */
export async function crawlSource(db: DB, sourceId: number, deps: CrawlDeps): Promise<CrawlResult> {
  const now = deps.now ?? new Date();
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId));
  if (!source) throw new Error(`source ${sourceId} not found`);
  const tz = source.timezone;
  const http = deps.http ?? defaultHttpClient();
  // A queued job or a manual run must not reach a host that told us to back off.
  if (source.pausedUntil && source.pausedUntil > now) {
    return { runId: 0, found: 0, inserted: 0, skippedOutOfWindow: 0, deferred: 0, skippedTooOld: 0 };
  }

  const [run] = await db.insert(crawlRuns).values({ sourceId }).returning({ id: crawlRuns.id });
  const result: CrawlResult = { runId: run.id, found: 0, inserted: 0, skippedOutOfWindow: 0, deferred: 0, skippedTooOld: 0 };
  let errorCount = 0;
  let failure: string | null = null;
  let blocked = false;

  const recordError = async (kind: string, message: string, url?: string) => {
    errorCount++;
    await db.insert(crawlErrors).values({ crawlRunId: run.id, sourceId, kind, message, url });
  };

  try {
    const adapter = deps.adapter ?? getAdapter(source.adapterKey);
    const previewMax = await getSetting(db, 'preview_max_chars', 120);
    const today = localDate(now, tz);
    const activeKeywords = await db
      .select()
      .from(keywords)
      .where(
        and(
          eq(keywords.active, true),
          or(isNull(keywords.startsOn), lte(keywords.startsOn, today)),
          or(isNull(keywords.endsOn), gte(keywords.endsOn, today)),
        ),
      );
    const ctx = { http, config: source.config, now, timezone: tz };
    // A source can lower the cap in its config (e.g. a site that throttles post pages hard).
    const configured = (source.config as { maxDetailFetches?: unknown }).maxDetailFetches;
    const maxDetail = typeof configured === 'number' ? configured : await getSetting(db, 'max_detail_fetches_per_run', 20);
    let detailFetches = 0;
    let untimedPages = 0;
    // User decision (2026-11-18): only posts written within the last 48h. 0 = no limit.
    const maxAgeHours = await getSetting(db, 'max_post_age_hours', 48);
    const oldestAllowed = maxAgeHours > 0 ? now.getTime() - maxAgeHours * 3_600_000 : null;

    for await (const listed of adapter.listPopular(ctx)) {
      result.found++;
      try {
        let item = listed;
        const known = item.externalId ? await lookupKnown(db, source.id, item.externalId) : null;
        if (known?.kind === 'seen') continue;
        if (known?.kind === 'post') {
          // Already stored: just note this sighting, never re-open the page.
          await db.insert(postDiscoveries).values({ postId: known.postId, path: 'POPULAR', crawlRunId: run.id }).onConflictDoNothing();
          continue;
        }
        if (item.needsDetail) {
          if (detailFetches >= maxDetail) {
            result.deferred++;
            continue;
          }
          detailFetches++;
          let full;
          try {
            full = await adapter.fetchPost(ctx, { url: item.url, externalId: item.externalId });
          } catch (err) {
            if (err instanceof HttpBlockedError) throw err;
            // Deleted post, disallowed URL, parse error...: give up after a few runs instead of retrying forever.
            if (item.externalId) await notePageFailure(db, source.id, item.externalId);
            throw err;
          }
          if (!full.postedAt) untimedPages++;
          item = {
            ...item,
            title: full.title.trim() || item.title,
            bodyText: full.bodyText ?? item.bodyText,
            postedAtRaw: full.postedAtRaw,
            postedAt: full.postedAt,
            precision: full.precision,
            needsDetail: false,
          };
        }
        if (oldestAllowed !== null && item.postedAt && item.postedAt.getTime() < oldestAllowed) {
          result.skippedTooOld++;
          if (item.externalId) await markSeen(db, source.id, item.externalId, 'too_old');
          continue;
        }
        const stored = await storePost(db, { source, adapter, item, now, previewMax, activeKeywords, runId: run.id });
        if (stored === 'out_of_window') {
          result.skippedOutOfWindow++;
          if (item.externalId) await markSeen(db, source.id, item.externalId, 'out_of_window');
        } else if (stored.isNew) {
          result.inserted++;
          await deps.enqueueEval(stored.postId);
        }
      } catch (err) {
        if (err instanceof HttpBlockedError) throw err; // the site is pushing back: stop this run
        await recordError('item', errMessage(err), listed.url);
      }
    }
    if (detailFetches >= 3 && untimedPages * 2 > detailFetches) {
      // Pages load but their time can't be read: the post page layout probably changed.
      failure = `${untimedPages}/${detailFetches} post pages had no readable time`;
      await recordError('post_layout', failure);
    }
    if (result.found === 0) {
      // A list that used to have posts now parses to nothing: almost always a layout change.
      failure = 'list parsed to 0 posts';
      await recordError('empty_list', failure);
    }
  } catch (err) {
    failure = errMessage(err);
    await recordError(err instanceof Error ? err.name : 'error', failure);
    if (err instanceof HttpBlockedError) blocked = true;
  }

  await updateSourceHealth(db, source, { failed: failure !== null, blocked, now });

  await db
    .update(crawlRuns)
    .set({
      finishedAt: new Date(),
      status: failure ? 'FAILED' : 'SUCCEEDED',
      requestsMade: http.requestCount,
      candidatesFound: result.found,
      newPosts: result.inserted,
      errorCount,
      errorSummary: failure,
    })
    .where(eq(crawlRuns.id, run.id));
  return result;
}

export const PAUSE_AFTER_BLOCK_MS = 60 * 60 * 1000;
export const DEGRADE_AFTER_FAILURES = 5;

/** Failure streaks mark a source DEGRADED; a success heals it. Admin-set statuses are never overridden. */
async function updateSourceHealth(
  db: DB,
  source: typeof sources.$inferSelect,
  r: { failed: boolean; blocked: boolean; now: Date },
): Promise<void> {
  if (!r.failed) {
    await db
      .update(sources)
      .set({ consecutiveFailures: 0, ...(source.status === 'DEGRADED' ? { status: 'ACTIVE' as const } : {}) })
      .where(eq(sources.id, source.id));
    return;
  }
  const failures = source.consecutiveFailures + 1;
  await db
    .update(sources)
    .set({
      consecutiveFailures: failures,
      ...(r.blocked ? { pausedUntil: new Date(r.now.getTime() + PAUSE_AFTER_BLOCK_MS) } : {}),
      ...(failures >= DEGRADE_AFTER_FAILURES && source.status === 'ACTIVE' ? { status: 'DEGRADED' as const } : {}),
    })
    .where(eq(sources.id, source.id));
}

async function lookupKnown(
  db: DB,
  sourceId: number,
  externalId: string,
): Promise<{ kind: 'post'; postId: number } | { kind: 'seen' } | null> {
  const [p] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.sourceId, sourceId), eq(posts.externalId, externalId)));
  if (p) return { kind: 'post', postId: p.id };
  const [s] = await db
    .select({ outcome: seenItems.outcome })
    .from(seenItems)
    .where(and(eq(seenItems.sourceId, sourceId), eq(seenItems.externalId, externalId)));
  return s && s.outcome !== 'failing' ? { kind: 'seen' } : null;
}

/** Remember a judged item so its page is never fetched again (overrides an earlier 'failing' attempt). */
async function markSeen(db: DB, sourceId: number, externalId: string, outcome: 'out_of_window' | 'too_old'): Promise<void> {
  await db
    .insert(seenItems)
    .values({ sourceId, externalId, outcome })
    .onConflictDoUpdate({ target: [seenItems.sourceId, seenItems.externalId], set: { outcome } });
}

export const MAX_PAGE_ATTEMPTS = 3;

/** Count a failed post-page fetch; after MAX_PAGE_ATTEMPTS the item is marked seen ('failed') and never fetched again. */
async function notePageFailure(db: DB, sourceId: number, externalId: string): Promise<void> {
  await db
    .insert(seenItems)
    .values({ sourceId, externalId, outcome: MAX_PAGE_ATTEMPTS <= 1 ? 'failed' : 'failing', attempts: 1 })
    .onConflictDoUpdate({
      target: [seenItems.sourceId, seenItems.externalId],
      set: {
        attempts: sql`${seenItems.attempts} + 1`,
        outcome: sql`case when ${seenItems.attempts} + 1 >= ${MAX_PAGE_ATTEMPTS} then 'failed' else 'failing' end`,
      },
    });
}

type StoreArgs = {
  source: typeof sources.$inferSelect;
  adapter: SourceAdapter;
  item: ParsedPost;
  now: Date;
  previewMax: number;
  activeKeywords: { id: number; keyword: string; aliases: string[] }[];
  runId: number;
};

async function storePost(db: DB, a: StoreArgs): Promise<'out_of_window' | { postId: number; isNew: boolean }> {
  const tz = a.source.timezone;
  const postedAt = a.item.postedAt && a.item.postedAt.getTime() <= a.now.getTime() ? a.item.postedAt : null;
  if (postedAt && !isInNightWindow(postedAt, tz)) return 'out_of_window';

  const canonicalUrl = canonicalizeUrl(a.item.url, a.adapter.canonicalRules);
  const title = a.item.title.trim();
  const preview = makePreview(a.item.bodyText ?? '', a.previewMax);
  const matched = matchKeywords(`${title} ${a.item.bodyText ?? ''}`, a.activeKeywords);

  const inserted = await db
    .insert(posts)
    .values({
      sourceId: a.source.id,
      externalId: a.item.externalId,
      canonicalUrl,
      title,
      preview,
      postedAt,
      postedAtPrecision: postedAt ? a.item.precision : null,
      sourceTimezone: tz,
      nightDate: postedAt ? nightDate(postedAt, tz) : null,
      nightHour: postedAt ? nightHour(postedAt, tz) : null,
      collectedAt: a.now,
      primaryPath: 'POPULAR',
      matchedKeywords: matched,
      similarGroupId: title || preview ? similarGroupKey(title, preview) : null,
      status: 'PENDING_EVAL',
    })
    .onConflictDoNothing()
    .returning({ id: posts.id });

  let postId: number;
  let isNew = true;
  if (inserted.length) {
    postId = inserted[0].id;
  } else {
    isNew = false;
    const byKey = a.item.externalId
      ? and(eq(posts.sourceId, a.source.id), eq(posts.externalId, a.item.externalId))
      : eq(posts.canonicalUrl, canonicalUrl);
    const [existing] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(or(byKey, eq(posts.canonicalUrl, canonicalUrl)));
    postId = existing.id;
  }

  await db.insert(postDiscoveries).values({ postId, path: 'POPULAR', crawlRunId: a.runId }).onConflictDoNothing();
  return { postId, isNew };
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
