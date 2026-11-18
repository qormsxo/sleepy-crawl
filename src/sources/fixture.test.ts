import { describe, it, expect } from 'vitest';
import { fixtureAdapter } from './fixture';
import { getAdapter } from './registry';
import type { ParsedPost, SourceContext } from './types';

const ctx = { config: {}, now: new Date('2026-11-18T19:00:00Z'), timezone: 'Asia/Seoul' } as unknown as SourceContext;

async function all(it: AsyncIterable<ParsedPost>) {
  const out: ParsedPost[] = [];
  for await (const p of it) out.push(p);
  return out;
}

describe('fixtureAdapter', () => {
  it('lists at least 12 sample posts with parsed times', async () => {
    const posts = await all(fixtureAdapter.listPopular(ctx));
    expect(posts.length).toBeGreaterThanOrEqual(12);
    expect(posts.some((p) => p.postedAt === null)).toBe(true);
    expect(posts.find((p) => p.externalId === '1')?.postedAt?.toISOString()).toBe('2026-11-18T14:00:00.000Z');
  });

  it('matches its own URLs', () => {
    expect(fixtureAdapter.matchUrl(new URL('https://fixture.local/p/1'))).toEqual({ externalId: '1' });
    expect(fixtureAdapter.matchUrl(new URL('https://other.example/p/1'))).toBeNull();
  });

  it('fetches a post body by id', async () => {
    const p = await fixtureAdapter.fetchPost(ctx, { url: 'https://fixture.local/p/1', externalId: '1' });
    expect(p.bodyText?.length).toBeGreaterThan(0);
  });
});

describe('registry', () => {
  it('returns the fixture adapter outside production', () => {
    expect(getAdapter('fixture').key).toBe('fixture');
  });

  it('refuses the fixture adapter in production', () => {
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    try {
      expect(() => getAdapter('fixture')).toThrow();
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prev;
    }
  });

  it('throws for unknown adapters', () => {
    expect(() => getAdapter('nope')).toThrow();
  });
});
