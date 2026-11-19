import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../tests/helpers/db';
import { seed } from '@/db/seed';
import type { DB } from '@/db/client';
import { submissions } from '@/db/schema';
import { hashIp, receiveSubmission, verifyTurnstile, type SubmissionInput } from './receive';

const NOW = new Date('2026-11-19T10:00:00+09:00');
const CLIEN = 'https://www.clien.net/service/board/park/19294872';
const DC = 'https://m.dcinside.com/board/programming/12345';

let db: DB;
const pass = async () => true;
const deps = (over: Partial<Parameters<typeof receiveSubmission>[2]> = {}) => ({ now: NOW, ipHash: 'h1', verifyCaptcha: pass, ...over });
const input = (over: Partial<SubmissionInput> = {}): SubmissionInput => ({ url: CLIEN, captchaToken: 't', ...over });
const manual = { manualTitle: '새벽에 쓴 시', manualPostedAt: '2026-11-19 01:30', manualExcerpt: '잠이 안 와서 냉장고 불빛 아래에서 시를 써 봤다. 제목은 계란.' };

beforeEach(async () => {
  db = await createTestDb();
  await seed(db);
});

describe('receiveSubmission', () => {
  it('stores a valid submission as RECEIVED with only the IP hash', async () => {
    expect(await receiveSubmission(db, input({ note: '이거 진짜 웃김', suggestedCategory: 'ABSURD' }), deps())).toEqual({ ok: true });
    const [row] = await db.select().from(submissions);
    expect(row).toMatchObject({ status: 'RECEIVED', mode: 'auto', ipHash: 'h1', canonicalUrl: CLIEN, note: '이거 진짜 웃김', suggestedCategory: 'ABSURD' });
  });

  it('rejects a failed bot check before anything else', async () => {
    expect(await receiveSubmission(db, input(), deps({ verifyCaptcha: async () => false }))).toEqual({ ok: false, error: 'captcha' });
    expect(await db.select().from(submissions)).toHaveLength(0);
  });

  it('allows 5 per hour per IP and rejects the 6th', async () => {
    for (let i = 0; i < 5; i++) expect((await receiveSubmission(db, input({ url: `${CLIEN}${i}` }), deps())).ok).toBe(true);
    expect(await receiveSubmission(db, input(), deps())).toEqual({ ok: false, error: 'rate_limited' });
    expect((await receiveSubmission(db, input(), deps({ ipHash: 'other' }))).ok).toBe(true);
  });

  it('applies the daily limit across hours', async () => {
    for (let i = 0; i < 20; i++) {
      await db.insert(submissions).values({ url: CLIEN, ipHash: 'h1', mode: 'auto', createdAt: new Date(NOW.getTime() - (2 + i) * 3_600_000 / 2) });
    }
    expect(await receiveSubmission(db, input(), deps())).toEqual({ ok: false, error: 'rate_limited' });
  });

  it.each([
    ['https://example.com/a', 'unsupported_site'],
    ['nope', 'invalid_url'],
  ])('rejects %s', async (url, error) => {
    expect(await receiveSubmission(db, input({ url }), deps())).toEqual({ ok: false, error, field: 'url' });
  });

  it('requires the manual fields for DCInside', async () => {
    expect(await receiveSubmission(db, input({ url: DC }), deps())).toEqual({ ok: false, error: 'manual_required', field: 'manualTitle' });
  });

  it('accepts a complete DCInside manual submission', async () => {
    expect(await receiveSubmission(db, input({ url: DC, ...manual }), deps())).toEqual({ ok: true });
    const [row] = await db.select().from(submissions);
    expect(row).toMatchObject({ mode: 'manual', manualTitle: '새벽에 쓴 시', externalId: 'board:programming:12345' });
    expect(row.manualPostedAt?.toISOString()).toBe(new Date('2026-11-19T01:30:00+09:00').toISOString());
  });

  it.each([
    [{ manualPostedAt: '어제 새벽' }, 'manualPostedAt'],
    [{ manualPostedAt: '2026-11-20 01:30' }, 'manualPostedAt'], // future
    [{ manualExcerpt: '짧음' }, 'manualExcerpt'],
    [{ manualExcerpt: '가'.repeat(1001) }, 'manualExcerpt'],
    [{ manualTitle: '가'.repeat(201) }, 'manualTitle'],
  ])('validates manual field %j', async (over, field) => {
    expect(await receiveSubmission(db, input({ url: DC, ...manual, ...over }), deps())).toMatchObject({ ok: false, field });
  });

  it('validates note length and category', async () => {
    expect(await receiveSubmission(db, input({ note: '가'.repeat(301) }), deps())).toMatchObject({ ok: false, field: 'note' });
    expect(await receiveSubmission(db, input({ suggestedCategory: 'FUNNY' }), deps())).toMatchObject({ ok: false, field: 'suggestedCategory' });
  });
});

describe('hashIp', () => {
  it('is stable per salt, differs across salts, and never contains the IP', () => {
    expect(hashIp('203.0.113.7', 's')).toBe(hashIp('203.0.113.7', 's'));
    expect(hashIp('203.0.113.7', 's')).not.toBe(hashIp('203.0.113.7', 't'));
    expect(hashIp('203.0.113.7', 's')).not.toContain('203.0.113.7');
  });
});

describe('verifyTurnstile', () => {
  it('posts the token, secret and IP to siteverify and reads success', async () => {
    let body = '';
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      body = String(init?.body);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as typeof fetch;
    expect(await verifyTurnstile('tok', '203.0.113.7', 'sec', fetchImpl)).toBe(true);
    expect(body).toContain('response=tok');
    expect(body).toContain('secret=sec');
  });

  it('fails closed on errors and empty tokens', async () => {
    const boom = (async () => Promise.reject(new Error('down'))) as typeof fetch;
    expect(await verifyTurnstile('tok', null, 'sec', boom)).toBe(false);
    expect(await verifyTurnstile('', null, 'sec', boom)).toBe(false);
  });
});

describe('clientIpFrom', () => {
  it('reads the first X-Forwarded-For hop by default (proxy overwrites the header)', async () => {
    const { clientIpFrom } = await import('./receive');
    const h = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });
    expect(clientIpFrom(h, {})).toBe('203.0.113.7');
  });

  it('uses the configured header (e.g. CF-Connecting-IP behind Cloudflare)', async () => {
    const { clientIpFrom } = await import('./receive');
    const h = new Headers({ 'x-forwarded-for': '6.6.6.6', 'cf-connecting-ip': '198.51.100.9' });
    expect(clientIpFrom(h, { CLIENT_IP_HEADER: 'cf-connecting-ip' })).toBe('198.51.100.9');
  });

  it('returns null when the header is missing', async () => {
    const { clientIpFrom } = await import('./receive');
    expect(clientIpFrom(new Headers(), {})).toBeNull();
  });
});
