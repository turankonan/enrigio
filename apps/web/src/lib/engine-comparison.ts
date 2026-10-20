export interface ModelCompetitorMentionRow {
	model: string;
	runs: number;
	brand_mentioned_count: number;
	competitor: string | null;
	competitor_count: number;
}

export type EngineVerdict = "lead" | "close" | "behind";

export interface EngineRow {
	model: string;
	label: string;
	/** 0–1 */
	brandRate: number | null;
	topCompetitor: { name: string; rate: number } | null;
	verdict: EngineVerdict | null;
}

const CLOSE_POINTS = 5;

export function verdictFor(brandRate: number | null, competitorRate: number | null): EngineVerdict | null {
	if (brandRate === null || competitorRate === null) return null;
	const diff = (brandRate - competitorRate) * 100;
	if (Math.abs(diff) < CLOSE_POINTS) return "close";
	return diff > 0 ? "lead" : "behind";
}

export function buildEngineRows(rows: ModelCompetitorMentionRow[], label: (model: string) => string): EngineRow[] {
	const byModel = new Map<string, EngineRow>();
	for (const row of rows) {
		const entry = byModel.get(row.model) ?? {
			model: row.model,
			label: label(row.model),
			brandRate: row.runs > 0 ? row.brand_mentioned_count / row.runs : null,
			topCompetitor: null,
			verdict: null,
		};
		if (row.competitor && row.runs > 0) {
			const rate = row.competitor_count / row.runs;
			if (!entry.topCompetitor || rate > entry.topCompetitor.rate) entry.topCompetitor = { name: row.competitor, rate };
		}
		byModel.set(row.model, entry);
	}
	return [...byModel.values()]
		.map((entry) => ({ ...entry, verdict: verdictFor(entry.brandRate, entry.topCompetitor?.rate ?? null) }))
		.sort((a, b) => (b.brandRate ?? -1) - (a.brandRate ?? -1));
}
