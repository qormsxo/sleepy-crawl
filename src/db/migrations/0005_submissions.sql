CREATE TYPE "sleepy"."submission_mode" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "sleepy"."submission_status" AS ENUM('RECEIVED', 'REJECTED', 'DUPLICATE', 'PROCESSED');--> statement-breakpoint
CREATE TABLE "sleepy"."submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"canonical_url" text,
	"source_id" integer,
	"external_id" text,
	"note" text,
	"suggested_category" "sleepy"."category",
	"ip_hash" text NOT NULL,
	"mode" "sleepy"."submission_mode" NOT NULL,
	"manual_title" text,
	"manual_posted_at" timestamp with time zone,
	"manual_excerpt" text,
	"status" "sleepy"."submission_status" DEFAULT 'RECEIVED' NOT NULL,
	"reject_reason" text,
	"post_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sleepy"."posts" ADD COLUMN "requires_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sleepy"."submissions" ADD CONSTRAINT "submissions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "sleepy"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sleepy"."submissions" ADD CONSTRAINT "submissions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "sleepy"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submissions_ip_created" ON "sleepy"."submissions" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "submissions_status" ON "sleepy"."submissions" USING btree ("status");