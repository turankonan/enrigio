import { describe, expect, it } from "vitest";
import { scoreBand } from "@/lib/score-band";

describe("scoreBand", () => {
	it("is low below 20, ok from 20 to 49, good from 50", () => {
		expect(scoreBand(0)).toBe("low");
		expect(scoreBand(19)).toBe("low");
		expect(scoreBand(20)).toBe("ok");
		expect(scoreBand(49)).toBe("ok");
		expect(scoreBand(50)).toBe("good");
		expect(scoreBand(100)).toBe("good");
	});

	it("has no band without a score", () => {
		expect(scoreBand(null)).toBeNull();
		expect(scoreBand(undefined)).toBeNull();
		expect(scoreBand(Number.NaN)).toBeNull();
	});
});
