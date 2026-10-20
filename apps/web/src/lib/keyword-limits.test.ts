import { describe, expect, it } from "vitest";
import { dedupeKeywords, keywordsDiffer } from "@/lib/keyword-limits";

describe("dedupeKeywords", () => {
	it("drops case variants, keeping the first spelling and the original order", () => {
		expect(dedupeKeywords(["Running Shoes", "trail", "running shoes", "RUNNING SHOES", "Trail", "socks"])).toEqual([
			"Running Shoes",
			"trail",
			"socks",
		]);
	});

	it("leaves a list without duplicates untouched", () => {
		expect(dedupeKeywords(["a", "b"])).toEqual(["a", "b"]);
	});
});

describe("keywordsDiffer", () => {
	it("ignores order and case", () => {
		expect(keywordsDiffer(["Shoes", "socks"], ["SOCKS", "shoes"])).toBe(false);
	});

	it("notices an added or removed keyword", () => {
		expect(keywordsDiffer(["shoes"], ["shoes", "socks"])).toBe(true);
		expect(keywordsDiffer(["shoes", "socks"], ["shoes"])).toBe(true);
		expect(keywordsDiffer([], ["shoes"])).toBe(true);
	});
});
