ALTER TABLE "brands" ADD COLUMN "default_market_key" text;--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "market_key" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
CREATE INDEX "prompt_runs_brand_id_market_key_created_at_idx" ON "prompt_runs" USING btree ("brand_id","market_key","created_at");