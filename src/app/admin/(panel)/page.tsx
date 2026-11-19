import { Suspense } from 'react';
import { requireAdmin } from '@/lib/admin-session';

async function Dashboard() {
  await requireAdmin();
  return <p className="text-sm text-slate-400">대시보드는 Task 5에서 채워진다.</p>;
}

export default function AdminHome() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">불러오는 중…</p>}>
      <Dashboard />
    </Suspense>
  );
}
