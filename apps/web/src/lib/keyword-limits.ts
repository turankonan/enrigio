export const MAX_KEYWORDS = 20;
export const MAX_KEYWORD_LENGTH = 60;

/** Keywords are matched case-insensitively, so case variants would only repeat a result. */
export function dedupeKeywords(keywords: string[]): string[] {
	const seen = new Set<string>();
	return keywords.filter((keyword) => {
		const key = keyword.toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/** True when a report was produced for a different keyword list than the one now saved. */
export function keywordsDiffer(a: string[], b: string[]): boolean {
	const left = new Set(a.map((k) => k.toLowerCase()));
	const right = new Set(b.map((k) => k.toLowerCase()));
	return left.size !== right.size || [...left].some((k) => !right.has(k));
}
