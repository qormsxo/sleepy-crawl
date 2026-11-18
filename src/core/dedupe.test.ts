import { describe, it, expect } from 'vitest';
import { similarGroupKey, simhash64 } from './dedupe';

describe('similarGroupKey', () => {
  it('groups texts that differ only by whitespace and punctuation', () => {
    const a = similarGroupKey('새벽에 냉장고 문 열었는데 계란이 나를 쳐다봄', '진짜로 눈이 마주침');
    const b = similarGroupKey('새벽에 냉장고 문 열었는데,, 계란이 나를 쳐다봄!!', '진짜로  눈이 마주침...');
    expect(a).toBe(b);
  });

  it('separates unrelated texts', () => {
    const a = similarGroupKey('새벽에 냉장고 문 열었는데 계란이 나를 쳐다봄', '진짜로 눈이 마주침');
    const b = similarGroupKey('오늘 회사에서 프린터가 고장났다', '수리 기사님이 내일 온다고 함');
    expect(a).not.toBe(b);
  });

  it('simhash64 is a 64-bit bigint and deterministic', () => {
    const h = simhash64('테스트 문장');
    expect(typeof h).toBe('bigint');
    expect(h).toBe(simhash64('테스트 문장'));
    expect(h < 1n << 64n).toBe(true);
  });
});
