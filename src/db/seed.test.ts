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

describe('seed: Korean sources (docs/sources.md)', () => {
  it('registers every surveyed community with the researched status', async () => {
    const db = await createTestDb();
    await seed(db);
    const all = await db.select().from(sources);
    expect(all).toHaveLength(12); // fixture + 10 Korean + reddit
    const active = all.filter((s) => s.status === 'ACTIVE' && s.key !== 'fixture').map((s) => s.key).sort();
    expect(active).toEqual(['fmkorea', 'inven', 'ruliweb', 'todayhumor']);
    for (const s of all.filter((x) => active.includes(x.key))) {
      expect((s.config as { lists?: string[] }).lists?.length).toBeGreaterThan(0);
    }
    const dc = all.find((s) => s.key === 'dcinside')!;
    expect(dc.status).toBe('UNSUPPORTED');
    expect(dc.statusReason).toContain('약관');
    expect(all.find((s) => s.key === 'reddit')).toMatchObject({ status: 'PENDING_APPROVAL', region: 'GLOBAL' });
  });

  it('adds follow-up crawl settings', async () => {
    const db = await createTestDb();
    await seed(db);
    const rows = Object.fromEntries((await db.select().from(settings)).map((r) => [r.key, r.value]));
    expect(rows).toMatchObject({ followup_until_hour: 15, followup_interval_minutes: 30, max_detail_fetches_per_run: 20 });
  });

  it('never overwrites an admin edit on re-seed', async () => {
    const db = await createTestDb();
    await seed(db);
    await db.update(sources).set({ status: 'DISABLED' }).where(eq(sources.key, 'inven'));
    await seed(db);
    const [inven] = await db.select().from(sources).where(eq(sources.key, 'inven'));
    expect(inven.status).toBe('DISABLED');
  });
});
