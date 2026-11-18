import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from '../../tests/helpers/db';
import { parseDatabaseUrl } from './client';

describe('schema isolation (DB is shared with another app)', () => {
  it('creates every table and enum inside the "sleepy" schema, nothing in public', async () => {
    const db = await createTestDb();
    const enums = await db.execute(sql`select n.nspname as ns from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typtype = 'e'`);
    const tables = await db.execute(sql`select table_schema as ns from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema')`);
    const rows = (r: unknown) => (r as { rows: { ns: string }[] }).rows;
    const ns = [...rows(enums), ...rows(tables)].map((r) => r.ns);
    expect(ns.length).toBeGreaterThan(0);
    expect(new Set(ns)).toEqual(new Set(['sleepy']));
  });
});

describe('parseDatabaseUrl', () => {
  it('strips the Prisma-style ?schema= parameter so node-postgres accepts the URL', () => {
    expect(parseDatabaseUrl('postgresql://u:p@localhost:5432/marginmap?schema=sleepy').connectionString).toBe(
      'postgresql://u:p@localhost:5432/marginmap',
    );
  });

  it('rejects a schema other than sleepy instead of silently writing elsewhere', () => {
    expect(() => parseDatabaseUrl('postgresql://u:p@localhost:5432/db?schema=public')).toThrow();
  });
});

describe('prompt_versions', () => {
  it('allows only one active prompt version', async () => {
    const { seed } = await import('./seed');
    const { promptVersions } = await import('./schema');
    const { PROMPT_V1 } = await import('./seed-data');
    const db = await createTestDb();
    await seed(db);
    await expect(db.insert(promptVersions).values({ ...PROMPT_V1, name: 'v2', active: true })).rejects.toThrow();
  });
});
