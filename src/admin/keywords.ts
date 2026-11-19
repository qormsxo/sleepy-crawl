import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/client';
import { keywords } from '../db/schema';
import { KEYWORD_KINDS } from '../core/constants';
import { audit } from './audit';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');
const fields = {
  kind: z.enum(KEYWORD_KINDS),
  keyword: z.string().trim().min(1).max(100),
  aliases: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  description: z.string().max(500).nullable().optional(),
  startsOn: day.nullable().optional(),
  endsOn: day.nullable().optional(),
  active: z.boolean().default(true),
  priority: z.number().int().min(-1000).max(1000).default(0),
};
const createSchema = z.object(fields).refine((k) => !k.startsOn || !k.endsOn || k.startsOn <= k.endsOn, 'end date must not be before start date');
// No defaults here: a partial update must only touch the fields it names.
const updateSchema = z.object({
  kind: z.enum(KEYWORD_KINDS),
  keyword: z.string().trim().min(1).max(100),
  aliases: z.array(z.string().trim().min(1).max(100)).max(20),
  description: z.string().max(500).nullable(),
  startsOn: day.nullable(),
  endsOn: day.nullable(),
  active: z.boolean(),
  priority: z.number().int().min(-1000).max(1000),
}).partial();

export type KeywordInput = z.input<typeof createSchema>;

export async function createKeyword(db: DB, adminId: number, input: KeywordInput): Promise<number> {
  const v = createSchema.parse(input);
  const [row] = await db.insert(keywords).values(v).returning({ id: keywords.id }); // unique (kind, keyword)
  await audit(db, adminId, 'keyword.create', `keyword:${row.id}`, { kind: v.kind, keyword: v.keyword });
  return row.id;
}

export async function updateKeyword(db: DB, adminId: number, id: number, input: z.input<typeof updateSchema>): Promise<void> {
  const change = updateSchema.parse(input);
  const [before] = await db.select().from(keywords).where(eq(keywords.id, id));
  if (!before) throw new Error(`keyword ${id} not found`);
  const starts = change.startsOn !== undefined ? change.startsOn : before.startsOn;
  const ends = change.endsOn !== undefined ? change.endsOn : before.endsOn;
  if (starts && ends && starts > ends) throw new Error('end date must not be before start date');
  await db.update(keywords).set(change).where(eq(keywords.id, id));
  await audit(db, adminId, 'keyword.update', `keyword:${id}`, { before: { keyword: before.keyword, active: before.active }, after: change });
}

export async function deleteKeyword(db: DB, adminId: number, id: number): Promise<void> {
  const [before] = await db.select().from(keywords).where(eq(keywords.id, id));
  if (!before) return;
  await db.delete(keywords).where(eq(keywords.id, id));
  await audit(db, adminId, 'keyword.delete', `keyword:${id}`, { kind: before.kind, keyword: before.keyword });
}

export async function listKeywords(db: DB) {
  return db.select().from(keywords).orderBy(keywords.kind, keywords.priority, keywords.id);
}
