import { describe, it, expect } from 'vitest';
import { dueSources, type SchedulableSource } from './scheduler';

const kst = (hhmm: string, day = '2026-11-18') => new Date(`${day}T${hhmm}:00+09:00`);
const src = (over: Partial<SchedulableSource> = {}): SchedulableSource => ({
  id: 1,
  status: 'ACTIVE',
  timezone: 'Asia/Seoul',
  intervalOverride: null,
  ...over,
});

describe('dueSources', () => {
  it('runs an active source in its night window once the interval has passed', () => {
    expect(dueSources(kst('23:05'), [src()], new Map([[1, kst('22:50')]]), 10)).toEqual([1]);
  });

  it('waits for the interval', () => {
    expect(dueSources(kst('23:05'), [src()], new Map([[1, kst('23:00')]]), 10)).toEqual([]);
  });

  it('runs a never-run source immediately inside the window', () => {
    expect(dueSources(kst('23:00'), [src()], new Map(), 10)).toEqual([1]);
  });

  it('does not run outside the window', () => {
    expect(dueSources(kst('03:00', '2026-11-19'), [src()], new Map(), 10)).toEqual([]);
    expect(dueSources(kst('22:59'), [src()], new Map(), 10)).toEqual([]);
  });

  it('skips non-active sources', () => {
    expect(dueSources(kst('23:05'), [src({ status: 'DISABLED' })], new Map(), 10)).toEqual([]);
    expect(dueSources(kst('23:05'), [src({ status: 'UNSUPPORTED' })], new Map(), 10)).toEqual([]);
  });

  it('uses the source time zone (New York is mid-morning at KST 23:05)', () => {
    expect(dueSources(kst('23:05'), [src({ timezone: 'America/New_York' })], new Map(), 10)).toEqual([]);
  });

  it('honours a per-source interval override', () => {
    const last = new Map([[1, kst('23:00')]]);
    expect(dueSources(kst('23:05'), [src({ intervalOverride: 5 })], last, 10)).toEqual([1]);
  });
});
