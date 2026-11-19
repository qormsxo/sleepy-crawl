import { Suspense } from 'react';
import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { reevalRequests } from '@/db/schema';
import { requireAdmin } from '@/lib/admin-session';
import { listVersions } from '@/admin/prompts';
import { Badge, kst, td, th } from '../ui';

async function Prompts() {
  await requireAdmin();
  const db = getDb();
  const versions = await listVersions(db);
  const active = versions.find((v) => v.active);
  const requests = await db.select().from(reevalRequests).orderBy(desc(reevalRequests.id)).limit(10);
  return (
    <div className="flex flex-col gap-6">
      <table className="w-full">
        <thead><tr><th className={th}>#</th><th className={th}>이름</th><th className={th}>공개 기준</th><th className={th}>만든 시각</th><th className={th}>상태</th><th className={th}></th></tr></thead>
        <tbody>
          {versions.map((v) => (
            <tr key={v.id}>
              <td className={td}>{v.id}</td>
              <td className={td}><Link href={`/admin/prompts/${v.id}`} className="text-indigo-300 hover:underline">{v.name}</Link></td>
              <td className={td}>공개 {v.thresholds.publish} / 검토 {v.thresholds.review}</td>
              <td className={td}>{kst(v.createdAt)}</td>
              <td className={td}>{v.active ? <Badge tone="green">활성</Badge> : <Badge>대기</Badge>}</td>
              <td className={td}>
                {active && !v.active && (
                  <Link href={`/admin/prompts/compare?a=${active.id}&b=${v.id}`} className="text-xs text-indigo-300 hover:underline">활성 버전과 비교</Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <h2 className="mb-2 text-sm font-bold text-slate-200">최근 재평가 요청</h2>
        <table className="w-full">
          <thead><tr><th className={th}>#</th><th className={th}>버전</th><th className={th}>진행</th><th className={th}>상태</th><th className={th}>요청</th></tr></thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td className={td}>{r.id}</td><td className={td}>{r.promptVersionId}</td>
                <td className={td}>{r.donePostIds.length} / {r.postIds.length}</td><td className={td}>{r.status}</td><td className={td}>{kst(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminPromptsPage() {
  return (
    <section>
      <h1 className="mb-4 text-lg font-bold text-slate-100">프롬프트 버전</h1>
      <Suspense fallback={<p className="text-sm text-slate-500">불러오는 중…</p>}>
        <Prompts />
      </Suspense>
    </section>
  );
}
