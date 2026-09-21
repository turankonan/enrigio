import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveEffectiveMarket } from "./effective";

afterEach(() => vi.unstubAllEnvs());

describe("resolveEffectiveMarket", () => {
	it("uses the brand's explicit market", () => {
		expect(resolveEffectiveMarket({ defaultMarketKey: "de-DE" }).key).toBe("de-DE");
	});

	it("falls back to the deployment env market when unset", () => {
		vi.stubEnv("DATAFORSEO_LOCATION_CODE", "2792");
		vi.stubEnv("DATAFORSEO_LANGUAGE_CODE", "tr");
		expect(resolveEffectiveMarket({ defaultMarketKey: null }).key).toBe("tr-TR");
	});

	it("never throws, and degrades to the global sentinel when the env pair maps to no catalog entry", () => {
		vi.stubEnv("DATAFORSEO_LOCATION_CODE", "9999");
		vi.stubEnv("DATAFORSEO_LANGUAGE_CODE", "zz");

		const market = resolveEffectiveMarket({ defaultMarketKey: null });

		expect(market.key).toBe("global");
		expect(market.locationCode).toBe(9999);
		expect(market.languageCode).toBe("zz");
	});

	it("never throws, and degrades to the global sentinel when the explicit key is unknown", () => {
		vi.stubEnv("DATAFORSEO_LOCATION_CODE", "2840");
		vi.stubEnv("DATAFORSEO_LANGUAGE_CODE", "en");

		const market = resolveEffectiveMarket({ defaultMarketKey: "zz-ZZ" });

		expect(market.key).toBe("global");
		expect(market.locationCode).toBe(2840);
		expect(market.languageCode).toBe("en");
	});
});
