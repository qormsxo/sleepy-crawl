export type KeywordLike = { id: number; keyword: string; aliases: string[] };

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/** Ids of keywords whose text or any alias appears in `text` (spaces and case ignored). */
export function matchKeywords(text: string, keywords: KeywordLike[]): number[] {
  const hay = squash(text);
  return keywords
    .filter((k) => [k.keyword, ...k.aliases].some((term) => {
      const needle = squash(term);
      return needle.length > 0 && hay.includes(needle);
    }))
    .map((k) => k.id);
}
