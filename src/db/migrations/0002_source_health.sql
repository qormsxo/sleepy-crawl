ALTER TABLE "sleepy"."sources" ADD COLUMN "paused_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sleepy"."sources" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;