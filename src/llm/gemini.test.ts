import { describe, it, expect, afterEach } from 'vitest';
import { createGeminiLlm, type GeminiGenerate } from './gemini';
import { createLlmClient } from './index';

const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { a: { type: 'integer' } } };

describe('createGeminiLlm', () => {
  it('sends system prompt, user prompt and JSON schema; parses the JSON reply and token usage', async () => {
    let seen: Parameters<GeminiGenerate>[0] | undefined;
    const generate: GeminiGenerate = async (req) => {
      seen = req;
      return { text: '{"a":1}', usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30 } };
    };
    const llm = createGeminiLlm({ apiKey: 'k', model: 'gemini-x', temperature: 0, timeoutMs: 1000, generate });
    const res = await llm.evaluate({ system: 'SYS', user: 'USER', jsonSchema: schema });

    expect(res).toEqual({ raw: { a: 1 }, model: 'gemini-x', tokensIn: 120, tokensOut: 30 });
    expect(seen?.model).toBe('gemini-x');
    expect(seen?.contents).toBe('USER');
    expect(seen?.config.systemInstruction).toBe('SYS');
    expect(seen?.config.temperature).toBe(0);
    expect(seen?.config.responseMimeType).toBe('application/json');
    expect(seen?.config.responseJsonSchema).toEqual({ type: 'object', properties: { a: { type: 'integer' } } });
    expect(seen?.config.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('returns unparseable text as raw so validation rejects it (not a throw)', async () => {
    const llm = createGeminiLlm({ apiKey: 'k', model: 'm', temperature: 0, timeoutMs: 1000, generate: async () => ({ text: 'not json' }) });
    expect((await llm.evaluate({ system: '', user: '', jsonSchema: {} })).raw).toBe('not json');
  });

  it('propagates API errors so the caller can retry', async () => {
    const llm = createGeminiLlm({
      apiKey: 'k',
      model: 'm',
      temperature: 0,
      timeoutMs: 1000,
      generate: async () => Promise.reject(new Error('429 RESOURCE_EXHAUSTED')),
    });
    await expect(llm.evaluate({ system: '', user: '', jsonSchema: {} })).rejects.toThrow('429');
  });
});

describe('createLlmClient', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('builds a Gemini client from LLM_* variables', () => {
    Object.assign(process.env, { LLM_PROVIDER: 'gemini', LLM_API_KEY: 'k', LLM_MODEL: 'gemini-x' });
    expect(() => createLlmClient()).not.toThrow();
  });

  it('fails fast when the Gemini key or model is missing', () => {
    Object.assign(process.env, { LLM_PROVIDER: 'gemini', LLM_API_KEY: '', LLM_MODEL: '' });
    expect(() => createLlmClient()).toThrow(/LLM_API_KEY/);
  });
});
