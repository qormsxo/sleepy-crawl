import OpenAI from 'openai';
import type { LlmClient } from './types';

/** OpenAI structured outputs require every object to be closed and fully required. */
function toStrictSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toStrictSchema);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === '$schema') continue;
    out[k] = toStrictSchema(v);
  }
  if (out.type === 'object' && out.properties) {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties as object);
  }
  return out;
}

export function createOpenAiLlm(opts: { apiKey: string; model: string }): LlmClient {
  const client = new OpenAI({ apiKey: opts.apiKey });
  return {
    async evaluate({ system, user, jsonSchema }) {
      const res = await client.chat.completions.create({
        model: opts.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'evaluation', strict: true, schema: toStrictSchema(jsonSchema) as Record<string, unknown> },
        },
      });
      const content = res.choices[0]?.message?.content ?? '';
      let raw: unknown;
      try {
        raw = JSON.parse(content);
      } catch {
        raw = content; // validation will reject it
      }
      return {
        raw,
        model: res.model,
        tokensIn: res.usage?.prompt_tokens ?? 0,
        tokensOut: res.usage?.completion_tokens ?? 0,
      };
    },
  };
}
