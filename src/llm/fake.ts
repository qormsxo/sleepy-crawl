import { DEFAULT_WEIGHTS, SCORE_KEYS } from '../core/constants';
import type { LlmClient, LlmRequest } from './types';

export type FakeLlm = LlmClient & { readonly calls: number };

/**
 * Test/demo LLM. With `responses`, returns (or throws) them in order, repeating the last.
 * Without, returns a deterministic pseudo-evaluation derived from the prompt text.
 */
export function createFakeLlm(responses?: Array<unknown | Error>): FakeLlm {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async evaluate(input: LlmRequest) {
      const i = calls++;
      const next = responses?.length ? responses[Math.min(i, responses.length - 1)] : demoEvaluation(input.user);
      if (next instanceof Error) throw next;
      return { raw: next, model: 'fake', tokensIn: 0, tokensOut: 0 };
    },
  };
}

function demoEvaluation(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  const ratio = 0.45 + (h % 50) / 100; // 0.45 ~ 0.94
  const scores = Object.fromEntries(SCORE_KEYS.map((k) => [k, Math.floor(DEFAULT_WEIGHTS[k] * ratio)]));
  const score = Object.values(scores).reduce((a, b) => a + b, 0);
  return {
    is_candidate: true,
    score,
    categories: [['ABSURD', 'LATE_NIGHT_EMOTION', 'OVERTHINKING', 'WEIRD_OBSERVATION'][h % 4]],
    reason: '(데모) 실제 AI가 아닌 로컬 데모 평가입니다.',
    scores,
    scores_reason: Object.fromEntries(SCORE_KEYS.map((k) => [k, '데모'])),
    safety: { is_safe: true, flags: [], uncertain: false },
    decision: score >= 70 ? 'PUBLISH' : 'REVIEW',
  };
}
