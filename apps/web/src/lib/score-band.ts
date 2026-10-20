export type ScoreBand = "low" | "ok" | "good";

// ponytail: fixed thresholds; make them per-deployment config if a customer asks.
export const SCORE_BAND_OK_FROM = 20;
export const SCORE_BAND_GOOD_FROM = 50;

export function scoreBand(pct: number | null | undefined): ScoreBand | null {
	if (pct === null || pct === undefined || Number.isNaN(pct)) return null;
	if (pct < SCORE_BAND_OK_FROM) return "low";
	if (pct < SCORE_BAND_GOOD_FROM) return "ok";
	return "good";
}
