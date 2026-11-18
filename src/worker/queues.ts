/** Queue names and creation options shared by the worker. */
export const QUEUES = { tick: 'tick', crawl: 'crawl', evaluate: 'evaluate' } as const;

/**
 * pg-boss 12 only enforces `singletonKey` under non-standard policies.
 * `stately` keeps at most one queued + one active crawl per source, so a slow crawl is never doubled.
 */
export const QUEUE_OPTIONS = {
  tick: { policy: 'standard' },
  crawl: { policy: 'stately' },
  // One queued + one active job per post (singletonKey eval:<postId>), so re-enqueueing stuck posts is safe.
  evaluate: { policy: 'stately' },
} as const;
