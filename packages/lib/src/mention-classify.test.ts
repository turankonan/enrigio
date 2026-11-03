import { describe, expect, it, vi } from "vitest";

const runStructuredCompletionPrompt = vi.hoisted(() => vi.fn());
vi.mock("./onboarding/llm", () => ({ runStructuredCompletionPrompt }));

import { classifyMention } from "./mention-classify";

describe("classifyMention", () => {
	it("returns the model's sentiment and 1-based rank", async () => {
		// runStructuredCompletionPrompt resolves to { object, modelVersion }.
		runStructuredCompletionPrompt.mockResolvedValue({ object: { sentiment: "positive", brandRank: 2 } });
		const out = await classifyMention({
			answer: "Acme is great; Globex is second-best.",
			brandName: "Acme",
			competitorNames: ["Globex"],
		});
		expect(out).toEqual({ sentiment: "positive", brandRank: 2 });
		expect(runStructuredCompletionPrompt).toHaveBeenCalledWith(expect.any(String), expect.anything());
	});

	it("returns null (never throws) when the classifier fails", async () => {
		runStructuredCompletionPrompt.mockRejectedValue(new Error("boom"));
		const out = await classifyMention({ answer: "x", brandName: "Acme", competitorNames: [] });
		expect(out).toBeNull();
	});

	it("asks for claims and returns them only when a profile is given", async () => {
		runStructuredCompletionPrompt.mockResolvedValue({
			object: {
				sentiment: "neutral",
				brandRank: null,
				claims: [{ claim: "Acme is based in Berlin", status: "contradicted" }],
			},
		});
		const out = await classifyMention({
			answer: "Acme, based in Berlin, sells widgets.",
			brandName: "Acme",
			competitorNames: [],
			profile: { name: "Acme", website: "acme.example", additionalDomains: [], aliases: [], keywords: ["widgets"] },
		});
		expect(out).toEqual({
			sentiment: "neutral",
			brandRank: null,
			claims: [{ claim: "Acme is based in Berlin", status: "contradicted" }],
		});
		const prompt = runStructuredCompletionPrompt.mock.calls.at(-1)?.[0] as string;
		expect(prompt).toContain("acme.example");
		expect(prompt).toContain("widgets");
	});

	it("omits claims when no profile is given, even if the model returns some", async () => {
		runStructuredCompletionPrompt.mockResolvedValue({
			object: { sentiment: "positive", brandRank: 1, claims: [{ claim: "x", status: "unsupported" }] },
		});
		const out = await classifyMention({ answer: "Acme is first.", brandName: "Acme", competitorNames: [] });
		expect(out).toEqual({ sentiment: "positive", brandRank: 1 });
	});

	it("keeps sentiment and rank, without claims, when only the claims call fails", async () => {
		runStructuredCompletionPrompt.mockReset();
		runStructuredCompletionPrompt
			.mockRejectedValueOnce(new Error("schema mismatch"))
			.mockResolvedValueOnce({ object: { sentiment: "negative", brandRank: 3 } });
		const out = await classifyMention({
			answer: "Acme is third.",
			brandName: "Acme",
			competitorNames: [],
			profile: { name: "Acme", website: "acme.example", additionalDomains: [], aliases: [], keywords: [] },
		});
		expect(out).toEqual({ sentiment: "negative", brandRank: 3 });
		expect(out).not.toHaveProperty("claims");
		expect(runStructuredCompletionPrompt).toHaveBeenCalledTimes(2);
	});
});
