import { describe, expect, it, vi } from "vitest";
import { classifyIntents, INTENT_BATCH_SIZE } from "./intent-backfill";

describe("classifyIntents", () => {
	it("sends one call per batch and maps ids to intents, nulling unknown values", async () => {
		const run = vi.fn(async (_prompt: string) => ({
			object: {
				items: [
					{ id: "a", intent: "discovery" },
					{ id: "b", intent: "nonsense" },
					{ id: "c", intent: null },
				],
			},
		}));
		const prompts = Array.from({ length: INTENT_BATCH_SIZE + 1 }, (_, i) => ({
			id: i < 3 ? "abc"[i] : `x${i}`,
			value: `q${i}`,
		}));
		const out = await classifyIntents(prompts, run as never);
		expect(run).toHaveBeenCalledTimes(2);
		expect(out.get("a")).toBe("discovery");
		expect(out.get("b")).toBeNull();
		expect(out.get("c")).toBeNull();
	});
});
