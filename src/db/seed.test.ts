import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../tests/helpers/db';
import { seed } from './seed';
import { keywords, promptVersions, settings, sources } from './schema';

describe('seed', () => {
  it('is idempotent and inserts initial data', async () => {
    const db = await createTestDb();
    await seed(db);
    await seed(db);

    expect(await db.select().from(keywords)).toHaveLength(15);
    expect(await db.select().from(promptVersions).where(eq(promptVersions.active, true))).toHaveLength(1);
    const [interval] = await db.select().from(settings).where(eq(settings.key, 'crawl_interval_minutes'));
    expect(interval.value).toBe(10);
    const fixture = await db.select().from(sources).where(eq(sources.key, 'fixture'));
    expect(fixture).toHaveLength(1);
    expect(fixture[0].timezone).toBe('Asia/Seoul');
  });
});
