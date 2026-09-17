/**
 * Discover competitors from the answers the engines have already given.
 *
 * Onboarding suggests competitors from web research, but it is told to stay
 * empty when uncertain — for many brands it returns nothing. The evaluated
 * answers are better evidence: when an engine names other companies next to
 * the brand, those are the competitors that matter for share of voice. This
 * module mines the stored run text for exactly those names.
 */
import { z } from "zod";
import { type MentionSubject, normalizeDomain } from "./mentions";
import { runStructuredCompletionPrompt } from "./onboarding/llm";

export interface DiscoveredCompetitor {
	name: string;
	domains: string[];
	/** Short quote or paraphrase of where the name appeared — shown so the user can judge. */
	evidence: string;
}

const discoverySchema = z.object({
	competitors: z
		.array(
			z.object({
				name: z.string().describe("The organization's common name, as a customer would write it."),
				domains: z
					.array(z.string())
					.describe("The organization's website domain(s), bare like example.com. Empty if unknown."),
				evidence: z.string().describe("One short phrase quoting or paraphrasing where the answers mention it."),
			}),
		)
		.max(15)
		.describe(
			"Organizations the answers present as alternatives, competitors, or peers of the brand. " +
				"Only real companies offering similar services to a similar audience. " +
				"Exclude the brand itself, generic software products, publishers, and directories.",
		),
});

export function buildDiscoveryPrompt(args: {
	brandName: string;
	brandAliases: string[];
	existingCompetitorNames: string[];
	answers: string[];
}): string {
	const known =
		args.existingCompetitorNames.length > 0
			? `Already tracked (do not repeat): ${args.existingCompetitorNames.join(", ")}.`
			: "No competitors are tracked yet.";
	return [
		`These are AI answer-engine responses to prompts about the brand "${args.brandName}"` +
			(args.brandAliases.length > 0 ? ` (also known as: ${args.brandAliases.join(", ")})` : "") +
			".",
		known,
		"List the organizations these answers treat as the brand's competitors, alternatives, or peers.",
		"",
		...args.answers.map((a, i) => `--- Answer ${i + 1} ---\n${a}`),
	].join("\n");
}

/**
 * Case- and diacritic-insensitive key, so "innova" matches "İnnova" — Turkish
 * dotted İ survives a plain toLowerCase() as i + combining dot and would
 * otherwise slip past the duplicate check.
 */
function foldName(name: string): string {
	return name.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");
}

/** Everything the brand or an existing competitor already answers to, folded. */
function knownIdentifiers(brand: MentionSubject, existing: readonly MentionSubject[]): Set<string> {
	const known = new Set<string>();
	for (const subject of [brand, ...existing]) {
		for (const name of [subject.name, ...(subject.aliases ?? [])]) {
			if (name) known.add(foldName(name));
		}
		for (const domain of subject.domains ?? []) {
			if (domain) known.add(normalizeDomain(domain));
		}
	}
	return known;
}

/**
 * Drop suggestions that are the brand itself or already-tracked competitors,
 * and dedupe by name. Model output is untrusted — this is the contract the
 * UI relies on, so it lives here rather than in the prompt.
 */
export function filterDiscoveries(
	found: DiscoveredCompetitor[],
	brand: MentionSubject,
	existing: readonly MentionSubject[],
): DiscoveredCompetitor[] {
	const known = knownIdentifiers(brand, existing);
	const seen = new Set<string>();
	const result: DiscoveredCompetitor[] = [];
	for (const candidate of found) {
		const name = candidate.name.trim();
		if (!name) continue;
		const key = foldName(name);
		const domains = candidate.domains.map((d) => normalizeDomain(d.trim())).filter(Boolean);
		if (seen.has(key) || known.has(key)) continue;
		if (domains.some((d) => known.has(d))) continue;
		seen.add(key);
		result.push({ name, domains, evidence: candidate.evidence.trim() });
	}
	return result;
}

/** Keep the LLM call bounded whatever the run history looks like. */
export const MAX_DISCOVERY_ANSWERS = 40;
export const MAX_ANSWER_CHARS = 1200;

export function prepareAnswers(texts: string[]): string[] {
	return texts
		.map((t) => t.trim())
		.filter((t) => t.length > 0)
		.slice(0, MAX_DISCOVERY_ANSWERS)
		.map((t) => (t.length > MAX_ANSWER_CHARS ? `${t.slice(0, MAX_ANSWER_CHARS)}…` : t));
}

export async function discoverCompetitorsFromAnswers(args: {
	brand: MentionSubject;
	existingCompetitors: readonly MentionSubject[];
	answerTexts: string[];
}): Promise<DiscoveredCompetitor[]> {
	const answers = prepareAnswers(args.answerTexts);
	if (answers.length === 0) return [];

	const prompt = buildDiscoveryPrompt({
		brandName: args.brand.name,
		brandAliases: (args.brand.aliases ?? []).filter((a): a is string => Boolean(a)),
		existingCompetitorNames: args.existingCompetitors.map((c) => c.name),
		answers,
	});

	const result = await runStructuredCompletionPrompt(prompt, discoverySchema);
	return filterDiscoveries(result.object.competitors, args.brand, args.existingCompetitors);
}
