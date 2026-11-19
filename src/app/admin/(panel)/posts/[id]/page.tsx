import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/db/client';
import { requireAdmin } from '@/lib/admin-session';
import { postDetail } from '@/admin/posts';
import { CATEGORIES } from '@/core/constants';
import { CATEGORY_LABELS } from '@/app/(public)/format';
import { Badge, button, Categories, input, kst, STATUS_LABELS, statusTone, td, th } from '../../ui';
import { updatePostAction } from './actions';

type Params = Promise<{ id: string }>;
type SP = Promise<Record<string, string | string[] | undefined>>;

async function Detail({ params, searchParams }: { params: Params; searchParams: SP }) {
  await requireAdmin();
  const id = Number((await params).id);
  const saved = (await searchParams).saved === '1';
  const d = Number.isInteger(id) ? await postDetail(getDb(), id) : null;
  if (!d) notFound();
  const p = d.post;
  const latest = d.evaluations[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/posts" className="text-sm text-indigo-300 hover:underline">← 목록</Link>
        <h1 className="mt-2 text-lg font-bold text-slate-100">{p.title || '(제목 없음)'}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {d.sourceName} · 작성 {kst(p.postedAt)} · 수집 {kst(p.collectedAt)} ·{' '}
          <a href={p.canonicalUrl} target="_blank" rel="noopener nofollow" className="text-indigo-300 hover:underline">원문 ↗</a>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(p.status)}>{STATUS_LABELS[p.status]}</Badge>
          {p.statusSource === 'ADMIN' && <Badge>수동 결정</Badge>}
          {p.requiresReview && <Badge tone="amber">검토 필수(수동 제보)</Badge>}
          <span className="text-sm text-slate-300">점수 {p.score ?? '-'}</span>
          <Categories list={p.categories} />
        </div>
        {p.preview && <p className="mt-3 rounded bg-slate-900 p-3 text-sm text-slate-300">{p.preview}</p>}
        {p.reason && <p className="mt-2 border-l-2 border-amber-300/60 pl-3 text-sm text-slate-300">{p.reason}</p>}
      </div>

      <form action={updatePostAction.bind(null, p.id)} className="flex flex-col gap-3 rounded-lg border border-slate-800 p-4">
        <h2 className="text-sm font-bold text-slate-200">관리자 결정</h2>
        {saved && <p className="text-sm text-emerald-300">저장했어요.</p>}
        <label className="flex items-center gap-2 text-sm text-slate-300">
          상태
          <select name="status" defaultValue={['PUBLISHED', 'REVIEW', 'HIDDEN', 'BLOCKED'].includes(p.status) ? p.status : ''} className={input}>
            <option value="">(그대로)</option>
            <option value="PUBLISHED">공개</option>
            <option value="REVIEW">검토 대기</option>
            <option value="HIDDEN">비공개</option>
            <option value="BLOCKED">차단</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          점수 <input name="score" type="number" min={0} max={100} defaultValue={p.score ?? ''} className={`${input} w-24`} />
        </label>
        <fieldset className="flex flex-wrap gap-3 text-sm text-slate-300">
          <legend className="mb-1">분류</legend>
          {CATEGORIES.map((c) => (
            <label key={c} className="flex items-center gap-1">
              <input type="checkbox" name="categories" value={c} defaultChecked={p.categories.includes(c)} /> {CATEGORY_LABELS[c]}
            </label>
          ))}
        </fieldset>
        <button type="submit" className={`${button} self-start`}>저장</button>
        <p className="text-xs text-slate-500">저장하면 이 글은 수동 결정으로 표시되고, 이후 자동 평가가 상태를 바꾸지 않아요.</p>
      </form>

      {d.submissions.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-bold text-slate-200">제보</h2>
          {d.submissions.map((s) => (
            <p key={s.id} className="text-sm text-slate-300">
              #{s.id} ({s.mode === 'manual' ? '수동' : '자동'}, {kst(s.createdAt)}) {s.note ? `“${s.note}”` : '(설명 없음)'}
              {s.suggestedCategory && <> · 제보자 분류 {CATEGORY_LABELS[s.suggestedCategory]}</>}
            </p>
          ))}
        </div>
      )}

      {latest?.scores && (
        <div>
          <h2 className="mb-2 text-sm font-bold text-slate-200">최근 평가 (#{latest.id}, {latest.model ?? '-'})</h2>
          <table className="w-full">
            <tbody>
              {Object.entries(latest.scores).map(([k, v]) => (
                <tr key={k}>
                  <td className={td}>{k}</td>
                  <td className={td}>{v}</td>
                  <td className={td}>{latest.scoresReason?.[k] ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-bold text-slate-200">평가 이력</h2>
        <table className="w-full">
          <thead><tr><th className={th}>#</th><th className={th}>시각</th><th className={th}>용도</th><th className={th}>프롬프트</th><th className={th}>점수</th><th className={th}>결정</th><th className={th}>오류</th></tr></thead>
          <tbody>
            {d.evaluations.map((e) => (
              <tr key={e.id}>
                <td className={td}>{e.id}</td><td className={td}>{kst(e.createdAt)}</td><td className={td}>{e.purpose}</td>
                <td className={td}>{e.promptVersionId}</td><td className={td}>{e.score ?? '-'}</td>
                <td className={td}>{STATUS_LABELS[e.finalDecision]}</td><td className={td}>{e.error ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">발견 경로: {d.discoveries.map((x) => x.path).join(', ') || '-'}</p>
      </div>
    </div>
  );
}

export default function AdminPostPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">불러오는 중…</p>}>
      <Detail params={params} searchParams={searchParams} />
    </Suspense>
  );
}
