/**
 * Server side of "Discover competitors from answers": load the brand's recent
 * run text and hand it to the discovery LLM in @workspace/lib.
 */
import { createServerFn } from "@tanstack/react-start";
import {
	type DiscoveredCompetitor,
	discoverCompetitorsFromAnswers,
	MAX_DISCOVERY_ANSWERS,
} from "@workspace/lib/competitor-discovery";
import { db } from "@workspace/lib/db/db";
import { brands, competitors, promptRuns } from "@workspace/lib/db/schema";
import { extractTextContent } from "@workspace/lib/text-extraction";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";

export interface DiscoverCompetitorsResult {
	suggestions: DiscoveredCompetitor[];
	answersScanned: number;
}

export const discoverCompetitors = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }): Promise<DiscoverCompetitorsResult> => {
		await requireBrandSession(data.brandId);

		const [brand] = await db.select().from(brands).where(eq(brands.id, data.brandId));
		if (!brand) throw new Error("Brand not found");

		const existing = await db.select().from(competitors).where(eq(competitors.brandId, data.brandId));

		// Newest runs first: discovery should reflect what engines say today.
		const runs = await db
			.select({ rawOutput: promptRuns.rawOutput, provider: promptRuns.provider, model: promptRuns.model })
			.from(promptRuns)
			.where(and(eq(promptRuns.brandId, data.brandId), isNotNull(promptRuns.rawOutput)))
			.orderBy(desc(promptRuns.createdAt))
			.limit(MAX_DISCOVERY_ANSWERS);

		const answerTexts = runs.map((r) => extractTextContent(r.rawOutput, r.provider ?? r.model));

		const suggestions = await discoverCompetitorsFromAnswers({
			brand: {
				name: brand.name,
				aliases: brand.aliases,
				domains: [brand.website, ...brand.additionalDomains],
			},
			existingCompetitors: existing.map((c) => ({ name: c.name, aliases: c.aliases, domains: c.domains })),
			answerTexts,
		});

		return { suggestions, answersScanned: answerTexts.length };
	});
