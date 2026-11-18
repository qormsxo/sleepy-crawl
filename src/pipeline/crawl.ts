import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';
import type { DB } from '../db/client';
import { crawlErrors, crawlRuns, keywords, postDiscoveries, posts, seenItems, sources } from '../db/schema';
import { getAdapter } from '../sources/registry';
import type { ParsedPost, SourceAdapter } from '../sources/types';
import { createHttpClient, type HttpClient } from '../lib/http';
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

  const [run] = await db.insert(crawlRuns).values({ sourceId }).returning({ id: crawlRuns.id });
  const result: CrawlResult = { runId: run.id, found: 0, inserted: 0, skippedOutOfWindow: 0, deferred: 0 };
  let errorCount = 0;
  let failure: string | null = null;

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
    const maxDetail = await getSetting(db, 'max_detail_fetches_per_run', 20);
    let detailFetches = 0;

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
          const full = await adapter.fetchPost(ctx, { url: item.url, externalId: item.externalId });
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
        const stored = await storePost(db, { source, adapter, item, now, previewMax, activeKeywords, runId: run.id });
        if (stored === 'out_of_window') {
          result.skippedOutOfWindow++;
          if (item.externalId) {
            await db.insert(seenItems).values({ sourceId: source.id, externalId: item.externalId, outcome: 'out_of_window' }).onConflictDoNothing();
          }
        } else if (stored.isNew) {
          result.inserted++;
          await deps.enqueueEval(stored.postId);
        }
      } catch (err) {
        await recordError('item', errMessage(err), listed.url);
      }
    }
  } catch (err) {
    failure = errMessage(err);
    await recordError(err instanceof Error ? err.name : 'error', failure);
  }

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
    .select({ id: seenItems.externalId })
    .from(seenItems)
    .where(and(eq(seenItems.sourceId, sourceId), eq(seenItems.externalId, externalId)));
  return s ? { kind: 'seen' } : null;
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
