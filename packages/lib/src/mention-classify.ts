import { z } from "zod";
import type { AccuracyClaim } from "./db/schema";
import { runStructuredCompletionPrompt } from "./onboarding/llm";

export interface MentionClassification {
	sentiment: "positive" | "neutral" | "negative";
	brandRank: number | null;
	/** Present only when a profile was supplied. */
	claims?: AccuracyClaim[];
}

/** The facts the classifier may call an answer wrong about. Identity only until the wizard adds more. */
export interface BrandProfile {
	name: string;
	website: string;
	additionalDomains: string[];
	aliases: string[];
	keywords: string[];
}

const baseSchema = z.object({
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

const claimsSchema = baseSchema.extend({
	claims: z
		.array(
			z.object({
				claim: z
					.string()
					.describe("A factual statement the answer makes about the brand, quoted or closely paraphrased."),
				status: z
					.enum(["contradicted", "unsupported"])
					.describe(
						"'contradicted' only when the profile states otherwise. 'unsupported' when the profile says nothing about it.",
					),
			}),
		)
		.describe("Every factual claim about the brand that is not confirmed by the profile. Empty if all are confirmed."),
});

function profileText(profile: BrandProfile): string {
	return [
		`Canonical name: ${profile.name}`,
		`Website: ${profile.website}`,
		profile.additionalDomains.length ? `Other domains: ${profile.additionalDomains.join(", ")}` : "",
		profile.aliases.length ? `Also known as: ${profile.aliases.join(", ")}` : "",
		profile.keywords.length ? `What the business does (owner's words): ${profile.keywords.join("; ")}` : "",
	]
		.filter(Boolean)
		.join("\n");
}

export async function classifyMention(input: {
	answer: string;
	brandName: string;
	competitorNames: string[];
	profile?: BrandProfile;
}): Promise<MentionClassification | null> {
	const prompt = [
		`An AI assistant produced this answer:\n"""\n${input.answer}\n"""`,
		`The brand of interest is "${input.brandName}".`,
		input.competitorNames.length ? `Other tracked brands: ${input.competitorNames.join(", ")}.` : "",
		`Classify the sentiment toward "${input.brandName}" and its 1-based rank among all named options in the answer.`,
		input.profile
			? `This is the authoritative profile of the brand:\n${profileText(input.profile)}\n\nList every factual claim the answer makes about the brand that the profile does not confirm. Mark a claim "contradicted" only when the profile states something different; mark it "unsupported" when the profile is silent.`
			: "",
	]
		.filter(Boolean)
		.join("\n\n");

	try {
		// runStructuredCompletionPrompt is web-search OFF: a single completion over the
		// context in the prompt, no tools, no agent loop. Returns { object, modelVersion }.
		if (input.profile) {
			try {
				const { object } = await runStructuredCompletionPrompt(prompt, claimsSchema);
				return { sentiment: object.sentiment, brandRank: object.brandRank, claims: object.claims };
			} catch (error) {
				// Sentiment and rank are still worth keeping; with no claims the run stays "not assessed".
				console.error("[mention-classify] claims classification failed, retrying without claims:", error);
			}
		}
		const { object } = await runStructuredCompletionPrompt(prompt, baseSchema);
		return { sentiment: object.sentiment, brandRank: object.brandRank };
	} catch (error) {
		console.error("[mention-classify] classification failed:", error);
		return null;
	}
}
