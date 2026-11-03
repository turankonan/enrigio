CREATE TYPE "public"."first_scan_status" AS ENUM('queued', 'running', 'complete', 'partial');--> statement-breakpoint
CREATE TABLE "first_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" text NOT NULL,
	"status" "first_scan_status" DEFAULT 'queued' NOT NULL,
	"expected" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enqueued_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "first_scans_brand_id_unique" UNIQUE("brand_id")
);
--> statement-breakpoint
ALTER TABLE "first_scans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "starter_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" text NOT NULL,
	"first_scan_id" uuid NOT NULL,
	"report" jsonb NOT NULL,
	"coverage" real NOT NULL,
	"partial" boolean DEFAULT false NOT NULL,
	"missing_sections" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone,
	CONSTRAINT "starter_reports_brand_id_unique" UNIQUE("brand_id")
);
--> statement-breakpoint
ALTER TABLE "starter_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "sector" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "setup_draft" jsonb;--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "first_scan_id" uuid;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "first_scan_id" uuid;--> statement-breakpoint
ALTER TABLE "first_scans" ADD CONSTRAINT "first_scans_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starter_reports" ADD CONSTRAINT "starter_reports_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starter_reports" ADD CONSTRAINT "starter_reports_first_scan_id_first_scans_id_fk" FOREIGN KEY ("first_scan_id") REFERENCES "public"."first_scans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompt_runs_first_scan_id_idx" ON "prompt_runs" USING btree ("first_scan_id") WHERE first_scan_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "usage_events_first_scan_id_idx" ON "usage_events" USING btree ("first_scan_id") WHERE first_scan_id IS NOT NULL;