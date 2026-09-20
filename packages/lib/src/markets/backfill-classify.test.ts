import { describe, expect, it } from "vitest";
import { historicalMarketKeyFor, isConfirmedLocalizableLegacyRow } from "./backfill-classify";

const row = (
	o: Partial<{ model: string; provider: string | null; version: string | null; webSearchEnabled: boolean }>,
) => ({
	model: "google-ai-overview",
	provider: "dataforseo",
	version: null,
	webSearchEnabled: false,
	...o,
});

describe("historicalMarketKeyFor", () => {
	it("leaves provably localizable history as legacy (market unprovable)", () => {
		expect(historicalMarketKeyFor(row({ model: "google-ai-overview" }))).toBe("legacy");
		expect(historicalMarketKeyFor(row({ model: "google-ai-mode" }))).toBe("legacy");
	});
	it("leaves ambiguous DataForSEO chatbot routes as legacy", () => {
		expect(historicalMarketKeyFor(row({ model: "chatgpt", provider: "dataforseo" }))).toBe("legacy");
		expect(historicalMarketKeyFor(row({ model: "gemini", provider: "dataforseo" }))).toBe("legacy");
	});
	it("marks provably non-localizable runs as global", () => {
		expect(historicalMarketKeyFor(row({ model: "perplexity", provider: "dataforseo" }))).toBe("global");
		for (const p of [
			"openai-api",
			"anthropic-api",
			"mistral-api",
			"openrouter",
			"brightdata",
			"olostep",
			"oxylabs",
			"cloro",
		]) {
			expect(historicalMarketKeyFor(row({ model: "x", provider: p }))).toBe("global");
		}
	});
	it("treats null and unknown providers as legacy (unknown route, not proven global)", () => {
		expect(historicalMarketKeyFor(row({ provider: null }))).toBe("legacy");
		expect(historicalMarketKeyFor(row({ provider: "retired-provider-xyz" }))).toBe("legacy");
	});
});

describe("isConfirmedLocalizableLegacyRow", () => {
	it("is true only for the provably-localizable legacy case", () => {
		expect(isConfirmedLocalizableLegacyRow(row({ model: "google-ai-overview" }))).toBe(true);
		expect(isConfirmedLocalizableLegacyRow(row({ model: "google-ai-mode" }))).toBe(true);
	});
	it("is false for the ambiguous DataForSEO chatbot routes", () => {
		expect(isConfirmedLocalizableLegacyRow(row({ model: "chatgpt", provider: "dataforseo" }))).toBe(false);
		expect(isConfirmedLocalizableLegacyRow(row({ model: "gemini", provider: "dataforseo" }))).toBe(false);
	});
	it("is false for provably non-localizable, null, and unknown providers", () => {
		expect(isConfirmedLocalizableLegacyRow(row({ model: "perplexity", provider: "dataforseo" }))).toBe(false);
		expect(isConfirmedLocalizableLegacyRow(row({ provider: null }))).toBe(false);
		expect(isConfirmedLocalizableLegacyRow(row({ provider: "retired-provider-xyz" }))).toBe(false);
	});
});
