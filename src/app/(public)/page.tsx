import { Suspense } from 'react';
import Link from 'next/link';
import { getDb } from '@/db/client';
import { sources } from '@/db/schema';
import { listFeed, parseFeedFilters, type FeedFilters } from '@/feed/query';
import { PostCard } from './PostCard';
import { Filters } from './Filters';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Sleepy Crawler</h1>
        <p className="mt-1 text-sm text-slate-400">
          밤 11시부터 새벽 3시 사이, 인터넷 어딘가에 올라온 이상하고 엉뚱한 글들. AI가 골랐습니다.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-slate-500">불러오는 중…</p>}>
        <Feed searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Feed({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filters = parseFeedFilters(params);
  const db = getDb();
  const [{ items, nextCursor }, sourceList] = await Promise.all([
    listFeed(db, filters),
    db.select({ key: sources.key, name: sources.name }).from(sources),
  ]);

  return (
    <>
      <Filters filters={filters} sources={sourceList} />
      {items.length === 0 ? (
        <p className="mt-8 text-center text-sm text-slate-500">조건에 맞는 글이 아직 없어요.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.id}>
              <PostCard item={item} />
            </li>
          ))}
        </ul>
      )}
      {nextCursor && (
        <div className="mt-6 text-center">
          <Link href={`/?${nextQuery(filters, nextCursor)}`} className="text-sm text-indigo-300 hover:underline">
            더 보기
          </Link>
        </div>
      )}
    </>
  );
}

function nextQuery(f: FeedFilters, cursor: string): string {
  const q = new URLSearchParams();
  if (f.sort !== 'latest') q.set('sort', f.sort);
  if (f.date) q.set('date', f.date);
  if (f.hour !== undefined) q.set('hour', String(f.hour));
  if (f.category) q.set('category', f.category);
  if (f.source) q.set('source', f.source);
  q.set('cursor', cursor);
  return q.toString();
}
