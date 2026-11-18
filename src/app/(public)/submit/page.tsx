import Link from 'next/link';
import { SubmitForm } from './SubmitForm';
import { submitAction } from './actions';
import { turnstileSiteKey } from '@/lib/submission-config';

export const metadata = { title: '제보하기 · Sleepy Crawler' };

export default function SubmitPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-6">
        <Link href="/" className="text-sm text-indigo-300 hover:underline">← 피드로</Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-100">새벽 글 제보하기</h1>
        <p className="mt-1 text-sm text-slate-400">
          밤 11시~새벽 3시에 올라온 이상하고 엉뚱한 글을 알려 주세요. 로그인은 필요 없어요. AI 평가와 확인을 거쳐 피드에 올라가요.
        </p>
      </header>
      <SubmitForm action={submitAction} initialState={{ status: 'idle' }} siteKey={turnstileSiteKey()} />
    </main>
  );
}
