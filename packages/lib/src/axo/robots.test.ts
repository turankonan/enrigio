import { describe, expect, it } from "vitest";
import { evaluateRobots } from "./robots";

describe("evaluateRobots", () => {
	it("returns unspecified when no group matches the bot and there is no wildcard group", () => {
		const robotsTxt = ["User-agent: OtherBot", "Disallow: /private"].join("\n");
		expect(evaluateRobots(robotsTxt, "https://example.com/private", "GPTBot")).toBe("unspecified");
	});

	it("returns allowed when a group matches the bot but no rule matches the path", () => {
		const robotsTxt = ["User-agent: GPTBot", "Disallow: /private"].join("\n");
		expect(evaluateRobots(robotsTxt, "https://example.com/public", "GPTBot")).toBe("allowed");
	});

	it("returns blocked when a Disallow rule matches the path", () => {
		const robotsTxt = ["User-agent: GPTBot", "Disallow: /private"].join("\n");
		expect(evaluateRobots(robotsTxt, "https://example.com/private/page", "GPTBot")).toBe("blocked");
	});

	it("falls back to the wildcard group when no bot-specific group exists", () => {
		const robotsTxt = ["User-agent: *", "Disallow: /private"].join("\n");
		expect(evaluateRobots(robotsTxt, "https://example.com/private", "ClaudeBot")).toBe("blocked");
	});

	it("prefers a bot-specific group over the wildcard group", () => {
		const robotsTxt = ["User-agent: *", "Disallow: /", "", "User-agent: GPTBot", "Allow: /"].join("\n");
		expect(evaluateRobots(robotsTxt, "https://example.com/anything", "GPTBot")).toBe("allowed");
	});

	it("matches user-agent names case-insensitively", () => {
		const robotsTxt = ["User-agent: gptbot", "Disallow: /private"].join("\n");
		expect(evaluateRobots(robotsTxt, "https://example.com/private", "GPTBot")).toBe("blocked");
	});

	it("supports * wildcard and $ end-anchor in rule paths", () => {
		const robotsTxt = ["User-agent: GPTBot", "Disallow: /*.pdf$"].join("\n");
		expect(evaluateRobots(robotsTxt, "https://example.com/reports/q1.pdf", "GPTBot")).toBe("blocked");
		expect(evaluateRobots(robotsTxt, "https://example.com/reports/q1.pdf.html", "GPTBot")).toBe("allowed");
	});

	it("picks the longest match when patterns overlap", () => {
		const robotsTxt = ["User-agent: GPTBot", "Disallow: /", "Allow: /public"].join("\n");
		expect(evaluateRobots(robotsTxt, "https://example.com/public/page", "GPTBot")).toBe("allowed");
		expect(evaluateRobots(robotsTxt, "https://example.com/other", "GPTBot")).toBe("blocked");
	});

	it("prefers Allow over Disallow when match lengths are equal", () => {
		const robotsTxt = ["User-agent: GPTBot", "Disallow: /page", "Allow: /page"].join("\n");
		expect(evaluateRobots(robotsTxt, "https://example.com/page", "GPTBot")).toBe("allowed");
	});

	it("merges rules from a group with multiple user-agents sharing it", () => {
		const robotsTxt = ["User-agent: GPTBot", "User-agent: ClaudeBot", "Disallow: /shared"].join("\n");
		expect(evaluateRobots(robotsTxt, "https://example.com/shared", "GPTBot")).toBe("blocked");
		expect(evaluateRobots(robotsTxt, "https://example.com/shared", "ClaudeBot")).toBe("blocked");
	});

	it("merges rules across repeated groups for the same user-agent", () => {
		const robotsTxt = ["User-agent: GPTBot", "Disallow: /a", "", "User-agent: GPTBot", "Disallow: /b"].join("\n");
		expect(evaluateRobots(robotsTxt, "https://example.com/a", "GPTBot")).toBe("blocked");
		expect(evaluateRobots(robotsTxt, "https://example.com/b", "GPTBot")).toBe("blocked");
		expect(evaluateRobots(robotsTxt, "https://example.com/c", "GPTBot")).toBe("allowed");
	});

	it("percent-decodes rule and URL paths once before comparing", () => {
		const robotsTxt = ["User-agent: GPTBot", "Disallow: /caf%C3%A9"].join("\n");
		expect(evaluateRobots(robotsTxt, "https://example.com/café", "GPTBot")).toBe("blocked");
	});

	it("falls back to the raw string when percent-decoding is malformed, without throwing", () => {
		const robotsTxt = ["User-agent: GPTBot", "Disallow: /bad%"].join("\n");
		expect(() => evaluateRobots(robotsTxt, "https://example.com/bad%", "GPTBot")).not.toThrow();
		expect(evaluateRobots(robotsTxt, "https://example.com/bad%", "GPTBot")).toBe("blocked");
		expect(evaluateRobots(robotsTxt, "https://example.com/other", "GPTBot")).toBe("allowed");
	});

	it("ignores comments and blank lines", () => {
		const robotsTxt = [
			"# comment",
			"User-agent: GPTBot # inline comment",
			"",
			"Disallow: /private # another comment",
		].join("\n");
		expect(evaluateRobots(robotsTxt, "https://example.com/private", "GPTBot")).toBe("blocked");
	});

	it("returns allowed for an empty robots.txt matched by wildcard-less lookup falling to unspecified", () => {
		expect(evaluateRobots("", "https://example.com/anything", "GPTBot")).toBe("unspecified");
	});

	it("treats an empty Disallow value as no restriction", () => {
		const robotsTxt = ["User-agent: GPTBot", "Disallow:"].join("\n");
		expect(evaluateRobots(robotsTxt, "https://example.com/anything", "GPTBot")).toBe("allowed");
	});
});
