import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/db";
import { keywordChecks } from "../db/schema";
import type { KeywordCheckReport } from "./types";

export type KeywordCheck = Omit<typeof keywordChecks.$inferSelect, "report"> & { report: KeywordCheckReport };

export async function getLatestCompletedKeywordCheck(brandId: string): Promise<KeywordCheck | null> {
	const [row] = await db
		.select()
		.from(keywordChecks)
		.where(and(eq(keywordChecks.brandId, brandId), eq(keywordChecks.status, "completed")))
		.orderBy(desc(keywordChecks.createdAt))
		.limit(1);
	return (row as KeywordCheck | undefined) ?? null;
}

/** Newest row of any status — what the enqueue cooldown looks at. */
export async function getLatestKeywordCheckAttempt(brandId: string): Promise<KeywordCheck | null> {
	const [row] = await db
		.select()
		.from(keywordChecks)
		.where(eq(keywordChecks.brandId, brandId))
		.orderBy(desc(keywordChecks.createdAt))
		.limit(1);
	return (row as KeywordCheck | undefined) ?? null;
}
