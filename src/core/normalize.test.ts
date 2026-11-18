import { describe, it, expect } from 'vitest';
import { canonicalizeUrl, makePreview } from './normalize';

describe('canonicalizeUrl', () => {
  it('lowercases host, strips tracking params and hash, sorts query, maps mobile host, trims slash', () => {
    expect(
      canonicalizeUrl('https://M.Example.com/b/123/?utm_source=x&b=2&a=1#c', {
        hostMap: { 'm.example.com': 'example.com' },
      }),
    ).toBe('https://example.com/b/123?a=1&b=2');
  });

  it('removes fbclid, gclid and source-specific params', () => {
    expect(canonicalizeUrl('https://ex.com/p?id=7&fbclid=z&gclid=y&ref=home', { stripParams: ['ref'] })).toBe(
      'https://ex.com/p?id=7',
    );
  });

  it('keeps root path as-is', () => {
    expect(canonicalizeUrl('https://ex.com/')).toBe('https://ex.com/');
  });
});

describe('makePreview', () => {
  it('collapses whitespace and truncates with ellipsis', () => {
    expect(makePreview('  가나다\n\n라마바  ', 5)).toBe('가나다 라…');
  });

  it('returns short text unchanged', () => {
    expect(makePreview('짧은 글', 120)).toBe('짧은 글');
  });

  it('returns empty string for blank input', () => {
    expect(makePreview('   \n ', 10)).toBe('');
  });
});
