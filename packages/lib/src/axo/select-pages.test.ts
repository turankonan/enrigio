import { describe, expect, it } from "vitest";
import { chooseAuditTargets, countOwnedCitations } from "./select-pages";

describe("chooseAuditTargets", () => {
	it("returns [] when there are no citations", () => {
		expect(chooseAuditTargets({ citations: [], ownedDomains: ["example.com"] })).toEqual([]);
	});

	it("restricts targets to the brand's own domains via extractDomain", () => {
		const targets = chooseAuditTargets({
			citations: [
				{ url: "https://example.com/a", domain: "example.com", promptValue: "p1", count: 5 },
				{ url: "https://competitor.com/b", domain: "competitor.com", promptValue: "p1", count: 100 },
			],
			ownedDomains: ["https://example.com"],
		});
		expect(targets).toEqual([{ url: "https://example.com/a", relatedPrompts: ["p1"] }]);
	});

	it("normalizes owned domains (scheme, www, trailing dot) before matching", () => {
		const targets = chooseAuditTargets({
			citations: [{ url: "https://www.example.com/a", domain: "www.example.com", promptValue: "p1", count: 1 }],
			ownedDomains: ["EXAMPLE.com."],
		});
		expect(targets).toEqual([{ url: "https://www.example.com/a", relatedPrompts: ["p1"] }]);
	});

	it("dedups: citations to the same url across prompts collapse into one target", () => {
		const targets = chooseAuditTargets({
			citations: [
				{ url: "https://example.com/a", domain: "example.com", promptValue: "p1", count: 3 },
				{ url: "https://example.com/a", domain: "example.com", promptValue: "p2", count: 1 },
			],
			ownedDomains: ["example.com"],
		});
		expect(targets).toHaveLength(1);
		expect(targets[0]).toEqual({ url: "https://example.com/a", relatedPrompts: ["p1", "p2"] });
	});

	it("merges duplicate rows for the same (url, prompt) by summing their counts", () => {
		const targets = chooseAuditTargets({
			citations: [
				{ url: "https://example.com/a", domain: "example.com", promptValue: "p1", count: 3 },
				{ url: "https://example.com/a", domain: "example.com", promptValue: "p1", count: 4 },
				{ url: "https://example.com/b", domain: "example.com", promptValue: "p2", count: 1 },
			],
			ownedDomains: ["example.com"],
		});
		// page /a has total count 7 (3+4) vs /b's 1, so /a ranks first.
		expect(targets.map((t) => t.url)).toEqual(["https://example.com/a", "https://example.com/b"]);
	});

	it("ranks pages by total citation count, descending", () => {
		const targets = chooseAuditTargets({
			citations: [
				{ url: "https://example.com/low", domain: "example.com", promptValue: "p1", count: 2 },
				{ url: "https://example.com/high", domain: "example.com", promptValue: "p1", count: 10 },
				{ url: "https://example.com/mid", domain: "example.com", promptValue: "p1", count: 5 },
			],
			ownedDomains: ["example.com"],
		});
		expect(targets.map((t) => t.url)).toEqual([
			"https://example.com/high",
			"https://example.com/mid",
			"https://example.com/low",
		]);
	});

	it("ranks a page's related prompts by citation count before capping at 8", () => {
		const citations = Array.from({ length: 10 }, (_, i) => ({
			url: "https://example.com/a",
			domain: "example.com",
			promptValue: `p${i}`,
			// counts 0..9 -> descending rank order is p9..p0
			count: i,
		}));
		const targets = chooseAuditTargets({ citations, ownedDomains: ["example.com"] });
		expect(targets).toHaveLength(1);
		expect(targets[0]?.relatedPrompts).toHaveLength(8);
		expect(targets[0]?.relatedPrompts).toEqual(["p9", "p8", "p7", "p6", "p5", "p4", "p3", "p2", "p1"].slice(0, 8));
	});

	it("caps the number of pages at the page limit (default 10)", () => {
		const citations = Array.from({ length: 12 }, (_, i) => ({
			url: `https://example.com/page-${i}`,
			domain: "example.com",
			promptValue: "p1",
			// higher index -> higher count, so page-11 ranks first
			count: i + 1,
		}));
		const targets = chooseAuditTargets({ citations, ownedDomains: ["example.com"] });
		expect(targets).toHaveLength(10);
		expect(targets[0]?.url).toBe("https://example.com/page-11");
		expect(targets.map((t) => t.url)).not.toContain("https://example.com/page-0");
		expect(targets.map((t) => t.url)).not.toContain("https://example.com/page-1");
	});

	it("respects a custom promptCap and pageLimit", () => {
		const citations = Array.from({ length: 3 }, (_, i) => ({
			url: "https://example.com/a",
			domain: "example.com",
			promptValue: `p${i}`,
			count: i + 1,
		}));
		const targets = chooseAuditTargets({ citations, ownedDomains: ["example.com"], promptCap: 2 });
		expect(targets[0]?.relatedPrompts).toHaveLength(2);
	});

	it("never lets competitor citations consume the page-limit budget", () => {
		const competitorCitations = Array.from({ length: 15 }, (_, i) => ({
			url: `https://competitor.com/page-${i}`,
			domain: "competitor.com",
			promptValue: "p1",
			count: 100,
		}));
		const targets = chooseAuditTargets({
			citations: [
				...competitorCitations,
				{ url: "https://example.com/only", domain: "example.com", promptValue: "p1", count: 1 },
			],
			ownedDomains: ["example.com"],
		});
		expect(targets).toEqual([{ url: "https://example.com/only", relatedPrompts: ["p1"] }]);
	});
});

describe("countOwnedCitations", () => {
	it("counts only citations to owned domains, excluding competitor volume", () => {
		const rows = [
			{ url: "https://example.com/a", domain: "example.com", promptValue: "p1", count: 3 },
			{ url: "https://www.example.com/b", domain: "www.example.com", promptValue: "p2", count: 4 },
			{ url: "https://competitor.com/x", domain: "competitor.com", promptValue: "p1", count: 100 },
			{ url: "https://third-party.io/y", domain: "third-party.io", promptValue: "p3", count: 50 },
		];
		// owned sum is 3 + 4 = 7; the 150 competitor/third-party citations are excluded.
		expect(countOwnedCitations(rows, ["https://example.com"])).toBe(7);
	});

	it("returns 0 when the brand has zero owned citations despite heavy competitor volume", () => {
		const rows = [{ url: "https://competitor.com/x", domain: "competitor.com", promptValue: "p1", count: 100 }];
		expect(countOwnedCitations(rows, ["example.com"])).toBe(0);
	});

	it("returns 0 when there are no owned domains", () => {
		const rows = [{ url: "https://example.com/a", domain: "example.com", promptValue: "p1", count: 3 }];
		expect(countOwnedCitations(rows, [])).toBe(0);
	});
});
