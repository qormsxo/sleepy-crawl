import { and, arrayContains, desc, eq, lt, or, sql, type SQL } from 'drizzle-orm';
import type { DB } from '../db/client';
import { posts, sources } from '../db/schema';
import { CATEGORIES, type Category } from '../core/constants';

export type FeedSort = 'latest' | 'score';
export type FeedFilters = {
  sort: FeedSort;
  date?: string;
  source?: string;
  category?: Category;
  hour?: 23 | 0 | 1 | 2;
  cursor?: string;
  limit?: number;
};

export type FeedItem = {
  id: number;
  title: string;
  preview: string;
  sourceName: string;
  postedAt: string | null;
  timezone: string;
  categories: Category[];
  score: number | null;
  reason: string | null;
  url: string;
};

type Cursor = { v: string | number; id: number };
const encode = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url');
function decode(s: string): Cursor | null {
  try {
    const c = JSON.parse(Buffer.from(s, 'base64url').toString());
    return typeof c?.id === 'number' && (typeof c.v === 'string' || typeof c.v === 'number') ? c : null;
  } catch {
    return null;
  }
}

/** Published posts for the public feed. One post per similar-content group (the highest score wins). */
export async function listFeed(db: DB, f: FeedFilters): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(f.limit ?? 20, 1), 50);

  // The same filters apply to the group mate, so a filtered view never hides a post behind a mate it excludes.
  const mateFilters: SQL[] = [];
  if (f.date) mateFilters.push(sql`and o.night_date = ${f.date}`);
  if (f.hour !== undefined) mateFilters.push(sql`and o.night_hour = ${f.hour}`);
  if (f.category) mateFilters.push(sql`and ${f.category} = any(o.categories)`);
  if (f.source) mateFilters.push(sql`and o.source_id = ${posts.sourceId}`);

  const conds: SQL[] = [
    eq(posts.status, 'PUBLISHED'),
    // Inner table gets an explicit SQL alias (o); ${posts.*} columns render as the outer "posts" row.
    sql`not exists (
      select 1 from posts o
      where o.status = 'PUBLISHED'
        and o.similar_group_id = ${posts.similarGroupId}
        and (coalesce(o.score, 0) > coalesce(${posts.score}, 0)
             or (coalesce(o.score, 0) = coalesce(${posts.score}, 0) and o.id < ${posts.id}))
        ${sql.join(mateFilters, sql` `)}
    )`,
  ];
  if (f.date) conds.push(eq(posts.nightDate, f.date));
  if (f.hour !== undefined) conds.push(eq(posts.nightHour, f.hour));
  if (f.category) conds.push(arrayContains(posts.categories, [f.category]));
  if (f.source) conds.push(eq(sources.key, f.source));

  const cursor = f.cursor ? decode(f.cursor) : null;
  if (cursor) {
    if (f.sort === 'score') {
      const v = Number(cursor.v);
      conds.push(or(lt(posts.score, v), and(eq(posts.score, v), lt(posts.id, cursor.id)))!);
    } else {
      const v = new Date(String(cursor.v));
      conds.push(or(lt(posts.publishedAt, v), and(eq(posts.publishedAt, v), lt(posts.id, cursor.id)))!);
    }
  }

  const order = f.sort === 'score' ? [desc(posts.score), desc(posts.id)] : [desc(posts.publishedAt), desc(posts.id)];
  const rows = await db
    .select({ post: posts, sourceName: sources.name })
    .from(posts)
    .innerJoin(sources, eq(posts.sourceId, sources.id))
    .where(and(...conds))
    .orderBy(...order)
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > limit && last
      ? encode({ v: f.sort === 'score' ? (last.post.score ?? 0) : last.post.publishedAt!.toISOString(), id: last.post.id })
      : null;

  return {
    items: page.map(({ post, sourceName }) => ({
      id: post.id,
      title: post.title,
      preview: post.preview,
      sourceName,
      postedAt: post.postedAt?.toISOString() ?? null,
      timezone: post.sourceTimezone,
      categories: post.categories,
      score: post.score,
      reason: post.reason,
      url: post.canonicalUrl,
    })),
    nextCursor,
  };
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Turn URL search params into filters, silently dropping invalid values. */
export function parseFeedFilters(params: Params): FeedFilters {
  const f: FeedFilters = { sort: one(params.sort) === 'score' ? 'score' : 'latest' };
  const date = one(params.date);
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) f.date = date;
  const hour = one(params.hour);
  if (hour !== undefined && ['23', '0', '1', '2'].includes(hour)) f.hour = Number(hour) as FeedFilters['hour'];
  const category = one(params.category);
  if (category && (CATEGORIES as readonly string[]).includes(category)) f.category = category as Category;
  const source = one(params.source);
  if (source && /^[a-z0-9_-]{1,40}$/.test(source)) f.source = source;
  const cursor = one(params.cursor);
  if (cursor && cursor.length <= 200) f.cursor = cursor;
  return f;
}
