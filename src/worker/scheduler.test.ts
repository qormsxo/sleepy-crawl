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

describe('dueSources with protection', () => {
  it('skips a paused source until the pause ends', () => {
    const paused = src({ pausedUntil: kst('23:30') });
    expect(dueSources(kst('23:05'), [paused], new Map(), 10)).toEqual([]);
    expect(dueSources(kst('23:31'), [paused], new Map(), 10)).toEqual([1]);
  });

  it('keeps retrying DEGRADED sources so they can recover', () => {
    expect(dueSources(kst('23:05'), [src({ status: 'DEGRADED' })], new Map(), 10)).toEqual([1]);
  });
});

describe('dueSources follow-up window (popular lists lag hours behind)', () => {
  const day = '2026-11-19';
  const followup = { untilHour: 15, intervalMin: 30 };

  it('uses the night interval inside 23:00–02:59', () => {
    expect(dueSources(kst('02:59', day), [src()], new Map([[1, kst('02:48', day)]]), 10, followup)).toEqual([1]);
  });

  it('uses the follow-up interval from 03:00 until untilHour', () => {
    expect(dueSources(kst('03:10', day), [src()], new Map([[1, kst('02:50', day)]]), 10, followup)).toEqual([]);
    expect(dueSources(kst('03:20', day), [src()], new Map([[1, kst('02:50', day)]]), 10, followup)).toEqual([1]);
    expect(dueSources(kst('14:59', day), [src()], new Map([[1, kst('14:20', day)]]), 10, followup)).toEqual([1]);
  });

  it('stops at untilHour', () => {
    expect(dueSources(kst('15:00', day), [src()], new Map(), 10, followup)).toEqual([]);
    expect(dueSources(kst('22:30', day), [src()], new Map(), 10, followup)).toEqual([]);
  });

  it('has no follow-up when untilHour is 3', () => {
    expect(dueSources(kst('03:30', day), [src()], new Map(), 10, { untilHour: 3, intervalMin: 30 })).toEqual([]);
  });
});
