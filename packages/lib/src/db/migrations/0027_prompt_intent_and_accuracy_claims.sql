CREATE TYPE "public"."prompt_intent" AS ENUM('discovery', 'comparison', 'local', 'price');--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "accuracy_claims" jsonb;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "intent" "prompt_intent";