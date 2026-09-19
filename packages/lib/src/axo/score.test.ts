import { describe, expect, it, vi } from "vitest";

const { runStructuredCompletionPrompt, StructuredCompletionError } = vi.hoisted(() => {
	class StructuredCompletionError extends Error {
		constructor(
			message: string,
			readonly providerId: string,
			readonly model: string | null,
			options?: ErrorOptions,
		) {
			super(message, options);
		}
	}
	return { runStructuredCompletionPrompt: vi.fn(), StructuredCompletionError };
});

vi.mock("../onboarding/llm", () => ({ runStructuredCompletionPrompt, StructuredCompletionError }));

import { scorePageRelevance } from "./score";

const input = {
	pageText: "Some page content.",
	brandName: "Acme",
	relatedPrompts: ["What is the best widget?"],
};

describe("scorePageRelevance", () => {
	it("returns ok:true with score, note, providerId, and model on success", async () => {
		runStructuredCompletionPrompt.mockResolvedValue({
			object: { score: 4, note: "Directly answers the question." },
			modelVersion: "gpt-5-mini",
			providerId: "openai-api",
		});

		const result = await scorePageRelevance(input);

		expect(result).toEqual({
			ok: true,
			score: 4,
			note: "Directly answers the question.",
			providerId: "openai-api",
			model: "gpt-5-mini",
		});
	});

	it("preserves provider/model attribution when the wrapper throws StructuredCompletionError", async () => {
		runStructuredCompletionPrompt.mockRejectedValue(new StructuredCompletionError("boom", "openai-api", null));

		const result = await scorePageRelevance(input);

		expect(result).toEqual({
			ok: false,
			providerId: "openai-api",
			model: null,
			errorKind: "exception",
		});
	});

	it("returns null attribution for a plain, non-attributed error", async () => {
		runStructuredCompletionPrompt.mockRejectedValue(new Error("network blip"));

		const result = await scorePageRelevance(input);

		expect(result).toEqual({
			ok: false,
			providerId: null,
			model: null,
			errorKind: "exception",
		});
	});
});
