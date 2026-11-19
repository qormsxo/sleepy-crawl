'use client';

import { useActionState } from 'react';

export type LoginState = { status: 'idle' } | { status: 'error'; error: 'invalid' | 'locked' | 'server' };

const MESSAGES = {
  invalid: '이메일 또는 비밀번호가 맞지 않아요.',
  locked: '로그인 시도가 너무 많아요. 15분 뒤에 다시 시도해 주세요.',
  server: '잠시 문제가 생겼어요. 다시 시도해 주세요.',
};

const field = 'w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100';

export function LoginForm({
  action,
  initialState = { status: 'idle' },
}: {
  action: (prev: LoginState, form: FormData) => Promise<LoginState>;
  initialState?: LoginState;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="text-sm text-slate-300" htmlFor="email">이메일</label>
      <input id="email" name="email" type="email" autoComplete="username" required className={field} />
      <label className="text-sm text-slate-300" htmlFor="password">비밀번호</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required className={field} />
      {state.status === 'error' && <p className="text-sm text-rose-300">{MESSAGES[state.error]}</p>}
      <button type="submit" disabled={pending} className="mt-2 rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50">
        {pending ? '확인 중…' : '로그인'}
      </button>
    </form>
  );
}
