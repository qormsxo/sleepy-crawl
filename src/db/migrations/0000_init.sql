CREATE SCHEMA IF NOT EXISTS "sleepy";
--> statement-breakpoint
CREATE TYPE "sleepy"."category" AS ENUM('ABSURD', 'LATE_NIGHT_EMOTION', 'OVERTHINKING', 'NONSENSE_HUMOR', 'IMPULSIVE_THOUGHT', 'WEIRD_OBSERVATION', 'MEME', 'OTHER');--> statement-breakpoint
CREATE TYPE "sleepy"."collection_path" AS ENUM('POPULAR', 'MIDNIGHT_KEYWORD', 'MEME_KEYWORD', 'USER_SUBMISSION');--> statement-breakpoint
CREATE TYPE "sleepy"."eval_purpose" AS ENUM('LIVE', 'REEVAL');--> statement-breakpoint
CREATE TYPE "sleepy"."keyword_kind" AS ENUM('MIDNIGHT', 'ABSURD', 'MEME');--> statement-breakpoint
CREATE TYPE "sleepy"."post_status" AS ENUM('PENDING_EVAL', 'PUBLISHED', 'REVIEW', 'HIDDEN', 'BLOCKED', 'EVAL_FAILED');--> statement-breakpoint
CREATE TYPE "sleepy"."run_status" AS ENUM('RUNNING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "sleepy"."source_region" AS ENUM('KR', 'GLOBAL');--> statement-breakpoint
CREATE TYPE "sleepy"."source_status" AS ENUM('ACTIVE', 'UNSUPPORTED', 'PENDING_APPROVAL', 'DISABLED', 'DEGRADED');--> statement-breakpoint
CREATE TYPE "sleepy"."status_source" AS ENUM('AUTO', 'ADMIN');--> statement-breakpoint
CREATE TYPE "sleepy"."time_precision" AS ENUM('exact', 'minute', 'approximate');--> statement-breakpoint
CREATE TABLE "sleepy"."crawl_errors" (
	"id" serial PRIMARY KEY NOT NULL,
	"crawl_run_id" integer,
	"source_id" integer NOT NULL,
	"url" text,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sleepy"."crawl_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "sleepy"."run_status" DEFAULT 'RUNNING' NOT NULL,
	"target_budget" integer,
	"requests_made" integer DEFAULT 0 NOT NULL,
	"candidates_found" integer DEFAULT 0 NOT NULL,
	"new_posts" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"error_summary" text
);
--> statement-breakpoint
CREATE TABLE "sleepy"."evaluations" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"prompt_version_id" integer NOT NULL,
	"model" text,
	"is_candidate" boolean,
	"score" smallint,
	"scores" jsonb,
	"scores_reason" jsonb,
	"categories" "sleepy"."category"[],
	"reason" text,
	"safety" jsonb,
	"llm_decision" text,
	"final_decision" "sleepy"."post_status" NOT NULL,
	"raw_response" jsonb,
	"error" text,
	"warnings" text[] DEFAULT '{}' NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"purpose" "sleepy"."eval_purpose" DEFAULT 'LIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sleepy"."keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "sleepy"."keyword_kind" NOT NULL,
	"keyword" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"description" text,
	"starts_on" date,
	"ends_on" date,
	"active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sleepy"."post_discoveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"path" "sleepy"."collection_path" NOT NULL,
	"keyword_id" integer,
	"crawl_run_id" integer,
	"submission_id" integer,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_discoveries_route" UNIQUE NULLS NOT DISTINCT("post_id","path","keyword_id")
);
--> statement-breakpoint
CREATE TABLE "sleepy"."posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"external_id" text,
	"canonical_url" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"preview" text DEFAULT '' NOT NULL,
	"posted_at" timestamp with time zone,
	"posted_at_precision" "sleepy"."time_precision",
	"source_timezone" text NOT NULL,
	"night_date" date,
	"night_hour" smallint,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"primary_path" "sleepy"."collection_path" NOT NULL,
	"matched_keywords" integer[] DEFAULT '{}' NOT NULL,
	"similar_group_id" text,
	"status" "sleepy"."post_status" DEFAULT 'PENDING_EVAL' NOT NULL,
	"status_source" "sleepy"."status_source" DEFAULT 'AUTO' NOT NULL,
	"score" smallint,
	"categories" "sleepy"."category"[] DEFAULT '{}' NOT NULL,
	"reason" text,
	"current_evaluation_id" integer,
	"published_at" timestamp with time zone,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sleepy"."prompt_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"system_prompt" text NOT NULL,
	"eval_prompt" text NOT NULL,
	"criteria" jsonb NOT NULL,
	"category_descriptions" jsonb NOT NULL,
	"exclusions" text NOT NULL,
	"weights" jsonb NOT NULL,
	"thresholds" jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "prompt_versions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sleepy"."settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sleepy"."sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"region" "sleepy"."source_region" DEFAULT 'KR' NOT NULL,
	"adapter_key" text NOT NULL,
	"status" "sleepy"."source_status" DEFAULT 'UNSUPPORTED' NOT NULL,
	"status_reason" text,
	"policy_notes" text,
	"policy_checked_at" timestamp with time zone,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"timezone" text DEFAULT 'Asia/Seoul' NOT NULL,
	"interval_override" integer,
	"allow_body_storage" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "sleepy"."crawl_errors" ADD CONSTRAINT "crawl_errors_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "sleepy"."crawl_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sleepy"."crawl_errors" ADD CONSTRAINT "crawl_errors_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "sleepy"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sleepy"."crawl_runs" ADD CONSTRAINT "crawl_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "sleepy"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sleepy"."evaluations" ADD CONSTRAINT "evaluations_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "sleepy"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sleepy"."evaluations" ADD CONSTRAINT "evaluations_prompt_version_id_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "sleepy"."prompt_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sleepy"."post_discoveries" ADD CONSTRAINT "post_discoveries_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "sleepy"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sleepy"."post_discoveries" ADD CONSTRAINT "post_discoveries_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "sleepy"."keywords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sleepy"."post_discoveries" ADD CONSTRAINT "post_discoveries_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "sleepy"."crawl_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sleepy"."posts" ADD CONSTRAINT "posts_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "sleepy"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "keywords_kind_keyword" ON "sleepy"."keywords" USING btree ("kind","keyword");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_source_external" ON "sleepy"."posts" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_canonical_url" ON "sleepy"."posts" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "posts_status_published" ON "sleepy"."posts" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "posts_status_score" ON "sleepy"."posts" USING btree ("status","score");--> statement-breakpoint
CREATE INDEX "posts_night_date" ON "sleepy"."posts" USING btree ("night_date");