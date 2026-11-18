import { createFakeLlm } from './fake';
import { createGeminiLlm } from './gemini';
import { createOpenAiLlm } from './openai';
import type { LlmClient } from './types';

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} must be set for LLM_PROVIDER=${process.env.LLM_PROVIDER} (or use LLM_PROVIDER=fake)`);
  return value;
}

/**
 * LLM_PROVIDER: gemini | openai | fake (default fake: no external calls).
 * Shared settings: LLM_API_KEY, LLM_MODEL, LLM_TEMPERATURE (0), LLM_TIMEOUT_MS (60000).
 * OPENAI_API_KEY / OPENAI_MODEL are accepted as fallbacks for openai.
 */
export function createLlmClient(): LlmClient {
  const provider = process.env.LLM_PROVIDER ?? 'fake';
  const temperature = Number(process.env.LLM_TEMPERATURE ?? 0);
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? 60_000);

  if (provider === 'fake') return createFakeLlm();
  if (provider === 'gemini') {
    return createGeminiLlm({
      apiKey: required('LLM_API_KEY', process.env.LLM_API_KEY),
      model: required('LLM_MODEL', process.env.LLM_MODEL),
      temperature,
      timeoutMs,
    });
  }
  if (provider === 'openai') {
    return createOpenAiLlm({
      apiKey: required('LLM_API_KEY', process.env.LLM_API_KEY || process.env.OPENAI_API_KEY),
      model: required('LLM_MODEL', process.env.LLM_MODEL || process.env.OPENAI_MODEL),
    });
  }
  throw new Error(`unknown LLM_PROVIDER "${provider}" (expected gemini | openai | fake)`);
}

export type { LlmClient } from './types';
