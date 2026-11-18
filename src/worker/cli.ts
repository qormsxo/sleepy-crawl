import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { posts, sources } from '../db/schema';
import { crawlSource } from '../pipeline/crawl';
import { evaluatePost } from '../pipeline/evaluate';
import { createLlmClient } from '../llm';

/**
 * Manual runs without the queue.
 *   crawl [sourceKey=fixture] [--now ISO]   crawl once, evaluate new posts immediately
 *   eval  [--now ISO]                       evaluate every PENDING_EVAL post
 */
async function main() {
  const args = process.argv.slice(2);
  const nowIdx = args.indexOf('--now');
  const now = nowIdx >= 0 ? new Date(args[nowIdx + 1]) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error('invalid --now');
  const positional = args.filter((_, i) => i !== nowIdx && i !== nowIdx + 1);
  const [command, sourceKey = 'fixture'] = positional;

  const db = getDb();
  const llm = createLlmClient();

  if (command === 'crawl') {
    const [source] = await db.select().from(sources).where(eq(sources.key, sourceKey));
    if (!source) throw new Error(`unknown source: ${sourceKey}`);
    const result = await crawlSource(db, source.id, {
      now,
      enqueueEval: async (postId) => {
        const status = await evaluatePost(db, postId, { llm, now });
        console.log(`  post ${postId}: ${status}`);
      },
    });
    console.log('crawl:', result);
  } else if (command === 'eval') {
    const pending = await db.select({ id: posts.id }).from(posts).where(eq(posts.status, 'PENDING_EVAL'));
    for (const { id } of pending) console.log(`  post ${id}: ${await evaluatePost(db, id, { llm, now })}`);
    console.log(`eval: ${pending.length} posts`);
  } else {
    throw new Error('usage: cli.ts crawl [sourceKey] [--now ISO] | eval [--now ISO]');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
