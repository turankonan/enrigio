/** Canonical form so "https://x.com" and "https://x.com/" are not fetched, and counted, twice. */
export function uniqueCanonicalUrls(raw: string[]): string[] {
	const seen = new Set<string>();
	for (const value of raw) {
		try {
			seen.add(new URL(value).href);
		} catch {
			// unparsable values cannot be fetched
		}
	}
	return [...seen];
}

/** Brand websites may be stored as bare domains; the web app's validator assumes https for those too. */
export function withScheme(website: string): string {
	const trimmed = website.trim();
	return trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
}
