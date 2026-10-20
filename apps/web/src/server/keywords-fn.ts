/** Thin wrappers so the client graph never resolves the db-backed core. */
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { type KeywordCheckView, maybeEnqueueKeywordCheck, readKeywordCheck } from "@/server/keywords";

export const MAX_KEYWORDS = 20;
export const MAX_KEYWORD_LENGTH = 60;

export const getKeywordCheckFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }): Promise<KeywordCheckView> => {
		await requireBrandSession(data.brandId);
		// Opening the Home is enough to keep the check fresh; no button needed.
		await maybeEnqueueKeywordCheck(data.brandId);
		return readKeywordCheck(data.brandId);
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
		const seen = new Set<string>();
		const keywords = data.keywords.filter((keyword) => {
			const key = keyword.toLowerCase();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
		await db.update(brands).set({ keywords, updatedAt: new Date() }).where(eq(brands.id, data.brandId));
		await maybeEnqueueKeywordCheck(data.brandId, { force: true });
		return { keywords };
	});
