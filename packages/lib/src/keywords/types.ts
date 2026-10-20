export type KeywordStatus = "found" | "weak" | "missing";

export interface KeywordResult {
	keyword: string;
	status: KeywordStatus;
	/** Page that produced the status; null when missing. */
	url: string | null;
	where: "heading" | "body" | null;
}

export interface KeywordCheckReport {
	pages: { url: string; fetched: boolean }[];
	keywords: KeywordResult[];
	failureSummary?: string;
}

/** One fetched page, split so a heading hit can outrank body text. */
export interface PageText {
	url: string;
	headings: string;
	body: string;
}
