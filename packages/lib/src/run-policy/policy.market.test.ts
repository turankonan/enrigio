import { describe, expect, it } from "vitest";
import { lastRunsByTargetKey, selectDueTargets, type TargetPlan, targetKey } from "./policy";

const cfg = (model: string) => ({ model, provider: "dataforseo", webSearch: false });
const plan = (model: string): TargetPlan => ({ config: cfg(model), intervalHours: 24, replication: 1 });
const marketKeyFor = (c: { model: string }) => (c.model === "openai" ? "global" : "de-DE");

describe("market-aware freshness", () => {
	it("targetKey omits the market when none is given, and appends it when given", () => {
		expect(targetKey(cfg("google-ai-overview"))).toBe("google-ai-overview::dataforseo::base");
		expect(targetKey(cfg("google-ai-overview"), "de-DE")).toContain("de-DE");
		expect(targetKey(cfg("google-ai-overview"), "de-DE")).not.toBe(targetKey(cfg("google-ai-overview"), "tr-TR"));
	});

	it("a recent tr-TR run does not mark the de-DE target fresh", () => {
		const now = new Date("2026-09-20T12:00:00Z");
		const recent = new Date("2026-09-20T11:00:00Z");
		const lastRuns = lastRunsByTargetKey([
			{
				model: "google-ai-overview",
				provider: "dataforseo",
				webSearchEnabled: false,
				marketKey: "tr-TR",
				lastRunAt: recent,
			},
		]);
		// brand now on de-DE → target is due despite the recent tr-TR run
		const due = selectDueTargets([plan("google-ai-overview")], lastRuns, now, marketKeyFor);
		expect(due).toHaveLength(1);
	});

	it("does not re-due global (non-localizable) targets on a market change", () => {
		const now = new Date("2026-09-20T12:00:00Z");
		const recent = new Date("2026-09-20T11:00:00Z");
		const lastRuns = lastRunsByTargetKey([
			{ model: "openai", provider: "dataforseo", webSearchEnabled: false, marketKey: "global", lastRunAt: recent },
		]);
		const due = selectDueTargets([plan("openai")], lastRuns, now, marketKeyFor);
		expect(due).toHaveLength(0); // global key unchanged by a market switch
	});

	it("selectDueTargets without a marketKeyFor stays market-blind (existing callers unaffected)", () => {
		const now = new Date("2026-09-20T12:00:00Z");
		const recent = new Date("2026-09-20T11:00:00Z");
		const lastRuns = new Map([[targetKey(cfg("openai")), recent]]);
		expect(selectDueTargets([plan("openai")], lastRuns, now)).toHaveLength(0);
	});
});
