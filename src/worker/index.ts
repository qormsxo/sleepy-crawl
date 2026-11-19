import 'dotenv/config';
import { PgBoss } from 'pg-boss';
import { databaseUrl, getDb } from '../db/client';
import { DB_SCHEMA } from '../db/schema';
import { crawlSource } from '../pipeline/crawl';
import { evaluatePost } from '../pipeline/evaluate';
import { createLlmClient } from '../llm';
import { logger } from '../lib/logger';
import { findDueSources } from './scheduler';
import { evalBudgetResumeAt } from './eval-budget';
import { QUEUES, QUEUE_OPTIONS } from './queues';
import { findReceivedSubmissions, findStuckPending } from './stuck';
import { processReevalRequests } from '../admin/prompts';
import { processSubmission } from '../submissions/process';
import { posts } from '../db/schema';
import { eq } from 'drizzle-orm';

const STUCK_AFTER_MIN = 15;
const SUBMISSIONS_PER_TICK = 10;
const REEVALS_PER_TICK = 10;

type CrawlJob = { sourceId: number };
type EvalJob = { postId: number };

async function main() {
  const db = getDb();
  const llm = createLlmClient();
  // Queue tables share this app's schema so nothing lands in the other app's schemas.
  const boss = new PgBoss({ connectionString: databaseUrl(), schema: DB_SCHEMA });
  boss.on('error', (err) => logger.error({ err }, 'pg-boss error'));
  await boss.start();

  for (const name of Object.values(QUEUES)) {
    await boss.createQueue(name, QUEUE_OPTIONS[name]);
    // createQueue leaves an existing queue untouched and policy can't be updated: fail loudly on drift.
    const queue = await boss.getQueue(name);
    if (queue?.policy !== QUEUE_OPTIONS[name].policy) {
      throw new Error(
        `queue "${name}" has policy "${queue?.policy}", expected "${QUEUE_OPTIONS[name].policy}". ` +
          `Drain it and delete it (boss.deleteQueue) so it is recreated.`,
      );
    }
  }

  const enqueueEval = async (postId: number) => {
    await boss.send(QUEUES.evaluate, { postId } satisfies EvalJob, { retryLimit: 3, retryBackoff: true, singletonKey: `eval:${postId}` });
  };

  await boss.work<CrawlJob>(QUEUES.crawl, async (jobs) => {
    for (const job of jobs) {
      const r = await crawlSource(db, job.data.sourceId, { enqueueEval });
      logger.info({ sourceId: job.data.sourceId, ...r }, 'crawl finished');
    }
  });

  await boss.work<EvalJob>(QUEUES.evaluate, { localConcurrency: 2 }, async (jobs) => {
    for (const job of jobs) {
      const resumeAt = await evalBudgetResumeAt(db, new Date());
      if (resumeAt) {
        await boss.send(QUEUES.evaluate, job.data, { startAfter: resumeAt, retryLimit: 3, retryBackoff: true, singletonKey: `eval:${job.data.postId}` });
        logger.warn({ postId: job.data.postId, resumeAt }, 'daily eval limit reached; deferred');
        continue;
      }
      const [post] = await db.select({ status: posts.status }).from(posts).where(eq(posts.id, job.data.postId));
      if (post?.status !== 'PENDING_EVAL') continue; // already handled by an earlier job
      // LLM outages and source pauses throw so pg-boss retries with backoff instead of marking the post failed.
      const status = await evaluatePost(db, job.data.postId, { llm, rethrowLlmErrors: true });
      logger.info({ postId: job.data.postId, status }, 'evaluated');
    }
  });

  await boss.schedule(QUEUES.tick, '* * * * *');
  await boss.work(QUEUES.tick, async () => {
    const due = await findDueSources(db, new Date());
    for (const sourceId of due) {
      await boss.send(QUEUES.crawl, { sourceId } satisfies CrawlJob, { singletonKey: `crawl:${sourceId}` });
    }
    // Anonymous submissions are stored by the web app and processed here (the web has no queue).
    const received = await findReceivedSubmissions(db, SUBMISSIONS_PER_TICK);
    for (const id of received) {
      try {
        await processSubmission(db, id, { now: new Date(), llm, enqueueEval });
      } catch (err) {
        logger.error({ err, submissionId: id }, 'submission processing failed');
      }
    }
    // Admin-requested comparisons (prompt versions): a few per tick, within the daily LLM budget.
    let reevaluated = 0;
    try {
      reevaluated = await processReevalRequests(db, { llm, now: new Date(), max: REEVALS_PER_TICK });
    } catch (err) {
      logger.error({ err }, 're-evaluation failed');
    }
    // Jobs can be lost or give up (long outage, source pause): pick their posts up again.
    const stuck = await findStuckPending(db, new Date(), STUCK_AFTER_MIN);
    for (const postId of stuck) await enqueueEval(postId);
    logger.info({ due, requeued: stuck.length, submissions: received.length, reevaluated }, 'tick');
  });

  logger.info('worker started');
  const shutdown = async () => {
    logger.info('worker stopping');
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'worker crashed');
  process.exit(1);
});
