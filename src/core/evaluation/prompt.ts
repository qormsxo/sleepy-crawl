import type { PromptVersionRow } from '../../db/schema';
import { SCORE_KEYS } from '../constants';

export const MAX_BODY_CHARS = 4000;
export const MAX_COMMENTS = 5;

export type PromptPost = { title: string; body: string; comments: string[]; communityName: string };
export type MemeHint = { keyword: string; description: string };

/** Assemble the system/user prompt from the active prompt version. Posting time is deliberately omitted. */
export function buildPrompt(p: PromptVersionRow, post: PromptPost, memes: MemeHint[]): { system: string; user: string } {
  const criteria = SCORE_KEYS.map((k) => `- ${k} (0~${p.weights[k]}점): ${p.criteria[k] ?? ''}`).join('\n');
  const categories = Object.entries(p.categoryDescriptions)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
  const memeBlock = memes.length
    ? memes.map((m) => `- ${m.keyword}: ${m.description}`).join('\n')
    : '(등록된 밈 없음)';

  const system = [
    p.systemPrompt,
    '',
    '## 평가 항목과 배점',
    criteria,
    '',
    '## 분류 유형 (복수 선택 가능)',
    categories,
    '',
    '## 자동 공개 제외 기준 (safety.flags 코드)',
    p.exclusions,
    '',
    '## 참고: 현재 유행 중인 밈',
    memeBlock,
  ].join('\n');

  const body = Array.from(post.body).slice(0, MAX_BODY_CHARS).join('');
  const comments = post.comments.slice(0, MAX_COMMENTS);
  const user = [
    p.evalPrompt,
    '',
    `커뮤니티: ${post.communityName}`,
    `제목: ${post.title || '(제목 없음)'}`,
    '본문:',
    body || '(본문 없음)',
    '',
    '댓글:',
    comments.length ? comments.map((c) => `- ${c}`).join('\n') : '(댓글 없음)',
  ].join('\n');

  return { system, user };
}
