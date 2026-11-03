import type { FirstScanExpectedPair, PromptIntent } from "@workspace/lib/db/schema";
import type { OnboardingSuggestion } from "@workspace/lib/onboarding";

// Type aliases rather than interfaces: the draft is stored in a jsonb column typed SetupDraftJson,
// which an interface is not assignable to.
export type SetupStep = 1 | 2 | 3 | 4 | 5;

export type DraftQuestion = {
	text: string;
	intent: PromptIntent | null;
	selected: boolean;
	custom: boolean;
};

export type DraftRival = {
	name: string;
	site: string;
	selected: boolean;
	custom: boolean;
};

export type SetupDraft = {
	step: SetupStep;
	profile: {
		name: string;
		sector: string;
		location: string;
		marketKey: string | null;
		aliases: string[];
		additionalDomains: string[];
	};
	questions: DraftQuestion[];
	rivals: DraftRival[];
	engines: string[];
};

export const MIN_BUYER = 10;
export const MAX_BUYER = 16;
export const PRESELECT_PER_INTENT = 3;
export const MAX_RIVALS = 5;
export const DEFAULT_ENGINES = ["chatgpt", "gemini", "google-ai-overview", "perplexity"];

const isBuyer = (q: DraftQuestion) => q.intent !== null;

export function draftFromSuggestion(s: OnboardingSuggestion, availableModels: string[]): SetupDraft {
	const perIntent = new Map<PromptIntent, number>();
	const questions: DraftQuestion[] = s.suggestedPrompts.map((p) => {
		if (p.intent === null) return { text: p.prompt, intent: null, selected: true, custom: false };
		const n = perIntent.get(p.intent) ?? 0;
		perIntent.set(p.intent, n + 1);
		return { text: p.prompt, intent: p.intent, selected: n < PRESELECT_PER_INTENT, custom: false };
	});
	return {
		step: 1,
		profile: {
			name: s.brandName,
			sector: s.sector ?? "",
			location: s.location ?? "",
			marketKey: s.marketKey,
			aliases: s.aliases,
			additionalDomains: s.additionalDomains,
		},
		questions,
		rivals: s.competitors.map((c, i) => ({
			name: c.name,
			site: c.domains[0] ?? "",
			selected: i < MAX_RIVALS,
			custom: false,
		})),
		engines: defaultEngines(availableModels),
	};
}

export function selectedBuyerCount(d: SetupDraft): number {
	return d.questions.filter((q) => isBuyer(q) && q.selected).length;
}

export function canContinueFromQuestions(d: SetupDraft): boolean {
	const n = selectedBuyerCount(d);
	return n >= MIN_BUYER && n <= MAX_BUYER;
}

export function toggleQuestion(d: SetupDraft, index: number): SetupDraft {
	const q = d.questions[index];
	if (!q || !isBuyer(q)) return d;
	if (!q.selected && selectedBuyerCount(d) >= MAX_BUYER) return d;
	const questions = d.questions.map((x, i) => (i === index ? { ...x, selected: !x.selected } : x));
	return { ...d, questions };
}

export function addCustomQuestion(d: SetupDraft, text: string, intent: PromptIntent): SetupDraft {
	const clean = text.trim();
	if (!clean || selectedBuyerCount(d) >= MAX_BUYER) return d;
	if (d.questions.some((q) => q.text.toLowerCase() === clean.toLowerCase())) return d;
	// Buyer questions sit ahead of the branded tail so the list reads in the same order it was built.
	const firstBranded = d.questions.findIndex((q) => !isBuyer(q));
	const at = firstBranded === -1 ? d.questions.length : firstBranded;
	const questions = [...d.questions];
	questions.splice(at, 0, { text: clean, intent, selected: true, custom: true });
	return { ...d, questions };
}

export function toggleRival(d: SetupDraft, index: number): SetupDraft {
	const r = d.rivals[index];
	if (!r) return d;
	if (!r.selected && d.rivals.filter((x) => x.selected).length >= MAX_RIVALS) return d;
	return { ...d, rivals: d.rivals.map((x, i) => (i === index ? { ...x, selected: !x.selected } : x)) };
}

export function addCustomRival(d: SetupDraft, name: string, site: string): SetupDraft {
	const n = name.trim();
	if (!n || d.rivals.filter((x) => x.selected).length >= MAX_RIVALS) return d;
	return { ...d, rivals: [...d.rivals, { name: n, site: site.trim(), selected: true, custom: true }] };
}

/** The board's four engines when offered, topped up from the rest so the scan is never one engine wide. */
export function defaultEngines(available: string[]): string[] {
	const preferred = DEFAULT_ENGINES.filter((m) => available.includes(m));
	const rest = available.filter((m) => !preferred.includes(m));
	return [...preferred, ...rest].slice(0, DEFAULT_ENGINES.length);
}

export function monthlyAnswerEstimate(d: SetupDraft, runsPerDay: number): number {
	const prompts = selectedBuyerCount(d) + d.questions.filter((q) => !isBuyer(q)).length;
	return prompts * d.engines.length * 30 * runsPerDay;
}

export function expectedPairs(promptIds: { id: string }[], engines: string[]): FirstScanExpectedPair[] {
	return promptIds.flatMap((p) => engines.map((model) => ({ promptId: p.id, model })));
}
