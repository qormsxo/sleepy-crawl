'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { requireAdmin } from '@/lib/admin-session';
import { createKeyword, deleteKeyword, updateKeyword } from '@/admin/keywords';
import { KEYWORD_KINDS } from '@/core/constants';

const done = (msg: string) => redirect(`/admin/keywords?msg=${encodeURIComponent(msg)}`);
const opt = (v: FormDataEntryValue | null) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

export async function createKeywordAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  let msg = '추가했어요.';
  try {
    const kind = String(form.get('kind'));
    if (!(KEYWORD_KINDS as readonly string[]).includes(kind)) throw new Error('kind');
    await createKeyword(getDb(), admin.id, {
      kind: kind as (typeof KEYWORD_KINDS)[number],
      keyword: String(form.get('keyword') ?? ''),
      aliases: String(form.get('aliases') ?? '').split(',').map((a) => a.trim()).filter(Boolean),
      description: opt(form.get('description')),
      startsOn: opt(form.get('startsOn')),
      endsOn: opt(form.get('endsOn')),
      active: true,
      priority: Number(form.get('priority') || 0),
    });
  } catch {
    msg = '추가하지 못했어요. 이미 있는 키워드이거나 날짜·입력을 확인해 주세요.';
  }
  done(msg);
}

export async function toggleKeywordAction(id: number, active: boolean): Promise<void> {
  const admin = await requireAdmin();
  await updateKeyword(getDb(), admin.id, id, { active });
  done(active ? '켰어요.' : '껐어요.');
}

export async function deleteKeywordAction(id: number): Promise<void> {
  const admin = await requireAdmin();
  await deleteKeyword(getDb(), admin.id, id);
  done('지웠어요.');
}
