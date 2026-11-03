import { describe, expect, it, vi } from "vitest";
import { classifyIntents, INTENT_BATCH_SIZE } from "./intent-backfill";

describe("classifyIntents", () => {
	it("maps numbered lines back to ids per batch, nulling unknown and omitted ones", async () => {
		const run = vi.fn(async (_prompt: string) => ({
			object: {
				items: [
					{ index: 1, intent: "discovery" },
					{ index: 2, intent: "nonsense" },
					{ index: 3, intent: null },
				],
			},
		}));
		const prompts = Array.from({ length: INTENT_BATCH_SIZE + 1 }, (_, i) => ({ id: `id${i}`, value: `q${i}` }));
		const onBatch = vi.fn(async () => {});
		const out = await classifyIntents(prompts, run as never, onBatch);
		expect(run).toHaveBeenCalledTimes(2);
		expect(onBatch).toHaveBeenCalledTimes(2);
		expect(out.size).toBe(26);
		expect(out.get("id0")).toBe("discovery");
		expect(out.get("id1")).toBeNull();
		expect(out.get("id2")).toBeNull();
		expect(out.get("id3")).toBeNull();
		expect(out.get("id25")).toBe("discovery");
	});
});
