CREATE TYPE "public"."keyword_check_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "keyword_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" text NOT NULL,
	"status" "keyword_check_status" NOT NULL,
	"report" json NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "keyword_checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "keywords" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "keyword_checks" ADD CONSTRAINT "keyword_checks_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "keyword_checks_brand_created_idx" ON "keyword_checks" USING btree ("brand_id","created_at");