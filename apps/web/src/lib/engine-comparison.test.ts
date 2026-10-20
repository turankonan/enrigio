import { describe, expect, it } from "vitest";
import { buildEngineRows, verdictFor } from "@/lib/engine-comparison";

const label = (model: string) => model.toUpperCase();

describe("verdictFor", () => {
	it("is close within five points, otherwise lead or behind", () => {
		expect(verdictFor(0.5, 0.47)).toBe("close");
		expect(verdictFor(0.6, 0.4)).toBe("lead");
		expect(verdictFor(0.2, 0.4)).toBe("behind");
		expect(verdictFor(null, 0.4)).toBeNull();
		expect(verdictFor(0.4, null)).toBeNull();
	});
});

describe("buildEngineRows", () => {
	it("keeps the strongest competitor per engine and sorts by the brand's rate", () => {
		const rows = buildEngineRows(
			[
				{ model: "chatgpt", runs: 10, brand_mentioned_count: 3, competitor: "Acme", competitor_count: 6 },
				{ model: "chatgpt", runs: 10, brand_mentioned_count: 3, competitor: "Beta", competitor_count: 2 },
				{ model: "gemini", runs: 4, brand_mentioned_count: 4, competitor: null, competitor_count: 0 },
			],
			label,
		);
		expect(rows.map((r) => r.model)).toEqual(["gemini", "chatgpt"]);
		expect(rows[1]).toEqual({
			model: "chatgpt",
			label: "CHATGPT",
			brandRate: 0.3,
			topCompetitor: { name: "Acme", rate: 0.6 },
			verdict: "behind",
		});
		expect(rows[0].topCompetitor).toBeNull();
		expect(rows[0].verdict).toBeNull();
	});
});
