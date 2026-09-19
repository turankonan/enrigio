import { z } from "zod";
import { runStructuredCompletionPrompt } from "./onboarding/llm";

export interface MentionClassification {
	sentiment: "positive" | "neutral" | "negative";
	brandRank: number | null;
}

const schema = z.object({
	sentiment: z.enum(["positive", "neutral", "negative"]).describe("How the answer speaks about the brand overall."),
	brandRank: z
		.number()
		.int()
		.min(1)
		.nullable()
		.describe(
			"1-based position of the brand among all named options in the answer (1 = recommended first). Null if the answer implies no ordering.",
		),
});

export async function classifyMention(input: {
	answer: string;
	brandName: string;
	competitorNames: string[];
}): Promise<MentionClassification | null> {
	const prompt = [
		`An AI assistant produced this answer:\n"""\n${input.answer}\n"""`,
		`The brand of interest is "${input.brandName}".`,
		input.competitorNames.length ? `Other tracked brands: ${input.competitorNames.join(", ")}.` : "",
		`Classify the sentiment toward "${input.brandName}" and its 1-based rank among all named options in the answer.`,
	]
		.filter(Boolean)
		.join("\n\n");

	try {
		// runStructuredCompletionPrompt is web-search OFF: a single completion over the
		// context in the prompt, no tools, no agent loop. Returns { object, modelVersion }.
		const { object } = await runStructuredCompletionPrompt(prompt, schema);
		return { sentiment: object.sentiment, brandRank: object.brandRank };
	} catch (error) {
		console.error("[mention-classify] classification failed:", error);
		return null;
	}
}
