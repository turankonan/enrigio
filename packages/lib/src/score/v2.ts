/**
 * Score v2: rank-weighted visibility. Lives here so the SQL read layer and
 * the offline back-test build from the same numbers and cannot drift.
 */
export const RANK_WEIGHTS = { rank1: 1, rank2: 0.7, rank3: 0.5, other: 0.3 } as const;

export interface ScoredRun {
	brandMentioned: boolean;
	brandRank: number | null;
}

export function weightFor(run: ScoredRun): number {
	if (!run.brandMentioned) return 0;
	if (run.brandRank === 1) return RANK_WEIGHTS.rank1;
	if (run.brandRank === 2) return RANK_WEIGHTS.rank2;
	if (run.brandRank === 3) return RANK_WEIGHTS.rank3;
	return RANK_WEIGHTS.other;
}

export function scoreV2(runs: readonly ScoredRun[]): number | null {
	if (runs.length === 0) return null;
	const total = runs.reduce((sum, run) => sum + weightFor(run), 0);
	return Math.round((total / runs.length) * 100);
}
