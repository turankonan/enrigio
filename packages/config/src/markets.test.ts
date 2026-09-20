import { describe, expect, it } from "vitest";
import { GLOBAL_MARKET_KEY, getMarket, getMarketForCodes, LEGACY_MARKET_KEY, MARKET_CATALOG } from "./markets";

describe("market catalog", () => {
	it("has unique BCP-47-style keys with valid codes", () => {
		const keys = MARKET_CATALOG.map((m) => m.key);
		expect(new Set(keys).size).toBe(keys.length);
		for (const m of MARKET_CATALOG) {
			expect(m.key).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
			expect(m.locationCode).toBeGreaterThan(0);
			expect(m.languageCode).toMatch(/^[a-z]{2}$/);
		}
	});
	it("includes Türkiye (2792/tr) as tr-TR", () => {
		expect(getMarketForCodes(2792, "tr")?.key).toBe("tr-TR");
	});
	it("looks up by key and returns undefined for unknown", () => {
		expect(getMarket("de-DE")?.countryCode).toBe("DE");
		expect(getMarket("zz-ZZ")).toBeUndefined();
	});
	it("reserves global and legacy sentinels distinct from catalog keys", () => {
		expect(GLOBAL_MARKET_KEY).toBe("global");
		expect(LEGACY_MARKET_KEY).toBe("legacy");
		expect(MARKET_CATALOG.map((m) => m.key)).not.toContain(GLOBAL_MARKET_KEY);
	});
});
