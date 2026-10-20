import type { KeywordResult, PageText } from "./types";

export function normalizeText(text: string, lang = "en"): string {
	const lower = lang === "tr" ? text.toLocaleLowerCase("tr") : text.toLowerCase();
	return lower.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function countOccurrences(haystack: string, needle: string): number {
	if (!needle) return 0;
	let count = 0;
	let index = haystack.indexOf(needle);
	while (index !== -1) {
		count += 1;
		index = haystack.indexOf(needle, index + needle.length);
	}
	return count;
}

// ponytail: plain substring matching; swap for LLM relevance scoring if customers ask.
export function matchKeywords(keywords: string[], pages: PageText[], lang = "en"): KeywordResult[] {
	const prepared = pages.map((page) => ({
		url: page.url,
		headings: normalizeText(page.headings, lang),
		body: normalizeText(page.body, lang),
	}));

	return keywords.map((keyword) => {
		const needle = normalizeText(keyword, lang);
		let bodyHits = 0;
		let firstBodyUrl: string | null = null;
		for (const page of prepared) {
			if (countOccurrences(page.headings, needle) > 0) {
				return { keyword, status: "found", url: page.url, where: "heading" };
			}
			const hits = countOccurrences(page.body, needle);
			if (hits > 0 && firstBodyUrl === null) firstBodyUrl = page.url;
			bodyHits += hits;
		}
		if (bodyHits >= 2) return { keyword, status: "found", url: firstBodyUrl, where: "body" };
		if (bodyHits === 1) return { keyword, status: "weak", url: firstBodyUrl, where: "body" };
		return { keyword, status: "missing", url: null, where: null };
	});
}

/** Share of keywords present on the site (found or weak), 0–100; null when there are none. */
export function overlapScore(results: KeywordResult[]): number | null {
	if (results.length === 0) return null;
	const present = results.filter((r) => r.status !== "missing").length;
	return Math.round((present / results.length) * 100);
}
