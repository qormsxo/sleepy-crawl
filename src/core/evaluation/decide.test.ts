import { describe, it, expect } from 'vitest';
import { decideStatus } from './decide';
import type { LlmEvaluation } from './schema';
import { DEFAULT_THRESHOLDS } from '../constants';

function ev(over: { is_safe?: boolean; uncertain?: boolean; is_candidate?: boolean } = {}): LlmEvaluation {
  return {
    is_candidate: over.is_candidate ?? true,
    score: 0,
    categories: ['ABSURD'],
    reason: 'r',
    scores: { absurdity: 0, unexpectedness: 0, originality: 0, late_night_emotion: 0, humor: 0, shareability: 0 },
    scores_reason: { absurdity: '', unexpectedness: '', originality: '', late_night_emotion: '', humor: '', shareability: '' },
    safety: { is_safe: over.is_safe ?? true, flags: over.is_safe === false ? ['SPAM'] : [], uncertain: over.uncertain ?? false },
    decision: 'PUBLISH',
  };
}

const base = { hasPostedAt: true, hasTitleOrPreview: true, thresholds: DEFAULT_THRESHOLDS };

describe('decideStatus', () => {
  it.each([
    ['evaluation missing', { ...base, evaluation: null, total: null }, 'EVAL_FAILED'],
    ['unsafe beats a high score', { ...base, evaluation: ev({ is_safe: false }), total: 95 }, 'BLOCKED'],
    ['uncertain safety', { ...base, evaluation: ev({ uncertain: true }), total: 90 }, 'REVIEW'],
    ['no posted time', { ...base, hasPostedAt: false, evaluation: ev(), total: 90 }, 'REVIEW'],
    ['no title or preview', { ...base, hasTitleOrPreview: false, evaluation: ev(), total: 90 }, 'HIDDEN'],
    ['70 and candidate', { ...base, evaluation: ev(), total: 70 }, 'PUBLISHED'],
    ['70 but not candidate', { ...base, evaluation: ev({ is_candidate: false }), total: 70 }, 'REVIEW'],
    ['69', { ...base, evaluation: ev(), total: 69 }, 'REVIEW'],
    ['50', { ...base, evaluation: ev(), total: 50 }, 'REVIEW'],
    ['49', { ...base, evaluation: ev(), total: 49 }, 'HIDDEN'],
  ] as const)('%s', (_name, input, expected) => {
    expect(decideStatus(input)).toBe(expected);
  });

  it('blocks when flags are present even if is_safe is true', () => {
    const e = ev();
    e.safety.flags = ['PERSONAL_INFO'];
    expect(decideStatus({ ...base, evaluation: e, total: 90 })).toBe('BLOCKED');
  });

  it('respects custom thresholds', () => {
    expect(decideStatus({ ...base, thresholds: { publish: 80, review: 60 }, evaluation: ev(), total: 75 })).toBe('REVIEW');
  });
});
