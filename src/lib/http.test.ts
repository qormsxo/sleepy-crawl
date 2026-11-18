import { describe, it, expect } from 'vitest';
import { createHttpClient, HttpBlockedError, RobotsDisallowedError } from './http';

type Route = (url: string) => { status: number; body?: string } | Error;

function fakeFetch(route: Route) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const r = route(url);
    if (r instanceof Error) throw r;
    return new Response(r.body ?? '', { status: r.status });
  }) as typeof fetch;
  return { impl, calls };
}

function clock() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

const base = { userAgent: 'SleepyCrawlerBot/1.0', minIntervalMs: 3000, timeoutMs: 1000, maxRetries: 3 };

describe('createHttpClient', () => {
  it('refuses paths disallowed by robots.txt and allows others', async () => {
    const f = fakeFetch((u) =>
      u.endsWith('/robots.txt') ? { status: 200, body: 'User-agent: *\nDisallow: /search\n' } : { status: 200, body: 'ok' },
    );
    const c = clock();
    const http = createHttpClient({ ...base, fetchImpl: f.impl, now: c.now, sleep: c.sleep });
    await expect(http.get('https://ex.com/search?q=a')).rejects.toBeInstanceOf(RobotsDisallowedError);
    await expect(http.get('https://ex.com/best')).resolves.toEqual({ status: 200, text: 'ok' });
    expect(f.calls.filter((u) => u.endsWith('/robots.txt'))).toHaveLength(1);
  });

  it('honours a more specific Allow over Disallow', async () => {
    const f = fakeFetch((u) =>
      u.endsWith('/robots.txt')
        ? { status: 200, body: 'User-agent: *\nDisallow: /board\nAllow: /board/best\n' }
        : { status: 200, body: 'ok' },
    );
    const c = clock();
    const http = createHttpClient({ ...base, fetchImpl: f.impl, now: c.now, sleep: c.sleep });
    await expect(http.get('https://ex.com/board/best/1')).resolves.toMatchObject({ status: 200 });
    await expect(http.get('https://ex.com/board/free')).rejects.toBeInstanceOf(RobotsDisallowedError);
  });

  it('treats a missing robots.txt as allow-all', async () => {
    const f = fakeFetch((u) => (u.endsWith('/robots.txt') ? { status: 404 } : { status: 200, body: 'ok' }));
    const c = clock();
    const http = createHttpClient({ ...base, fetchImpl: f.impl, now: c.now, sleep: c.sleep });
    await expect(http.get('https://ex.com/anything')).resolves.toMatchObject({ status: 200 });
  });

  it('retries 5xx with backoff and then succeeds', async () => {
    let n = 0;
    const f = fakeFetch((u) => {
      if (u.endsWith('/robots.txt')) return { status: 404 };
      n++;
      return n <= 2 ? { status: 503 } : { status: 200, body: 'ok' };
    });
    const c = clock();
    const http = createHttpClient({ ...base, fetchImpl: f.impl, now: c.now, sleep: c.sleep });
    await expect(http.get('https://ex.com/p')).resolves.toEqual({ status: 200, text: 'ok' });
    expect(f.calls.filter((u) => u.endsWith('/p'))).toHaveLength(3);
  });

  it('does not retry 429 and throws HttpBlockedError', async () => {
    const f = fakeFetch((u) => (u.endsWith('/robots.txt') ? { status: 404 } : { status: 429 }));
    const c = clock();
    const http = createHttpClient({ ...base, fetchImpl: f.impl, now: c.now, sleep: c.sleep });
    await expect(http.get('https://ex.com/p')).rejects.toBeInstanceOf(HttpBlockedError);
    expect(f.calls.filter((u) => u.endsWith('/p'))).toHaveLength(1);
  });

  it('throws after exhausting retries on network errors', async () => {
    const f = fakeFetch((u) => (u.endsWith('/robots.txt') ? { status: 404 } : new Error('ECONNRESET')));
    const c = clock();
    const http = createHttpClient({ ...base, fetchImpl: f.impl, now: c.now, sleep: c.sleep });
    await expect(http.get('https://ex.com/p')).rejects.toThrow('ECONNRESET');
    expect(f.calls.filter((u) => u.endsWith('/p'))).toHaveLength(4);
  });

  it('waits at least minIntervalMs between requests to the same host', async () => {
    const f = fakeFetch((u) => (u.endsWith('/robots.txt') ? { status: 404 } : { status: 200, body: 'ok' }));
    const c = clock();
    const http = createHttpClient({ ...base, fetchImpl: f.impl, now: c.now, sleep: c.sleep });
    await http.get('https://ex.com/a');
    await http.get('https://ex.com/b');
    expect(c.sleeps.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(3000);
  });

  it('sends the configured User-Agent', async () => {
    let ua = '';
    const impl = (async (_u: string | URL | Request, init?: RequestInit) => {
      ua = new Headers(init?.headers).get('user-agent') ?? '';
      return new Response('', { status: 404 });
    }) as typeof fetch;
    const c = clock();
    const http = createHttpClient({ ...base, fetchImpl: impl, now: c.now, sleep: c.sleep });
    await http.get('https://ex.com/a').catch(() => {});
    expect(ua).toBe('SleepyCrawlerBot/1.0');
  });
});
