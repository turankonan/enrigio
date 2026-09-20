import { getMarket } from "@workspace/config/markets";
import { locale } from "@/lib/i18n";

/** Human label for a market key, localized to the UI locale, e.g. "Germany · German". */
export function marketLabel(key: string): string {
	const m = getMarket(key);
	if (!m) return key;
	const region = new Intl.DisplayNames([locale], { type: "region" }).of(m.countryCode) ?? m.countryCode;
	const language = new Intl.DisplayNames([locale], { type: "language" }).of(m.languageCode) ?? m.languageCode;
	return `${region} · ${language}`;
}
