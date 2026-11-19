import { Suspense } from 'react';
import { getDb } from '@/db/client';
import { requireAdmin } from '@/lib/admin-session';
import { listKeywords } from '@/admin/keywords';
import { Badge, button, input, td, th } from '../ui';
import { createKeywordAction, deleteKeywordAction, toggleKeywordAction } from './actions';

type SP = Promise<Record<string, string | string[] | undefined>>;
const KIND_LABELS = { MIDNIGHT: '새벽 감성', ABSURD: '황당한 글', MEME: '밈' } as const;

async function Keywords({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const msg = (await searchParams).msg;
  const rows = await listKeywords(getDb());
  return (
    <div className="flex flex-col gap-6">
      {typeof msg === 'string' && <p className="text-sm text-emerald-300">{msg}</p>}
      <form action={createKeywordAction} className="grid gap-2 rounded-lg border border-slate-800 p-4 sm:grid-cols-4">
        <select name="kind" defaultValue="MEME" className={input}>
          {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input name="keyword" required maxLength={100} placeholder="키워드" className={input} />
        <input name="aliases" placeholder="유사 표현 (쉼표로 구분)" className={input} />
        <input name="priority" type="number" defaultValue={0} placeholder="우선순위" className={input} />
        <input name="description" maxLength={500} placeholder="설명 (밈이면 AI 참고용)" className={`${input} sm:col-span-2`} />
        <input name="startsOn" type="date" className={input} aria-label="적용 시작일" />
        <input name="endsOn" type="date" className={input} aria-label="적용 종료일" />
        <button type="submit" className={`${button} sm:col-span-4 sm:justify-self-start`}>추가</button>
      </form>
      <p className="text-xs text-slate-500">변경은 다음 수집 회차부터 반영돼요. 사이트 검색은 쓰지 않고, 목록에서 받은 글을 거르는 데 써요.</p>
      <table className="w-full">
        <thead><tr><th className={th}>종류</th><th className={th}>키워드</th><th className={th}>유사 표현</th><th className={th}>설명</th><th className={th}>기간</th><th className={th}>우선</th><th className={th}>상태</th><th className={th}></th></tr></thead>
        <tbody>
          {rows.map((k) => (
            <tr key={k.id}>
              <td className={td}>{KIND_LABELS[k.kind]}</td>
              <td className={td}>{k.keyword}</td>
              <td className={td}>{k.aliases.join(', ')}</td>
              <td className={td}>{k.description ?? ''}</td>
              <td className={td}>{k.startsOn || k.endsOn ? `${k.startsOn ?? ''} ~ ${k.endsOn ?? ''}` : '-'}</td>
              <td className={td}>{k.priority}</td>
              <td className={td}><Badge tone={k.active ? 'green' : 'slate'}>{k.active ? '켜짐' : '꺼짐'}</Badge></td>
              <td className={`${td} whitespace-nowrap`}>
                <form action={toggleKeywordAction.bind(null, k.id, !k.active)} className="inline">
                  <button className="text-xs text-indigo-300 hover:underline">{k.active ? '끄기' : '켜기'}</button>
                </form>{' '}
                <form action={deleteKeywordAction.bind(null, k.id)} className="inline">
                  <button className="text-xs text-rose-300 hover:underline">삭제</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminKeywordsPage({ searchParams }: { searchParams: SP }) {
  return (
    <section>
      <h1 className="mb-4 text-lg font-bold text-slate-100">키워드·밈</h1>
      <Suspense fallback={<p className="text-sm text-slate-500">불러오는 중…</p>}>
        <Keywords searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
