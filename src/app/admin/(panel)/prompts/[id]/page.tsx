import { Suspense } from 'react';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getDb } from '@/db/client';
import { promptVersions } from '@/db/schema';
import { requireAdmin } from '@/lib/admin-session';
import { SCORE_KEYS } from '@/core/constants';
import { Badge, button, input } from '../../ui';
import { activateVersionAction, requestReevalAction, saveAsNewVersionAction } from '../actions';

type Params = Promise<{ id: string }>;
type SP = Promise<Record<string, string | string[] | undefined>>;
const area = `${input} w-full font-mono text-xs`;

async function Editor({ params, searchParams }: { params: Params; searchParams: SP }) {
  await requireAdmin();
  const id = Number((await params).id);
  const msg = (await searchParams).msg;
  const [v] = Number.isInteger(id) ? await getDb().select().from(promptVersions).where(eq(promptVersions.id, id)) : [];
  if (!v) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/prompts" className="text-sm text-indigo-300 hover:underline">← 목록</Link>
        <h1 className="mt-2 text-lg font-bold text-slate-100">
          {v.name} {v.active ? <Badge tone="green">활성</Badge> : <Badge>대기</Badge>}
        </h1>
        {typeof msg === 'string' && <p className="mt-2 text-sm text-emerald-300">{msg}</p>}
      </div>

      <div className="flex flex-wrap gap-3">
        {!v.active && (
          <form action={activateVersionAction.bind(null, v.id)}>
            <button type="submit" className={button}>이 버전 활성화</button>
          </form>
        )}
        <form action={requestReevalAction.bind(null, v.id)} className="flex items-center gap-2 text-sm text-slate-300">
          최근 <input name="recent" type="number" min={1} max={200} defaultValue={20} className={`${input} w-20`} />건
          <select name="status" defaultValue="" className={input}>
            <option value="">모든 상태</option><option value="PUBLISHED">공개</option><option value="REVIEW">검토 대기</option><option value="HIDDEN">비공개</option>
          </select>
          <button type="submit" className="rounded-md border border-slate-700 px-3 py-1.5 hover:bg-slate-800">이 버전으로 재평가</button>
        </form>
      </div>

      <form action={saveAsNewVersionAction.bind(null, v.id)} className="flex flex-col gap-3 rounded-lg border border-slate-800 p-4">
        <p className="text-xs text-slate-500">저장하면 이 버전은 그대로 두고 <b>새 버전</b>을 만들어요. 평가 결과가 어떤 버전으로 나왔는지 항상 추적할 수 있어요.</p>
        <label className="flex flex-col gap-1 text-sm text-slate-300">새 버전 이름<input name="name" required maxLength={50} defaultValue={`${v.name}-수정`} className={input} /></label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">시스템 프롬프트<textarea name="systemPrompt" rows={8} defaultValue={v.systemPrompt} className={area} /></label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">평가 프롬프트<textarea name="evalPrompt" rows={10} defaultValue={v.evalPrompt} className={area} /></label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">항목별 평가 기준 (JSON)<textarea name="criteria" rows={6} defaultValue={JSON.stringify(v.criteria, null, 2)} className={area} /></label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">유형 설명 (JSON)<textarea name="categoryDescriptions" rows={8} defaultValue={JSON.stringify(v.categoryDescriptions, null, 2)} className={area} /></label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">제외 기준<textarea name="exclusions" rows={6} defaultValue={v.exclusions} className={area} /></label>
        <fieldset className="grid grid-cols-2 gap-2 text-sm text-slate-300 sm:grid-cols-3">
          <legend className="mb-1">배점</legend>
          {SCORE_KEYS.map((k) => (
            <label key={k} className="flex items-center justify-between gap-2">{k}<input name={`w_${k}`} type="number" min={0} max={100} defaultValue={v.weights[k]} className={`${input} w-20`} /></label>
          ))}
        </fieldset>
        <div className="flex gap-4 text-sm text-slate-300">
          <label className="flex items-center gap-2">자동 공개 ≥<input name="publish" type="number" min={0} max={100} defaultValue={v.thresholds.publish} className={`${input} w-20`} /></label>
          <label className="flex items-center gap-2">검토 ≥<input name="review" type="number" min={0} max={100} defaultValue={v.thresholds.review} className={`${input} w-20`} /></label>
        </div>
        <button type="submit" className={`${button} self-start`}>새 버전으로 저장</button>
      </form>
    </div>
  );
}

export default function AdminPromptPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">불러오는 중…</p>}>
      <Editor params={params} searchParams={searchParams} />
    </Suspense>
  );
}
