import Link from 'next/link';
import { CATEGORY_LABELS } from '@/app/(public)/format';
import type { Category } from '@/core/constants';

export const STATUS_LABELS: Record<string, string> = {
  PENDING_EVAL: '평가 대기',
  PUBLISHED: '공개',
  REVIEW: '검토 대기',
  HIDDEN: '비공개',
  BLOCKED: '차단',
  EVAL_FAILED: '평가 실패',
  RECEIVED: '접수',
  REJECTED: '거절',
  DUPLICATE: '중복',
  PROCESSED: '처리됨',
  ACTIVE: '수집 중',
  UNSUPPORTED: '미지원',
  PENDING_APPROVAL: '승인 대기',
  DISABLED: '꺼짐',
  DEGRADED: '불안정',
};

export function kst(d: Date | null | undefined): string {
  if (!d) return '-';
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'amber' | 'green' | 'rose' | 'indigo' }) {
  const tones = {
    slate: 'bg-slate-800 text-slate-200',
    amber: 'bg-amber-900/60 text-amber-200',
    green: 'bg-emerald-900/60 text-emerald-200',
    rose: 'bg-rose-900/60 text-rose-200',
    indigo: 'bg-indigo-900/60 text-indigo-200',
  };
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

export function statusTone(s: string): 'slate' | 'amber' | 'green' | 'rose' | 'indigo' {
  if (s === 'PUBLISHED' || s === 'ACTIVE' || s === 'PROCESSED') return 'green';
  if (s === 'REVIEW' || s === 'DEGRADED' || s === 'RECEIVED') return 'amber';
  if (s === 'BLOCKED' || s === 'EVAL_FAILED' || s === 'REJECTED' || s === 'UNSUPPORTED') return 'rose';
  return 'slate';
}

export function Categories({ list }: { list: Category[] | null | undefined }) {
  if (!list?.length) return <span className="text-slate-500">-</span>;
  return <>{list.map((c) => <Badge key={c} tone="indigo">{CATEGORY_LABELS[c]}</Badge>)}</>;
}

export function FilterLinks({ base, current, options }: { base: string; current?: string; options: [string | undefined, string][] }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2 text-sm">
      {options.map(([value, label]) => (
        <Link
          key={label}
          href={value ? `${base}?status=${value}` : base}
          className={`rounded border px-2 py-1 ${current === value ? 'border-indigo-500 text-indigo-200' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

export const th = 'border-b border-slate-800 px-2 py-2 text-left text-xs font-medium text-slate-400';
export const td = 'border-b border-slate-900 px-2 py-2 align-top text-sm text-slate-200';
export const input = 'rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100';
export const button = 'rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500';
