import type { ReportOpportunity } from "@/server/opportunities";

export const NEXT_STEPS_COUNT = 5;
const RANK = { high: 0, medium: 1, low: 2 } as const;

export function pickNextSteps(opportunities: ReportOpportunity[]): ReportOpportunity[] {
	return opportunities
		.map((o, index) => ({ o, index }))
		.sort((a, b) => (RANK[a.o.priority] ?? 1) - (RANK[b.o.priority] ?? 1) || a.index - b.index)
		.slice(0, NEXT_STEPS_COUNT)
		.map(({ o }) => o);
}
