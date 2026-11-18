import type { FeedItem } from '@/feed/query';
import { CATEGORY_LABELS, formatPostedAt } from './format';

/** One feed card. All external text is rendered as plain text (React escapes it). */
export function PostCard({ item }: { item: FeedItem }) {
  const heading = item.title.trim() || item.preview;
  return (
    <article className="rounded-xl border border-indigo-900/60 bg-slate-900/70 p-4 shadow-sm">
      <header className="flex items-center justify-between gap-2 text-xs text-slate-400">
        <span className="font-medium text-indigo-300">{item.sourceName}</span>
        <time dateTime={item.postedAt ?? undefined}>{formatPostedAt(item.postedAt, item.timezone)}</time>
      </header>
      <h2 className="mt-2 text-base font-semibold leading-snug text-slate-100">{heading}</h2>
      {item.title.trim() && item.preview && <p className="mt-1 text-sm text-slate-400">{item.preview}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {item.categories.map((c) => (
          <span key={c} className="rounded-full bg-indigo-950 px-2 py-0.5 text-xs text-indigo-200">
            {CATEGORY_LABELS[c]}
          </span>
        ))}
        <span className="ml-auto text-xs text-slate-400">
          AI 점수 <strong className="text-base text-amber-300">{item.score}</strong>
        </span>
      </div>
      {item.reason && <p className="mt-3 border-l-2 border-amber-300/60 pl-3 text-sm text-slate-300">{item.reason}</p>}
      <a
        href={item.url}
        target="_blank"
        rel="noopener nofollow"
        className="mt-3 inline-block text-sm text-indigo-300 underline-offset-2 hover:underline"
      >
        원문 보기 ({item.sourceName}) ↗
      </a>
    </article>
  );
}
