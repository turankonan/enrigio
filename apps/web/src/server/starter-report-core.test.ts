import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/lib/db/db", () => ({ db: {} }));
vi.mock("@/lib/postgres-read", () => ({ getFirstScanRivalCitations: vi.fn() }));
vi.mock("@/server/opportunities", () => ({ resolveOpportunities: vi.fn() }));
vi.mock("@/server/first-scan-core", () => ({ getFirstScanStatus: vi.fn() }));

const { buildStarterReport } = await import("./starter-report-core");

const run = (o: Partial<Parameters<typeof buildStarterReport>[0]["runs"][number]>) => ({
	promptValue: "best physio in kadıköy",
	intent: "local" as const,
	model: "chatgpt",
	mentioned: false,
	brandRank: null,
	competitorsMentioned: [],
	accuracyClaims: null,
	text: "An answer that lists several clinics in the area and explains how to choose one.",
	...o,
});

const base = {
	brand: {
		name: "Atlas Fizyo",
		website: "https://atlasfizyo.com",
		sector: null,
		location: null,
		domains: ["atlasfizyo.com"],
	},
	engines: ["chatgpt", "gemini"],
	citations: [
		{ domain: "doktortakvimi.com", count: 5 },
		{ domain: "atlasfizyo.com", count: 1 },
	],
	nextSteps: [{ title: "Add a pricing page", why: "Price questions never name you." }],
};

describe("buildStarterReport", () => {
	it("computes the headline, intent sub-scores, who's there and why them", () => {
		const { report, missingSections } = buildStarterReport({
			...base,
			runs: [
				run({ mentioned: true, brandRank: 2, competitorsMentioned: ["Fizyo Plus"] }),
				run({ model: "gemini", competitorsMentioned: ["Fizyo Plus", "Kadıköy Fizik"] }),
				run({ intent: "price", competitorsMentioned: ["Fizyo Plus"] }),
				run({ intent: "price", model: "gemini", mentioned: true, brandRank: 1 }),
			],
		});
		expect(report.headline).toMatchObject({ mentionedRuns: 2, totalRuns: 4, mentionPercent: 50, rivalsAhead: 1 });
		expect(report.score.byIntent.find((i) => i.intent === "local")).toMatchObject({ mentionPercent: 50, runs: 2 });
		expect(report.whoIsThere[0]).toMatchObject({ name: "Fizyo Plus", count: 3, isYou: false });
		expect(report.whoIsThere.find((w) => w.isYou)).toMatchObject({ name: "Atlas Fizyo", count: 2 });
		expect(report.whyThem[0]).toMatchObject({ domain: "doktortakvimi.com", isYours: false });
		expect(report.whyThem[1]).toMatchObject({ domain: "atlasfizyo.com", isYours: true });
		expect(report.answers).toHaveLength(4);
		expect(missingSections).toEqual([]);
	});

	it("prefers a mix of mentioned and unmentioned answers across engines and truncates excerpts", () => {
		const long = "x".repeat(900);
		const { report } = buildStarterReport({
			...base,
			runs: [
				run({ mentioned: true, text: long }),
				run({ model: "gemini", mentioned: true }),
				run({ intent: "price" }),
				run({ intent: "price", model: "gemini" }),
				run({ intent: "comparison" }),
			],
		});
		expect(report.answers.filter((a) => a.mentioned)).toHaveLength(2);
		expect(new Set(report.answers.map((a) => a.model)).size).toBe(2);
		expect(report.answers[0]!.excerpt.length).toBeLessThanOrEqual(600);
	});

	it("reports accuracy only when something was assessed and lists missing sections", () => {
		const { report, missingSections } = buildStarterReport({
			...base,
			citations: [],
			nextSteps: null,
			runs: [run({})],
		});
		expect(report.score.accuracy).toBeNull();
		expect(missingSections).toEqual(["whyThem", "nextSteps"]);
	});
});
