export type ScoreDeltaKind = "up" | "down" | "same" | "first" | "none";

export function scoreDelta(score: number | null | undefined, previous: number | null | undefined) {
	if (score === null || score === undefined) return { kind: "none" as const, points: 0 };
	if (previous === null || previous === undefined) return { kind: "first" as const, points: 0 };
	const diff = score - previous;
	if (diff === 0) return { kind: "same" as const, points: 0 };
	return { kind: diff > 0 ? ("up" as const) : ("down" as const), points: Math.abs(diff) };
}
