import type { HttpClient } from '../lib/http';

export type TimePrecision = 'exact' | 'minute' | 'approximate';

export type RawPost = {
  externalId: string | null;
  url: string;
  title: string;
  /** Used transiently for evaluation only. Never persisted. */
  bodyText?: string;
  postedAtRaw: string | null;
  comments?: string[];
};

export type ParsedPost = RawPost & { postedAt: Date | null; precision: TimePrecision | null };

export interface SourceContext {
  http: HttpClient;
  config: Record<string, unknown>;
  now: Date;
  timezone: string;
}

export interface SourceAdapter {
  key: string;
  capabilities: { popular: boolean; search: boolean; fetchPost: boolean };
  /** URL normalization rules for canonical URLs. */
  canonicalRules?: { stripParams?: string[]; hostMap?: Record<string, string> };
  matchUrl(url: URL): { externalId: string } | null;
  listPopular(ctx: SourceContext): AsyncIterable<ParsedPost>;
  search?(ctx: SourceContext, keyword: string): AsyncIterable<ParsedPost>;
  fetchPost(ctx: SourceContext, ref: { url: string; externalId: string | null }): Promise<ParsedPost>;
}
