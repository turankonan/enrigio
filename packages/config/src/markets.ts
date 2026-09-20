export interface Market {
	/** Stable BCP-47-style key, persisted forever, never reused. */
	key: string;
	/** ISO-3166 alpha-2, e.g. "TR". */
	countryCode: string;
	/** ISO-639-1, e.g. "tr" — DataForSEO language_code. */
	languageCode: string;
	/** DataForSEO location_code, e.g. 2792. */
	locationCode: number;
}

/** Reserved sentinels — NOT catalog entries. */
export const GLOBAL_MARKET_KEY = "global";
export const LEGACY_MARKET_KEY = "legacy";

/** Curated v1 markets. Labels are rendered from codes via Intl.DisplayNames, not stored. */
export const MARKET_CATALOG: readonly Market[] = [
	{ key: "tr-TR", countryCode: "TR", languageCode: "tr", locationCode: 2792 },
	{ key: "de-DE", countryCode: "DE", languageCode: "de", locationCode: 2276 },
	{ key: "en-GB", countryCode: "GB", languageCode: "en", locationCode: 2826 },
	{ key: "en-US", countryCode: "US", languageCode: "en", locationCode: 2840 },
];

export function getMarket(key: string): Market | undefined {
	return MARKET_CATALOG.find((m) => m.key === key);
}

export function getMarketForCodes(locationCode: number, languageCode: string): Market | undefined {
	return MARKET_CATALOG.find((m) => m.locationCode === locationCode && m.languageCode === languageCode);
}
