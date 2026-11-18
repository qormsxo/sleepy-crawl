'use client';

import { useActionState, useState } from 'react';
import Script from 'next/script';
import { CATEGORIES } from '@/core/constants';
import { CATEGORY_LABELS } from '../format';

export type SubmitState =
  | { status: 'idle' }
  | { status: 'ok' }
  | { status: 'error'; error: string; field?: string };

const MESSAGES: Record<string, string> = {
  captcha: '봇 확인에 실패했어요. 잠시 후 다시 시도해 주세요.',
  rate_limited: '제보가 너무 많아요. 한 시간 뒤에 다시 시도해 주세요.',
  invalid_url: '글 주소를 정확히 넣어 주세요 (http:// 또는 https://).',
  unsupported_site: '지원하지 않는 사이트예요. 오늘의유머·에펨코리아·루리웹·인벤·클리앙·웃긴대학·디시인사이드 글만 받아요.',
  manual_required: '디시인사이드 글은 제목·작성 시각·내용을 직접 입력해 주세요.',
  invalid_field: '입력한 내용을 확인해 주세요.',
  server: '잠시 문제가 생겼어요. 다시 시도해 주세요.',
};
const FIELD_HINTS: Record<string, string> = {
  manualTitle: '제목은 1~200자로 입력해 주세요.',
  manualPostedAt: '작성 시각을 "2026-11-19 01:30" 형식으로, 지금보다 이전으로 입력해 주세요.',
  manualExcerpt: '내용은 20~1,000자로 입력해 주세요.',
  note: '설명은 300자 이하로 입력해 주세요.',
  suggestedCategory: '유형을 목록에서 골라 주세요.',
};

/** Same shapes the server accepts (src/sources/manual-dcinside.ts); the server re-checks. */
const DC_POST = /^https?:\/\/(gall\.dcinside\.com\/(mgallery\/|mini\/)?board\/view|m\.dcinside\.com\/(board|mini)\/\w+\/\d+)/;

const field = 'w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100';
const label = 'mb-1 block text-sm text-slate-300';

export function SubmitForm({
  action,
  initialState,
  siteKey,
}: {
  action: (prev: SubmitState, form: FormData) => Promise<SubmitState>;
  initialState: SubmitState;
  siteKey: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [url, setUrl] = useState('');
  const manual = DC_POST.test(url.trim());
  const error = state.status === 'error' ? state : null;
  const errorFor = (name: string) =>
    error && error.field === name ? <p className="mt-1 text-xs text-rose-300">{FIELD_HINTS[name] ?? MESSAGES[error.error]}</p> : null;

  if (state.status === 'ok') {
    return (
      <p className="rounded-lg border border-indigo-800 bg-indigo-950/60 p-4 text-sm text-indigo-100">
        접수됐어요. 확인을 거쳐 새벽 피드에 오를 수 있어요. 고마워요!
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <div>
        <label className={label} htmlFor="url">글 주소</label>
        <input id="url" name="url" type="url" required maxLength={500} value={url} onChange={(e) => setUrl(e.target.value)} className={field} placeholder="https://..." />
        {error?.field === 'url' && <p className="mt-1 text-xs text-rose-300">{MESSAGES[error.error]}</p>}
      </div>

      {manual && (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-amber-800/60 p-3">
          <legend className="px-1 text-xs text-amber-200">디시인사이드 글은 직접 입력해 주세요 (사이트에 접속하지 않아요)</legend>
          <div>
            <label className={label} htmlFor="manualTitle">글 제목</label>
            <input id="manualTitle" name="manualTitle" maxLength={200} required className={field} />
            {errorFor('manualTitle')}
          </div>
          <div>
            <label className={label} htmlFor="manualPostedAt">작성 시각 (한국 시간)</label>
            <input id="manualPostedAt" name="manualPostedAt" required placeholder="2026-11-19 01:30" className={field} />
            {errorFor('manualPostedAt')}
          </div>
          <div>
            <label className={label} htmlFor="manualExcerpt">내용 일부 (20~1,000자)</label>
            <textarea id="manualExcerpt" name="manualExcerpt" required minLength={20} maxLength={1000} rows={5} className={field} />
            {errorFor('manualExcerpt')}
          </div>
        </fieldset>
      )}

      <div>
        <label className={label} htmlFor="note">왜 웃긴지 한마디 (선택)</label>
        <textarea id="note" name="note" maxLength={300} rows={2} className={field} />
        {errorFor('note')}
      </div>
      <div>
        <label className={label} htmlFor="suggestedCategory">유형 (선택)</label>
        <select id="suggestedCategory" name="suggestedCategory" defaultValue="" className={field}>
          <option value="">고르지 않음</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        {errorFor('suggestedCategory')}
      </div>

      <div className="cf-turnstile" data-sitekey={siteKey} data-theme="dark" />
      {error && !error.field && <p className="text-sm text-rose-300">{MESSAGES[error.error] ?? MESSAGES.server}</p>}

      <button type="submit" disabled={pending} className="self-start rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50">
        {pending ? '보내는 중…' : '제보하기'}
      </button>
    </form>
  );
}
