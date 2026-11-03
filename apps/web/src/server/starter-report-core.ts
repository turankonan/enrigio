import { db } from "@workspace/lib/db/db";
import {
	type AccuracyClaim,
	brands,
	firstScans,
	PROMPT_INTENTS,
	type PromptIntent,
	promptRuns,
	prompts,
	starterReports,
} from "@workspace/lib/db/schema";
import { extractTextContent } from "@workspace/lib/text-extraction";
import { eq } from "drizzle-orm";
import { getFirstScanRivalCitations } from "@/lib/postgres-read";
import { getFirstScanStatus } from "@/server/first-scan-core";
import { resolveOpportunities } from "@/server/opportunities";

const EXCERPT_CHARS = 600;
const ANSWER_COUNT = 4;
const WHO_LIMIT = 6;
const STEPS_LIMIT = 3;

export interface StarterReport {
	brand: { name: string; website: string; sector: string | null; location: string | null };
	engines: string[];
	headline: { mentionedRuns: number; totalRuns: number; mentionPercent: number; rivalsAhead: number };
	score: {
		mentionPercent: number;
		byIntent: { intent: PromptIntent; mentionPercent: number; runs: number }[];
		accuracy: { assessed: number; accurate: number; unsupported: number } | null;
	};
	whoIsThere: { name: string; count: number; isYou: boolean }[];
	whyThem: { domain: string; count: number; isYours: boolean }[];
	nextSteps: { title: string; why: string }[];
	answers: { promptValue: string; model: string; mentioned: boolean; excerpt: string }[];
}

export interface BuildInput {
	brand: { name: string; website: string; sector: string | null; location: string | null; domains: string[] };
	engines: string[];
	runs: {
		promptValue: string;
		intent: PromptIntent | null;
		model: string;
		mentioned: boolean;
		brandRank: number | null;
		competitorsMentioned: string[];
		accuracyClaims: AccuracyClaim[] | null;
		text: string;
	}[];
	citations: { domain: string; count: number }[];
	nextSteps: { title: string; why: string }[] | null;
}

const pct = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part * 100) / whole));

export function buildStarterReport(input: BuildInput): { report: StarterReport; missingSections: string[] } {
	const { runs } = input;
	const mentionedRuns = runs.filter((r) => r.mentioned).length;

	const rivalCounts = new Map<string, number>();
	for (const r of runs) for (const c of r.competitorsMentioned) rivalCounts.set(c, (rivalCounts.get(c) ?? 0) + 1);
	const who = [...rivalCounts.entries()]
		.map(([name, count]) => ({ name, count, isYou: false }))
		.concat([{ name: input.brand.name, count: mentionedRuns, isYou: true }])
		.sort((a, b) => b.count - a.count)
		.slice(0, WHO_LIMIT);
	const rivalsAhead = who.filter((w) => !w.isYou && w.count > mentionedRuns).length;

	const byIntent = PROMPT_INTENTS.map((intent) => {
		const rs = runs.filter((r) => r.intent === intent);
		return { intent, runs: rs.length, mentionPercent: pct(rs.filter((r) => r.mentioned).length, rs.length) };
	});

	const assessed = runs.filter((r) => r.accuracyClaims !== null);
	const accuracy =
		assessed.length === 0
			? null
			: {
					assessed: assessed.length,
					accurate: assessed.filter((r) => (r.accuracyClaims ?? []).every((c) => c.status !== "contradicted")).length,
					unsupported: assessed.filter((r) => (r.accuracyClaims ?? []).some((c) => c.status === "unsupported")).length,
				};

	const yours = new Set(input.brand.domains.map((d) => d.toLowerCase().replace(/^www\./, "")));
	const whyThem = input.citations.map((c) => ({
		...c,
		isYours: yours.has(c.domain.toLowerCase().replace(/^www\./, "")),
	}));

	const answers = pickAnswers(runs).map((r) => ({
		promptValue: r.promptValue,
		model: r.model,
		mentioned: r.mentioned,
		excerpt: r.text.length > EXCERPT_CHARS ? `${r.text.slice(0, EXCERPT_CHARS - 1).trimEnd()}…` : r.text,
	}));

	const missingSections: string[] = [];
	if (whyThem.length === 0) missingSections.push("whyThem");
	if (input.nextSteps === null) missingSections.push("nextSteps");

	return {
		report: {
			brand: {
				name: input.brand.name,
				website: input.brand.website,
				sector: input.brand.sector,
				location: input.brand.location,
			},
			engines: input.engines,
			headline: { mentionedRuns, totalRuns: runs.length, mentionPercent: pct(mentionedRuns, runs.length), rivalsAhead },
			score: { mentionPercent: pct(mentionedRuns, runs.length), byIntent, accuracy },
			whoIsThere: who,
			whyThem,
			nextSteps: (input.nextSteps ?? []).slice(0, STEPS_LIMIT),
			answers,
		},
		missingSections,
	};
}

/**
 * Four answers the reader can learn from: alternate mentioned/unmentioned and
 * rotate engines so the page is not four ChatGPT answers in a row.
 */
function pickAnswers<T extends { mentioned: boolean; model: string; text: string }>(runs: T[]): T[] {
	const usable = runs.filter((r) => r.text.trim().length > 0);
	const picked: T[] = [];
	const buckets = [usable.filter((r) => r.mentioned), usable.filter((r) => !r.mentioned)];
	let turn = 0;
	while (picked.length < ANSWER_COUNT && buckets.some((b) => b.length > 0)) {
		const bucket = buckets[turn % 2]!;
		turn++;
		if (bucket.length === 0) continue;
		const usedModels = new Set(picked.map((p) => p.model));
		const idx = Math.max(
			0,
			bucket.findIndex((r) => !usedModels.has(r.model)),
		);
		picked.push(bucket.splice(idx, 1)[0]!);
	}
	return picked;
}

export async function getOrBuildStarterReport(brandId: string) {
	const existing = await db.query.starterReports.findFirst({ where: eq(starterReports.brandId, brandId) });
	if (existing) {
		return {
			report: existing.report as StarterReport,
			coverage: existing.coverage,
			partial: existing.partial,
			missingSections: existing.missingSections,
			createdAt: existing.createdAt.toISOString(),
		};
	}
	const scan = await db.query.firstScans.findFirst({ where: eq(firstScans.brandId, brandId) });
	if (!scan) return null;
	const status = await getFirstScanStatus(scan.id);
	if (status.status !== "complete" && status.status !== "partial") return null;

	const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
	if (!brand) return null;
	const rows = await db
		.select({
			promptValue: prompts.value,
			intent: prompts.intent,
			model: promptRuns.model,
			provider: promptRuns.provider,
			mentioned: promptRuns.brandMentioned,
			brandRank: promptRuns.brandRank,
			competitorsMentioned: promptRuns.competitorsMentioned,
			accuracyClaims: promptRuns.accuracyClaims,
			rawOutput: promptRuns.rawOutput,
		})
		.from(promptRuns)
		.innerJoin(prompts, eq(prompts.id, promptRuns.promptId))
		.where(eq(promptRuns.firstScanId, scan.id));

	const [citations, opportunities] = await Promise.all([
		getFirstScanRivalCitations(scan.id),
		resolveOpportunities(brandId, "UTC").catch(() => null),
	]);
	const nextSteps = opportunities?.report?.opportunities.map((o) => ({ title: o.title, why: o.why })) ?? null;

	const websiteHost = new URL(brand.website).hostname.replace(/^www\./, "");
	const { report, missingSections } = buildStarterReport({
		brand: {
			name: brand.name,
			website: brand.website,
			sector: brand.sector,
			location: brand.location,
			domains: [websiteHost, ...brand.additionalDomains],
		},
		engines: [...new Set(scan.expected.map((p) => p.model))],
		runs: rows.map((r) => ({ ...r, text: extractTextContent(r.rawOutput, r.provider ?? r.model) })),
		citations,
		nextSteps,
	});
	// Successes only: a failed pair contributed no answer.
	const coverage = scan.expected.length === 0 ? 0 : status.done / scan.expected.length;
	const partial = status.status === "partial";
	const [saved] = await db
		.insert(starterReports)
		.values({
			brandId,
			firstScanId: scan.id,
			report,
			coverage,
			partial,
			missingSections,
			finalizedAt: partial ? null : new Date(),
		})
		.onConflictDoNothing({ target: starterReports.brandId })
		.returning();
	// A concurrent request may have won the insert; the stored row is the truth.
	if (!saved) return getOrBuildStarterReport(brandId);
	return { report, coverage, partial, missingSections, createdAt: saved.createdAt.toISOString() };
}

/** Only "next steps" can be retried: it is the single LLM-generated section. */
export async function retryStarterReportSection(brandId: string, section: "nextSteps"): Promise<void> {
	const existing = await db.query.starterReports.findFirst({ where: eq(starterReports.brandId, brandId) });
	if (!existing || !existing.missingSections.includes(section)) return;
	const opportunities = await resolveOpportunities(brandId, "UTC").catch(() => null);
	const steps = opportunities?.report?.opportunities.map((o) => ({ title: o.title, why: o.why }));
	if (!steps) return;
	const report = { ...(existing.report as StarterReport), nextSteps: steps.slice(0, STEPS_LIMIT) };
	await db
		.update(starterReports)
		.set({ report, missingSections: existing.missingSections.filter((s) => s !== section) })
		.where(eq(starterReports.id, existing.id));
}
