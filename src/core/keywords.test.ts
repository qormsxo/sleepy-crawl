import { describe, it, expect } from 'vitest';
import { matchKeywords } from './keywords';

const kws = [
  { id: 1, keyword: '잠이 안 온다', aliases: [] },
  { id: 2, keyword: '현타', aliases: ['현자타임'] },
  { id: 3, keyword: 'Brainrot', aliases: [] },
];

describe('matchKeywords', () => {
  it('ignores spaces', () => {
    expect(matchKeywords('잠이안온다 진짜', kws)).toEqual([1]);
  });

  it('matches aliases', () => {
    expect(matchKeywords('갑자기 현자타임 옴', kws)).toEqual([2]);
  });

  it('ignores case', () => {
    expect(matchKeywords('this is pure BRAINROT', kws)).toEqual([3]);
  });

  it('returns empty when nothing matches', () => {
    expect(matchKeywords('평범한 글', kws)).toEqual([]);
  });
});
