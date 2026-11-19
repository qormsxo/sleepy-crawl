import { Suspense } from 'react';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-session';
import { logoutAction } from './actions';

export const metadata = { title: '관리자 · Sleepy Crawler', robots: { index: false } };

const NAV = [
  ['/admin', '대시보드'],
  ['/admin/posts', '게시글·검토'],
  ['/admin/submissions', '제보'],
  ['/admin/sources', '커뮤니티'],
  ['/admin/keywords', '키워드·밈'],
  ['/admin/prompts', '프롬프트'],
  ['/admin/settings', '설정'],
] as const;

/** Reads the session cookie, so it streams in behind Suspense (Cache Components). */
async function AdminShell({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 pb-3">
        <span className="font-bold text-slate-100">Sleepy Crawler 관리</span>
        <nav className="flex flex-wrap gap-3 text-sm">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="text-indigo-300 hover:underline">
              {label}
            </Link>
          ))}
        </nav>
        <form action={logoutAction} className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          <span>{admin.email}</span>
          <button type="submit" className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800">로그아웃</button>
        </form>
      </header>
      {children}
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">확인 중…</p>}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
