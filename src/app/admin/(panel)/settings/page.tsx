import { Suspense } from 'react';
import { getDb } from '@/db/client';
import { requireAdmin } from '@/lib/admin-session';
import { EDITABLE_SETTINGS, readSettings } from '@/admin/settings';
import { button, input } from '../ui';
import { updateSettingsAction } from './actions';

type SP = Promise<Record<string, string | string[] | undefined>>;

async function Settings({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const msg = (await searchParams).msg;
  const current = await readSettings(getDb());
  return (
    <form action={updateSettingsAction} className="flex max-w-xl flex-col gap-3">
      {typeof msg === 'string' && <p className="text-sm text-emerald-300">{msg}</p>}
      {Object.entries(EDITABLE_SETTINGS).map(([key, rule]) => (
        <label key={key} className="flex items-center justify-between gap-4 text-sm text-slate-300">
          <span>
            {rule.label}
            <span className="ml-1 text-xs text-slate-500">({rule.min}~{rule.max})</span>
          </span>
          <input name={key} type="number" min={rule.min} max={rule.max} defaultValue={String(current[key] ?? '')} className={`${input} w-28`} />
        </label>
      ))}
      <p className="text-xs text-slate-500">공개 기준 점수와 배점은 프롬프트 버전에서 바꿔요.</p>
      <button type="submit" className={`${button} self-start`}>저장</button>
    </form>
  );
}

export default function AdminSettingsPage({ searchParams }: { searchParams: SP }) {
  return (
    <section>
      <h1 className="mb-4 text-lg font-bold text-slate-100">설정</h1>
      <Suspense fallback={<p className="text-sm text-slate-500">불러오는 중…</p>}>
        <Settings searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
