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
});
