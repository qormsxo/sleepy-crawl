import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { sessionFromToken, type Admin } from '@/admin/auth';

export const ADMIN_COOKIE = 'sc_admin';

/** The signed-in admin for this request, or null. Memoized per request. */
export const currentAdmin = cache(async (): Promise<Admin | null> => {
  // Session checks compare against "now": mark this as request-time work (Cache Components).
  await connection();
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  return sessionFromToken(getDb(), token, new Date());
});

/**
 * Call at the top of every admin page and every admin server action. Hiding UI is not
 * protection: server actions are reachable directly, so each one checks the session itself.
 */
export async function requireAdmin(): Promise<Admin> {
  const admin = await currentAdmin();
  if (!admin) redirect('/admin/login');
  return admin;
}

export async function setAdminCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearAdminCookie(): Promise<string | undefined> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  store.delete(ADMIN_COOKIE);
  return token;
}
