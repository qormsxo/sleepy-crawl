import { z } from 'zod';
import { CATEGORIES, SAFETY_FLAGS, SCORE_KEYS, type ScoreKey } from '../constants';

const scoreShape = Object.fromEntries(SCORE_KEYS.map((k) => [k, z.number().int()])) as Record<ScoreKey, z.ZodNumber>;
const reasonShape = Object.fromEntries(SCORE_KEYS.map((k) => [k, z.string()])) as Record<ScoreKey, z.ZodString>;

/** LLM output contract (지시서 5-4 + scores_reason + safety.uncertain). */
export const evaluationSchema = z.object({
  is_candidate: z.boolean(),
  score: z.number().int(),
  categories: z.array(z.enum(CATEGORIES)).min(1),
  reason: z.string(),
  scores: z.object(scoreShape),
  scores_reason: z.object(reasonShape),
  safety: z.object({
    is_safe: z.boolean(),
    flags: z.array(z.enum(SAFETY_FLAGS)),
    uncertain: z.boolean(),
  }),
  decision: z.enum(['PUBLISH', 'REVIEW', 'REJECT']),
});

export type LlmEvaluation = z.infer<typeof evaluationSchema>;
export type Weights = Record<ScoreKey, number>;
export type Thresholds = { publish: number; review: number };

/** JSON Schema handed to the LLM's structured-output mode. */
export function evaluationJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(evaluationSchema) as Record<string, unknown>;
}
