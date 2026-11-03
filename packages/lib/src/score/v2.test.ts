import { describe, expect, it } from "vitest";
import { RANK_WEIGHTS, scoreV2, weightFor } from "./v2";

describe("weightFor", () => {
	it("gives 0 when the brand is not mentioned, whatever the rank says", () => {
		expect(weightFor({ brandMentioned: false, brandRank: 1 })).toBe(0);
	});
	it("steps down by rank and floors at the 'other' weight", () => {
		expect(weightFor({ brandMentioned: true, brandRank: 1 })).toBe(RANK_WEIGHTS.rank1);
		expect(weightFor({ brandMentioned: true, brandRank: 2 })).toBe(RANK_WEIGHTS.rank2);
		expect(weightFor({ brandMentioned: true, brandRank: 3 })).toBe(RANK_WEIGHTS.rank3);
		expect(weightFor({ brandMentioned: true, brandRank: 7 })).toBe(RANK_WEIGHTS.other);
	});
	it("treats a mention with no rank as the 'other' weight", () => {
		expect(weightFor({ brandMentioned: true, brandRank: null })).toBe(RANK_WEIGHTS.other);
	});
});

describe("scoreV2", () => {
	it("is null with no runs", () => {
		expect(scoreV2([])).toBeNull();
	});
	it("is the rounded mean weight × 100", () => {
		const runs = [
			{ brandMentioned: true, brandRank: 1 }, // 1.0
			{ brandMentioned: true, brandRank: 2 }, // 0.7
			{ brandMentioned: false, brandRank: null }, // 0
			{ brandMentioned: true, brandRank: null }, // 0.3
		];
		expect(scoreV2(runs)).toBe(50); // (1 + 0.7 + 0 + 0.3) / 4 = 0.5
	});
});
