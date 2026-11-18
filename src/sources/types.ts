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

export type ParsedPost = RawPost & {
  postedAt: Date | null;
  precision: TimePrecision | null;
  /** The list's time can't be trusted (e.g. "4 시간 전", or a "moved to best" time): open the post page to confirm it. */
  needsDetail?: boolean;
};

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
  /** The robots-allowed canonical URL for a post link (used for submissions). */
  canonicalUrlFor?(url: URL): string | null;
  listPopular(ctx: SourceContext): AsyncIterable<ParsedPost>;
  search?(ctx: SourceContext, keyword: string): AsyncIterable<ParsedPost>;
  fetchPost(ctx: SourceContext, ref: { url: string; externalId: string | null }): Promise<ParsedPost>;
}
