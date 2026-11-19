import { Suspense } from 'react';
import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { crawlErrors, sources } from '@/db/schema';
import { requireAdmin } from '@/lib/admin-session';
import { SOURCE_STATUSES } from '@/core/constants';
import { Badge, button, input, kst, STATUS_LABELS, statusTone, td, th } from '../ui';
import { deleteSourceAction, unpauseSourceAction, updateSourceAction } from './actions';

type SP = Promise<Record<string, string | string[] | undefined>>;

async function Sources({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;
  const db = getDb();
  const all = await db.select().from(sources).orderBy(sources.key);
  const selected = all.find((s) => s.key === sp.key);
  const errors = selected
    ? await db.select().from(crawlErrors).where(eq(crawlErrors.sourceId, selected.id)).orderBy(desc(crawlErrors.id)).limit(50)
    : [];
  const now = new Date();

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <ul className="flex flex-col gap-1">
        {all.map((s) => (
          <li key={s.id}>
            <Link href={`/admin/sources?key=${s.key}`} className={`flex items-center justify-between rounded px-2 py-1 text-sm ${s.key === selected?.key ? 'bg-slate-800' : 'hover:bg-slate-900'}`}>
              <span className="text-slate-200">{s.name}</span>
              <Badge tone={statusTone(s.status)}>{STATUS_LABELS[s.status]}</Badge>
            </Link>
          </li>
        ))}
      </ul>

      {selected ? (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-bold text-slate-100">{selected.name} <span className="text-sm font-normal text-slate-500">({selected.key}, 어댑터 {selected.adapterKey})</span></h2>
          {typeof sp.msg === 'string' && <p className="text-sm text-emerald-300">{sp.msg}</p>}
          <p className="text-sm text-slate-400">
            연속 실패 {selected.consecutiveFailures}회
            {selected.pausedUntil && selected.pausedUntil > now && <> · <span className="text-amber-300">정지 ~{kst(selected.pausedUntil)}</span></>}
            {selected.policyNotes && <> · 정책: {selected.policyNotes}</>}
          </p>

          <form action={updateSourceAction.bind(null, selected.id, selected.key)} className="flex flex-col gap-3 rounded-lg border border-slate-800 p-4">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              상태
              <select name="status" defaultValue={selected.status} className={input}>
                {SOURCE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]} ({s})</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              상태 사유
              <input name="statusReason" defaultValue={selected.statusReason ?? ''} maxLength={500} className={input} />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              새벽 수집 간격(분, 비우면 기본값)
              <input name="intervalOverride" type="number" min={1} max={1440} defaultValue={selected.intervalOverride ?? ''} className={`${input} w-24`} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              수집 설정 (JSON: lists, maxDetailFetches, manualSubmission)
              <textarea name="config" rows={6} defaultValue={JSON.stringify(selected.config, null, 2)} className={`${input} font-mono text-xs`} />
            </label>
            <button type="submit" className={`${button} self-start`}>저장</button>
          </form>

          <div className="flex gap-2">
            <form action={unpauseSourceAction.bind(null, selected.id, selected.key)}>
              <button type="submit" className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800">정지 풀기</button>
            </form>
            <form action={deleteSourceAction.bind(null, selected.id, selected.key)}>
              <button type="submit" className="rounded border border-rose-800 px-3 py-1.5 text-sm text-rose-200 hover:bg-rose-950">삭제 (기록 없을 때만)</button>
            </form>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-bold text-slate-200">최근 오류</h3>
            <table className="w-full">
              <thead><tr><th className={th}>시각</th><th className={th}>종류</th><th className={th}>내용</th><th className={th}>주소</th></tr></thead>
              <tbody>
                {errors.map((e) => (
                  <tr key={e.id}><td className={td}>{kst(e.occurredAt)}</td><td className={td}>{e.kind}</td><td className={td}>{e.message}</td><td className={`${td} break-all text-xs`}>{e.url ?? ''}</td></tr>
                ))}
              </tbody>
            </table>
            {errors.length === 0 && <p className="text-sm text-slate-500">오류 없음</p>}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-400">왼쪽에서 커뮤니티를 고르세요. 새 커뮤니티는 코드에 어댑터가 있어야 등록할 수 있어요.</p>
      )}
    </div>
  );
}

export default function AdminSourcesPage({ searchParams }: { searchParams: SP }) {
  return (
    <section>
      <h1 className="mb-4 text-lg font-bold text-slate-100">커뮤니티</h1>
      <Suspense fallback={<p className="text-sm text-slate-500">불러오는 중…</p>}>
        <Sources searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
