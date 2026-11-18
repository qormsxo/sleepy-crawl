import { describe, it, expect } from 'vitest';
import { validateEvaluation } from './validate';
import { DEFAULT_WEIGHTS } from '../constants';

const valid = () => ({
  is_candidate: true,
  score: 82,
  categories: ['ABSURD', 'OVERTHINKING'],
  reason: '평범한 상황에서 지나치게 비약적인 결론을 내리는 독특한 전개가 특징이다.',
  scores: { absurdity: 23, unexpectedness: 18, originality: 12, late_night_emotion: 10, humor: 11, shareability: 8 },
  scores_reason: {
    absurdity: 'a',
    unexpectedness: 'b',
    originality: 'c',
    late_night_emotion: 'd',
    humor: 'e',
    shareability: 'f',
  },
  safety: { is_safe: true, flags: [], uncertain: false },
  decision: 'PUBLISH',
});

describe('validateEvaluation', () => {
  it('accepts the spec example and computes total 82', () => {
    const r = validateEvaluation(valid(), DEFAULT_WEIGHTS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.total).toBe(82);
      expect(r.warnings).toEqual([]);
    }
  });

  it('rejects a sub-score above its weight', () => {
    const raw = valid();
    raw.scores.absurdity = 26;
    expect(validateEvaluation(raw, DEFAULT_WEIGHTS).ok).toBe(false);
  });

  it('rejects a negative sub-score', () => {
    const raw = valid();
    raw.scores.humor = -1;
    expect(validateEvaluation(raw, DEFAULT_WEIGHTS).ok).toBe(false);
  });

  it('rejects an unknown category', () => {
    const raw = { ...valid(), categories: ['FUNNY'] };
    expect(validateEvaluation(raw, DEFAULT_WEIGHTS).ok).toBe(false);
  });

  it('rejects empty categories', () => {
    const raw = { ...valid(), categories: [] };
    expect(validateEvaluation(raw, DEFAULT_WEIGHTS).ok).toBe(false);
  });

  it('rejects an unknown safety flag', () => {
    const raw = { ...valid(), safety: { is_safe: false, flags: ['NSFW'], uncertain: false } };
    expect(validateEvaluation(raw, DEFAULT_WEIGHTS).ok).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(validateEvaluation('not json', DEFAULT_WEIGHTS).ok).toBe(false);
    expect(validateEvaluation(null, DEFAULT_WEIGHTS).ok).toBe(false);
  });

  it('uses the sub-score sum when score disagrees, with a warning', () => {
    const raw = { ...valid(), score: 90 };
    const r = validateEvaluation(raw, DEFAULT_WEIGHTS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.total).toBe(82);
      expect(r.warnings).toEqual(['score_mismatch']);
    }
  });

  it('scales to 100 when weights change', () => {
    const half = Object.fromEntries(Object.entries(DEFAULT_WEIGHTS).map(([k, v]) => [k, v / 2])) as typeof DEFAULT_WEIGHTS;
    const raw = valid();
    raw.scores = { absurdity: 12, unexpectedness: 9, originality: 6, late_night_emotion: 5, humor: 5, shareability: 4 };
    raw.score = 41;
    const r = validateEvaluation(raw, half);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.total).toBe(82);
  });
});
