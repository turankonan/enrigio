/**
 * Admin-only breakdown of the shipped score (v1) beside the candidate score
 * (v2), its intent sub-scores and brand accuracy. Nothing here feeds a
 * user-facing surface; the v2 switch is a separate change gated on the
 * phase V back-test.
 */
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { PROMPT_INTENTS, type PromptIntent } from "@workspace/lib/db/schema";
import { resolveEffectiveMarket } from "@workspace/lib/markets";
import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";
import { isAdmin, requireAuthSession } from "@/lib/auth/helpers";
import {
	getAccuracySummary,
	getDashboardSummary,
	getDistinctModelCount,
	getIntentScoreSummary,
	getScoreV2Summary,
} from "@/lib/postgres-read";
import { resolveTimezone, shiftDateStr } from "@/lib/timezone-utils";

const WINDOW_DAYS = 30;

export interface AdminScoreRow {
	brandId: string;
	name: string;
	marketKey: string;
	totalRuns: number;
	models: number;
	v1: number | null;
	v2: number | null;
	cohortPrompts: number;
	intents: Record<PromptIntent, { score: number | null; promptCount: number }>;
	classifiedPrompts: number;
	unbrandedPrompts: number;
	/** accurate ÷ assessed, as a percentage. Null until something was assessed. */
	noContradiction: number | null;
	assessedRuns: number;
	accurateRuns: number;
	unsupportedRuns: number;
	unrecognisedRuns: number;
}

export async function computeAdminScoreRows(timezone: string): Promise<AdminScoreRow[]> {
	const today = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
	const from = shiftDateStr(today, { days: -(WINDOW_DAYS - 1) });
	const brandRows = await db.query.brands.findMany({ where: (b, { eq }) => eq(b.onboarded, true) });
	const promptRows = await db.query.prompts.findMany({ where: (p, { eq }) => eq(p.enabled, true) });

	// ponytail: five queries per brand; roll into one org-wide query past ~50 brands.
	return Promise.all(
		brandRows.map(async (brand) => {
			const marketKey = resolveEffectiveMarket({ defaultMarketKey: brand.defaultMarketKey }).key;
			const own = promptRows.filter((p) => p.brandId === brand.id);
			const unbranded = own.filter((p) => !getEffectiveBrandedStatus(p.systemTags ?? [], p.tags ?? []).isBranded);
			const branded = own.filter((p) => getEffectiveBrandedStatus(p.systemTags ?? [], p.tags ?? []).isBranded);
			const allIds = own.map((p) => p.id);
			const unbrandedIds = unbranded.map((p) => p.id);
			const brandedIds = branded.map((p) => p.id);

			const [[v1], v2, intentRows, accuracy, models] = await Promise.all([
				getDashboardSummary(brand.id, from, today, timezone, allIds, marketKey),
				getScoreV2Summary(brand.id, from, today, timezone, unbrandedIds, marketKey),
				getIntentScoreSummary(brand.id, from, today, timezone, unbrandedIds, marketKey),
				getAccuracySummary(brand.id, from, today, timezone, brandedIds, marketKey),
				getDistinctModelCount(brand.id, from, today, timezone, marketKey),
			]);

			const intents = Object.fromEntries(
				PROMPT_INTENTS.map((intent) => {
					const row = intentRows.find((r) => r.intent === intent);
					return [intent, { score: row?.score_v2 ?? null, promptCount: row?.prompt_count ?? 0 }];
				}),
			) as AdminScoreRow["intents"];

			return {
				brandId: brand.id,
				name: brand.name,
				marketKey,
				totalRuns: v1?.total_runs ?? 0,
				models,
				v1: v1?.total_runs ? v1.avg_visibility : null,
				v2: v2.score_v2,
				cohortPrompts: v2.prompt_count,
				intents,
				classifiedPrompts: unbranded.filter((p) => p.intent !== null).length,
				unbrandedPrompts: unbranded.length,
				noContradiction:
					accuracy.assessed_runs > 0 ? Math.round((accuracy.accurate_runs / accuracy.assessed_runs) * 100) : null,
				assessedRuns: accuracy.assessed_runs,
				accurateRuns: accuracy.accurate_runs,
				unsupportedRuns: accuracy.unsupported_runs,
				unrecognisedRuns: accuracy.unrecognised_runs,
			};
		}),
	);
}

export const getAdminScoreBreakdownFn = createServerFn({ method: "GET" }).handler(async () => {
	const session = await requireAuthSession();
	if (!isAdmin(session)) throw new Error("Unauthorized: Admin access required");
	return computeAdminScoreRows(resolveTimezone("UTC"));
});
