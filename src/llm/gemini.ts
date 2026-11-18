import { GoogleGenAI } from '@google/genai';
import type { LlmClient } from './types';

export type GeminiRequest = {
  model: string;
  contents: string;
  config: {
    systemInstruction: string;
    temperature: number;
    responseMimeType: 'application/json';
    responseJsonSchema: unknown;
    abortSignal: AbortSignal;
  };
};
export type GeminiReply = { text?: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
export type GeminiGenerate = (req: GeminiRequest) => Promise<GeminiReply>;

export type GeminiOptions = {
  apiKey: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  /** Injected in tests; defaults to the @google/genai SDK. */
  generate?: GeminiGenerate;
};

/** Drop JSON Schema meta keys Gemini's structured output does not accept. */
function forGemini(schema: Record<string, unknown>): unknown {
  const { $schema: _ignored, ...rest } = schema;
  return rest;
}

export function createGeminiLlm(opts: GeminiOptions): LlmClient {
  const generate: GeminiGenerate =
    opts.generate ??
    (() => {
      const ai = new GoogleGenAI({ apiKey: opts.apiKey });
      return (req) => ai.models.generateContent(req);
    })();

  return {
    async evaluate({ system, user, jsonSchema }) {
      const res = await generate({
        model: opts.model,
        contents: user,
        config: {
          systemInstruction: system,
          temperature: opts.temperature,
          responseMimeType: 'application/json',
          responseJsonSchema: forGemini(jsonSchema),
          abortSignal: AbortSignal.timeout(opts.timeoutMs),
        },
      });
      const text = res.text ?? '';
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        raw = text; // validation rejects it and the evaluation is retried once
      }
      return {
        raw,
        model: opts.model,
        tokensIn: res.usageMetadata?.promptTokenCount ?? 0,
        tokensOut: res.usageMetadata?.candidatesTokenCount ?? 0,
      };
    },
  };
}
