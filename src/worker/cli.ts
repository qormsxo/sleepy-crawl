import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { posts, sources } from '../db/schema';
import { crawlSource } from '../pipeline/crawl';
import { evaluatePost } from '../pipeline/evaluate';
import { createLlmClient } from '../llm';
import { parseCliArgs } from './cli-args';
import { findReceivedSubmissions } from './stuck';
import { processSubmission } from '../submissions/process';
import { submissions } from '../db/schema';

/**
 * Manual runs without the queue.
 *   crawl [sourceKey=fixture] [--now ISO]   crawl once, evaluate new posts immediately
 *   eval  [--now ISO]                       evaluate every PENDING_EVAL post
 */
async function main() {
  const { command, sourceKey, now } = parseCliArgs(process.argv.slice(2));

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
  } else if (command === 'submissions') {
    const ids = await findReceivedSubmissions(db, 100);
    for (const id of ids) {
      await processSubmission(db, id, {
        now,
        llm,
        enqueueEval: async (postId) => {
          console.log(`  post ${postId}: ${await evaluatePost(db, postId, { llm, now })}`);
        },
      });
      const [s] = await db.select().from(submissions).where(eq(submissions.id, id));
      console.log(`  submission ${id}: ${s.status}${s.rejectReason ? ` (${s.rejectReason})` : ''}`);
    }
    console.log(`submissions: ${ids.length}`);
  } else {
    throw new Error('usage: cli.ts crawl [sourceKey] [--now ISO] | eval [--now ISO] | submissions [--now ISO]');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
