import { describe, expect, it } from "vitest";
import { resolveLocalizable } from "./index";

const cfg = (model: string, provider: string, version?: string) => ({ model, provider, version, webSearch: false });

describe("resolveLocalizable", () => {
	it("is true for DataForSEO scraped routes", () => {
		expect(resolveLocalizable(cfg("google-ai-mode", "dataforseo"))).toBe(true);
		expect(resolveLocalizable(cfg("google-ai-overview", "dataforseo"))).toBe(true);
		expect(resolveLocalizable(cfg("chatgpt", "dataforseo"))).toBe(true); // unpinned scraper
		expect(resolveLocalizable(cfg("gemini", "dataforseo"))).toBe(true); // unpinned scraper
	});
	it("is false for DataForSEO LLM-Responses (pinned) and Perplexity", () => {
		expect(resolveLocalizable(cfg("chatgpt", "dataforseo", "gpt-4o"))).toBe(false);
		expect(resolveLocalizable(cfg("gemini", "dataforseo", "gemini-2.0"))).toBe(false);
		expect(resolveLocalizable(cfg("perplexity", "dataforseo"))).toBe(false);
	});
	it("is false for direct-API and BrightData", () => {
		expect(resolveLocalizable(cfg("chatgpt", "openai-api"))).toBe(false);
		expect(resolveLocalizable(cfg("claude", "anthropic-api"))).toBe(false);
		expect(resolveLocalizable(cfg("google-ai-overview", "brightdata"))).toBe(false);
	});
});
