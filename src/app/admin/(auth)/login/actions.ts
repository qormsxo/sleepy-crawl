'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { login } from '@/admin/auth';
import { setAdminCookie } from '@/lib/admin-session';
import { clientIpFrom, hashIp } from '@/submissions/receive';
import { submissionConfig } from '@/lib/submission-config';
import type { LoginState } from './LoginForm';

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  let ok = false;
  try {
    const ip = clientIpFrom(await headers()) ?? 'unknown';
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    const r = await login(getDb(), email, password, hashIp(ip, submissionConfig().ipSalt), new Date());
    if (!r.ok) return { status: 'error', error: r.error };
    await setAdminCookie(r.token, r.expiresAt);
    ok = true;
  } catch (err) {
    console.error('loginAction failed', err);
    return { status: 'error', error: 'server' };
  }
  if (ok) redirect('/admin'); // outside try: redirect() throws by design
  return { status: 'idle' };
}
