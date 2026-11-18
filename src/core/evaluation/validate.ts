import { SCORE_KEYS } from '../constants';
import { evaluationSchema, type LlmEvaluation, type Weights } from './schema';

export type ValidationResult =
  | { ok: true; value: LlmEvaluation; total: number; warnings: string[] }
  | { ok: false; error: string };

/** Schema check + per-item bounds + total normalized to 100. */
export function validateEvaluation(raw: unknown, weights: Weights): ValidationResult {
  const parsed = evaluationSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: `schema: ${parsed.error.message}` };
  const value = parsed.data;

  let sum = 0;
  let max = 0;
  for (const key of SCORE_KEYS) {
    const s = value.scores[key];
    if (s < 0 || s > weights[key]) return { ok: false, error: `score out of range: ${key}=${s} (max ${weights[key]})` };
    sum += s;
    max += weights[key];
  }
  if (max <= 0) return { ok: false, error: 'weights sum to zero' };

  const warnings: string[] = [];
  if (value.score !== sum) warnings.push('score_mismatch');
  const total = Math.round((sum / max) * 100);
  return { ok: true, value, total, warnings };
}
