import 'dotenv/config';
import { PgBoss } from 'pg-boss';
import { getDb } from '../db/client';
import { crawlSource } from '../pipeline/crawl';
import { evaluatePost } from '../pipeline/evaluate';
import { createLlmClient } from '../llm';
import { logger } from '../lib/logger';
import { findDueSources } from './scheduler';
import { evalBudgetResumeAt } from './eval-budget';

export const QUEUES = { tick: 'tick', crawl: 'crawl', evaluate: 'evaluate' } as const;
type CrawlJob = { sourceId: number };
type EvalJob = { postId: number };

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = getDb();
  const llm = createLlmClient();
  const boss = new PgBoss(url);
  boss.on('error', (err) => logger.error({ err }, 'pg-boss error'));
  await boss.start();

  for (const name of Object.values(QUEUES)) await boss.createQueue(name);

  const enqueueEval = async (postId: number) => {
    await boss.send(QUEUES.evaluate, { postId } satisfies EvalJob, { retryLimit: 3, retryBackoff: true });
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
        await boss.send(QUEUES.evaluate, job.data, { startAfter: resumeAt, retryLimit: 3, retryBackoff: true });
        logger.warn({ postId: job.data.postId, resumeAt }, 'daily eval limit reached; deferred');
        continue;
      }
      const status = await evaluatePost(db, job.data.postId, { llm });
      logger.info({ postId: job.data.postId, status }, 'evaluated');
    }
  });

  await boss.schedule(QUEUES.tick, '* * * * *');
  await boss.work(QUEUES.tick, async () => {
    const due = await findDueSources(db, new Date());
    for (const sourceId of due) {
      await boss.send(QUEUES.crawl, { sourceId } satisfies CrawlJob, { singletonKey: `crawl:${sourceId}` });
    }
    logger.info({ due }, 'tick');
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
