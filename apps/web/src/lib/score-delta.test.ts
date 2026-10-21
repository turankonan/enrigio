import { describe, expect, it } from "vitest";
import { scoreDelta } from "@/lib/score-delta";

describe("scoreDelta", () => {
	it("reports the signed change against last month", () => {
		expect(scoreDelta(42, 37)).toEqual({ kind: "up", points: 5 });
		expect(scoreDelta(17, 21)).toEqual({ kind: "down", points: 4 });
		expect(scoreDelta(30, 30)).toEqual({ kind: "same", points: 0 });
	});
	it("distinguishes a first month from no data at all", () => {
		expect(scoreDelta(42, null)).toEqual({ kind: "first", points: 0 });
		expect(scoreDelta(null, 10)).toEqual({ kind: "none", points: 0 });
		expect(scoreDelta(null, null)).toEqual({ kind: "none", points: 0 });
	});
});
