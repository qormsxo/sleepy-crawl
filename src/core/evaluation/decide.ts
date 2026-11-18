import type { PostStatus } from '../constants';
import { nearWindowBoundary } from '../time-window';
import type { LlmEvaluation, Thresholds } from './schema';

/** Approximate post times this close (minutes) to 23:00/03:00 can't be trusted to be in the window. */
export const BOUNDARY_TOLERANCE_MIN = 10;

export type DecideInput = {
  evaluation: LlmEvaluation | null;
  total: number | null;
  hasPostedAt: boolean;
  hasTitleOrPreview: boolean;
  thresholds: Thresholds;
  /** When present, approximate times near a window edge go to review (설계 7-1, 7-8 규칙 4). */
  posted?: { at: Date; precision: 'exact' | 'minute' | 'approximate' | null; timezone: string };
  /** Never auto-publish (manual submissions: time can't be verified). A would-be publish becomes REVIEW. */
  requiresReview?: boolean;
};

/** Final publish decision (설계 7-8 규칙 1~8, in order). The LLM's own `decision` is advisory only. */
export function decideStatus(input: DecideInput): PostStatus {
  const { evaluation, total, thresholds } = input;
  if (!evaluation || total === null) return 'EVAL_FAILED';
  if (!evaluation.safety.is_safe || evaluation.safety.flags.length > 0) return 'BLOCKED';
  if (evaluation.safety.uncertain) return 'REVIEW';
  if (!input.hasPostedAt) return 'REVIEW';
  const p = input.posted;
  if (p?.precision === 'approximate' && nearWindowBoundary(p.at, p.timezone, BOUNDARY_TOLERANCE_MIN)) return 'REVIEW';
  if (!input.hasTitleOrPreview) return 'HIDDEN';
  if (total >= thresholds.publish && evaluation.is_candidate) return input.requiresReview ? 'REVIEW' : 'PUBLISHED';
  if (total >= thresholds.review) return 'REVIEW';
  return 'HIDDEN';
}
