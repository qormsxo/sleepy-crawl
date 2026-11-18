import { describe, it, expect } from 'vitest';
import { parseKstAbsolute, parseKstListTime } from './kst-time';

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

describe('parseKstAbsolute', () => {
  it.each([
    ['2026.11.18 16:59', '2026-11-18T07:59:00.000Z'],
    ['2026-11-18 19:43', '2026-11-18T10:43:00.000Z'],
    ['2026/11/17 13:50:09', '2026-11-17T04:50:09.000Z'],
    ['2026.11.18 (16:54:40)', '2026-11-18T07:54:40.000Z'],
    ['26/11/18 07:48', '2026-11-17T22:48:00.000Z'],
    ['2026-11-18T16:54:40', '2026-11-18T07:54:40.000Z'],
    ['  원글작성시간 : 2026/11/17 13:50:09 ', '2026-11-17T04:50:09.000Z'],
  ])('%s → %s (read as KST)', (s, expected) => {
    expect(iso(parseKstAbsolute(s))).toBe(expected);
  });

  it.each(['', '어제', '2026.13.40 25:99', 'not a date'])('rejects %j', (s) => {
    expect(parseKstAbsolute(s)).toBeNull();
  });
});

describe('parseKstListTime', () => {
  const now = new Date('2026-11-18T19:00:00+09:00');

  it('reads HH:MM as today (minute precision)', () => {
    expect(parseKstListTime('16:54', now)).toEqual({ at: new Date('2026-11-18T16:54:00+09:00'), precision: 'minute' });
  });

  it('reads a future HH:MM as yesterday (e.g. 23:55 seen at 00:10)', () => {
    const justAfterMidnight = new Date('2026-11-19T00:10:00+09:00');
    expect(iso(parseKstListTime('23:55', justAfterMidnight)?.at)).toBe(iso(new Date('2026-11-18T23:55:00+09:00')));
  });

  it.each([
    ['4 시간 전', '2026-11-18T15:00:00+09:00'],
    ['12분 전', '2026-11-18T18:48:00+09:00'],
    ['방금', '2026-11-18T19:00:00+09:00'],
  ])('reads relative %j as approximate', (s, expected) => {
    expect(parseKstListTime(s, now)).toEqual({ at: new Date(expected), precision: 'approximate' });
  });

  it.each([
    ['17.11.09', '2017-11-09T00:00:00+09:00'],
    ['2026.11.17', '2026-11-17T00:00:00+09:00'],
    ['26.11.17', '2026-11-17T00:00:00+09:00'],
  ])('reads date-only %j as approximate midnight', (s, expected) => {
    expect(parseKstListTime(s, now)).toEqual({ at: new Date(expected), precision: 'approximate' });
  });

  it('accepts full timestamps with minute precision', () => {
    expect(parseKstListTime('26/11/18 07:48', now)).toEqual({ at: new Date('2026-11-18T07:48:00+09:00'), precision: 'minute' });
  });

  it('returns null for unknown text', () => {
    expect(parseKstListTime('공지', now)).toBeNull();
  });
});
