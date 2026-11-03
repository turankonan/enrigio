import { z } from "zod";
import { PROMPT_INTENTS, type PromptIntent } from "../db/schema";
import { runStructuredCompletionPrompt } from "../onboarding/llm";

export const INTENT_BATCH_SIZE = 25;

const schema = z.object({
	items: z.array(
		z.object({
			index: z.number().int().describe("The number of the prompt line, as given."),
			intent: z.string().nullable().describe("One of discovery, comparison, local, price; null when none fits."),
		}),
	),
});

const GUIDANCE =
	"Classify each buyer search prompt by intent: 'discovery' = finding or listing options (best X, top X, X recommendations); 'comparison' = X vs Y, alternatives to X; 'local' = near me, in a named place; 'price' = cost, pricing, how much. Use null when none fits. Return every line number exactly once.";

export async function classifyIntents(
	prompts: readonly { id: string; value: string }[],
	run: typeof runStructuredCompletionPrompt = runStructuredCompletionPrompt,
	onBatch?: (results: Map<string, PromptIntent | null>) => Promise<void>,
): Promise<Map<string, PromptIntent | null>> {
	const out = new Map<string, PromptIntent | null>();
	for (let i = 0; i < prompts.length; i += INTENT_BATCH_SIZE) {
		const batch = prompts.slice(i, i + INTENT_BATCH_SIZE);
		// Numbered lines, mapped back by position, so the model never has to echo a UUID.
		const prompt = `${GUIDANCE}\n\n${batch.map((p, n) => `${n + 1}: ${p.value}`).join("\n")}`;
		const { object } = await run(prompt, schema);
		const results = new Map<string, PromptIntent | null>(batch.map((p) => [p.id, null]));
		for (const item of object.items) {
			const target = batch[item.index - 1];
			if (!target) continue;
			results.set(
				target.id,
				PROMPT_INTENTS.includes(item.intent as PromptIntent) ? (item.intent as PromptIntent) : null,
			);
		}
		for (const [id, intent] of results) out.set(id, intent);
		await onBatch?.(results);
	}
	return out;
}
