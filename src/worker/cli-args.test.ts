import { describe, it, expect } from 'vitest';
import { parseCliArgs } from './cli-args';

describe('parseCliArgs', () => {
  it('reads the command and source without --now', () => {
    const r = parseCliArgs(['crawl', 'inven']);
    expect(r.command).toBe('crawl');
    expect(r.sourceKey).toBe('inven');
    expect(Math.abs(r.now.getTime() - Date.now())).toBeLessThan(5000);
  });

  it('reads --now wherever it appears', () => {
    expect(parseCliArgs(['crawl', '--now', '2026-11-18T19:00:00Z', 'clien'])).toEqual({
      command: 'crawl',
      sourceKey: 'clien',
      now: new Date('2026-11-18T19:00:00Z'),
    });
  });

  it('defaults the source to fixture', () => {
    expect(parseCliArgs(['eval']).sourceKey).toBe('fixture');
  });

  it('rejects an invalid --now', () => {
    expect(() => parseCliArgs(['crawl', '--now', 'yesterday'])).toThrow(/--now/);
  });
});
