import { Suspense } from 'react';
import Link from 'next/link';
import { getDb } from '@/db/client';
import { requireAdmin } from '@/lib/admin-session';
import { listSubmissions } from '@/admin/submissions';
import { CATEGORY_LABELS } from '@/app/(public)/format';
import { Badge, FilterLinks, kst, STATUS_LABELS, statusTone, td, th } from '../ui';

type SP = Promise<Record<string, string | string[] | undefined>>;
const STATUSES = ['RECEIVED', 'REJECTED', 'DUPLICATE', 'PROCESSED'] as const;

async function SubmissionList({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const raw = (await searchParams).status;
  const status = typeof raw === 'string' && (STATUSES as readonly string[]).includes(raw) ? (raw as (typeof STATUSES)[number]) : undefined;
  const rows = await listSubmissions(getDb(), { status });
  return (
    <>
      <FilterLinks
        base="/admin/submissions"
        current={status}
        options={[[undefined, '전체'], ['RECEIVED', '접수'], ['PROCESSED', '처리됨'], ['DUPLICATE', '중복'], ['REJECTED', '거절']]}
      />
      <table className="w-full">
        <thead>
          <tr><th className={th}>#</th><th className={th}>접수</th><th className={th}>주소 / 제목</th><th className={th}>방식</th><th className={th}>설명</th><th className={th}>결과</th><th className={th}>글</th></tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td className={td}>{s.id}</td>
              <td className={td}>{kst(s.createdAt)}</td>
              <td className={td}>
                <span className="break-all text-slate-300">{s.url}</span>
                {s.manualTitle && <div className="text-slate-100">“{s.manualTitle}” ({kst(s.manualPostedAt)})</div>}
                <div className="text-xs text-slate-500">{s.sourceName ?? '-'}</div>
              </td>
              <td className={td}>{s.mode === 'manual' ? '수동' : '자동'}</td>
              <td className={td}>
                {s.note ?? ''}
                {s.suggestedCategory && <div className="text-xs text-slate-500">분류 제안: {CATEGORY_LABELS[s.suggestedCategory]}</div>}
              </td>
              <td className={td}>
                <Badge tone={statusTone(s.status)}>{STATUS_LABELS[s.status]}</Badge>
                {s.rejectReason && <div className="text-xs text-slate-500">{s.rejectReason}</div>}
              </td>
              <td className={td}>{s.postId ? <Link href={`/admin/posts/${s.postId}`} className="text-indigo-300 hover:underline">#{s.postId}</Link> : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="mt-6 text-sm text-slate-500">제보가 없어요.</p>}
    </>
  );
}

export default function AdminSubmissionsPage({ searchParams }: { searchParams: SP }) {
  return (
    <section>
      <h1 className="mb-4 text-lg font-bold text-slate-100">제보</h1>
      <Suspense fallback={<p className="text-sm text-slate-500">불러오는 중…</p>}>
        <SubmissionList searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
