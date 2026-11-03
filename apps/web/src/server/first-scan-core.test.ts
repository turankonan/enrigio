import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/lib/db/db", () => ({ db: {} }));
vi.mock("@/lib/boss-client", () => ({ getBoss: vi.fn() }));
vi.mock("@/lib/postgres-read", () => ({ getFirstScanFinishedPairs: vi.fn() }));

const { computeStatus } = await import("./first-scan-core");

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
				{ promptId: "a", model: "chatgpt", failed: false },
				{ promptId: "a", model: "gemini", failed: true },
				{ promptId: "b", model: "chatgpt", failed: true },
				{ promptId: "b", model: "gemini", failed: true },
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
				{ promptId: "a", model: "chatgpt", failed: false },
				{ promptId: "a", model: "chatgpt", failed: false }, // a retried duplicate
				{ promptId: "a", model: "gemini", failed: true },
				{ promptId: "zzz", model: "chatgpt", failed: false }, // not expected, ignored
			],
			startedAt: new Date("2026-11-03T10:00:00Z"),
			now: new Date("2026-11-03T10:01:00Z"),
		});
		expect(s).toMatchObject({ done: 1, failed: 1, missing: 2 });
	});

	it("gives no ETA until five pairs have finished, then extrapolates from the average", () => {
		const start = new Date("2026-11-03T10:00:00Z");
		const four = Array.from({ length: 4 }, (_, i) => ({ promptId: "a", model: `m${i}`, failed: false }));
		const big = Array.from({ length: 10 }, (_, i) => ({ promptId: "a", model: `m${i}` }));
		expect(
			computeStatus({ expected: big, finished: four, startedAt: start, now: new Date(start.getTime() + 40_000) })
				.etaSeconds,
		).toBeNull();
		const five = [...four, { promptId: "a", model: "m4", failed: false }];
		// 5 finished in 50 s → 10 s each → 5 remaining → 50 s
		expect(
			computeStatus({ expected: big, finished: five, startedAt: start, now: new Date(start.getTime() + 50_000) })
				.etaSeconds,
		).toBe(50);
	});

	it("allows opening a partial report once half the pairs succeeded; failures do not count", () => {
		const start = new Date();
		const one = [{ promptId: "a", model: "chatgpt", failed: false }];
		const oneAndFail = [...one, { promptId: "a", model: "gemini", failed: true }];
		const two = [...one, { promptId: "a", model: "gemini", failed: false }];
		expect(computeStatus({ expected, finished: one, startedAt: start, now: start }).canOpenPartial).toBe(false);
		expect(computeStatus({ expected, finished: oneAndFail, startedAt: start, now: start }).canOpenPartial).toBe(false);
		expect(computeStatus({ expected, finished: two, startedAt: start, now: start }).canOpenPartial).toBe(true);
	});
});
