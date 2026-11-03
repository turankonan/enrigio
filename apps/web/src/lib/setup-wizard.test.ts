import { describe, expect, it } from "vitest";
import {
	addCustomQuestion,
	addCustomRival,
	canContinueFromQuestions,
	defaultEngines,
	draftFromSuggestion,
	expectedPairs,
	monthlyAnswerEstimate,
	selectedBuyerCount,
	toggleQuestion,
	toggleRival,
} from "./setup-wizard";

const q = (intent: "discovery" | "comparison" | "local" | "price" | null, i: number) => ({
	prompt: `${intent ?? "brand"} ${i}`,
	tags: [],
	intent,
});
const suggestion = {
	brandName: "Atlas Fizyo",
	website: "atlasfizyo.com",
	additionalDomains: ["atlasfizyo.com.tr"],
	aliases: ["Atlas Fizyoterapi"],
	sector: "fizyoterapi merkezi",
	location: "Kadıköy, İstanbul",
	marketKey: "tr-TR",
	competitors: Array.from({ length: 7 }, (_, i) => ({ name: `Marka ${i}`, domains: [`marka${i}.com`], aliases: [] })),
	suggestedPrompts: [
		...[0, 1, 2, 3].map((i) => q("discovery", i)),
		...[0, 1, 2, 3].map((i) => q("comparison", i)),
		...[0, 1, 2, 3].map((i) => q("local", i)),
		...[0, 1, 2, 3].map((i) => q("price", i)),
		...[0, 1, 2].map((i) => q(null, i)),
	],
};

describe("draftFromSuggestion", () => {
	it("preselects 3 per intent (12), keeps branded questions unselectable, picks the first 5 rivals and the default engines", () => {
		const d = draftFromSuggestion(suggestion as never, [
			"chatgpt",
			"gemini",
			"google-ai-overview",
			"perplexity",
			"claude",
		]);
		expect(selectedBuyerCount(d)).toBe(12);
		expect(d.questions.filter((x) => x.intent === null)).toHaveLength(3);
		expect(d.rivals.filter((r) => r.selected)).toHaveLength(5);
		expect(d.engines).toEqual(["chatgpt", "gemini", "google-ai-overview", "perplexity"]);
		expect(d.profile).toMatchObject({ name: "Atlas Fizyo", sector: "fizyoterapi merkezi", marketKey: "tr-TR" });
		expect(d.step).toBe(1);
	});
});

describe("question rules", () => {
	const d = draftFromSuggestion(suggestion as never, ["chatgpt"]);
	it("needs at least 10 selected buyer questions to continue", () => {
		let x = d;
		for (let i = 0; i < 3; i++) x = toggleQuestion(x, i); // deselect three → 9
		expect(selectedBuyerCount(x)).toBe(9);
		expect(canContinueFromQuestions(x)).toBe(false);
	});
	it("never selects more than 16", () => {
		let x = d;
		for (let i = 0; i < 16; i++) if (!x.questions[i].selected) x = toggleQuestion(x, i);
		expect(selectedBuyerCount(x)).toBe(16);
		x = addCustomQuestion(x, "yeni soru", "local");
		expect(selectedBuyerCount(x)).toBe(16);
		expect(x.questions.some((y) => y.text === "yeni soru")).toBe(false);
	});
	it("adds a custom question selected, with its intent, up to the limit", () => {
		let x = d;
		x = toggleQuestion(x, 0); // 11
		x = addCustomQuestion(x, "  evde fizyoterapi  ", "local");
		expect(x.questions.find((y) => y.text === "evde fizyoterapi")).toMatchObject({
			intent: "local",
			selected: true,
			custom: true,
		});
		expect(selectedBuyerCount(x)).toBe(12);
	});
	it("ignores empty custom text", () => {
		expect(addCustomQuestion(d, "   ", "price")).toBe(d);
	});
});

describe("rivals and engines", () => {
	it("refuses a sixth rival", () => {
		const d = draftFromSuggestion(suggestion as never, ["chatgpt"]);
		const x = toggleRival(d, 5);
		expect(x.rivals.filter((r) => r.selected)).toHaveLength(5);
	});
	it("never selects a rival without a website, since the scan could not track it", () => {
		const competitors = [
			{ name: "No Site", domains: [], aliases: [] },
			...Array.from({ length: 6 }, (_, i) => ({ name: `Marka ${i}`, domains: [`marka${i}.com`], aliases: [] })),
		];
		const d = draftFromSuggestion({ ...suggestion, competitors } as never, ["chatgpt"]);
		expect(d.rivals.filter((r) => r.selected).map((r) => r.name)).toEqual([
			"Marka 0",
			"Marka 1",
			"Marka 2",
			"Marka 3",
			"Marka 4",
		]);
		const freed = toggleRival(d, 1);
		expect(toggleRival(freed, 0).rivals[0].selected).toBe(false);
		expect(addCustomRival(freed, "Yeni Rakip", "  ")).toBe(freed);
		expect(addCustomRival(freed, "Yeni Rakip", "yenirakip.com").rivals.at(-1)).toMatchObject({
			name: "Yeni Rakip",
			site: "yenirakip.com",
			selected: true,
		});
	});
	it("tops the preferred engines up to four from whatever else is available", () => {
		expect(defaultEngines(["claude", "copilot", "qwen", "mistral", "grok"])).toEqual([
			"claude",
			"copilot",
			"qwen",
			"mistral",
		]);
		expect(defaultEngines(["gemini", "claude"])).toEqual(["gemini", "claude"]);
	});
});

describe("estimates and pairs", () => {
	it("counts branded questions and the real cadence", () => {
		const d = draftFromSuggestion(suggestion as never, ["chatgpt", "gemini"]);
		expect(monthlyAnswerEstimate(d, 1)).toBe((12 + 3) * 2 * 30);
		expect(monthlyAnswerEstimate(d, 4)).toBe((12 + 3) * 2 * 30 * 4);
		// A brand sampled every two days with one run per firing.
		expect(monthlyAnswerEstimate(d, 1 / 2)).toBe(450);
	});
	it("builds one pair per prompt per engine", () => {
		expect(expectedPairs([{ id: "a" }, { id: "b" }], ["chatgpt", "gemini"])).toEqual([
			{ promptId: "a", model: "chatgpt" },
			{ promptId: "a", model: "gemini" },
			{ promptId: "b", model: "chatgpt" },
			{ promptId: "b", model: "gemini" },
		]);
	});
});
