const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = (1n << 64n) - 1n;

function fnv1a64(s: string): bigint {
  let h = FNV_OFFSET;
  for (const ch of s) {
    h ^= BigInt(ch.codePointAt(0)!);
    h = (h * FNV_PRIME) & MASK64;
  }
  return h;
}

/** Letters and digits only, lowercased. */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/** 64-bit SimHash over character bigrams. */
export function simhash64(text: string): bigint {
  const chars = Array.from(normalizeText(text));
  const weights = new Array<number>(64).fill(0);
  for (let i = 0; i < chars.length - 1; i++) {
    const h = fnv1a64(chars[i] + chars[i + 1]);
    for (let bit = 0; bit < 64; bit++) {
      weights[bit] += (h >> BigInt(bit)) & 1n ? 1 : -1;
    }
  }
  let out = 0n;
  for (let bit = 0; bit < 64; bit++) if (weights[bit] > 0) out |= 1n << BigInt(bit);
  return out;
}

/** Coarse bucket for "similar content" grouping: top 16 bits of the SimHash, hex. */
export function similarGroupKey(title: string, preview: string): string {
  return (simhash64(`${title} ${preview}`) >> 48n).toString(16).padStart(4, '0');
}
