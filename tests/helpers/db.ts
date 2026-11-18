import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import * as schema from '@/db/schema';
import { DB_SCHEMA } from '@/db/schema';
import type { DB } from '@/db/client';

const open = new Set<PGlite>();

/** Fresh in-memory Postgres with all migrations applied. Closed automatically after each test (tests/setup.ts). */
export async function createTestDb(): Promise<DB> {
  const client = new PGlite();
  open.add(client);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, '../../src/db/migrations'), migrationsSchema: DB_SCHEMA });
  return db as unknown as DB;
}

/** Each PGlite holds a WebAssembly heap; leaving them open exhausts worker memory. */
export async function closeTestDbs(): Promise<void> {
  const clients = [...open];
  open.clear();
  await Promise.all(clients.map((c) => c.close()));
}
