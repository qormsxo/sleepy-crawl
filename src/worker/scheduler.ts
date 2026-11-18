import { desc, eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { crawlRuns, sources } from '../db/schema';
import { isInNightWindow, localParts } from '../core/time-window';
import { getSetting } from '../lib/settings';

export type SchedulableSource = {
  id: number;
  status: string;
  timezone: string;
  intervalOverride: number | null;
  pausedUntil?: Date | null;
};

export type FollowupOptions = { untilHour: number; intervalMin: number };

/** Minutes between runs right now for this source, or null when it should not run at this local hour. */
function intervalNow(now: Date, s: SchedulableSource, nightIntervalMin: number, followup?: FollowupOptions): number | null {
  if (isInNightWindow(now, s.timezone)) return s.intervalOverride ?? nightIntervalMin;
  // Posts written 23–03 usually reach popular lists hours later, so keep checking after the window.
  const { hour } = localParts(now, s.timezone);
  if (followup && hour >= 3 && hour < followup.untilHour) return followup.intervalMin;
  return null;
}

/** Sources that are runnable now (night window or follow-up period) and whose interval has elapsed. */
export function dueSources(
  now: Date,
  list: SchedulableSource[],
  lastRunAt: Map<number, Date>,
  defaultIntervalMin: number,
  followup?: FollowupOptions,
): number[] {
  return (
    list
      // DEGRADED sources keep being tried so they can recover; paused ones wait out their pause.
      .filter((s) => (s.status === 'ACTIVE' || s.status === 'DEGRADED') && !(s.pausedUntil && s.pausedUntil > now))
      .filter((s) => {
        const interval = intervalNow(now, s, defaultIntervalMin, followup);
        if (interval === null) return false;
        const last = lastRunAt.get(s.id);
        return !last || now.getTime() - last.getTime() >= interval * 60_000;
      })
      .map((s) => s.id)
  );
}

/** Load sources + last run times from the DB and compute which are due. */
export async function findDueSources(db: DB, now: Date): Promise<number[]> {
  const list = await db.select().from(sources);
  const interval = await getSetting(db, 'crawl_interval_minutes', 10);
  const followup = {
    untilHour: await getSetting(db, 'followup_until_hour', 15),
    intervalMin: await getSetting(db, 'followup_interval_minutes', 30),
  };
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
  return dueSources(now, list, lastRunAt, interval, followup);
}
