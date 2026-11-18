import { createHash } from 'node:crypto';
import { and, count, eq, gt } from 'drizzle-orm';
import type { DB } from '../db/client';
import { submissions } from '../db/schema';
import { CATEGORIES, type Category } from '../core/constants';
import { getSetting } from '../lib/settings';
import { parseKstAbsolute } from '../sources/kst-time';
import { resolveSubmissionTarget } from './target';

export type SubmissionInput = {
  url: string;
  captchaToken: string;
  note?: string;
  suggestedCategory?: string;
  manualTitle?: string;
  manualPostedAt?: string;
  manualExcerpt?: string;
};

export type ReceiveError =
  | 'captcha'
  | 'rate_limited'
  | 'invalid_url'
  | 'unsupported_site'
  | 'manual_required'
  | 'invalid_field';
export type ReceiveResult = { ok: true } | { ok: false; error: ReceiveError; field?: string };

export const LIMITS = { note: 300, manualTitle: 200, manualExcerptMin: 20, manualExcerptMax: 1000 };

/** Salted SHA-256 of the client IP: enough for rate limiting, never the IP itself. */
export function hashIp(ip: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

/** Cloudflare Turnstile server-side check. Fails closed: any error means "not verified". */
export async function verifyTurnstile(
  token: string,
  ip: string | null,
  secret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) });
    const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

const fail = (error: ReceiveError, field?: string): ReceiveResult => ({ ok: false, error, ...(field ? { field } : {}) });

/**
 * Validate and store an anonymous submission (status RECEIVED). Nothing is fetched here:
 * the worker processes it later. Order: bot check → rate limit → target → fields.
 */
export async function receiveSubmission(
  db: DB,
  input: SubmissionInput,
  deps: { now: Date; ipHash: string; verifyCaptcha: (token: string) => Promise<boolean> },
): Promise<ReceiveResult> {
  if (!(await deps.verifyCaptcha(input.captchaToken))) return fail('captcha');

  const perHour = await getSetting(db, 'submission_per_hour', 5);
  const perDay = await getSetting(db, 'submission_per_day', 20);
  const since = async (ms: number) => {
    const [{ n }] = await db
      .select({ n: count() })
      .from(submissions)
      .where(and(eq(submissions.ipHash, deps.ipHash), gt(submissions.createdAt, new Date(deps.now.getTime() - ms))));
    return n;
  };
  if ((await since(3_600_000)) >= perHour || (await since(86_400_000)) >= perDay) return fail('rate_limited');

  const target = await resolveSubmissionTarget(db, input.url);
  if ('error' in target) return fail(target.error, 'url');

  const note = input.note?.trim() || null;
  if (note && Array.from(note).length > LIMITS.note) return fail('invalid_field', 'note');
  const category = input.suggestedCategory?.trim() || null;
  if (category && !(CATEGORIES as readonly string[]).includes(category)) return fail('invalid_field', 'suggestedCategory');

  let manual: { manualTitle: string; manualPostedAt: Date; manualExcerpt: string } | null = null;
  if (target.mode === 'manual') {
    const title = input.manualTitle?.trim() ?? '';
    const excerpt = input.manualExcerpt?.trim() ?? '';
    const when = input.manualPostedAt?.trim() ?? '';
    if (!title && !excerpt && !when) return fail('manual_required', 'manualTitle');
    if (!title || Array.from(title).length > LIMITS.manualTitle) return fail('invalid_field', 'manualTitle');
    const postedAt = parseKstAbsolute(when);
    if (!postedAt || postedAt.getTime() > deps.now.getTime()) return fail('invalid_field', 'manualPostedAt');
    const len = Array.from(excerpt).length;
    if (len < LIMITS.manualExcerptMin || len > LIMITS.manualExcerptMax) return fail('invalid_field', 'manualExcerpt');
    manual = { manualTitle: title, manualPostedAt: postedAt, manualExcerpt: excerpt };
  }

  await db.insert(submissions).values({
    url: input.url.trim(),
    canonicalUrl: target.canonicalUrl,
    sourceId: target.sourceId,
    externalId: target.externalId,
    note,
    suggestedCategory: category as Category | null,
    ipHash: deps.ipHash,
    mode: target.mode,
    ...(manual ?? {}),
    createdAt: deps.now,
  });
  return { ok: true };
}
