import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../tests/helpers/db';
import { seed } from '@/db/seed';
import type { DB } from '@/db/client';
import { posts, sources } from '@/db/schema';
import type { Category, PostStatus } from '@/core/constants';
import { listFeed, parseFeedFilters } from './query';

let db: DB;
let sourceId: number;

async function add(
  n: number,
  over: { status?: PostStatus; score?: number; hour?: number; date?: string; categories?: Category[]; group?: string; publishedAt?: string } = {},
) {
  await db.insert(posts).values({
    sourceId,
    externalId: String(n),
    canonicalUrl: `https://fixture.local/p/${n}`,
    title: `글 ${n}`,
    preview: `미리보기 ${n}`,
    postedAt: new Date('2026-11-18T15:00:00Z'),
    sourceTimezone: 'Asia/Seoul',
    nightDate: over.date ?? '2026-11-18',
    nightHour: over.hour ?? 0,
    primaryPath: 'POPULAR',
    status: over.status ?? 'PUBLISHED',
    score: over.score ?? 75,
    categories: over.categories ?? ['ABSURD'],
    reason: '이유',
    similarGroupId: over.group ?? `g${n}`,
    publishedAt: new Date(over.publishedAt ?? `2026-11-18T19:0${n}:00Z`),
  });
}

beforeEach(async () => {
  db = await createTestDb();
  await seed(db);
  [{ id: sourceId }] = await db.select({ id: sources.id }).from(sources);
});

describe('listFeed', () => {
  it('returns only published posts, newest first', async () => {
    await add(1);
    await add(2);
    await add(3);
    await add(4, { status: 'REVIEW' });
    await add(5, { status: 'HIDDEN' });
    const { items } = await listFeed(db, { sort: 'latest' });
    expect(items.map((i) => i.title)).toEqual(['글 3', '글 2', '글 1']);
    expect(items[0]).toMatchObject({ sourceName: '샘플 커뮤니티', timezone: 'Asia/Seoul', score: 75, reason: '이유', url: 'https://fixture.local/p/3' });
  });

  it('sorts by score', async () => {
    await add(1, { score: 71 });
    await add(2, { score: 95 });
    await add(3, { score: 80 });
    const { items } = await listFeed(db, { sort: 'score' });
    expect(items.map((i) => i.score)).toEqual([95, 80, 71]);
  });

  it('filters by hour, date, category and source', async () => {
    await add(1, { hour: 23 });
    await add(2, { hour: 0, categories: ['MEME', 'ABSURD'] });
    await add(3, { hour: 0, date: '2026-11-17' });
    expect((await listFeed(db, { sort: 'latest', hour: 23 })).items.map((i) => i.title)).toEqual(['글 1']);
    expect((await listFeed(db, { sort: 'latest', category: 'MEME' })).items.map((i) => i.title)).toEqual(['글 2']);
    expect((await listFeed(db, { sort: 'latest', date: '2026-11-17' })).items.map((i) => i.title)).toEqual(['글 3']);
    expect((await listFeed(db, { sort: 'latest', source: 'fixture' })).items).toHaveLength(3);
    expect((await listFeed(db, { sort: 'latest', source: 'nope' })).items).toHaveLength(0);
  });

  it('shows only the highest-scoring post of a similar group', async () => {
    await add(1, { group: 'same', score: 72 });
    await add(2, { group: 'same', score: 88 });
    await add(3);
    const { items } = await listFeed(db, { sort: 'latest' });
    expect(items.map((i) => i.title).sort()).toEqual(['글 2', '글 3']);
  });

  it('paginates with a cursor for both sorts', async () => {
    for (let n = 1; n <= 5; n++) await add(n, { score: 70 + n });
    for (const sort of ['latest', 'score'] as const) {
      const p1 = await listFeed(db, { sort, limit: 2 });
      expect(p1.items).toHaveLength(2);
      expect(p1.nextCursor).not.toBeNull();
      const p2 = await listFeed(db, { sort, limit: 2, cursor: p1.nextCursor! });
      const p3 = await listFeed(db, { sort, limit: 2, cursor: p2.nextCursor! });
      const titles = [...p1.items, ...p2.items, ...p3.items].map((i) => i.title);
      expect(new Set(titles).size).toBe(5);
      expect(p3.nextCursor).toBeNull();
    }
  });
});

describe('parseFeedFilters', () => {
  it('drops invalid values', () => {
    expect(parseFeedFilters({ sort: 'x', hour: '5', category: 'FUNNY', date: 'yesterday' })).toEqual({ sort: 'latest' });
  });

  it('keeps valid values', () => {
    expect(parseFeedFilters({ sort: 'score', hour: '0', category: 'MEME', date: '2026-11-18', source: 'fixture', cursor: 'abc' })).toEqual({
      sort: 'score',
      hour: 0,
      category: 'MEME',
      date: '2026-11-18',
      source: 'fixture',
      cursor: 'abc',
    });
  });
});

describe('listFeed grouping under filters', () => {
  it('shows a group member when its higher-scored mate is filtered out', async () => {
    await add(1, { group: 'same', score: 90, categories: ['MEME'] });
    await add(2, { group: 'same', score: 70, categories: ['ABSURD'] });
    const { items } = await listFeed(db, { sort: 'latest', category: 'ABSURD' });
    expect(items.map((i) => i.title)).toEqual(['글 2']);
  });
});

describe('listFeed with missing values', () => {
  it('pages through published posts whose score is null without losing or repeating any', async () => {
    for (let n = 1; n <= 4; n++) await add(n, { score: n % 2 ? 80 : (null as unknown as number) });
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i++) {
      const page = await listFeed(db, { sort: 'score', limit: 1, cursor });
      seen.push(...page.items.map((x) => x.title));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen.sort()).toEqual(['글 1', '글 2', '글 3', '글 4']);
  });
});
