'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { requireAdmin } from '@/lib/admin-session';
import { updatePost } from '@/admin/posts';
import { CATEGORIES, type Category } from '@/core/constants';

export async function updatePostAction(id: number, form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const status = String(form.get('status') ?? '');
  const scoreRaw = String(form.get('score') ?? '').trim();
  const categories = form.getAll('categories').map(String).filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c));
  try {
    await updatePost(getDb(), admin.id, id, {
      status: status ? (status as 'PUBLISHED' | 'REVIEW' | 'HIDDEN' | 'BLOCKED') : undefined,
      score: scoreRaw === '' ? undefined : Number(scoreRaw),
      categories,
    });
  } catch {
    redirect(`/admin/posts/${id}?error=1`);
  }
  redirect(`/admin/posts/${id}?saved=1`);
}
