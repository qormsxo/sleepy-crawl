import { CATEGORIES } from '@/core/constants';
import type { FeedFilters } from '@/feed/query';
import { CATEGORY_LABELS } from './format';

const HOURS = [
  { value: '23', label: '밤 11시대' },
  { value: '0', label: '자정' },
  { value: '1', label: '새벽 1시대' },
  { value: '2', label: '새벽 2시대' },
];

const field = 'rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200';

/** Plain GET form: works without JavaScript and keeps filters shareable in the URL. */
export function Filters({ filters, sources }: { filters: FeedFilters; sources: { key: string; name: string }[] }) {
  return (
    <form method="get" action="/" className="flex flex-wrap items-center gap-2" aria-label="피드 필터">
      <select name="sort" defaultValue={filters.sort} className={field} aria-label="정렬">
        <option value="latest">최신순</option>
        <option value="score">AI 점수순</option>
      </select>
      <input type="date" name="date" defaultValue={filters.date ?? ''} className={field} aria-label="새벽 날짜" />
      <select name="hour" defaultValue={filters.hour === undefined ? '' : String(filters.hour)} className={field} aria-label="시간대">
        <option value="">모든 시간대</option>
        {HOURS.map((h) => (
          <option key={h.value} value={h.value}>
            {h.label}
          </option>
        ))}
      </select>
      <select name="category" defaultValue={filters.category ?? ''} className={field} aria-label="유형">
        <option value="">모든 유형</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      <select name="source" defaultValue={filters.source ?? ''} className={field} aria-label="커뮤니티">
        <option value="">모든 커뮤니티</option>
        {sources.map((s) => (
          <option key={s.key} value={s.key}>
            {s.name}
          </option>
        ))}
      </select>
      <button type="submit" className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500">
        적용
      </button>
    </form>
  );
}
