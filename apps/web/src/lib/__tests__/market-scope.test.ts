/**
 * `marketScope` compiles to a raw SQL fragment; there's no DB-free way to read
 * the text/params off a drizzle `SQL` object without going through a dialect,
 * so these tests compile through `PgDialect` — the same step `db.execute`
 * takes internally — rather than asserting on the object's private shape.
 *
 * The second `describe` below is a genuine behavioral test against a seeded
 * Postgres database: it seeds one brand with runs + citations across
 * `tr-TR`, `de-DE`, `global`, and `legacy`, then asserts each representative
 * brand-scoped read includes `tr-TR` + `global` and excludes `de-DE` +
 * `legacy`. It only runs when `DATABASE_URL` is set — this repo's CI has no
 * Postgres fixture for `apps/web` unit tests (`db.ts` only connects lazily,
 * so importing it without `DATABASE_URL` is safe; skipping means never
 * calling it), so it self-skips there rather than failing on a missing DB.
 * Run it locally with `DATABASE_URL=postgres://... pnpm --filter
 * @workspace/web exec vitest run src/lib/__tests__/market-scope.test.ts`
 * against a migrated database.
 */
import { randomUUID } from "node:crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { marketScope } from "../postgres-read";

const dialect = new PgDialect();
const compile = (frag: ReturnType<typeof marketScope>) => dialect.sqlToQuery(frag);

describe("marketScope", () => {
	it("defaults to the unaliased prompt_runs predicate", () => {
		const { sql, params } = compile(marketScope("de-DE"));
		expect(sql).toBe("AND (market_key = $1 OR market_key = 'global')");
		expect(params).toEqual(["de-DE"]);
	});

	it("qualifies the column with the pr. alias for fanout queries", () => {
		const { sql, params } = compile(marketScope("de-DE", "pr"));
		expect(sql).toBe("AND (pr.market_key = $1 OR pr.market_key = 'global')");
		expect(params).toEqual(["de-DE"]);
	});

	it("scopes the citations source via an EXISTS join back to prompt_runs", () => {
		const { sql, params } = compile(marketScope("de-DE", "citations"));
		expect(sql).toContain("EXISTS (");
		expect(sql).toContain("FROM prompt_runs AS ms_run");
		expect(sql).toContain("ms_run.id = prompt_run_id");
		expect(sql).toContain("ms_run.market_key = $1 OR ms_run.market_key = 'global'");
		expect(params).toEqual(["de-DE"]);
	});

	it("binds whatever effective key it's given, not a hardcoded market", () => {
		const { params } = compile(marketScope("tr-TR"));
		expect(params).toEqual(["tr-TR"]);
	});
});

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

describe.skipIf(!process.env.DATABASE_URL)("brand-scoped reads against a seeded database", () => {
	let db: typeof import("@workspace/lib/db/db")["db"];
	let schema: typeof import("@workspace/lib/db/schema");
	let pgRead: typeof import("../postgres-read");

	const organizationId = `org-${randomUUID()}`;
	const brandId = `brand-${randomUUID()}`;
	const promptId = randomUUID();
	const promptValue = "what is the best crm";
	const fanoutQuery = "top crm software 2026";

	const now = Date.now();
	const trAt = new Date(now - 2 * 3_600_000);
	const globalAt = new Date(now - 1 * 3_600_000);
	const deAt = new Date(now - 20 * 86_400_000);
	const legacyAt = new Date(now - 25 * 86_400_000);
	const seedRuns = [
		{ key: "tr-TR", at: trAt },
		{ key: "de-DE", at: deAt },
		{ key: "global", at: globalAt },
		{ key: "legacy", at: legacyAt },
	] as const;
	const runIds: Record<string, string> = {};

	// Wide enough to contain every seeded row regardless of market — only
	// `marketScope` should narrow what these reads return.
	const windowFrom = new Date(now - 30 * 86_400_000).toISOString();
	const windowTo = new Date(now + 86_400_000).toISOString();

	beforeAll(async () => {
		({ db } = await import("@workspace/lib/db/db"));
		schema = await import("@workspace/lib/db/schema");
		pgRead = await import("../postgres-read");

		await db
			.insert(schema.organization)
			.values({ id: organizationId, name: "Market Scope Test Org", slug: organizationId, createdAt: new Date() });
		await db
			.insert(schema.brands)
			.values({ id: brandId, name: "Market Scope Test Brand", website: "https://example.com", organizationId });
		await db.insert(schema.prompts).values({ id: promptId, brandId, value: promptValue });

		for (const { key, at } of seedRuns) {
			const [row] = await db
				.insert(schema.promptRuns)
				.values({
					promptId,
					brandId,
					model: "gpt-test",
					version: "1",
					webSearchEnabled: true,
					rawOutput: {},
					webQueries: [fanoutQuery],
					brandMentioned: true,
					competitorsMentioned: ["Acme"],
					marketKey: key,
					createdAt: at,
				})
				.returning({ id: schema.promptRuns.id });
			runIds[key] = row.id;

			await db.insert(schema.citations).values({
				promptRunId: row.id,
				promptId,
				brandId,
				model: "gpt-test",
				url: `https://cited-${key}.example.com/page`,
				domain: `cited-${key}.example.com`,
				title: "Example",
				citationIndex: 1,
				createdAt: at,
			});
		}
	});

	afterAll(async () => {
		const { eq } = await import("drizzle-orm");
		await db.delete(schema.citations).where(eq(schema.citations.brandId, brandId));
		await db.delete(schema.promptRuns).where(eq(schema.promptRuns.brandId, brandId));
		await db.delete(schema.prompts).where(eq(schema.prompts.brandId, brandId));
		await db.delete(schema.brands).where(eq(schema.brands.id, brandId));
		await db.delete(schema.organization).where(eq(schema.organization.id, organizationId));
	});

	it("getDashboardSummary (summary/visibility) counts only tr-TR + global runs", async () => {
		const [summary] = await pgRead.getDashboardSummary(brandId, windowFrom, windowTo, "UTC", undefined, "tr-TR");
		expect(summary.total_runs).toBe(2);
	});

	it("getVisibilityDailyAggregate (summary/visibility) counts only tr-TR + global runs", async () => {
		const rows = await pgRead.getVisibilityDailyAggregate(
			brandId,
			dateOnly(new Date(now - 30 * 86_400_000)),
			dateOnly(new Date(now + 86_400_000)),
			"UTC",
			[promptId],
			[],
			undefined,
			"tr-TR",
		);
		const totalRuns = rows.reduce((sum, row) => sum + row.actual_branded_runs + row.actual_nonbranded_runs, 0);
		expect(totalRuns).toBe(2);
	});

	it("getPromptRuns / countPromptRuns (run history & count) return only tr-TR + global rows", async () => {
		const total = await pgRead.countPromptRuns(promptId, windowFrom, windowTo, "UTC", undefined, "tr-TR");
		expect(total).toBe(2);

		const rows = await pgRead.getPromptRuns(promptId, windowFrom, windowTo, "UTC", 10, 0, undefined, "tr-TR");
		expect(rows.map((row) => row.id).sort()).toEqual([runIds["tr-TR"], runIds.global].sort());
	});

	it("getBrandEarliestRunDate / getPromptsFirstEvaluatedAt (chart start date) ignore the older de-DE/legacy runs", async () => {
		const earliest = await pgRead.getBrandEarliestRunDate(brandId, "tr-TR");
		expect(earliest).not.toBeNull();
		// Without market scoping the earliest run would be `legacyAt` (25 days
		// ago); scoped to tr-TR + global it must be `trAt` (2 hours ago).
		expect(new Date(earliest as string).getTime()).toBeGreaterThan(now - 3 * 3_600_000);

		const firstEvaluated = await pgRead.getPromptsFirstEvaluatedAt(brandId, [promptId], "tr-TR");
		expect(new Date(firstEvaluated[0].first_evaluated_at).getTime()).toBeGreaterThan(now - 3 * 3_600_000);
	});

	it("getCitationDomainStats (citations, EXISTS-join) counts only tr-TR + global citations", async () => {
		const rows = await pgRead.getCitationDomainStats(
			brandId,
			windowFrom,
			windowTo,
			"UTC",
			undefined,
			undefined,
			"tr-TR",
		);
		const domains = rows.map((row) => row.domain).sort();
		expect(domains).toEqual(["cited-global.example.com", "cited-tr-TR.example.com"]);
		expect(rows.reduce((sum, row) => sum + Number(row.count), 0)).toBe(2);
	});

	it("getPromptTopCompetitorMentions (competitors/SoV) counts only tr-TR + global mentions", async () => {
		const rows = await pgRead.getPromptTopCompetitorMentions(promptId, windowFrom, windowTo, "UTC", 10, "tr-TR");
		expect(rows).toEqual([{ competitor_name: "Acme", mention_count: 2 }]);
	});

	it("getFanoutBreakdown (fanout, pr alias) counts only tr-TR + global runs", async () => {
		const rows = await pgRead.getFanoutBreakdown(brandId, windowFrom, windowTo, "UTC", [promptId], undefined, "tr-TR");
		expect(rows).toEqual([expect.objectContaining({ query: fanoutQuery, count: 2, brand_mentions: 2 })]);
	});
});
