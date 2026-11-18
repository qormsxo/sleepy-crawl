import type { DB } from './client';
import { keywords, promptVersions, settings, sources } from './schema';
import { FIXTURE_SOURCE, INITIAL_MIDNIGHT_KEYWORDS, INITIAL_SETTINGS, KOREAN_SOURCES, PROMPT_V1 } from './seed-data';

/** Idempotent: safe to run repeatedly. Never overwrites admin edits. */
export async function seed(db: DB): Promise<void> {
  await db
    .insert(keywords)
    .values(INITIAL_MIDNIGHT_KEYWORDS.map((keyword, i) => ({ kind: 'MIDNIGHT' as const, keyword, priority: 100 - i })))
    .onConflictDoNothing();

  await db.insert(promptVersions).values(PROMPT_V1).onConflictDoNothing();

  await db
    .insert(settings)
    .values(Object.entries(INITIAL_SETTINGS).map(([key, value]) => ({ key, value })))
    .onConflictDoNothing();

  await db.insert(sources).values([FIXTURE_SOURCE, ...KOREAN_SOURCES]).onConflictDoNothing();
}
