export type LocalParts = { y: number; m: number; d: number; hour: number; minute: number };
export type NightHour = 23 | 0 | 1 | 2;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Wall-clock parts of `t` in time zone `tz`. */
export function localParts(t: Date, tz: string): LocalParts {
  const parts = formatterFor(tz).formatToParts(t);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), hour: get('hour'), minute: get('minute') };
}

/** 23:00:00 <= local time < 03:00:00 in `tz`. */
export function isInNightWindow(t: Date, tz: string): boolean {
  return nightHour(t, tz) !== null;
}

export function nightHour(t: Date, tz: string): NightHour | null {
  const { hour } = localParts(t, tz);
  return hour === 23 || hour === 0 || hour === 1 || hour === 2 ? hour : null;
}

/** The date the night "belongs" to: 23시대 = 당일, 0~2시대 = 전날. YYYY-MM-DD. */
export function nightDate(t: Date, tz: string): string | null {
  const hour = nightHour(t, tz);
  if (hour === null) return null;
  const { y, m, d } = localParts(t, tz);
  const base = new Date(Date.UTC(y, m - 1, hour === 23 ? d : d - 1));
  return base.toISOString().slice(0, 10);
}
