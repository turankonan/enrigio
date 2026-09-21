import { describe, expect, it } from "vitest";
import { resolveBrandMarketState, updateBrandMarketInput } from "@/server/brand-market";

// `resolveBrandMarketState` is the only binding in `@/server/brand-market`
// the client bundle can reach, and it's built to have zero imports (see the
// comment in that file): no auth, db, or markets mocking is needed to import
// or exercise it directly. The auth+db orchestration around it
// (`writeBrandMarket`/`readBrandMarketState`) is deliberately NOT exported —
// TanStack Start's server-fn compiler can only prune those (and the
// server-only imports they lazily pull in) from the client chunk when
// nothing exported reaches them — so that orchestration is exercised
// through the route/component tests instead.

describe("resolveBrandMarketState", () => {
	it("uses the brand's stored market key when set", () => {
		const result = resolveBrandMarketState("tr-TR", true, "en-US");

		expect(result.marketKey).toBe("tr-TR");
	});

	it("falls back to the given fallback market key when the brand has none set", () => {
		const result = resolveBrandMarketState(null, true, "en-US");

		expect(result.marketKey).toBe("en-US");
	});

	it("passes the editable flag through unchanged", () => {
		expect(resolveBrandMarketState("tr-TR", false, "en-US").editable).toBe(false);
		expect(resolveBrandMarketState("tr-TR", true, "en-US").editable).toBe(true);
	});

	it("returns every catalog market as an option", () => {
		const result = resolveBrandMarketState("tr-TR", true, "en-US");

		expect(result.options.map((m) => m.key)).toEqual(["tr-TR", "en-TR", "de-DE", "en-GB", "en-US"]);
	});

	it("passes through an unresolvable fallback, e.g. the global sentinel, unchanged", () => {
		const result = resolveBrandMarketState(null, true, "global");

		expect(result.marketKey).toBe("global");
	});
});

describe("updateBrandMarketInput", () => {
	it("accepts every market key in the catalog", () => {
		for (const marketKey of ["tr-TR", "de-DE", "en-GB", "en-US"]) {
			expect(() => updateBrandMarketInput.parse({ brandId: "brand-1", marketKey })).not.toThrow();
		}
	});

	it("rejects a key not in the catalog", () => {
		expect(() => updateBrandMarketInput.parse({ brandId: "brand-1", marketKey: "xx-XX" })).toThrow();
	});
});
