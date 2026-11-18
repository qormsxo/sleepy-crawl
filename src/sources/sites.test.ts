import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { HttpClient } from '../lib/http';
import type { ParsedPost, SourceContext } from './types';
import { getAdapter } from './registry';
import { clearPageCache } from './html-adapter';
import { beforeEach } from 'vitest';

beforeEach(() => clearPageCache());

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const NOW = new Date('2026-11-19T10:00:00+09:00');

/** Serves fixture files by exact URL; anything else is a 404 so an unexpected URL fails loudly. */
function fakeHttp(routes: Record<string, string>): HttpClient & { requested: string[] } {
  const requested: string[] = [];
  return {
    requested,
    requestCount: 0,
    async get(url: string) {
      requested.push(url);
      const name = routes[url];
      if (!name) return { status: 404, text: '' };
      return { status: 200, text: fixture(name) };
    },
  };
}

async function list(key: string, lists: string[], routes: Record<string, string>) {
  const http = fakeHttp(routes);
  const ctx: SourceContext = { http, config: { lists }, now: NOW, timezone: 'Asia/Seoul' };
  const out: ParsedPost[] = [];
  for await (const p of getAdapter(key).listPopular(ctx)) out.push(p);
  return { out, http, ctx };
}

function ctxFor(routes: Record<string, string>): SourceContext {
  return { http: fakeHttp(routes), config: {}, now: NOW, timezone: "Asia/Seoul" };
}

const kst = (s: string) => new Date(`${s}+09:00`).toISOString();

describe('todayhumor', () => {
  const LIST = 'https://www.todayhumor.co.kr/board/list.php?table=bestofbest';
  const POST = 'https://www.todayhumor.co.kr/board/view.php?table=bestofbest&no=900001';

  it('lists best posts with canonical URLs and asks for the post page (list time = moved-to-best time)', async () => {
    const { out } = await list('todayhumor', [LIST], { [LIST]: 'todayhumor-list.html' });
    expect(out.map((p) => p.externalId)).toEqual(['bestofbest:900001', 'bestofbest:900002', 'humorbest:900003']);
    expect(out[0]).toMatchObject({ url: POST, title: '새벽 세 시에 라면 물 맞추기 대회 개최', needsDetail: true });
  });

  it('reads the original written time from the post, not the best-registration time', async () => {
    const ctx = ctxFor({ [POST]: 'todayhumor-post.html' });
    const p = await getAdapter('todayhumor').fetchPost(ctx, { url: POST, externalId: 'bestofbest:900001' });
    expect(p.postedAt?.toISOString()).toBe(kst('2026-11-19T01:47:09'));
    expect(p.precision).toBe('exact');
    expect(p.title).toBe('새벽 세 시에 라면 물 맞추기 대회 개최');
    expect(p.bodyText).toContain('계량컵');
  });

  it('matches its own post URLs', () => {
    expect(getAdapter('todayhumor').matchUrl(new URL('https://m.todayhumor.co.kr/view.php?table=humorbest&no=5&page=2'))).toEqual({
      externalId: 'humorbest:5',
    });
    expect(getAdapter('todayhumor').matchUrl(new URL('https://example.com/view.php?table=a&no=1'))).toBeNull();
  });
});

describe('fmkorea', () => {
  const LIST = 'https://www.fmkorea.com/best';
  const POST = 'https://www.fmkorea.com/best/800001';

  it('rewrites list links to the robots-allowed /best/<srl> form and strips comment counts', async () => {
    const { out } = await list('fmkorea', [LIST], { [LIST]: 'fmkorea-list.html' });
    expect(out.map((p) => p.url)).toEqual([POST, 'https://www.fmkorea.com/best/800002']);
    expect(out[0]).toMatchObject({ externalId: '800001', title: '자다가 일어나서 냉장고한테 사과함', precision: 'approximate', needsDetail: true });
    expect(out[0].postedAt?.toISOString()).toBe(kst('2026-11-19T06:00:00'));
    expect(out.some((p) => p.url.includes('index.php'))).toBe(false);
  });

  it('parses the post page', async () => {
    const ctx = ctxFor({ [POST]: 'fmkorea-post.html' });
    const p = await getAdapter('fmkorea').fetchPost(ctx, { url: POST, externalId: '800001' });
    expect(p).toMatchObject({ title: '자다가 일어나서 냉장고한테 사과함', precision: 'minute' });
    expect(p.postedAt?.toISOString()).toBe(kst('2026-11-19T01:12:00'));
    expect(p.bodyText).toContain('문을 너무 세게');
  });

  it('matches both /<srl> and /best/<srl>', () => {
    const a = getAdapter('fmkorea');
    expect(a.matchUrl(new URL('https://www.fmkorea.com/800001'))).toEqual({ externalId: '800001' });
    expect(a.matchUrl(new URL('https://m.fmkorea.com/best/800001'))).toEqual({ externalId: '800001' });
  });
});

describe('ruliweb', () => {
  const LIST = 'https://bbs.ruliweb.com/best/humor_only';
  const POST = 'https://bbs.ruliweb.com/best/board/300143/read/700001';

  it('skips notices, strips rank numbers, trusts HH:MM but not date-only times', async () => {
    const { out } = await list('ruliweb', [LIST], { [LIST]: 'ruliweb-list.html' });
    expect(out.map((p) => p.externalId)).toEqual(['300143/700001', '300143/700002']);
    expect(out[0]).toMatchObject({ url: POST, title: '편의점 직원이랑 눈인사 300일째', precision: 'minute', needsDetail: false });
    expect(out[0].postedAt?.toISOString()).toBe(kst('2026-11-19T01:12:00'));
    expect(out[1]).toMatchObject({ precision: 'approximate', needsDetail: true });
  });

  it('parses the post page', async () => {
    const ctx = ctxFor({ [POST]: 'ruliweb-post.html' });
    const p = await getAdapter('ruliweb').fetchPost(ctx, { url: POST, externalId: '300143/700001' });
    expect(p.postedAt?.toISOString()).toBe(kst('2026-11-19T01:12:40'));
    expect(p.bodyText).toContain('관계가 깨질');
  });
});

describe('inven', () => {
  const LIST = 'https://www.inven.co.kr/board/webzine/2097?my=chu';
  const POST = 'https://www.inven.co.kr/board/webzine/2097/600001';

  it('skips notices and drops the category tag from titles', async () => {
    const { out } = await list('inven', [LIST], { [LIST]: 'inven-list.html' });
    expect(out.map((p) => p.externalId)).toEqual(['webzine/2097/600001', 'webzine/2097/600002']);
    expect(out[0]).toMatchObject({ url: POST, title: '새벽에 깨달은 우주의 진리', needsDetail: false });
    expect(out[1].needsDetail).toBe(true);
  });

  it('parses the post page', async () => {
    const ctx = ctxFor({ [POST]: 'inven-post.html' });
    const p = await getAdapter('inven').fetchPost(ctx, { url: POST, externalId: 'webzine/2097/600001' });
    expect(p.postedAt?.toISOString()).toBe(kst('2026-11-19T01:12:00'));
    expect(p.bodyText).toContain('베개는');
  });
});

describe('clien', () => {
  const LIST = 'https://www.clien.net/service/board/park';
  const POST = 'https://www.clien.net/service/board/park/500001';

  it('uses the plain latest list, skips notices, drops query strings, reads full timestamps', async () => {
    const { out } = await list('clien', [LIST], { [LIST]: 'clien-list.html' });
    expect(out.map((p) => p.url)).toEqual([POST, 'https://www.clien.net/service/board/park/500002']);
    expect(out[0]).toMatchObject({ externalId: 'park/500001', title: '잠 안 와서 전자레인지 소리 흉내 연습', needsDetail: false });
    expect(out[0].postedAt?.toISOString()).toBe(kst('2026-11-19T01:12:30'));
  });

  it('parses the bot-friendly post page', async () => {
    const ctx = ctxFor({ [POST]: 'clien-post.html' });
    const p = await getAdapter('clien').fetchPost(ctx, { url: POST, externalId: 'park/500001' });
    expect(p).toMatchObject({ title: '잠 안 와서 전자레인지 소리 흉내 연습', precision: 'exact' });
    expect(p.postedAt?.toISOString()).toBe(kst('2026-11-19T01:12:30'));
    expect(p.bodyText).toContain('띵 소리');
  });
});

describe('humoruniv', () => {
  const LIST = 'https://web.humoruniv.com/board/humor/list.html?table=pds';
  const POST = 'https://web.humoruniv.com/board/humor/read.html?table=pds&number=1400001';

  it('lists pds posts and asks for the post page (list time = moved time)', async () => {
    const { out } = await list('humoruniv', [LIST], { [LIST]: 'humoruniv-list.html' });
    expect(out.map((p) => p.externalId)).toEqual(['pds:1400001', 'pds:1400002']);
    expect(out[0]).toMatchObject({ url: POST, title: '우리 집 강아지의 새벽 순찰', needsDetail: true });
  });

  it('reads the original written time and strips style/script from the body', async () => {
    const ctx = ctxFor({ [POST]: 'humoruniv-post.html' });
    const p = await getAdapter('humoruniv').fetchPost(ctx, { url: POST, externalId: 'pds:1400001' });
    expect(p.postedAt?.toISOString()).toBe(kst('2026-11-19T01:12:28'));
    expect(p.bodyText).toContain('현관 앞을 세 바퀴');
    expect(p.bodyText).not.toMatch(/line-height|var x/);
  });
});

describe('list configuration', () => {
  it('requires config.lists', async () => {
    await expect(list('inven', undefined as unknown as string[], {})).rejects.toThrow(/lists/);
  });

  it('turns a non-200 list response into an error', async () => {
    await expect(list('inven', ['https://www.inven.co.kr/board/webzine/2097?my=chu'], {})).rejects.toThrow(/404/);
  });
});

describe('post page reuse (crawl already opened it)', () => {
  it('serves a second fetchPost of the same URL from memory, without another request', async () => {
    const POST = 'https://www.todayhumor.co.kr/board/view.php?table=bestofbest&no=900001';
    const http = fakeHttp({ [POST]: 'todayhumor-post.html' });
    const ctx: SourceContext = { http, config: {}, now: NOW, timezone: 'Asia/Seoul' };
    const a = getAdapter('todayhumor');
    await a.fetchPost(ctx, { url: POST, externalId: 'bestofbest:900001' });
    const again = await a.fetchPost(ctx, { url: POST, externalId: 'bestofbest:900001' });
    expect(http.requested.filter((u) => u === POST)).toHaveLength(1);
    expect(again.bodyText).toContain('계량컵');
  });
});

describe('several lists', () => {
  it('keeps posts from healthy lists but throws when one list parses to nothing', async () => {
    const A = 'https://www.todayhumor.co.kr/board/list.php?table=bestofbest';
    const B = 'https://www.todayhumor.co.kr/board/list.php?table=humorbest';
    const http = fakeHttp({ [A]: 'todayhumor-list.html', [B]: 'inven-post.html' });
    const ctx: SourceContext = { http, config: { lists: [A, B] }, now: NOW, timezone: 'Asia/Seoul' };
    const got: string[] = [];
    await expect(
      (async () => {
        for await (const p of getAdapter('todayhumor').listPopular(ctx)) got.push(p.externalId!);
      })(),
    ).rejects.toThrow(/0 posts.*humorbest/);
    expect(got).toHaveLength(3);
  });
});
