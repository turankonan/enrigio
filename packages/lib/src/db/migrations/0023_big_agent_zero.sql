CREATE TYPE "public"."site_audit_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "site_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" text NOT NULL,
	"status" "site_audit_status" NOT NULL,
	"report" json NOT NULL,
	"schema_version" smallint NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_audits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brand_opportunities" ADD COLUMN "site_audit_id" uuid;--> statement-breakpoint
ALTER TABLE "site_audits" ADD CONSTRAINT "site_audits_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_audits_brand_created_idx" ON "site_audits" USING btree ("brand_id","created_at");--> statement-breakpoint
ALTER TABLE "brand_opportunities" ADD CONSTRAINT "brand_opportunities_site_audit_id_site_audits_id_fk" FOREIGN KEY ("site_audit_id") REFERENCES "public"."site_audits"("id") ON DELETE no action ON UPDATE no action;