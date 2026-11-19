import { Suspense } from 'react';
import Link from 'next/link';
import { getDb } from '@/db/client';
import { requireAdmin } from '@/lib/admin-session';
import { compareVersions } from '@/admin/prompts';
import { Badge, STATUS_LABELS, statusTone, td, th } from '../../ui';

type SP = Promise<Record<string, string | string[] | undefined>>;

async function Compare({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;
  const a = Number(sp.a);
  const b = Number(sp.b);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return <p className="text-sm text-slate-400">비교할 두 버전을 고르세요.</p>;
  const rows = await compareVersions(getDb(), a, b);
  const changed = rows.filter((r) => r.changed).length;
  return (
    <>
      <p className="mb-4 text-sm text-slate-300">
        버전 #{a} ↔ #{b} · 두 버전 모두로 평가된 글 {rows.length}건 · 결정이 바뀐 글 <b className="text-amber-300">{changed}</b>건
      </p>
      <table className="w-full">
        <thead><tr><th className={th}>글</th><th className={th}>#{a} 점수·결정</th><th className={th}>#{b} 점수·결정</th><th className={th}>#{b} 이유</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.postId} className={r.changed ? 'bg-amber-950/30' : ''}>
              <td className={td}><Link href={`/admin/posts/${r.postId}`} className="text-indigo-300 hover:underline">{r.title || `#${r.postId}`}</Link></td>
              <td className={td}>{r.a.score ?? '-'} <Badge tone={statusTone(r.a.decision)}>{STATUS_LABELS[r.a.decision]}</Badge></td>
              <td className={td}>{r.b.score ?? '-'} <Badge tone={statusTone(r.b.decision)}>{STATUS_LABELS[r.b.decision]}</Badge></td>
              <td className={td}>{r.b.reason ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="text-sm text-slate-500">아직 두 버전으로 모두 평가된 글이 없어요. 버전 화면에서 재평가를 요청하세요.</p>}
    </>
  );
}

export default function AdminComparePage({ searchParams }: { searchParams: SP }) {
  return (
    <section>
      <Link href="/admin/prompts" className="text-sm text-indigo-300 hover:underline">← 프롬프트</Link>
      <h1 className="mb-4 mt-2 text-lg font-bold text-slate-100">버전 비교</h1>
      <Suspense fallback={<p className="text-sm text-slate-500">불러오는 중…</p>}>
        <Compare searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
