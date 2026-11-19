'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { requireAdmin } from '@/lib/admin-session';
import { activateVersion, createVersionFrom, requestReeval } from '@/admin/prompts';
import { POST_STATUSES, SCORE_KEYS, type PostStatus } from '@/core/constants';

const go = (path: string, msg: string) => redirect(`${path}${path.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}`);

/** Saving never edits a version in place: it creates a new (inactive) version from the form. */
export async function saveAsNewVersionAction(baseId: number, form: FormData): Promise<void> {
  const admin = await requireAdmin();
  let target = `/admin/prompts/${baseId}`;
  let msg = '새 버전을 만들었어요. 활성화하기 전까지는 쓰이지 않아요.';
  try {
    const json = (name: string) => JSON.parse(String(form.get(name) ?? '{}')) as Record<string, string>;
    const weights = Object.fromEntries(SCORE_KEYS.map((k) => [k, Number(form.get(`w_${k}`))]));
    const id = await createVersionFrom(getDb(), admin.id, baseId, {
      name: String(form.get('name') ?? ''),
      systemPrompt: String(form.get('systemPrompt') ?? ''),
      evalPrompt: String(form.get('evalPrompt') ?? ''),
      criteria: json('criteria'),
      categoryDescriptions: json('categoryDescriptions'),
      exclusions: String(form.get('exclusions') ?? ''),
      weights: weights as never,
      thresholds: { publish: Number(form.get('publish')), review: Number(form.get('review')) },
    });
    target = `/admin/prompts/${id}`;
  } catch (err) {
    msg = `만들지 못했어요: ${err instanceof Error ? err.message.slice(0, 300) : '입력 확인'}`;
  }
  go(target, msg);
}

export async function activateVersionAction(id: number): Promise<void> {
  const admin = await requireAdmin();
  await activateVersion(getDb(), admin.id, id);
  go(`/admin/prompts/${id}`, '활성화했어요. 이후 새로 수집되는 글부터 이 버전으로 평가해요.');
}

export async function requestReevalAction(id: number, form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const recent = Number(form.get('recent') || 20);
  const status = String(form.get('status') ?? '');
  const reqId = await requestReeval(getDb(), admin.id, id, {
    recent,
    status: (POST_STATUSES as readonly string[]).includes(status) ? (status as PostStatus) : undefined,
  });
  go(`/admin/prompts/${id}`, `재평가 요청 #${reqId}를 등록했어요. 워커가 매분 조금씩 처리해요(공개 상태는 바뀌지 않아요).`);
}
