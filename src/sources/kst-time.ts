/** KST has no daylight saving: a fixed +09:00 offset. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kst(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Date | null {
  if (y < 100) y += 2000;
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi, s) - KST_OFFSET_MS);
  // Reject overflow such as month 13 or 25:99 instead of silently rolling over.
  const back = new Date(t.getTime() + KST_OFFSET_MS);
  const ok =
    back.getUTCFullYear() === y &&
    back.getUTCMonth() === mo - 1 &&
    back.getUTCDate() === d &&
    back.getUTCHours() === h &&
    back.getUTCMinutes() === mi &&
    back.getUTCSeconds() === s;
  return ok ? t : null;
}

const ABSOLUTE = /(\d{2,4})[./-](\d{1,2})[./-](\d{1,2})[\sT(]*(\d{1,2}):(\d{2})(?::(\d{2}))?/;
const DATE_ONLY = /^(\d{2,4})[./-](\d{1,2})[./-](\d{1,2})$/;
const CLOCK_ONLY = /^(\d{1,2}):(\d{2})$/;

/** A date+time anywhere in `s` (YYYY.MM.DD HH:MM[:SS], YY/MM/DD HH:MM, ISO without zone), read as KST. */
export function parseKstAbsolute(s: string): Date | null {
  const m = s.match(ABSOLUTE);
  if (!m) return null;
  const [, y, mo, d, h, mi, sec] = m;
  return kst(Number(y), Number(mo), Number(d), Number(h), Number(mi), Number(sec ?? 0));
}

export type ListTime = { at: Date; precision: 'minute' | 'approximate' };

/** Times as shown in board lists: "16:54", "4 시간 전", "방금", "17.11.09", or a full timestamp. */
export function parseKstListTime(raw: string, now: Date): ListTime | null {
  const s = raw.replace(/\s+/g, ' ').trim();

  const clock = s.match(CLOCK_ONLY);
  if (clock) {
    const local = new Date(now.getTime() + KST_OFFSET_MS);
    const today = kst(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate(), Number(clock[1]), Number(clock[2]));
    if (!today) return null;
    const at = today.getTime() > now.getTime() ? new Date(today.getTime() - 24 * 60 * 60 * 1000) : today;
    return { at, precision: 'minute' };
  }

  if (s === '방금' || /^방금\s*전$/.test(s)) return { at: new Date(now), precision: 'approximate' };
  const rel = s.match(/^(\d+)\s*(초|분|시간|일)\s*전$/);
  if (rel) {
    const unit = { 초: 1_000, 분: 60_000, 시간: 3_600_000, 일: 86_400_000 }[rel[2] as '초' | '분' | '시간' | '일'];
    return { at: new Date(now.getTime() - Number(rel[1]) * unit), precision: 'approximate' };
  }

  const dateOnly = s.match(DATE_ONLY);
  if (dateOnly) {
    const at = kst(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]));
    return at ? { at, precision: 'approximate' } : null;
  }

  const abs = parseKstAbsolute(s);
  return abs ? { at: abs, precision: 'minute' } : null;
}
