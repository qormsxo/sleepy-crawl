import { count, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/client';
import { crawlRuns, posts, seenItems, sources, submissions } from '../db/schema';
import { SOURCE_STATUSES } from '../core/constants';
import { getAdapter } from '../sources/registry';
import { audit } from './audit';

const httpUrl = z.string().url().refine((u) => /^https?:\/\//.test(u), 'http(s) URL only');

/** Known config keys only; anything else is a typo that would silently do nothing. */
export const sourceConfigSchema = z
  .object({
    lists: z.array(httpUrl).min(1).optional(),
    maxDetailFetches: z.number().int().min(0).max(100).optional(),
    manualSubmission: z.boolean().optional(),
  })
  .strict();

const updateSchema = z.object({
  status: z.enum(SOURCE_STATUSES).optional(),
  statusReason: z.string().max(500).optional(),
  intervalOverride: z.number().int().min(1).max(1440).nullable().optional(),
  config: sourceConfigSchema.optional(),
});

export async function updateSource(db: DB, adminId: number, id: number, input: z.input<typeof updateSchema>): Promise<void> {
  const change = updateSchema.parse(input); // throws before touching the DB
  const [before] = await db.select().from(sources).where(eq(sources.id, id));
  if (!before) throw new Error(`source ${id} not found`);
  await db.update(sources).set(change).where(eq(sources.id, id));
  await audit(db, adminId, 'source.update', `source:${before.key}`, {
    before: { status: before.status, intervalOverride: before.intervalOverride, config: before.config },
    after: change,
  });
}

const createSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]{2,40}$/),
  name: z.string().min(1).max(100),
  adapterKey: z.string(),
  region: z.enum(['KR', 'GLOBAL']).default('KR'),
  timezone: z.string().default('Asia/Seoul'),
  config: sourceConfigSchema.default({}),
});

/** "Registering" a community = a config row for an adapter that already exists in code (설계 7-12). Starts DISABLED. */
export async function createSource(db: DB, adminId: number, input: z.input<typeof createSchema>): Promise<number> {
  const v = createSchema.parse(input);
  try {
    getAdapter(v.adapterKey);
  } catch {
    throw new Error(`no adapter "${v.adapterKey}" in code: a new site needs an adapter first`);
  }
  const [row] = await db
    .insert(sources)
    .values({ ...v, status: 'DISABLED', statusReason: '관리자 등록, 확인 후 켜기' })
    .returning({ id: sources.id });
  await audit(db, adminId, 'source.create', `source:${v.key}`, { adapterKey: v.adapterKey });
  return row.id;
}

/** Only sources with no history can be deleted; otherwise disable them so stats stay intact. */
export async function deleteSource(db: DB, adminId: number, id: number): Promise<void> {
  const [s] = await db.select().from(sources).where(eq(sources.id, id));
  if (!s) return;
  const used = async (table: typeof crawlRuns | typeof posts | typeof submissions | typeof seenItems) =>
    Number((await db.select({ n: count() }).from(table).where(eq(table.sourceId, id)))[0].n) > 0;
  if ((await used(crawlRuns)) || (await used(posts)) || (await used(submissions)) || (await used(seenItems))) {
    throw new Error('source has history: disable it instead of deleting');
  }
  await db.delete(sources).where(eq(sources.id, id));
  await audit(db, adminId, 'source.delete', `source:${s.key}`, {});
}

export async function unpauseSource(db: DB, adminId: number, id: number): Promise<void> {
  const [s] = await db.select().from(sources).where(eq(sources.id, id));
  if (!s) return;
  await db
    .update(sources)
    .set({ pausedUntil: null, consecutiveFailures: 0, ...(s.status === 'DEGRADED' ? { status: 'ACTIVE' as const } : {}) })
    .where(eq(sources.id, id));
  await audit(db, adminId, 'source.unpause', `source:${s.key}`, { pausedUntil: s.pausedUntil });
}
