import { describe, it, expect } from 'vitest';
import { isInNightWindow, nightHour, nightDate, localParts } from './time-window';

const KST = 'Asia/Seoul';

describe('time-window (Asia/Seoul)', () => {
  it.each([
    ['2026-11-18T13:59:59Z', false, null, null], // 22:59:59
    ['2026-11-18T14:00:00Z', true, 23, '2026-11-18'], // 23:00:00
    ['2026-11-18T15:00:00Z', true, 0, '2026-11-18'], // 00:00:00
    ['2026-11-18T17:59:59Z', true, 2, '2026-11-18'], // 02:59:59
    ['2026-11-18T18:00:00Z', false, null, null], // 03:00:00
  ] as const)('%s → in=%s hour=%s date=%s', (iso, inWin, hour, date) => {
    const t = new Date(iso);
    expect(isInNightWindow(t, KST)).toBe(inWin);
    expect(nightHour(t, KST)).toBe(hour);
    expect(nightDate(t, KST)).toBe(date);
  });

  it('crosses month boundary: KST 12/1 01:00 belongs to night of 11/30', () => {
    expect(nightDate(new Date('2026-11-30T16:00:00Z'), KST)).toBe('2026-11-30');
  });

  it('crosses year boundary: KST 1/1 00:30 belongs to night of 12/31', () => {
    expect(nightDate(new Date('2026-12-31T15:30:00Z'), KST)).toBe('2026-12-31');
  });
});

describe('time-window (other time zones)', () => {
  it('uses the given zone, not KST: NY 23:30 EST is in window', () => {
    const t = new Date('2026-11-19T04:30:00Z'); // NY 23:30 (EST, UTC-5)
    expect(isInNightWindow(t, 'America/New_York')).toBe(true);
    expect(isInNightWindow(t, KST)).toBe(false); // KST 13:30
  });

  it('follows Intl local hour across DST change', () => {
    const t = new Date('2026-03-08T07:30:00Z'); // NY just after spring-forward
    const { hour } = localParts(t, 'America/New_York');
    expect(hour).toBe(3);
    expect(isInNightWindow(t, 'America/New_York')).toBe(false);
  });

  it('localParts returns local wall-clock parts', () => {
    expect(localParts(new Date('2026-11-18T15:05:00Z'), KST)).toEqual({ y: 2026, m: 11, d: 19, hour: 0, minute: 5 });
  });
});
