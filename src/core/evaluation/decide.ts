import type { PostStatus } from '../constants';
import type { LlmEvaluation, Thresholds } from './schema';

export type DecideInput = {
  evaluation: LlmEvaluation | null;
  total: number | null;
  hasPostedAt: boolean;
  hasTitleOrPreview: boolean;
  thresholds: Thresholds;
};

/** Final publish decision (설계 7-8 규칙 1~8, in order). The LLM's own `decision` is advisory only. */
export function decideStatus(input: DecideInput): PostStatus {
  const { evaluation, total, thresholds } = input;
  if (!evaluation || total === null) return 'EVAL_FAILED';
  if (!evaluation.safety.is_safe || evaluation.safety.flags.length > 0) return 'BLOCKED';
  if (evaluation.safety.uncertain) return 'REVIEW';
  if (!input.hasPostedAt) return 'REVIEW';
  if (!input.hasTitleOrPreview) return 'HIDDEN';
  if (total >= thresholds.publish && evaluation.is_candidate) return 'PUBLISHED';
  if (total >= thresholds.review) return 'REVIEW';
  return 'HIDDEN';
}
