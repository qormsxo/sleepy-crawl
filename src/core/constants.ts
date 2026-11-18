export const CATEGORIES = [
  'ABSURD',
  'LATE_NIGHT_EMOTION',
  'OVERTHINKING',
  'NONSENSE_HUMOR',
  'IMPULSIVE_THOUGHT',
  'WEIRD_OBSERVATION',
  'MEME',
  'OTHER',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SCORE_KEYS = [
  'absurdity',
  'unexpectedness',
  'originality',
  'late_night_emotion',
  'humor',
  'shareability',
] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];

export const SAFETY_FLAGS = ['PERSONAL_INFO', 'HARASSMENT', 'HATE_VIOLENCE', 'SELF_HARM', 'ILLEGAL', 'SPAM'] as const;
export type SafetyFlag = (typeof SAFETY_FLAGS)[number];

export const POST_STATUSES = ['PENDING_EVAL', 'PUBLISHED', 'REVIEW', 'HIDDEN', 'BLOCKED', 'EVAL_FAILED'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const COLLECTION_PATHS = ['POPULAR', 'MIDNIGHT_KEYWORD', 'MEME_KEYWORD', 'USER_SUBMISSION'] as const;
export type CollectionPath = (typeof COLLECTION_PATHS)[number];

export const SOURCE_STATUSES = ['ACTIVE', 'UNSUPPORTED', 'PENDING_APPROVAL', 'DISABLED', 'DEGRADED'] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const KEYWORD_KINDS = ['MIDNIGHT', 'ABSURD', 'MEME'] as const;
export type KeywordKind = (typeof KEYWORD_KINDS)[number];

export const DEFAULT_WEIGHTS: Record<ScoreKey, number> = {
  absurdity: 25,
  unexpectedness: 20,
  originality: 15,
  late_night_emotion: 15,
  humor: 15,
  shareability: 10,
};

export const DEFAULT_THRESHOLDS = { publish: 70, review: 50 };
