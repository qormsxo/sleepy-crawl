import { eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { settings } from '../db/schema';

/** Read a setting; falls back to `fallback` when the key is missing. */
export async function getSetting<T>(db: DB, key: string, fallback: T): Promise<T> {
  const rows = await db.select().from(settings).where(eq(settings.key, key));
  return rows.length ? (rows[0].value as T) : fallback;
}
