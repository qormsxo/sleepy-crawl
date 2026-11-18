import type { Category } from '@/core/constants';
import { localParts } from '@/core/time-window';

export const CATEGORY_LABELS: Record<Category, string> = {
  ABSURD: '황당',
  LATE_NIGHT_EMOTION: '새벽 감성',
  OVERTHINKING: '과몰입',
  NONSENSE_HUMOR: '아무말 유머',
  IMPULSIVE_THOUGHT: '충동적 생각',
  WEIRD_OBSERVATION: '독특한 관찰',
  MEME: '밈',
  OTHER: '기타',
};

const KOREAN_ZONE = 'Asia/Seoul';
const ZONE_LABELS: Record<string, string> = {
  'America/New_York': '뉴욕',
  'America/Los_Angeles': 'LA',
  'Europe/London': '런던',
};

/** "11/19 00:30" for Korean sources, "현지 11/19 01:20 (뉴욕)" otherwise. */
export function formatPostedAt(iso: string | null, tz: string): string {
  if (!iso) return '작성 시각 미상';
  const { m, d, hour, minute } = localParts(new Date(iso), tz);
  const text = `${m}/${d} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  if (tz === KOREAN_ZONE) return text;
  return `현지 ${text} (${ZONE_LABELS[tz] ?? tz})`;
}
