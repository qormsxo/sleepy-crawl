import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { ParsedPost, SourceAdapter, SourceContext, TimePrecision } from './types';
import type { ListTime } from './kst-time';

export type ListRow = { href: string; title: string; time: ListTime | null };
export type PostPage = { title: string; body: string; postedAt: Date | null; precision: TimePrecision | null };

/**
 * One community = selectors + URL rules. Everything else (fetching configured list pages,
 * canonical URLs, needsDetail) is shared here so each site file stays small.
 */
export type HtmlSiteSpec = {
  key: string;
  /** Turn any link to a post (relative or absolute) into the robots-allowed canonical URL + stable id. */
  canonicalize(href: string, base: string): { url: string; externalId: string } | null;
  parseList($: CheerioAPI, now: Date): ListRow[];
  parsePost($: CheerioAPI): PostPage;
  /** True when this site's list time is never the written time (moved-to-best time, "N 시간 전"). */
  listTimeUntrusted?: boolean;
};

/** Visible text with scripts/styles removed and whitespace collapsed. */
export function cleanText($: CheerioAPI, selector: string): string {
  const el = $(selector).first().clone();
  el.find('script, style, noscript').remove();
  el.find('br, p, div').after('\n');
  return el
    .text()
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function listUrls(ctx: SourceContext, key: string): string[] {
  const lists = (ctx.config as { lists?: unknown }).lists;
  if (!Array.isArray(lists) || lists.length === 0 || !lists.every((u) => typeof u === 'string')) {
    throw new Error(`source "${key}" has no config.lists`);
  }
  return lists;
}

async function load(ctx: SourceContext, url: string): Promise<CheerioAPI> {
  const res = await ctx.http.get(url);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${url}`);
  return cheerio.load(res.text);
}

export function htmlAdapter(spec: HtmlSiteSpec): SourceAdapter {
  return {
    key: spec.key,
    capabilities: { popular: true, search: false, fetchPost: true },

    matchUrl(url) {
      const c = spec.canonicalize(url.toString(), url.origin);
      return c ? { externalId: c.externalId } : null;
    },

    async *listPopular(ctx) {
      for (const listUrl of listUrls(ctx, spec.key)) {
        const $ = await load(ctx, listUrl);
        for (const row of spec.parseList($, ctx.now)) {
          const c = spec.canonicalize(row.href, listUrl);
          if (!c) continue;
          yield {
            externalId: c.externalId,
            url: c.url,
            title: row.title.replace(/\s+/g, ' ').trim(),
            postedAtRaw: row.time?.at.toISOString() ?? null,
            postedAt: row.time?.at ?? null,
            precision: row.time?.precision ?? null,
            needsDetail: spec.listTimeUntrusted === true || row.time?.precision !== 'minute',
          } satisfies ParsedPost;
        }
      }
    },

    async fetchPost(ctx, ref) {
      const $ = await load(ctx, ref.url);
      const page = spec.parsePost($);
      return {
        externalId: ref.externalId,
        url: ref.url,
        title: page.title.replace(/\s+/g, ' ').trim(),
        bodyText: page.body,
        postedAtRaw: page.postedAt?.toISOString() ?? null,
        postedAt: page.postedAt,
        precision: page.postedAt ? page.precision : null,
        needsDetail: false,
      };
    },
  };
}

/** Resolve `href` against `base`; null when it isn't a valid URL. */
export function resolve(href: string, base: string): URL | null {
  try {
    return new URL(href, base);
  } catch {
    return null;
  }
}
