import { desc, eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { crawlRuns, sources } from '../db/schema';
import { isInNightWindow } from '../core/time-window';
import { getSetting } from '../lib/settings';

export type SchedulableSource = {
  id: number;
  status: string;
  timezone: string;
  intervalOverride: number | null;
  pausedUntil?: Date | null;
};

/** Sources whose local night window is open and whose interval has elapsed since their last run. */
export function dueSources(
  now: Date,
  list: SchedulableSource[],
  lastRunAt: Map<number, Date>,
  defaultIntervalMin: number,
): number[] {
  return list
    // DEGRADED sources keep being tried so they can recover; paused ones wait out their pause.
    .filter((s) => (s.status === 'ACTIVE' || s.status === 'DEGRADED') && !(s.pausedUntil && s.pausedUntil > now))
    .filter((s) => isInNightWindow(now, s.timezone))
    .filter((s) => {
      const last = lastRunAt.get(s.id);
      const intervalMs = (s.intervalOverride ?? defaultIntervalMin) * 60_000;
      return !last || now.getTime() - last.getTime() >= intervalMs;
    })
    .map((s) => s.id);
}

/** Load sources + last run times from the DB and compute which are due. */
export async function findDueSources(db: DB, now: Date): Promise<number[]> {
  const list = await db.select().from(sources);
  const interval = await getSetting(db, 'crawl_interval_minutes', 10);
  const lastRunAt = new Map<number, Date>();
  for (const s of list) {
    const [last] = await db
      .select({ startedAt: crawlRuns.startedAt })
      .from(crawlRuns)
      .where(eq(crawlRuns.sourceId, s.id))
      .orderBy(desc(crawlRuns.startedAt))
      .limit(1);
    if (last) lastRunAt.set(s.id, last.startedAt);
  }
  return dueSources(now, list, lastRunAt, interval);
}
