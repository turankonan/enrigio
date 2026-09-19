/**
 * Read-side queries for `site_audits` rows. No writes here — see `./run` for
 * the orchestrator that creates and updates rows.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/db";
import { siteAudits } from "../db/schema";
import type { SiteAuditReport } from "./types";

/**
 * A `site_audits` row with `report` narrowed to the shape this package
 * actually writes into the `json` column (the column itself is untyped at
 * the schema level).
 */
export type SiteAudit = Omit<typeof siteAudits.$inferSelect, "report"> & { report: SiteAuditReport };

/** Newest `status: "completed"` audit for `brandId` — what the product displays. */
export async function getLatestCompletedAudit(brandId: string): Promise<SiteAudit | null> {
	const [row] = await db
		.select()
		.from(siteAudits)
		.where(and(eq(siteAudits.brandId, brandId), eq(siteAudits.status, "completed")))
		.orderBy(desc(siteAudits.createdAt))
		.limit(1);
	return (row as SiteAudit | undefined) ?? null;
}

/**
 * Newest audit of ANY status (running/completed/failed) for `brandId` — used
 * by the enqueue cooldown (Task 12), which must see an in-flight or recently
 * failed attempt even though it's never displayed.
 */
export async function getLatestAuditAttempt(brandId: string): Promise<SiteAudit | null> {
	const [row] = await db
		.select()
		.from(siteAudits)
		.where(eq(siteAudits.brandId, brandId))
		.orderBy(desc(siteAudits.createdAt))
		.limit(1);
	return (row as SiteAudit | undefined) ?? null;
}
