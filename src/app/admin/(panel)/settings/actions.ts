'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { requireAdmin } from '@/lib/admin-session';
import { EDITABLE_SETTINGS, updateSettings, type SettingKey } from '@/admin/settings';

export async function updateSettingsAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  let msg = '저장했어요. 다음 회차부터 반영돼요.';
  try {
    const values: Partial<Record<SettingKey, number>> = {};
    for (const key of Object.keys(EDITABLE_SETTINGS) as SettingKey[]) {
      const raw = String(form.get(key) ?? '').trim();
      if (raw !== '') values[key] = Number(raw);
    }
    await updateSettings(getDb(), admin.id, values);
  } catch (err) {
    msg = `저장하지 못했어요: ${err instanceof Error ? err.message : '입력 확인'}`;
  }
  redirect(`/admin/settings?msg=${encodeURIComponent(msg)}`);
}
