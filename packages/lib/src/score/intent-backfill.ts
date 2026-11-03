import { z } from "zod";
import { PROMPT_INTENTS, type PromptIntent } from "../db/schema";
import { runStructuredCompletionPrompt } from "../onboarding/llm";

export const INTENT_BATCH_SIZE = 25;

const schema = z.object({
	items: z.array(
		z.object({
			id: z.string(),
			intent: z.string().nullable().describe("One of discovery, comparison, local, price; null when none fits."),
		}),
	),
});

const GUIDANCE =
	"Classify each buyer search prompt by intent: 'discovery' = finding or listing options (best X, top X, X recommendations); 'comparison' = X vs Y, alternatives to X; 'local' = near me, in a named place; 'price' = cost, pricing, how much. Use null when none fits. Return every id exactly once.";

export async function classifyIntents(
	prompts: readonly { id: string; value: string }[],
	run: typeof runStructuredCompletionPrompt = runStructuredCompletionPrompt,
): Promise<Map<string, PromptIntent | null>> {
	const out = new Map<string, PromptIntent | null>();
	for (let i = 0; i < prompts.length; i += INTENT_BATCH_SIZE) {
		const batch = prompts.slice(i, i + INTENT_BATCH_SIZE);
		const prompt = `${GUIDANCE}\n\n${batch.map((p) => `${p.id}: ${p.value}`).join("\n")}`;
		const { object } = await run(prompt, schema);
		for (const p of batch) out.set(p.id, null);
		for (const item of object.items) {
			if (!out.has(item.id)) continue;
			out.set(item.id, PROMPT_INTENTS.includes(item.intent as PromptIntent) ? (item.intent as PromptIntent) : null);
		}
	}
	return out;
}
