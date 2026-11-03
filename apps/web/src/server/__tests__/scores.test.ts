import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({
	getDashboardSummary: vi.fn(),
	getScoreV2Summary: vi.fn(),
	getIntentScoreSummary: vi.fn(),
	getAccuracySummary: vi.fn(),
	getDistinctModelCount: vi.fn(),
}));
vi.mock("@/lib/postgres-read", () => reads);
vi.mock("@/lib/auth/helpers", () => ({
	requireAuthSession: async () => ({ user: { id: "u1", role: "admin" } }),
	isAdmin: (s: { user: { role: string } }) => s.user.role === "admin",
}));
vi.mock("@workspace/lib/db/db", () => ({
	db: {
		query: {
			brands: {
				findMany: async () => [
					{ id: "b1", name: "Acme", defaultMarketKey: "tr-TR", onboarded: true },
					{ id: "b2", name: "Empty", defaultMarketKey: "tr-TR", onboarded: true },
				],
			},
			prompts: {
				findMany: async () => [
					{ id: "p1", brandId: "b1", enabled: true, tags: [], systemTags: ["unbranded"], intent: "discovery" },
					{ id: "p2", brandId: "b1", enabled: true, tags: [], systemTags: ["unbranded"], intent: null },
					{ id: "p3", brandId: "b1", enabled: true, tags: [], systemTags: ["branded"], intent: null },
				],
			},
		},
	},
}));

const { computeAdminScoreRows } = await import("@/server/scores-core");

describe("computeAdminScoreRows", () => {
	beforeEach(() => {
		reads.getDashboardSummary.mockResolvedValue([{ total_runs: 120, avg_visibility: 41 }]);
		reads.getScoreV2Summary.mockResolvedValue({ total_runs: 80, prompt_count: 1, score_v2: 33 });
		reads.getIntentScoreSummary.mockResolvedValue([
			{ intent: "discovery", prompt_count: 1, total_runs: 40, score_v2: 29 },
		]);
		reads.getAccuracySummary.mockResolvedValue({
			branded_mentioned_runs: 30,
			assessed_runs: 10,
			accurate_runs: 9,
			unsupported_runs: 3,
			unrecognised_runs: 4,
		});
		reads.getDistinctModelCount.mockResolvedValue(4);
	});

	it("splits prompts by branded status and reports coverage beside every score", async () => {
		const [row] = await computeAdminScoreRows("UTC");
		expect(row).toMatchObject({
			brandId: "b1",
			v1: 41,
			v2: 33,
			cohortPrompts: 1,
			classifiedPrompts: 1,
			unbrandedPrompts: 2,
			noContradiction: 90,
			assessedRuns: 10,
			accurateRuns: 9,
			unsupportedRuns: 3,
			unrecognisedRuns: 4,
			models: 4,
		});
		expect(row.intents.discovery).toEqual({ score: 29, promptCount: 1 });
		expect(row.intents.price).toEqual({ score: null, promptCount: 0 });
		// v2 and intents are asked for the unbranded prompts only; accuracy for the branded ones.
		expect(reads.getScoreV2Summary.mock.calls[0]?.[4]).toEqual(["p1", "p2"]);
		expect(reads.getAccuracySummary.mock.calls[0]?.[4]).toEqual(["p3"]);
	});

	it("reports null when nothing was assessed", async () => {
		reads.getAccuracySummary.mockResolvedValue({
			branded_mentioned_runs: 5,
			assessed_runs: 0,
			accurate_runs: 0,
			unsupported_runs: 0,
			unrecognised_runs: 0,
		});
		const [row] = await computeAdminScoreRows("UTC");
		expect(row.noContradiction).toBeNull();
	});

	it("returns nulls rather than throwing for a brand without data", async () => {
		reads.getDashboardSummary.mockResolvedValue([]);
		reads.getScoreV2Summary.mockResolvedValue({ total_runs: 0, prompt_count: 0, score_v2: null });
		reads.getIntentScoreSummary.mockResolvedValue([]);
		reads.getAccuracySummary.mockResolvedValue({
			branded_mentioned_runs: 0,
			assessed_runs: 0,
			accurate_runs: 0,
			unsupported_runs: 0,
			unrecognised_runs: 0,
		});
		reads.getDistinctModelCount.mockResolvedValue(0);
		const rows = await computeAdminScoreRows("UTC");
		const row = rows.find((r) => r.brandId === "b2");
		expect(row).toMatchObject({
			v1: null,
			v2: null,
			noContradiction: null,
			cohortPrompts: 0,
			classifiedPrompts: 0,
			totalRuns: 0,
			models: 0,
		});
		for (const intent of Object.values(row?.intents ?? {})) {
			expect(intent).toEqual({ score: null, promptCount: 0 });
		}
		expect(Object.keys(row?.intents ?? {}).length).toBeGreaterThan(0);
	});
});
