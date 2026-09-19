/**
 * End-to-end AXO integration test: brand-new brand -> Opportunities request
 * enqueues a site audit -> the audit completes -> the next Opportunities
 * generation references it -> a newer completed audit invalidates the cache.
 *
 * Only the true I/O boundaries are mocked: pg-boss (`getBoss().send`), the LLM
 * (`runStructuredCompletionPrompt`), and the raw-SQL read helpers in
 * `@/lib/postgres-read`. Everything that wires AXO together —
 * `resolveOpportunities`, `maybeEnqueueSiteAudit`, and `@workspace/lib/axo`'s
 * `getLatestCompletedAudit`/`getLatestAuditAttempt` — runs for real against a
 * single shared in-memory fake `db`, so this proves the actual siteAuditId
 * plumbing and staleness rule, not a restatement of it.
 *
 * Seam: `runSiteAudit` itself (the crawl/robots/HTML/LLM-scoring orchestrator)
 * is unit-tested in `packages/lib/src/axo/run.test.ts` with its own
 * collaborators (safeFetch, fetchRobots, scorePageRelevance, ...) mocked at
 * the packages/lib level. Those aren't part of `@workspace/lib/axo`'s public
 * surface, so re-mocking them from an apps/web test would mean reaching into
 * internals. Instead, the "audit completes" step below inserts a `completed`
 * `site_audits` row through the exact same `db.insert(siteAudits).values(...)`
 * call `runSiteAudit` makes, proving the read/staleness side end-to-end
 * without re-proving the crawler.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireBrandSession, send, resolveFilteredPrompts, runStructuredCompletionPrompt, postgresRead, dbState } =
	vi.hoisted(() => ({
		requireBrandSession: vi.fn(),
		send: vi.fn(async () => "job-id"),
		resolveFilteredPrompts: vi.fn(),
		runStructuredCompletionPrompt: vi.fn(),
		postgresRead: {
			getPerPromptRunStats: vi.fn(),
			getPerPromptDailyCompetitorMentions: vi.fn(),
			getPerPromptDailyCitationStats: vi.fn(),
			getPerPromptCitationPages: vi.fn(),
			getBrandMentionRateByModel: vi.fn(),
		},
		dbState: {
			siteAudits: [] as Record<string, unknown>[],
			brandOpportunities: [] as Record<string, unknown>[],
			brands: [] as Record<string, unknown>[],
			competitors: [] as Record<string, unknown>[],
			clock: Date.now(),
		},
	}));

// Pulled in transitively by `@/server/site-audit` for its authorized
// wrappers (unused by the unauthorized core this test exercises) — stubbed
// so loading the module doesn't require a real better-auth instance/env.
vi.mock("@/lib/auth/helpers", () => ({ requireBrandSession }));
vi.mock("@/lib/boss-client", () => ({ getBoss: vi.fn(async () => ({ send })) }));
vi.mock("@/server/prompt-resolution", () => ({ resolveFilteredPrompts }));
vi.mock("@/lib/postgres-read", () => postgresRead);
vi.mock("@workspace/lib/onboarding", () => ({ runStructuredCompletionPrompt }));

vi.mock("@workspace/lib/db/db", async () => {
	const schema = await vi.importActual<typeof import("@workspace/lib/db/schema")>("@workspace/lib/db/schema");

	type TableKey = "siteAudits" | "brandOpportunities" | "brands" | "competitors";

	function tableKey(table: unknown): TableKey | null {
		if (table === schema.siteAudits) return "siteAudits";
		if (table === schema.brandOpportunities) return "brandOpportunities";
		if (table === schema.brands) return "brands";
		if (table === schema.competitors) return "competitors";
		return null;
	}

	function nextCreatedAt(): Date {
		dbState.clock += 1000;
		return new Date(dbState.clock);
	}

	// The only two tables this fake ever needs to order are the ones the
	// product code actually queries with `orderBy(desc(createdAt))`.
	function rowsForTable(table: unknown): Record<string, unknown>[] {
		const key = tableKey(table);
		if (!key) return [];
		const rows = dbState[key];
		if (key === "siteAudits" || key === "brandOpportunities") {
			return [...rows].sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime());
		}
		return rows;
	}

	// A real `Promise` with extra chain methods bolted on (rather than a plain
	// object defining its own `then`), so it satisfies both
	// `await db.select(...).from(t).where(...)` (no further chaining) and
	// `...where(...).orderBy(...).limit(1)` call sites. `where`/`orderBy`
	// intentionally ignore their condition — the scoping the real queries do
	// by brandId/status is already guaranteed by what this test seeds into
	// each table.
	function makeChain(getRows: () => Record<string, unknown>[]): unknown {
		const chain = Promise.resolve(getRows());
		return Object.assign(chain, {
			from: (table: unknown) => makeChain(() => rowsForTable(table)),
			where: () => chain,
			orderBy: () => chain,
			limit: (n: number) => makeChain(() => getRows().slice(0, n)),
		});
	}

	const db = {
		select: (_cols?: unknown) => ({ from: (table: unknown) => makeChain(() => rowsForTable(table)) }),
		insert: (table: unknown) => ({
			values: (values: Record<string, unknown>) => {
				const key = tableKey(table);
				if (key !== "siteAudits" && key !== "brandOpportunities") {
					throw new Error(`axo-integration fake db: unexpected insert into ${String(key)}`);
				}
				const row = {
					id: `${key}-${dbState[key].length + 1}`,
					...values,
					createdAt: (values.createdAt as Date) ?? nextCreatedAt(),
				};
				dbState[key].push(row);
				return { returning: async (_shape?: unknown) => [row] };
			},
		}),
	};

	return { db };
});

const { resolveOpportunities } = await import("@/server/opportunities");
const { getLatestCompletedAudit } = await import("@workspace/lib/axo");
const { db } = await import("@workspace/lib/db/db");
const { siteAudits } = await import("@workspace/lib/db/schema");

const BRAND_ID = "brand-1";

function rawLlmReport() {
	return {
		summary: ["Competitors out-cite you on comparison queries"],
		opportunities: [
			{
				category: "creation" as const,
				title: "Publish a comparison guide",
				why: "Rivals are cited on comparison queries you are absent from.",
				priority: "high" as const,
				expectedImpact: "More citations on comparison prompts.",
				relatedPrompts: [] as string[],
			},
		],
		risks: ["Comparison queries are competitive."],
	};
}

function completedAuditReport(citationCount: number) {
	return {
		window: { fromIso: "2026-01-01T00:00:00.000Z", toIso: "2026-01-08T00:00:00.000Z", citationCount },
		origins: [],
		pages: [],
	};
}

describe("AXO integration: enqueue -> audit completes -> opportunities -> staleness", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		dbState.siteAudits = [];
		dbState.brandOpportunities = [];
		dbState.brands = [{ name: "Acme", website: "https://acme.com", additionalDomains: [] }];
		dbState.competitors = [];
		dbState.clock = Date.now();

		requireBrandSession.mockResolvedValue({ user: { id: "u1" } });
		send.mockResolvedValue("job-id");
		resolveFilteredPrompts.mockResolvedValue([{ id: "p1", value: "best crm", systemTags: [], tags: [] }]);
		postgresRead.getPerPromptRunStats.mockResolvedValue([
			{ prompt_id: "p1", runs: 10, run_days: 5, brand_mention_rate: 0.4, competitor_mention_rate: 0.5 },
		]);
		postgresRead.getPerPromptDailyCompetitorMentions.mockResolvedValue([]);
		postgresRead.getPerPromptDailyCitationStats.mockResolvedValue([]);
		postgresRead.getPerPromptCitationPages.mockResolvedValue([]);
		postgresRead.getBrandMentionRateByModel.mockResolvedValue([]);
		runStructuredCompletionPrompt.mockResolvedValue({ object: rawLlmReport(), modelVersion: "test-model" });
	});

	it("walks brand-new through enqueue, a completed audit, a report referencing it, and staleness on a newer audit", async () => {
		// Stage 1: no audit exists yet.
		expect(await getLatestCompletedAudit(BRAND_ID)).toBeNull();

		// Stage 2: an Opportunities request enqueues exactly one audit-site job.
		const first = await resolveOpportunities(BRAND_ID);
		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith(
			"audit-site",
			{ brandId: BRAND_ID },
			expect.objectContaining({ singletonKey: `audit-${BRAND_ID}` }),
		);
		expect(first.report).not.toBeNull();
		expect(dbState.brandOpportunities).toHaveLength(1);
		expect(dbState.brandOpportunities[0]?.siteAuditId).toBeNull();

		// Stage 3: `runSiteAudit` stores a completed audit (seam — see module
		// doc: this drives the same db.insert(siteAudits) call the real
		// orchestrator makes, rather than re-mocking its crawl collaborators).
		const [inserted] = await db
			.insert(siteAudits)
			.values({
				brandId: BRAND_ID,
				status: "completed",
				schemaVersion: 1,
				startedAt: new Date(),
				report: completedAuditReport(1),
			})
			.returning({ id: siteAudits.id });
		const auditId = (inserted as { id: string }).id;
		expect(await getLatestCompletedAudit(BRAND_ID)).not.toBeNull();

		// Stage 4: the next Opportunities generation references that siteAuditId.
		const second = await resolveOpportunities(BRAND_ID);
		expect(second.report).not.toBeNull();
		expect(dbState.brandOpportunities).toHaveLength(2);
		expect(dbState.brandOpportunities[1]?.siteAuditId).toBe(auditId);
		// A fresh completed audit puts enqueue back on cooldown — no second job.
		expect(send).toHaveBeenCalledTimes(1);

		// Stage 5: a newer completed audit marks the cached report stale, so
		// serving it again regenerates instead of returning the stage-4 cache.
		const [insertedNewer] = await db
			.insert(siteAudits)
			.values({
				brandId: BRAND_ID,
				status: "completed",
				schemaVersion: 1,
				startedAt: new Date(),
				report: completedAuditReport(2),
			})
			.returning({ id: siteAudits.id });
		const newerAuditId = (insertedNewer as { id: string }).id;
		expect(newerAuditId).not.toBe(auditId);

		const third = await resolveOpportunities(BRAND_ID);
		expect(third.report).not.toBeNull();
		expect(dbState.brandOpportunities).toHaveLength(3);
		expect(dbState.brandOpportunities[2]?.siteAuditId).toBe(newerAuditId);
		expect(send).toHaveBeenCalledTimes(1);
	});
});
