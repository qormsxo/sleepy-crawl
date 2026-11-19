import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import { crawlRuns, evaluations, postDiscoveries, posts, sources } from '../db/schema';
import { kstDayStart } from '../worker/eval-budget';

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100));

/** Everything the admin dashboard shows (지시서 7-1). */
export async function dashboardStats(db: DB, now: Date) {
  const byStatus = await db.select({ status: posts.status, n: count() }).from(posts).groupBy(posts.status);
  const n = (s: string) => Number(byStatus.find((r) => r.status === s)?.n ?? 0);
  const collected = byStatus.reduce((a, r) => a + Number(r.n), 0);
  const totals = {
    collected,
    evaluated: collected - n('PENDING_EVAL'),
    published: n('PUBLISHED'),
    review: n('REVIEW'),
    hidden: n('HIDDEN'),
    blocked: n('BLOCKED'),
    failed: n('EVAL_FAILED'),
    pending: n('PENDING_EVAL'),
  };

  const perSourceRows = await db
    .select({
      key: sources.key,
      name: sources.name,
      region: sources.region,
      status: sources.status,
      pausedUntil: sources.pausedUntil,
      consecutiveFailures: sources.consecutiveFailures,
      collected: sql<number>`count(${posts.id})::int`,
      published: sql<number>`count(${posts.id}) filter (where ${posts.status} = 'PUBLISHED')::int`,
      lastRunAt: sql<Date | null>`(select max(${crawlRuns.startedAt}) from ${crawlRuns} where ${crawlRuns.sourceId} = ${sources.id})`,
    })
    .from(sources)
    .leftJoin(posts, eq(posts.sourceId, sources.id))
    .groupBy(sources.id)
    .orderBy(sources.key);
  const perSource = perSourceRows.map((r) => ({ ...r, lastRunAt: r.lastRunAt ? new Date(r.lastRunAt) : null }));

  const kr = perSource.filter((s) => s.region === 'KR').reduce((a, s) => a + s.collected, 0);
  const global = perSource.filter((s) => s.region === 'GLOBAL').reduce((a, s) => a + s.collected, 0);
  const regionShare = { krTarget: 80, globalTarget: 20, krActual: pct(kr, kr + global), globalActual: pct(global, kr + global) };

  const pathRows = await db
    .select({
      path: postDiscoveries.path,
      count: sql<number>`count(distinct ${posts.id})::int`,
      avgScore: sql<number | null>`avg(${posts.score})`,
      published: sql<number>`count(distinct ${posts.id}) filter (where ${posts.status} = 'PUBLISHED')::int`,
    })
    .from(postDiscoveries)
    .innerJoin(posts, eq(posts.id, postDiscoveries.postId))
    .groupBy(postDiscoveries.path);
  const perPath = pathRows.map((r) => ({
    path: r.path,
    count: r.count,
    avgScore: r.avgScore === null ? null : Math.round(Number(r.avgScore)),
    publishRate: pct(r.published, r.count),
  }));

  const recentRuns = await db
    .select({
      id: crawlRuns.id,
      sourceKey: sources.key,
      status: crawlRuns.status,
      startedAt: crawlRuns.startedAt,
      found: crawlRuns.candidatesFound,
      newPosts: crawlRuns.newPosts,
      errors: crawlRuns.errorCount,
      errorSummary: crawlRuns.errorSummary,
    })
    .from(crawlRuns)
    .innerJoin(sources, eq(sources.id, crawlRuns.sourceId))
    .orderBy(desc(crawlRuns.id))
    .limit(20);

  const [today] = await db
    .select({
      evaluations: count(),
      tokensIn: sql<number>`coalesce(sum(${evaluations.tokensIn}), 0)::int`,
      tokensOut: sql<number>`coalesce(sum(${evaluations.tokensOut}), 0)::int`,
    })
    .from(evaluations)
    .where(and(gte(evaluations.createdAt, kstDayStart(now))));

  return { totals, perSource, regionShare, perPath, recentRuns, today };
}
