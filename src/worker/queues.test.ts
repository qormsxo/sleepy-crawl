import { describe, it, expect } from 'vitest';
import { QUEUE_OPTIONS } from './queues';

describe('queue options', () => {
  it('uses a policy under which singletonKey dedupes crawl jobs (pg-boss 12 ignores it on standard)', () => {
    expect(['stately', 'singleton']).toContain(QUEUE_OPTIONS.crawl.policy);
  });
});

describe('evaluate queue', () => {
  it('dedupes per post so re-enqueueing a stuck post never doubles the work', () => {
    expect(['stately', 'singleton']).toContain(QUEUE_OPTIONS.evaluate.policy);
  });
});
