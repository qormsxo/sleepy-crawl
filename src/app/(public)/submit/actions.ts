'use server';

import { headers } from 'next/headers';
import { getDb } from '@/db/client';
import { hashIp, receiveSubmission, verifyTurnstile } from '@/submissions/receive';
import { submissionConfig } from '@/lib/submission-config';
import type { SubmitState } from './SubmitForm';

/** Client IP as seen by the reverse proxy (Caddy sets X-Forwarded-For). Only its salted hash is stored. */
async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}

export async function submitAction(_prev: SubmitState, form: FormData): Promise<SubmitState> {
  try {
    const config = submissionConfig();
    const ip = await clientIp();
    const text = (name: string) => {
      const v = form.get(name);
      return typeof v === 'string' ? v : undefined;
    };
    const result = await receiveSubmission(
      getDb(),
      {
        url: text('url') ?? '',
        captchaToken: text('cf-turnstile-response') ?? '',
        note: text('note'),
        suggestedCategory: text('suggestedCategory'),
        manualTitle: text('manualTitle'),
        manualPostedAt: text('manualPostedAt'),
        manualExcerpt: text('manualExcerpt'),
      },
      {
        now: new Date(),
        ipHash: hashIp(ip, config.ipSalt),
        verifyCaptcha: (token) => verifyTurnstile(token, ip === 'unknown' ? null : ip, config.turnstileSecret),
      },
    );
    return result.ok ? { status: 'ok' } : { status: 'error', error: result.error, field: result.field };
  } catch (err) {
    console.error('submitAction failed', err);
    return { status: 'error', error: 'server' };
  }
}
