/**
 * Phase V back-test: does rank-weighted score v2 order prompts and move month
 * over month like the shipped mention-rate score v1, on the same buyer-prompt
 * cohort? Read-only. Thresholds live in src/score/backtest.ts.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm -C packages/lib exec tsx scripts/backtest-score-v2.ts [--json rows.json]
 *   DATABASE_URL=postgres://... pnpm -C packages/lib exec tsx scripts/backtest-score-v2.ts --labels 50 --out-dir ./labels
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Client } from "pg";
import { resolveEffectiveMarket } from "../src/markets/effective";
import { type Direction, direction, scoreV2, spearman, type VerdictRow, verdict } from "../src/score";
import { getEffectiveBrandedStatus } from "../src/tag-utils";
import { extractTextContent } from "../src/text-extraction";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL is required");
	process.exit(2);
}
if (!/localhost|127\.0\.0\.1/.test(DATABASE_URL) && process.env.ALLOW_REMOTE_DB !== "1") {
	console.error("Refusing to run against a non-local database (set ALLOW_REMOTE_DB=1 to override)");
	process.exit(2);
}

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		json: { type: "string" },
		labels: { type: "string" },
		"out-dir": { type: "string", default: "./labels" },
	},
});

const WINDOW_DAYS = 30;
const MIN_MODELS = 4;
const MIN_RUNS_PER_PROMPT = 4;
// Spearman over fewer prompts is noise, so such a brand cannot qualify.
const MIN_COHORT_PROMPTS = 3;

interface BrandRow {
	id: string;
	name: string;
	default_market_key: string | null;
}
interface PromptRow {
	id: string;
	tags: string[];
	system_tags: string[];
}
interface RunRow {
	prompt_id: string;
	model: string;
	brand_mentioned: boolean;
	brand_rank: number | null;
	created_at: Date;
}
interface CohortPrompt {
	id: string;
	cur: RunRow[];
	prev: RunRow[];
}

interface BrandReport {
	brandId: string;
	name: string;
	cohortPrompts: number;
	runs: number;
	models: number;
	v1All: number | null;
	v1Buyer: number | null;
	v2: number | null;
	spearman: number | null;
	trendV1: number | null;
	trendV2: number | null;
	directionV1: Direction | "n/a";
	directionV2: Direction | "n/a";
	levelGap: number | null;
	trendGap: number | null;
}

const mentionRate = (runs: RunRow[]) =>
	runs.length === 0 ? null : Math.round((runs.filter((r) => r.brand_mentioned).length / runs.length) * 100);
const toScored = (runs: RunRow[]) => runs.map((r) => ({ brandMentioned: r.brand_mentioned, brandRank: r.brand_rank }));
const delta = (a: number | null, b: number | null) => (a !== null && b !== null ? a - b : null);

async function loadRuns(client: Client, brandId: string, marketKey: string, since: Date): Promise<RunRow[]> {
	const { rows } = await client.query<RunRow>(
		`SELECT r.prompt_id, r.model, r.brand_mentioned, r.brand_rank, r.created_at
		 FROM prompt_runs r
		 JOIN prompts p ON p.id = r.prompt_id
		 WHERE r.brand_id = $1 AND p.enabled AND r.created_at >= $2
		   AND (r.market_key = $3 OR r.market_key = 'global')`,
		[brandId, since, marketKey],
	);
	return rows;
}

function groupByPrompt(runs: RunRow[], allowed: Set<string>): Map<string, RunRow[]> {
	const byPrompt = new Map<string, RunRow[]>();
	for (const r of runs) {
		if (!allowed.has(r.prompt_id)) continue;
		byPrompt.set(r.prompt_id, [...(byPrompt.get(r.prompt_id) ?? []), r]);
	}
	return byPrompt;
}

// A prompt is in the cohort only when, on the models it ran on in BOTH
// windows, it has enough runs in each window. Pairs seen in one window only
// are dropped from both, so a prompt or model that came or went between
// windows cannot pose as a trend.
function buildCohort(cur: RunRow[], prev: RunRow[], unbrandedIds: Set<string>): CohortPrompt[] {
	const curByPrompt = groupByPrompt(cur, unbrandedIds);
	const prevByPrompt = groupByPrompt(prev, unbrandedIds);
	const cohort: CohortPrompt[] = [];
	for (const [id, curRuns] of curByPrompt) {
		const prevRuns = prevByPrompt.get(id) ?? [];
		const models = new Set(curRuns.map((r) => r.model));
		const paired = [...new Set(prevRuns.map((r) => r.model))].filter((m) => models.has(m));
		const c = curRuns.filter((r) => paired.includes(r.model));
		const pv = prevRuns.filter((r) => paired.includes(r.model));
		if (c.length >= MIN_RUNS_PER_PROMPT && pv.length >= MIN_RUNS_PER_PROMPT) cohort.push({ id, cur: c, prev: pv });
	}
	return cohort;
}

type Analysis = { report: BrandReport } | { skipped: "too few shared models" | "too few cohort prompts" };

function analyseBrand(brand: BrandRow, prompts: PromptRow[], runs: RunRow[], now: Date): Analysis {
	const cutoff = new Date(now.getTime() - WINDOW_DAYS * 864e5);
	const current = runs.filter((r) => r.created_at >= cutoff);
	const previous = runs.filter((r) => r.created_at < cutoff);
	// Only models seen in both windows, so a pick change cannot pose as a score change.
	const modelsBefore = new Set(previous.map((r) => r.model));
	const shared = [...new Set(current.map((r) => r.model))].filter((m) => modelsBefore.has(m));
	if (shared.length < MIN_MODELS) return { skipped: "too few shared models" };
	const inShared = (r: RunRow) => shared.includes(r.model);
	const cur = current.filter(inShared);

	const unbrandedIds = new Set(
		prompts.filter((p) => !getEffectiveBrandedStatus(p.system_tags, p.tags).isBranded).map((p) => p.id),
	);
	const cohort = buildCohort(cur, previous.filter(inShared), unbrandedIds);
	if (cohort.length < MIN_COHORT_PROMPTS) return { skipped: "too few cohort prompts" };
	const curCohort = cohort.flatMap((c) => c.cur);
	const prevCohort = cohort.flatMap((c) => c.prev);

	const perPromptV1 = cohort.map((c) => mentionRate(c.cur) ?? 0);
	const perPromptV2 = cohort.map((c) => scoreV2(toScored(c.cur)) ?? 0);

	const v1Buyer = mentionRate(curCohort);
	const v2 = scoreV2(toScored(curCohort));
	const trendV1 = delta(v1Buyer, mentionRate(prevCohort));
	const trendV2 = delta(v2, scoreV2(toScored(prevCohort)));
	const gap = delta(trendV1, trendV2);

	const report: BrandReport = {
		brandId: brand.id,
		name: brand.name,
		cohortPrompts: cohort.length,
		runs: curCohort.length,
		models: shared.length,
		v1All: mentionRate(cur),
		v1Buyer,
		v2,
		spearman: spearman(perPromptV1, perPromptV2),
		trendV1,
		trendV2,
		directionV1: trendV1 === null ? "n/a" : direction(trendV1, 0),
		directionV2: trendV2 === null ? "n/a" : direction(trendV2, 0),
		levelGap: delta(v1Buyer, v2),
		trendGap: gap === null ? null : Math.abs(gap),
	};
	return { report };
}

async function runBacktest(client: Client): Promise<void> {
	const now = new Date();
	const since = new Date(now.getTime() - 2 * WINDOW_DAYS * 864e5);
	const { rows: brandRows } = await client.query<BrandRow>(
		"SELECT id, name, default_market_key FROM brands WHERE onboarded AND enabled",
	);
	const reports: BrandReport[] = [];
	const skipped: Record<string, string[]> = {};
	for (const brand of brandRows) {
		const marketKey = resolveEffectiveMarket({ defaultMarketKey: brand.default_market_key }).key;
		const { rows: prompts } = await client.query<PromptRow>(
			"SELECT id, tags, system_tags FROM prompts WHERE brand_id = $1 AND enabled",
			[brand.id],
		);
		const runs = await loadRuns(client, brand.id, marketKey, since);
		const analysis = analyseBrand(brand, prompts, runs, now);
		if ("report" in analysis) {
			reports.push(analysis.report);
		} else {
			skipped[analysis.skipped] = [...(skipped[analysis.skipped] ?? []), brand.name];
		}
	}

	console.table(reports.map(({ brandId, ...rest }) => rest));
	for (const [reason, names] of Object.entries(skipped)) console.log(`Skipped (${reason}): ${names.join(", ")}`);
	const rows: VerdictRow[] = [];
	for (const r of reports) {
		if (r.trendGap === null || r.directionV1 === "n/a" || r.directionV2 === "n/a") continue;
		rows.push({ spearman: r.spearman, directionV1: r.directionV1, directionV2: r.directionV2, trendGap: r.trendGap });
	}
	const result = verdict(rows);
	// Level gap is reported, never gated: every v2 weight is ≤ 1, so v2 sits
	// below v1-buyer by design. The gate is ordering and trend, not level.
	console.log(`\nVerdict: ${result.outcome.toUpperCase()} (level gap is informational)`);
	for (const reason of result.reasons) console.log(`  - ${reason}`);
	if (values.json) {
		writeFileSync(values.json, JSON.stringify({ generatedAt: now.toISOString(), reports, verdict: result }, null, 2));
		console.log(`✓ wrote ${values.json}`);
	}
}

interface LabelRow {
	id: string;
	brand_id: string;
	model: string;
	provider: string | null;
	raw_output: unknown;
	accuracy_claims: unknown;
	prompt: string;
	name: string;
	website: string;
	additional_domains: string[];
	aliases: string[];
	keywords: string[];
}

const csvCell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;

async function exportLabels(client: Client, n: number, outDir: string): Promise<void> {
	// Only runs the new classifier assessed carry claims; before the worker
	// change ships, this exports nothing.
	const { rows } = await client.query<LabelRow>(
		`SELECT r.id, r.brand_id, r.model, r.provider, r.raw_output, r.accuracy_claims, p.value AS prompt,
		        b.name, b.website, b.additional_domains, b.aliases, b.keywords
		 FROM prompt_runs r
		 JOIN prompts p ON p.id = r.prompt_id
		 JOIN brands b ON b.id = r.brand_id
		 WHERE r.brand_mentioned AND r.accuracy_claims IS NOT NULL
		 ORDER BY random()
		 LIMIT $1`,
		[n],
	);
	mkdirSync(outDir, { recursive: true });
	const answers = [
		["run_id", "brand_id", "model", "prompt", "answer", "profile"].map(csvCell).join(","),
		...rows.map((r) =>
			[
				r.id,
				r.brand_id,
				r.model,
				r.prompt,
				extractTextContent(r.raw_output, r.provider ?? r.model),
				[
					`name: ${r.name}`,
					`website: ${r.website}`,
					`domains: ${r.additional_domains.join(", ")}`,
					`aliases: ${r.aliases.join(", ")}`,
					`keywords: ${r.keywords.join("; ")}`,
				].join(" | "),
			]
				.map(csvCell)
				.join(","),
		),
	].join("\n");
	const claims = [
		["run_id", "claims_json"].map(csvCell).join(","),
		...rows.map((r) => [r.id, JSON.stringify(r.accuracy_claims)].map(csvCell).join(",")),
	].join("\n");
	writeFileSync(join(outDir, "answers.csv"), answers);
	writeFileSync(join(outDir, "classifier-claims.csv"), claims);
	console.log(
		`✓ wrote ${rows.length} answers to ${outDir}/answers.csv (labellers) and classifier-claims.csv (keep separate)`,
	);
}

async function main(): Promise<void> {
	const client = new Client({ connectionString: DATABASE_URL });
	await client.connect();
	try {
		if (values.labels) await exportLabels(client, Number(values.labels), values["out-dir"] ?? "./labels");
		else await runBacktest(client);
	} finally {
		await client.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
