import { describe, expect, it, vi } from "vitest";

const { resolveEffectiveMarket } = vi.hoisted(() => ({
	resolveEffectiveMarket: vi.fn(),
}));

vi.mock("@workspace/lib/markets", () => ({ resolveEffectiveMarket }));

// `@/server/brand-market` top-level-imports `@/lib/auth/helpers` for the
// `writeBrandMarket`/`readBrandMarketState` handlers (see the comment below);
// the real module eagerly builds a Better Auth instance that requires
// `APP_URL`, which isn't set in the test env. Stub it so importing the module
// under test doesn't blow up — nothing here exercises these directly.
vi.mock("@/lib/auth/helpers", () => ({
	canEditPlatformPicks: vi.fn(),
	requireBrandSession: vi.fn(),
	requirePlatformPicksEditable: vi.fn(),
}));

vi.mock("@workspace/lib/db/db", () => ({ db: {} }));

// `updateBrandMarketFn`/`getBrandMarketStateFn` (in `@/server/brand-market`)
// wrap the auth+db orchestration in `createServerFn`, whose RPC boundary only
// resolves inside the TanStack Start request runtime (it throws "No Start
// context found" outside an actual server request/SSR pass), and the
// orchestration itself (`writeBrandMarket`/`readBrandMarketState`) is
// deliberately NOT exported: TanStack Start's server-fn compiler can only
// prune a same-module helper — and their `@/lib/auth/helpers` import (the
// server-only `getRequestHeaders`) — out of the client bundle when nothing
// exported reaches it. So what's left to unit test directly is the pure,
// side-effect-free surface: `resolveBrandMarketState` (the state-shape
// assembly) and `updateBrandMarketInput` (the catalog validation). The
// auth+db orchestration is exercised through the route/component tests.
const { resolveBrandMarketState, updateBrandMarketInput } = await import("@/server/brand-market");

describe("resolveBrandMarketState", () => {
	it("uses the brand's stored market key when set", () => {
		const result = resolveBrandMarketState("tr-TR", true);

		expect(result.marketKey).toBe("tr-TR");
		expect(resolveEffectiveMarket).not.toHaveBeenCalled();
	});

	it("falls back to the deployment's effective market when the brand has none set", () => {
		resolveEffectiveMarket.mockReturnValue({
			key: "en-US",
			countryCode: "US",
			languageCode: "en",
			locationCode: 2840,
		});

		const result = resolveBrandMarketState(null, true);

		expect(resolveEffectiveMarket).toHaveBeenCalledWith({ defaultMarketKey: null });
		expect(result.marketKey).toBe("en-US");
	});

	it("passes the editable flag through unchanged", () => {
		expect(resolveBrandMarketState("tr-TR", false).editable).toBe(false);
		expect(resolveBrandMarketState("tr-TR", true).editable).toBe(true);
	});

	it("returns every catalog market as an option", () => {
		const result = resolveBrandMarketState("tr-TR", true);

		expect(result.options.map((m) => m.key)).toEqual(["tr-TR", "en-TR", "de-DE", "en-GB", "en-US"]);
	});

	it("does not throw when the effective market is unresolvable, and surfaces the global sentinel", () => {
		resolveEffectiveMarket.mockReturnValue({
			key: "global",
			countryCode: "",
			languageCode: "en",
			locationCode: 9999,
		});

		const result = resolveBrandMarketState(null, true);

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
