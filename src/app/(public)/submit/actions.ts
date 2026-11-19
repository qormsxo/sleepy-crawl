'use server';

import { headers } from 'next/headers';
import { getDb } from '@/db/client';
import { clientIpFrom, hashIp, receiveSubmission, verifyTurnstile } from '@/submissions/receive';
import { submissionConfig } from '@/lib/submission-config';
import type { SubmitState } from './SubmitForm';

/** Client IP as seen by the reverse proxy (see clientIpFrom). Only its salted hash is stored. */
async function clientIp(): Promise<string> {
  return clientIpFrom(await headers()) ?? 'unknown';
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
    if (result.ok) return { status: 'ok' };
    // Echo the typed values back so the form keeps them (React resets forms after an action).
    const keep = ['url', 'note', 'suggestedCategory', 'manualTitle', 'manualPostedAt', 'manualExcerpt'];
    const values = Object.fromEntries(keep.map((k) => [k, text(k) ?? '']));
    return { status: 'error', error: result.error, field: result.field, values };
  } catch (err) {
    console.error('submitAction failed', err);
    return { status: 'error', error: 'server' };
  }
}
