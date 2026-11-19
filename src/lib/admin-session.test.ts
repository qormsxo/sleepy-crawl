import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from '../../tests/helpers/db';
import { seed } from '@/db/seed';
import type { DB } from '@/db/client';
import { createAdmin, login } from '@/admin/auth';

let db: DB;
let cookieValue: string | undefined;

vi.mock('@/db/client', () => ({ getDb: () => db }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined), set: vi.fn(), delete: vi.fn() }),
  headers: async () => new Headers(),
}));
vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
// react.cache memoizes per request in Next; in tests every call is its own "request".
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(fn: T) => fn }));

beforeEach(async () => {
  db = await createTestDb();
  await seed(db);
  await createAdmin(db, 'admin@example.com', 'correct horse battery');
  cookieValue = undefined;
});

describe('requireAdmin', () => {
  it('redirects to the login page without a session (also blocks direct server-action calls)', async () => {
    const { requireAdmin } = await import('./admin-session');
    await expect(requireAdmin()).rejects.toThrow('REDIRECT:/admin/login');
  });

  it('redirects with a forged or expired token', async () => {
    const { requireAdmin } = await import('./admin-session');
    cookieValue = 'forged-token';
    await expect(requireAdmin()).rejects.toThrow('REDIRECT:/admin/login');
  });

  it('returns the admin for a valid session', async () => {
    const { requireAdmin } = await import('./admin-session');
    const r = await login(db, 'admin@example.com', 'correct horse battery', 'ip', new Date());
    if (!r.ok) throw new Error('login failed');
    cookieValue = r.token;
    expect(await requireAdmin()).toMatchObject({ email: 'admin@example.com' });
  });
});
