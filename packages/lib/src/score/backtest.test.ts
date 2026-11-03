import { describe, expect, it } from "vitest";
import { direction, spearman, verdict } from "./backtest";

describe("spearman", () => {
	it("is 1 for identical orderings and -1 for reversed", () => {
		expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBe(1);
		expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBe(-1);
	});
	it("uses average ranks for ties", () => {
		// a has a tie at positions 2 and 3 → ranks 1, 2.5, 2.5, 4
		const r = spearman([1, 2, 2, 3], [1, 2, 3, 4]);
		expect(r).toBeCloseTo(0.9487, 3);
	});
	it("is null with fewer than 3 pairs or no variance", () => {
		expect(spearman([1, 2], [1, 2])).toBeNull();
		expect(spearman([5, 5, 5], [1, 2, 3])).toBeNull();
	});
});

describe("direction", () => {
	it("marks ±3 as a move and anything smaller as flat", () => {
		expect(direction(40, 37)).toBe("up");
		expect(direction(37, 40)).toBe("down");
		expect(direction(40, 38)).toBe("flat");
		expect(direction(38, 40)).toBe("flat");
	});
});

describe("verdict", () => {
	const good = { spearman: 0.9, directionV1: "up" as const, directionV2: "up" as const, trendGap: 1 };
	it("is inconclusive below five brands", () => {
		expect(verdict([good, good, good, good]).outcome).toBe("inconclusive");
	});
	it("passes when 80% correlate, no direction flips, and the median trend gap is within 5", () => {
		const weak = { ...good, spearman: 0.2 };
		expect(verdict([good, good, good, good, weak]).outcome).toBe("pass");
	});
	it("fails on a direction flip", () => {
		const flipped = { ...good, directionV2: "down" as const };
		const v = verdict([good, good, good, good, flipped]);
		expect(v.outcome).toBe("fail");
		expect(v.reasons.join(" ")).toMatch(/direction/);
	});
	it("fails when the median trend gap exceeds 5", () => {
		const wide = { ...good, trendGap: 9 };
		expect(verdict([wide, wide, wide, good, good]).outcome).toBe("fail");
	});
	it("fails when under 80% of brands correlate", () => {
		const weak = { ...good, spearman: 0.5 };
		expect(verdict([good, good, good, weak, weak]).outcome).toBe("fail");
	});
});
