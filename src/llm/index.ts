import { createFakeLlm } from './fake';
import { createOpenAiLlm } from './openai';
import type { LlmClient } from './types';

/** LLM_PROVIDER=fake → local demo evaluator; otherwise OpenAI (OPENAI_API_KEY, OPENAI_MODEL). */
export function createLlmClient(): LlmClient {
  if (process.env.LLM_PROVIDER === 'fake') return createFakeLlm();
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey || !model) throw new Error('OPENAI_API_KEY and OPENAI_MODEL must be set (or LLM_PROVIDER=fake)');
  return createOpenAiLlm({ apiKey, model });
}

export type { LlmClient } from './types';
