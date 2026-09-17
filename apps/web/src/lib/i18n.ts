/**
 * Minimal two-locale i18n: static dictionaries, build-time locale.
 *
 * The locale is baked into the bundle via VITE_LOCALE — there is no runtime
 * switcher, because a deployment serves one market. English is the fallback
 * for any key a wave of translation hasn't reached yet, so a missing entry
 * shows English rather than a blank or a raw key.
 */
import en from "../locales/en.json";
import tr from "../locales/tr.json";

export type TranslationKey = keyof typeof en;

const LOCALE: "en" | "tr" = import.meta.env.VITE_LOCALE === "tr" ? "tr" : "en";

const dictionary: Record<string, string> = LOCALE === "tr" ? tr : en;

export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
	let text: string = dictionary[key] ?? en[key] ?? key;
	if (vars) {
		for (const [name, value] of Object.entries(vars)) {
			text = text.replaceAll(`{${name}}`, String(value));
		}
	}
	return text;
}

export const locale = LOCALE;
