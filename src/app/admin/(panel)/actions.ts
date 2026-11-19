'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { logout } from '@/admin/auth';
import { clearAdminCookie } from '@/lib/admin-session';

export async function logoutAction(): Promise<void> {
  const token = await clearAdminCookie();
  if (token) await logout(getDb(), token);
  redirect('/admin/login');
}
