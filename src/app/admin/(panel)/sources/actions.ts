'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { requireAdmin } from '@/lib/admin-session';
import { deleteSource, unpauseSource, updateSource } from '@/admin/sources';
import { SOURCE_STATUSES } from '@/core/constants';

const back = (key: string, msg: string) => redirect(`/admin/sources?key=${encodeURIComponent(key)}&msg=${encodeURIComponent(msg)}`);

export async function updateSourceAction(id: number, key: string, form: FormData): Promise<void> {
  const admin = await requireAdmin();
  let msg = '저장했어요.';
  try {
    const status = String(form.get('status') ?? '');
    const interval = String(form.get('intervalOverride') ?? '').trim();
    const configText = String(form.get('config') ?? '').trim();
    await updateSource(getDb(), admin.id, id, {
      status: (SOURCE_STATUSES as readonly string[]).includes(status) ? (status as (typeof SOURCE_STATUSES)[number]) : undefined,
      statusReason: String(form.get('statusReason') ?? '').slice(0, 500),
      intervalOverride: interval === '' ? null : Number(interval),
      config: configText ? JSON.parse(configText) : {},
    });
  } catch (err) {
    msg = `저장하지 못했어요: ${err instanceof Error ? err.message.slice(0, 200) : '입력 확인'}`;
  }
  back(key, msg);
}

export async function unpauseSourceAction(id: number, key: string): Promise<void> {
  const admin = await requireAdmin();
  await unpauseSource(getDb(), admin.id, id);
  back(key, '정지를 풀었어요.');
}

export async function deleteSourceAction(id: number, key: string): Promise<void> {
  const admin = await requireAdmin();
  try {
    await deleteSource(getDb(), admin.id, id);
  } catch {
    back(key, '수집 기록이 있어 지울 수 없어요. 대신 상태를 "꺼짐"으로 바꿔 주세요.');
  }
  redirect('/admin/sources');
}
