import { describe, expect, it } from "vitest";
import { pickNextSteps } from "@/components/home/next-steps";
import { opportunityKey } from "@/lib/opportunity-key";

const opp = (title: string, priority: "high" | "medium" | "low") => ({
	title,
	priority,
	category: "creation" as const,
	why: "",
	expectedImpact: "",
	relatedPrompts: [],
	yourCitations: [],
	competitorCitations: [],
});

describe("pickNextSteps", () => {
	it("returns at most five, highest priority first, keeping report order within a priority", () => {
		const picked = pickNextSteps(
			[
				opp("m1", "medium"),
				opp("l1", "low"),
				opp("h1", "high"),
				opp("m2", "medium"),
				opp("h2", "high"),
				opp("m3", "medium"),
				opp("l2", "low"),
			],
			[],
		);
		expect(picked.map((o) => o.title)).toEqual(["h1", "h2", "m1", "m2", "m3"]);
	});

	it("returns an empty list for no opportunities", () => {
		expect(pickNextSteps([], [])).toEqual([]);
	});

	it("skips dismissed opportunities so the next one fills in", () => {
		const picked = pickNextSteps(
			[opp("a", "high"), opp("b", "high"), opp("c", "medium"), opp("d", "medium"), opp("e", "low"), opp("f", "low")],
			["a", "C"].map(opportunityKey),
		);
		expect(picked.map((o) => o.title)).toEqual(["b", "d", "e", "f"]);
	});
});
