import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../tests/helpers/db';
import { seed } from '@/db/seed';
import type { DB } from '@/db/client';
import { sources } from '@/db/schema';
import { resolveSubmissionTarget } from './target';
import { matchDcinside } from '@/sources/manual-dcinside';

let db: DB;
beforeEach(async () => {
  db = await createTestDb();
  await seed(db);
});

describe('matchDcinside (URL only, never fetched)', () => {
  it.each([
    ['https://gall.dcinside.com/board/view/?id=programming&no=12345&page=1', 'board:programming:12345', 'https://gall.dcinside.com/board/view/?id=programming&no=12345'],
    ['https://gall.dcinside.com/mgallery/board/view/?id=aoegame&no=777', 'mgallery:aoegame:777', 'https://gall.dcinside.com/mgallery/board/view/?id=aoegame&no=777'],
    ['https://gall.dcinside.com/mini/board/view/?id=tiny&no=5', 'mini:tiny:5', 'https://gall.dcinside.com/mini/board/view/?id=tiny&no=5'],
    ['https://m.dcinside.com/board/programming/12345?recommend=1', 'board:programming:12345', 'https://gall.dcinside.com/board/view/?id=programming&no=12345'],
  ])('%s', (url, externalId, canonicalUrl) => {
    expect(matchDcinside(new URL(url))).toEqual({ externalId, canonicalUrl });
  });

  it('rejects other DC pages', () => {
    expect(matchDcinside(new URL('https://gall.dcinside.com/board/lists/?id=programming'))).toBeNull();
    expect(matchDcinside(new URL('https://www.dcinside.com/'))).toBeNull();
  });
});

describe('resolveSubmissionTarget', () => {
  it('routes a supported site to automatic processing with its canonical URL', async () => {
    const r = await resolveSubmissionTarget(db, 'https://www.clien.net/service/board/park/19294872?od=T31');
    expect(r).toMatchObject({ sourceKey: 'clien', mode: 'auto', externalId: 'park/19294872', canonicalUrl: 'https://www.clien.net/service/board/park/19294872' });
  });

  it('routes DCInside to manual submission', async () => {
    const r = await resolveSubmissionTarget(db, 'https://m.dcinside.com/board/programming/12345');
    expect(r).toMatchObject({ sourceKey: 'dcinside', mode: 'manual', externalId: 'board:programming:12345' });
  });

  it.each([
    ['javascript:alert(1)', 'invalid_url'],
    ['ftp://www.clien.net/service/board/park/1', 'invalid_url'],
    ['not a url', 'invalid_url'],
    [`https://www.clien.net/service/board/park/1?x=${'a'.repeat(600)}`, 'invalid_url'],
    ['https://example.com/post/1', 'unsupported_site'],
    ['https://www.ppomppu.co.kr/zboard/view.php?id=humor&no=1', 'unsupported_site'],
    ['http://localhost:5432/', 'unsupported_site'],
  ])('rejects %s as %s', async (url, error) => {
    expect(await resolveSubmissionTarget(db, url)).toEqual({ error });
  });

  it('rejects a supported site an admin disabled', async () => {
    await db.update(sources).set({ status: 'DISABLED' }).where(eq(sources.key, 'clien'));
    expect(await resolveSubmissionTarget(db, 'https://www.clien.net/service/board/park/1')).toEqual({ error: 'unsupported_site' });
  });

  it('does not route manual sites when manualSubmission is off', async () => {
    await db.update(sources).set({ config: {} }).where(eq(sources.key, 'dcinside'));
    expect(await resolveSubmissionTarget(db, 'https://m.dcinside.com/board/programming/1')).toEqual({ error: 'unsupported_site' });
  });
});
