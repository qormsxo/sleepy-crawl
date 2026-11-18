import { describe, it, expect } from 'vitest';
import { buildPrompt } from './prompt';
import { PROMPT_V1 } from '@/db/seed-data';
import { CATEGORIES } from '../constants';
import type { PromptVersionRow } from '@/db/schema';

const prompt = { ...PROMPT_V1, id: 1, createdAt: new Date() } as unknown as PromptVersionRow;

describe('buildPrompt', () => {
  it('includes every category, weight, and exclusion but no posted time', () => {
    const { system, user } = buildPrompt(
      prompt,
      { title: '제목', body: '본문', comments: ['댓글'], communityName: '샘플 커뮤니티' },
      [{ keyword: '럭키비키', description: '긍정 회로 밈' }],
    );
    const all = system + user;
    for (const c of CATEGORIES) expect(all).toContain(c);
    expect(all).toContain('25');
    expect(all).toContain('PERSONAL_INFO');
    expect(all).toContain('럭키비키');
    expect(all).toContain('샘플 커뮤니티');
    expect(all).not.toMatch(/작성 ?시각|posted/i);
  });

  it('truncates body to 4000 chars and comments to 5', () => {
    const { user } = buildPrompt(
      prompt,
      { title: 't', body: '가'.repeat(5000), comments: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'], communityName: 'x' },
      [],
    );
    expect(user).toContain('가'.repeat(4000));
    expect(user).not.toContain('가'.repeat(4001));
    expect(user).toContain('c5');
    expect(user).not.toContain('c6');
  });
});
