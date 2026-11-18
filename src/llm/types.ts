export type LlmRequest = { system: string; user: string; jsonSchema: Record<string, unknown> };
export type LlmResponse = { raw: unknown; model: string; tokensIn: number; tokensOut: number };

export interface LlmClient {
  evaluate(input: LlmRequest): Promise<LlmResponse>;
}
