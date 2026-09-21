import { GLOBAL_MARKET_KEY, getMarket, getMarketForCodes, type Market } from "@workspace/config/markets";
import { dfsLanguageCode, dfsLocationCode } from "../providers/registry/dataforseo-shared";

/**
 * Resolve the market a brand's localizable runs execute in. Never throws: a
 * brand row or a deployment's env can point at a (location, language) pair
 * that isn't in the catalog — bad/legacy `default_market_key` data, or an env
 * pair nobody's added a catalog entry for yet — and that must degrade rather
 * than take the brand's reads, writes, and scheduled runs down.
 *
 * On an unresolvable market this returns a sentinel `Market` keyed
 * `GLOBAL_MARKET_KEY`: every caller that stamps or scopes by `.key` already
 * treats "global" as the non-localized bucket, so reads and writes fall back
 * to it instead of 500ing. The sentinel still carries the deployment's env
 * `locationCode`/`languageCode`, so a localizable target on an unresolvable
 * brand still tells DataForSEO to scrape the deployment's configured
 * location exactly as before this feature existed — only the persisted
 * `market_key` degrades, not the actual scrape.
 */
export function resolveEffectiveMarket(input: { defaultMarketKey: string | null }): Market {
	const loc = dfsLocationCode();
	const lang = dfsLanguageCode();
	const sentinel: Market = { key: GLOBAL_MARKET_KEY, countryCode: "", languageCode: lang, locationCode: loc };

	if (input.defaultMarketKey) {
		return getMarket(input.defaultMarketKey) ?? sentinel;
	}
	return getMarketForCodes(loc, lang) ?? sentinel;
}
