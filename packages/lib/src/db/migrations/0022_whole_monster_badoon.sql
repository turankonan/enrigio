CREATE TYPE "public"."run_sentiment" AS ENUM('positive', 'neutral', 'negative');--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "sentiment" "run_sentiment";--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "brand_rank" smallint;