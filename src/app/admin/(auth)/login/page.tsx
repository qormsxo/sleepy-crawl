import { LoginForm } from './LoginForm';
import { loginAction } from './actions';

export const metadata = { title: '관리자 로그인 · Sleepy Crawler', robots: { index: false } };

export default function AdminLoginPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-16">
      <h1 className="mb-6 text-xl font-bold text-slate-100">관리자 로그인</h1>
      <LoginForm action={loginAction} />
    </main>
  );
}
