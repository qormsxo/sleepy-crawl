import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import * as schema from './schema';
import { DB_SCHEMA } from './schema';

/** Driver-agnostic handle: node-postgres in production, PGlite in tests. */
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Accepts a Prisma-style `?schema=` parameter (the shared local DB uses one) and strips it,
 * because node-postgres rejects unknown params. All objects are schema-qualified in code, so the
 * parameter is only checked: it must name this app's schema.
 */
export function parseDatabaseUrl(raw: string): { connectionString: string } {
  const url = new URL(raw);
  const schemaParam = url.searchParams.get('schema');
  if (schemaParam !== null && schemaParam !== DB_SCHEMA) {
    throw new Error(`DATABASE_URL ?schema=${schemaParam} is not supported; this app uses "${DB_SCHEMA}"`);
  }
  url.searchParams.delete('schema');
  return { connectionString: url.toString() };
}

/** The connection string with `?schema=` removed (for pg-boss and other raw clients). */
export function databaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is not set');
  return parseDatabaseUrl(raw).connectionString;
}

export function createDb(url: string): NodePgDatabase<typeof schema> {
  return drizzle(new Pool(parseDatabaseUrl(url)), { schema });
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
