import { Suspense } from 'react';
import Link from 'next/link';
import { getDb } from '@/db/client';
import { requireAdmin } from '@/lib/admin-session';
import { listPosts } from '@/admin/posts';
import { POST_STATUSES, type PostStatus } from '@/core/constants';
import { Badge, Categories, FilterLinks, kst, STATUS_LABELS, statusTone, td, th } from '../ui';

type SP = Promise<Record<string, string | string[] | undefined>>;

async function PostList({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;
  const raw = typeof sp.status === 'string' ? sp.status : 'REVIEW';
  const status = raw === 'ALL' ? undefined : (POST_STATUSES as readonly string[]).includes(raw) ? (raw as PostStatus) : 'REVIEW';
  const before = typeof sp.before === 'string' ? Number(sp.before) || undefined : undefined;
  const { items, next } = await listPosts(getDb(), { status, before });

  return (
    <>
      <FilterLinks
        base="/admin/posts"
        current={status ?? 'ALL'}
        options={[['REVIEW', '검토 대기'], ['PUBLISHED', '공개'], ['HIDDEN', '비공개'], ['BLOCKED', '차단'], ['EVAL_FAILED', '평가 실패'], ['PENDING_EVAL', '평가 대기'], ['ALL', '전체']]}
      />
      <table className="w-full">
        <thead>
          <tr>
            <th className={th}>#</th><th className={th}>제목</th><th className={th}>커뮤니티</th><th className={th}>작성</th>
            <th className={th}>점수</th><th className={th}>분류</th><th className={th}>상태</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td className={td}>{p.id}</td>
              <td className={td}>
                <Link href={`/admin/posts/${p.id}`} className="text-indigo-300 hover:underline">{p.title || '(제목 없음)'}</Link>
                {p.primaryPath === 'USER_SUBMISSION' && <span className="ml-1"><Badge tone="amber">제보</Badge></span>}
              </td>
              <td className={td}>{p.sourceName}</td>
              <td className={td}>{kst(p.postedAt)}</td>
              <td className={td}>{p.score ?? '-'}</td>
              <td className={td}><Categories list={p.categories} /></td>
              <td className={td}>
                <Badge tone={statusTone(p.status)}>{STATUS_LABELS[p.status]}</Badge>
                {p.statusSource === 'ADMIN' && <span className="ml-1 text-xs text-slate-500">수동</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p className="mt-6 text-sm text-slate-500">해당하는 글이 없어요.</p>}
      {next && (
        <Link href={`/admin/posts?status=${status ?? 'ALL'}&before=${next}`} className="mt-4 inline-block text-sm text-indigo-300 hover:underline">
          더 보기
        </Link>
      )}
    </>
  );
}

export default function AdminPostsPage({ searchParams }: { searchParams: SP }) {
  return (
    <section>
      <h1 className="mb-4 text-lg font-bold text-slate-100">게시글·검토</h1>
      <Suspense fallback={<p className="text-sm text-slate-500">불러오는 중…</p>}>
        <PostList searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
