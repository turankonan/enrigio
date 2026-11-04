import { describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
vi.mock("@workspace/lib/db/db", () => ({
	db: { query: { brands: { findFirst: (...a: unknown[]) => findFirst(...a) } }, transaction: vi.fn() },
}));
vi.mock("@/lib/boss-client", () => ({ getBoss: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({ requirePlatformPicksEditable: vi.fn() }));
vi.mock("@/lib/postgres-read", () => ({ getFirstScanFinishedPairs: vi.fn() }));

const { computeStatus, latestPerPair, startFirstScan } = await import("./first-scan-core");

const T0 = new Date("2026-11-03T10:00:00Z");

const expected = [
	{ promptId: "a", model: "chatgpt" },
	{ promptId: "a", model: "gemini" },
	{ promptId: "b", model: "chatgpt" },
	{ promptId: "b", model: "gemini" },
];

describe("computeStatus", () => {
	it("is settled but not complete when every pair finished and some failed", () => {
		const s = computeStatus({
			expected,
			finished: [
				{ promptId: "a", model: "chatgpt", failed: false, finishedAt: T0 },
				{ promptId: "a", model: "gemini", failed: true, finishedAt: T0 },
				{ promptId: "b", model: "chatgpt", failed: true, finishedAt: T0 },
				{ promptId: "b", model: "gemini", failed: true, finishedAt: T0 },
			],
			startedAt: new Date(),
			now: new Date(),
		});
		expect(s).toMatchObject({ done: 1, failed: 3, missing: 0, settled: true, canOpenPartial: false });
	});

	it("counts done, failed and missing pairs and never counts a pair twice", () => {
		const s = computeStatus({
			expected,
			finished: [
				{ promptId: "a", model: "chatgpt", failed: false, finishedAt: T0 },
				{ promptId: "a", model: "chatgpt", failed: false, finishedAt: T0 }, // a retried duplicate
				{ promptId: "a", model: "gemini", failed: true, finishedAt: T0 },
				{ promptId: "zzz", model: "chatgpt", failed: false, finishedAt: T0 }, // not expected, ignored
			],
			startedAt: new Date("2026-11-03T10:00:00Z"),
			now: new Date("2026-11-03T10:01:00Z"),
		});
		expect(s).toMatchObject({ done: 1, failed: 1, missing: 2 });
	});

	it("counts a pair that failed and then succeeded as done, not failed", () => {
		const s = computeStatus({
			expected,
			finished: [
				{ promptId: "a", model: "chatgpt", failed: true, finishedAt: T0 },
				{ promptId: "a", model: "chatgpt", failed: false, finishedAt: T0 },
			],
			startedAt: new Date(),
			now: new Date(),
		});
		expect(s).toMatchObject({ done: 1, failed: 0, missing: 3 });
	});

	it("gives no ETA until five pairs have finished, then extrapolates from the average", () => {
		const start = new Date("2026-11-03T10:00:00Z");
		const four = Array.from({ length: 4 }, (_, i) => ({
			promptId: "a",
			model: `m${i}`,
			failed: false,
			finishedAt: T0,
		}));
		const big = Array.from({ length: 10 }, (_, i) => ({ promptId: "a", model: `m${i}` }));
		expect(
			computeStatus({ expected: big, finished: four, startedAt: start, now: new Date(start.getTime() + 40_000) })
				.etaSeconds,
		).toBeNull();
		const five = [...four, { promptId: "a", model: "m4", failed: false, finishedAt: T0 }];
		// 5 finished in 50 s → 10 s each → 5 remaining → 50 s
		expect(
			computeStatus({ expected: big, finished: five, startedAt: start, now: new Date(start.getTime() + 50_000) })
				.etaSeconds,
		).toBe(50);
	});

	it("calls a scan stalled when nothing has finished for three minutes, even before the first answer", () => {
		const start = new Date("2026-11-03T10:00:00Z");
		const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
		expect(computeStatus({ expected, finished: [], startedAt: start, now: at(2) }).stalled).toBe(false);
		expect(computeStatus({ expected, finished: [], startedAt: start, now: at(4) }).stalled).toBe(true);
		const one = [{ promptId: "a", model: "chatgpt", failed: false, finishedAt: at(3) }];
		expect(computeStatus({ expected, finished: one, startedAt: start, now: at(5) }).stalled).toBe(false);
		expect(computeStatus({ expected, finished: one, startedAt: start, now: at(7) }).stalled).toBe(true);
		const all = expected.map((p) => ({ ...p, failed: false, finishedAt: at(1) }));
		expect(computeStatus({ expected, finished: all, startedAt: start, now: at(30) }).stalled).toBe(false);
	});

	it("allows opening a partial report once half the pairs succeeded; failures do not count", () => {
		const start = new Date();
		const one = [{ promptId: "a", model: "chatgpt", failed: false, finishedAt: T0 }];
		const oneAndFail = [...one, { promptId: "a", model: "gemini", failed: true, finishedAt: T0 }];
		const two = [...one, { promptId: "a", model: "gemini", failed: false, finishedAt: T0 }];
		expect(computeStatus({ expected, finished: one, startedAt: start, now: start }).canOpenPartial).toBe(false);
		expect(computeStatus({ expected, finished: oneAndFail, startedAt: start, now: start }).canOpenPartial).toBe(false);
		expect(computeStatus({ expected, finished: two, startedAt: start, now: start }).canOpenPartial).toBe(true);
	});
});

describe("latestPerPair", () => {
	it("keeps one answer per prompt and engine, the newest, so a retried pair is not counted twice", () => {
		const runs = [
			{ promptId: "a", model: "chatgpt", mentioned: false, createdAt: new Date("2026-11-03T10:00:00Z") },
			{ promptId: "a", model: "chatgpt", mentioned: true, createdAt: new Date("2026-11-03T10:05:00Z") },
			{ promptId: "a", model: "gemini", mentioned: false, createdAt: new Date("2026-11-03T10:01:00Z") },
		];
		const out = latestPerPair(runs);
		expect(out).toHaveLength(2);
		expect(out.find((r) => r.model === "chatgpt")?.mentioned).toBe(true);
	});
});

describe("startFirstScan", () => {
	it("rejects an engine that is not configured before writing anything", async () => {
		vi.stubEnv("SCRAPE_TARGETS", "chatgpt:openai-api");
		findFirst.mockResolvedValue({ id: "b", website: "https://b.example", onboarded: false, organizationId: "o" });
		const { db } = await import("@workspace/lib/db/db");
		await expect(
			startFirstScan({
				brandId: "b",
				draft: {
					step: 4,
					profile: { name: "B", sector: "", location: "", marketKey: "tr", aliases: [], additionalDomains: [] },
					questions: [],
					rivals: [],
					engines: ["chatgpt", "not-a-model"],
				},
			}),
		).rejects.toThrow(/not in SCRAPE_TARGETS/);
		expect(db.transaction).not.toHaveBeenCalled();
	});
});
