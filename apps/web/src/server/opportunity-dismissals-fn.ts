import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { opportunityDismissals } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { opportunityKey } from "@/lib/opportunity-key";

async function listDismissed(brandId: string): Promise<string[]> {
	const rows = await db
		.select({ key: opportunityDismissals.opportunityKey })
		.from(opportunityDismissals)
		.where(eq(opportunityDismissals.brandId, brandId));
	return rows.map((r) => r.key);
}

export const getDismissedOpportunitiesFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return listDismissed(data.brandId);
	});

export const dismissOpportunityFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), title: z.string().trim().min(1).max(500) }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		await db
			.insert(opportunityDismissals)
			.values({ brandId: data.brandId, opportunityKey: opportunityKey(data.title) })
			.onConflictDoNothing();
		return { dismissed: await listDismissed(data.brandId) };
	});
