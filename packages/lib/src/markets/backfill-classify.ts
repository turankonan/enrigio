import type { ModelConfig } from "@workspace/config/scrape-targets";
import { getProvider, resolveLocalizable } from "../providers";
import { isVersionSensitiveDfsModel } from "../providers/registry/dataforseo";

/**
 * Attribution for a pre-2a run — from what the stored columns can PROVE, and nothing more.
 * The historical MARKET is never assertable here (the deployment location may have changed),
 * so this returns only "global" (proven non-localizable) or "legacy" (unprovable). Assigning
 * a legacy localizable run to a real market is the operator's explicit decision (--historical-market).
 *  - null / unknown provider  → "legacy" (unknown route, not proven anything).
 *  - DataForSEO chatgpt/gemini → "legacy" (scraped-vs-LLM-Responses unreconstructable).
 *  - provably localizable      → "legacy" (route localizes, but which market is unknown).
 *  - provably non-localizable  → "global".
 */
export function historicalMarketKeyFor(row: {
	model: string;
	provider: string | null;
	version: string | null;
	webSearchEnabled: boolean;
}): "global" | "legacy" {
	if (!row.provider) return "legacy";
	try {
		getProvider(row.provider); // unknown/retired provider id → catch → legacy (never abort)
	} catch {
		return "legacy";
	}
	if (row.provider === "dataforseo" && isVersionSensitiveDfsModel(row.model)) return "legacy";
	const config: ModelConfig = {
		model: row.model,
		provider: row.provider,
		version: row.version ?? undefined,
		webSearch: row.webSearchEnabled,
	};
	return resolveLocalizable(config) ? "legacy" : "global";
}

/**
 * Narrower than `historicalMarketKeyFor(row) === "legacy"`: true only for the
 * "route localizes, but which market is unknown" case, not for a null/unknown
 * provider or an ambiguous DataForSEO chatbot route. This is what the backfill
 * script checks before honoring `--historical-market` — an operator's asserted
 * market must only ever land on a row that is actually provably localizable.
 */
export function isConfirmedLocalizableLegacyRow(row: {
	model: string;
	provider: string | null;
	version: string | null;
	webSearchEnabled: boolean;
}): boolean {
	if (!row.provider) return false;
	try {
		getProvider(row.provider);
	} catch {
		return false;
	}
	if (row.provider === "dataforseo" && isVersionSensitiveDfsModel(row.model)) return false;
	const config: ModelConfig = {
		model: row.model,
		provider: row.provider,
		version: row.version ?? undefined,
		webSearch: row.webSearchEnabled,
	};
	return resolveLocalizable(config);
}
