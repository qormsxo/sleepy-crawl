import { Suspense } from 'react';
import Link from 'next/link';
import { getDb } from '@/db/client';
import { requireAdmin } from '@/lib/admin-session';
import { dashboardStats } from '@/admin/stats';
import { Badge, kst, STATUS_LABELS, statusTone, td, th } from './ui';

const PATH_LABELS: Record<string, string> = {
  POPULAR: '인기글',
  MIDNIGHT_KEYWORD: '새벽 키워드',
  MEME_KEYWORD: '밈 키워드',
  USER_SUBMISSION: '제보',
};

function Stat({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const body = (
    <div className="rounded-lg border border-slate-800 p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-100">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

async function Dashboard() {
  await requireAdmin();
  const s = await dashboardStats(getDb(), new Date());
  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="누적 수집" value={s.totals.collected} />
        <Stat label="평가 완료" value={s.totals.evaluated} />
        <Stat label="공개" value={s.totals.published} href="/admin/posts?status=PUBLISHED" />
        <Stat label="검토 대기" value={s.totals.review} href="/admin/posts?status=REVIEW" />
        <Stat label="비공개" value={s.totals.hidden} href="/admin/posts?status=HIDDEN" />
        <Stat label="차단" value={s.totals.blocked} href="/admin/posts?status=BLOCKED" />
        <Stat label="평가 실패" value={s.totals.failed} href="/admin/posts?status=EVAL_FAILED" />
        <Stat label="평가 대기" value={s.totals.pending} href="/admin/posts?status=PENDING_EVAL" />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-bold text-slate-200">한국 / 해외 비중 (수집 글 기준)</h2>
          <p className="text-sm text-slate-300">
            목표 {s.regionShare.krTarget} : {s.regionShare.globalTarget} · 실제 {s.regionShare.krActual} : {s.regionShare.globalActual}
          </p>
          <h2 className="mb-2 mt-6 text-sm font-bold text-slate-200">수집 경로별 결과</h2>
          <table className="w-full">
            <thead><tr><th className={th}>경로</th><th className={th}>글</th><th className={th}>평균 점수</th><th className={th}>공개 비율</th></tr></thead>
            <tbody>
              {s.perPath.map((p) => (
                <tr key={p.path}><td className={td}>{PATH_LABELS[p.path] ?? p.path}</td><td className={td}>{p.count}</td><td className={td}>{p.avgScore ?? '-'}</td><td className={td}>{p.publishRate}%</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-xs text-slate-500">
            오늘 AI 평가 {s.today.evaluations}건 · 토큰 입력 {s.today.tokensIn} / 출력 {s.today.tokensOut}
          </p>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-bold text-slate-200">커뮤니티별</h2>
          <table className="w-full">
            <thead><tr><th className={th}>커뮤니티</th><th className={th}>상태</th><th className={th}>수집</th><th className={th}>공개</th><th className={th}>마지막 실행</th></tr></thead>
            <tbody>
              {s.perSource.map((x) => (
                <tr key={x.key}>
                  <td className={td}><Link href={`/admin/sources?key=${x.key}`} className="text-indigo-300 hover:underline">{x.name}</Link></td>
                  <td className={td}>
                    <Badge tone={statusTone(x.status)}>{STATUS_LABELS[x.status]}</Badge>
                    {x.pausedUntil && x.pausedUntil > new Date() && <span className="ml-1 text-xs text-amber-300">정지 ~{kst(x.pausedUntil)}</span>}
                  </td>
                  <td className={td}>{x.collected}</td><td className={td}>{x.published}</td><td className={td}>{kst(x.lastRunAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-200">최근 수집 실행</h2>
        <table className="w-full">
          <thead><tr><th className={th}>#</th><th className={th}>시각</th><th className={th}>커뮤니티</th><th className={th}>결과</th><th className={th}>목록</th><th className={th}>새 글</th><th className={th}>오류</th></tr></thead>
          <tbody>
            {s.recentRuns.map((r) => (
              <tr key={r.id}>
                <td className={td}>{r.id}</td><td className={td}>{kst(r.startedAt)}</td><td className={td}>{r.sourceKey}</td>
                <td className={td}><Badge tone={r.status === 'SUCCEEDED' ? 'green' : r.status === 'FAILED' ? 'rose' : 'amber'}>{r.status}</Badge></td>
                <td className={td}>{r.found}</td><td className={td}>{r.newPosts}</td>
                <td className={td}>{r.errors > 0 ? `${r.errors}건 ${r.errorSummary ?? ''}` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default function AdminHome() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">불러오는 중…</p>}>
      <Dashboard />
    </Suspense>
  );
}
