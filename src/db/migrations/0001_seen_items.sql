CREATE TABLE "sleepy"."seen_items" (
	"source_id" integer NOT NULL,
	"external_id" text NOT NULL,
	"outcome" text NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sleepy"."seen_items" ADD CONSTRAINT "seen_items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "sleepy"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seen_items_source_external" ON "sleepy"."seen_items" USING btree ("source_id","external_id");