/**
 * Server-function entry points, kept apart from `keywords.ts` because client code imports this
 * file: the bundler swaps these handlers for RPC stubs, so the db-backed core never enters the
 * client graph.
 */
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { dedupeKeywords, MAX_KEYWORD_LENGTH, MAX_KEYWORDS } from "@/lib/keyword-limits";
import { type KeywordCheckView, maybeEnqueueKeywordCheck, readKeywordCheck } from "@/server/keywords";

export const getKeywordCheckFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }): Promise<KeywordCheckView> => {
		await requireBrandSession(data.brandId);
		const [brand] = await db
			.select({ keywords: brands.keywords })
			.from(brands)
			.where(eq(brands.id, data.brandId))
			.limit(1);
		// Opening the Home is enough to keep the check fresh; no button needed. With no keywords
		// there is nothing to check, and an empty run would only push the real first check back.
		const { enqueued } = brand?.keywords.length ? await maybeEnqueueKeywordCheck(data.brandId) : { enqueued: false };
		const view = await readKeywordCheck(data.brandId);
		// The running row only appears once the worker picks the job up; report it as running now
		// so the client starts polling.
		return { ...view, running: view.running || enqueued };
	});

export const requestKeywordCheckFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return maybeEnqueueKeywordCheck(data.brandId, { force: true });
	});

export const updateBrandKeywordsFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			keywords: z.array(z.string().trim().min(1).max(MAX_KEYWORD_LENGTH)).max(MAX_KEYWORDS),
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const keywords = dedupeKeywords(data.keywords);
		await db.update(brands).set({ keywords, updatedAt: new Date() }).where(eq(brands.id, data.brandId));
		const { enqueued } = await maybeEnqueueKeywordCheck(data.brandId, { force: true });
		return { keywords, enqueued };
	});
