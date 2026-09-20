import { getMarket, getMarketForCodes, type Market } from "@workspace/config/markets";
import { dfsLanguageCode, dfsLocationCode } from "../providers/registry/dataforseo-shared";

/** Resolve the market a brand's localizable runs execute in. Throws on misconfiguration. */
export function resolveEffectiveMarket(input: { defaultMarketKey: string | null }): Market {
	if (input.defaultMarketKey) {
		const m = getMarket(input.defaultMarketKey);
		if (!m) throw new Error(`Unknown market key "${input.defaultMarketKey}"`);
		return m;
	}
	const loc = dfsLocationCode();
	const lang = dfsLanguageCode();
	const m = getMarketForCodes(loc, lang);
	if (!m) throw new Error(`Deployment env (location ${loc}, language ${lang}) maps to no catalog market`);
	return m;
}
