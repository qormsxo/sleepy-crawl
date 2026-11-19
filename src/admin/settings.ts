import { sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import { settings } from '../db/schema';
import { audit } from './audit';

/** Settings an admin may change from the UI, with their allowed integer ranges. */
export const EDITABLE_SETTINGS = {
  crawl_interval_minutes: { label: '새벽 수집 간격(분)', min: 1, max: 120 },
  followup_until_hour: { label: '후속 수집 종료 시각(시, 3이면 후속 없음)', min: 3, max: 24 },
  followup_interval_minutes: { label: '후속 수집 간격(분)', min: 5, max: 240 },
  max_detail_fetches_per_run: { label: '회차당 글 페이지 확인 상한', min: 0, max: 100 },
  max_post_age_hours: { label: '수집 대상 최대 경과 시간(시간, 0=제한 없음)', min: 0, max: 720 },
  preview_max_chars: { label: '미리보기 길이(자)', min: 0, max: 300 },
  daily_eval_limit: { label: '하루 AI 평가 상한(건)', min: 0, max: 100000 },
  submission_per_hour: { label: '제보 시간당 상한(IP별)', min: 1, max: 100 },
  submission_per_day: { label: '제보 하루 상한(IP별)', min: 1, max: 1000 },
} as const;
export type SettingKey = keyof typeof EDITABLE_SETTINGS;

export async function updateSettings(db: DB, adminId: number, values: Partial<Record<SettingKey, number>>): Promise<void> {
  const entries = Object.entries(values) as [string, number][];
  for (const [key, value] of entries) {
    const rule = EDITABLE_SETTINGS[key as SettingKey];
    if (!rule) throw new Error(`unknown setting ${key}`);
    if (!Number.isInteger(value) || value < rule.min || value > rule.max) {
      throw new Error(`${key} must be an integer between ${rule.min} and ${rule.max}`);
    }
  }
  for (const [key, value] of entries) {
    await db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: sql`now()` } });
  }
  await audit(db, adminId, 'settings.update', 'settings', values);
}

export async function readSettings(db: DB): Promise<Record<string, unknown>> {
  return Object.fromEntries((await db.select().from(settings)).map((r) => [r.key, r.value]));
}
