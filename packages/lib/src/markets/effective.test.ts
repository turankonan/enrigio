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
	it("throws when the env pair maps to no catalog entry", () => {
		vi.stubEnv("DATAFORSEO_LOCATION_CODE", "9999");
		vi.stubEnv("DATAFORSEO_LANGUAGE_CODE", "zz");
		expect(() => resolveEffectiveMarket({ defaultMarketKey: null })).toThrow(/no catalog market/i);
	});
	it("throws when the explicit key is unknown", () => {
		expect(() => resolveEffectiveMarket({ defaultMarketKey: "zz-ZZ" })).toThrow(/unknown market/i);
	});
});
