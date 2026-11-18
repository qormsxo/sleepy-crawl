import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { Pool } from 'pg';
import * as schema from './schema';

export type DB = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

export function createDb(url: string): NodePgDatabase<typeof schema> {
  return drizzle(new Pool({ connectionString: url }), { schema });
}

let shared: NodePgDatabase<typeof schema> | null = null;

/** Process-wide DB built from DATABASE_URL. */
export function getDb(): NodePgDatabase<typeof schema> {
  if (!shared) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    shared = createDb(url);
  }
  return shared;
}
