import {
  pgSchema,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  jsonb,
  date,
  smallint,
  uniqueIndex,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { CATEGORIES, COLLECTION_PATHS, KEYWORD_KINDS, POST_STATUSES, SOURCE_STATUSES } from '../core/constants';

/** Everything this app owns lives in one schema: the database may be shared with another app. */
export const DB_SCHEMA = 'sleepy';
export const sleepy = pgSchema(DB_SCHEMA);

export const sourceStatus = sleepy.enum('source_status', SOURCE_STATUSES);
export const sourceRegion = sleepy.enum('source_region', ['KR', 'GLOBAL']);
export const keywordKind = sleepy.enum('keyword_kind', KEYWORD_KINDS);
export const postStatus = sleepy.enum('post_status', POST_STATUSES);
export const statusSource = sleepy.enum('status_source', ['AUTO', 'ADMIN']);
export const collectionPath = sleepy.enum('collection_path', COLLECTION_PATHS);
export const timePrecision = sleepy.enum('time_precision', ['exact', 'minute', 'approximate']);
export const runStatus = sleepy.enum('run_status', ['RUNNING', 'SUCCEEDED', 'FAILED']);
export const categoryEnum = sleepy.enum('category', CATEGORIES);
export const evalPurpose = sleepy.enum('eval_purpose', ['LIVE', 'REEVAL']);

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const sources = sleepy.table('sources', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  region: sourceRegion('region').notNull().default('KR'),
  adapterKey: text('adapter_key').notNull(),
  status: sourceStatus('status').notNull().default('UNSUPPORTED'),
  statusReason: text('status_reason'),
  policyNotes: text('policy_notes'),
  policyCheckedAt: ts('policy_checked_at'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  timezone: text('timezone').notNull().default('Asia/Seoul'),
  intervalOverride: integer('interval_override'),
  allowBodyStorage: boolean('allow_body_storage').notNull().default(false),
  /** Set after a 403/429: the scheduler skips the source until then. */
  pausedUntil: ts('paused_until'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const keywords = sleepy.table(
  'keywords',
  {
    id: serial('id').primaryKey(),
    kind: keywordKind('kind').notNull(),
    keyword: text('keyword').notNull(),
    aliases: text('aliases').array().notNull().default([]),
    description: text('description'),
    startsOn: date('starts_on'),
    endsOn: date('ends_on'),
    active: boolean('active').notNull().default(true),
    priority: integer('priority').notNull().default(0),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('keywords_kind_keyword').on(t.kind, t.keyword)],
);

export const crawlRuns = sleepy.table('crawl_runs', {
  id: serial('id').primaryKey(),
  sourceId: integer('source_id')
    .notNull()
    .references(() => sources.id),
  startedAt: ts('started_at').notNull().defaultNow(),
  finishedAt: ts('finished_at'),
  status: runStatus('status').notNull().default('RUNNING'),
  targetBudget: integer('target_budget'),
  requestsMade: integer('requests_made').notNull().default(0),
  candidatesFound: integer('candidates_found').notNull().default(0),
  newPosts: integer('new_posts').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  errorSummary: text('error_summary'),
});

export const crawlErrors = sleepy.table('crawl_errors', {
  id: serial('id').primaryKey(),
  crawlRunId: integer('crawl_run_id').references(() => crawlRuns.id),
  sourceId: integer('source_id')
    .notNull()
    .references(() => sources.id),
  url: text('url'),
  kind: text('kind').notNull(),
  message: text('message').notNull(),
  occurredAt: ts('occurred_at').notNull().defaultNow(),
});

export const promptVersions = sleepy.table('prompt_versions', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  systemPrompt: text('system_prompt').notNull(),
  evalPrompt: text('eval_prompt').notNull(),
  criteria: jsonb('criteria').$type<Record<string, string>>().notNull(),
  categoryDescriptions: jsonb('category_descriptions').$type<Record<string, string>>().notNull(),
  exclusions: text('exclusions').notNull(),
  weights: jsonb('weights').$type<Record<string, number>>().notNull(),
  thresholds: jsonb('thresholds').$type<{ publish: number; review: number }>().notNull(),
  active: boolean('active').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
  createdBy: text('created_by'),
});

export const posts = sleepy.table(
  'posts',
  {
    id: serial('id').primaryKey(),
    sourceId: integer('source_id')
      .notNull()
      .references(() => sources.id),
    externalId: text('external_id'),
    canonicalUrl: text('canonical_url').notNull(),
    title: text('title').notNull().default(''),
    preview: text('preview').notNull().default(''),
    postedAt: ts('posted_at'),
    postedAtPrecision: timePrecision('posted_at_precision'),
    sourceTimezone: text('source_timezone').notNull(),
    nightDate: date('night_date'),
    nightHour: smallint('night_hour'),
    collectedAt: ts('collected_at').notNull().defaultNow(),
    primaryPath: collectionPath('primary_path').notNull(),
    matchedKeywords: integer('matched_keywords').array().notNull().default([]),
    similarGroupId: text('similar_group_id'),
    status: postStatus('status').notNull().default('PENDING_EVAL'),
    statusSource: statusSource('status_source').notNull().default('AUTO'),
    score: smallint('score'),
    categories: categoryEnum('categories').array().notNull().default([]),
    reason: text('reason'),
    currentEvaluationId: integer('current_evaluation_id'),
    publishedAt: ts('published_at'),
    removedAt: ts('removed_at'),
  },
  (t) => [
    uniqueIndex('posts_source_external').on(t.sourceId, t.externalId),
    uniqueIndex('posts_canonical_url').on(t.canonicalUrl),
    index('posts_status_published').on(t.status, t.publishedAt),
    index('posts_status_score').on(t.status, t.score),
    index('posts_night_date').on(t.nightDate),
  ],
);

export const postDiscoveries = sleepy.table(
  'post_discoveries',
  {
    id: serial('id').primaryKey(),
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id),
    path: collectionPath('path').notNull(),
    keywordId: integer('keyword_id').references(() => keywords.id),
    crawlRunId: integer('crawl_run_id').references(() => crawlRuns.id),
    submissionId: integer('submission_id'),
    discoveredAt: ts('discovered_at').notNull().defaultNow(),
  },
  // One row per (post, route, keyword): re-seeing a post on the same route must not inflate route stats.
  (t) => [unique('post_discoveries_route').on(t.postId, t.path, t.keywordId).nullsNotDistinct()],
);

export const evaluations = sleepy.table('evaluations', {
  id: serial('id').primaryKey(),
  postId: integer('post_id')
    .notNull()
    .references(() => posts.id),
  promptVersionId: integer('prompt_version_id')
    .notNull()
    .references(() => promptVersions.id),
  model: text('model'),
  isCandidate: boolean('is_candidate'),
  score: smallint('score'),
  scores: jsonb('scores').$type<Record<string, number>>(),
  scoresReason: jsonb('scores_reason').$type<Record<string, string>>(),
  categories: categoryEnum('categories').array(),
  reason: text('reason'),
  safety: jsonb('safety').$type<{ is_safe: boolean; flags: string[]; uncertain: boolean }>(),
  llmDecision: text('llm_decision'),
  finalDecision: postStatus('final_decision').notNull(),
  rawResponse: jsonb('raw_response'),
  error: text('error'),
  warnings: text('warnings').array().notNull().default([]),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  purpose: evalPurpose('purpose').notNull().default('LIVE'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/** List items already judged (e.g. out of window) so their pages are never fetched again. */
export const seenItems = sleepy.table(
  'seen_items',
  {
    sourceId: integer('source_id')
      .notNull()
      .references(() => sources.id),
    externalId: text('external_id').notNull(),
    outcome: text('outcome').notNull(),
    seenAt: ts('seen_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('seen_items_source_external').on(t.sourceId, t.externalId)],
);

export const settings = sleepy.table('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export type SourceRow = typeof sources.$inferSelect;
export type PostRow = typeof posts.$inferSelect;
export type PromptVersionRow = typeof promptVersions.$inferSelect;
export type KeywordRow = typeof keywords.$inferSelect;
