CREATE TABLE "sleepy"."reeval_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"prompt_version_id" integer NOT NULL,
	"post_ids" integer[] NOT NULL,
	"done_post_ids" integer[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sleepy"."reeval_requests" ADD CONSTRAINT "reeval_requests_prompt_version_id_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "sleepy"."prompt_versions"("id") ON DELETE no action ON UPDATE no action;