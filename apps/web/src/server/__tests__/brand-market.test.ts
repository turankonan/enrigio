import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	requireBrandSession,
	requirePlatformPicksEditable,
	canEditPlatformPicks,
	resolveEffectiveMarket,
	dbUpdateSet,
	dbUpdateWhere,
	updateReturning,
	findFirst,
} = vi.hoisted(() => ({
	requireBrandSession: vi.fn(),
	requirePlatformPicksEditable: vi.fn(),
	canEditPlatformPicks: vi.fn(),
	resolveEffectiveMarket: vi.fn(),
	dbUpdateSet: vi.fn(),
	dbUpdateWhere: vi.fn(),
	updateReturning: vi.fn(),
	findFirst: vi.fn(),
}));

vi.mock("@/lib/auth/helpers", () => ({
	requireBrandSession,
	requirePlatformPicksEditable,
	canEditPlatformPicks,
}));

vi.mock("@workspace/lib/markets", () => ({ resolveEffectiveMarket }));

vi.mock("@workspace/lib/db/db", () => ({
	db: {
		update: (table: unknown) => ({
			set: (values: unknown) => {
				dbUpdateSet(table, values);
				return {
					where: (cond: unknown) => {
						dbUpdateWhere(cond);
						return { returning: (shape: unknown) => updateReturning(shape) };
					},
				};
			},
		}),
		query: { brands: { findFirst: (args: unknown) => findFirst(args) } },
	},
}));

// `updateBrandMarketFn`/`getBrandMarketStateFn` wrap these in `createServerFn`,
// whose RPC boundary only resolves inside the TanStack Start request runtime
// (it throws "No Start context found" outside an actual server request/SSR
// pass). `updateBrandMarket`/`getBrandMarketState` are the plain, exported
// auth+validation+write core — the same split `@/server/site-audit` uses — so
// that's what these tests call directly.
const { getBrandMarketState, updateBrandMarket } = await import("@/server/brand-market");

const BRAND_ID = "brand-1";

describe("brand-market web layer", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		requireBrandSession.mockResolvedValue({ user: { id: "u1" } });
		requirePlatformPicksEditable.mockImplementation(() => {});
		canEditPlatformPicks.mockReturnValue(true);
		updateReturning.mockResolvedValue([{ id: BRAND_ID, defaultMarketKey: "de-DE" }]);
		findFirst.mockResolvedValue({ id: BRAND_ID, defaultMarketKey: null });
		resolveEffectiveMarket.mockReturnValue({
			key: "en-US",
			countryCode: "US",
			languageCode: "en",
			locationCode: 2840,
		});
	});

	describe("updateBrandMarket", () => {
		it("rejects a key not in MARKET_CATALOG", async () => {
			await expect(updateBrandMarket({ brandId: BRAND_ID, marketKey: "xx-XX" })).rejects.toThrow();
			expect(requireBrandSession).not.toHaveBeenCalled();
			expect(dbUpdateSet).not.toHaveBeenCalled();
		});

		it("writes brands.default_market_key when the deployment allows editing", async () => {
			const result = await updateBrandMarket({ brandId: BRAND_ID, marketKey: "de-DE" });

			expect(requireBrandSession).toHaveBeenCalledWith(BRAND_ID);
			expect(requirePlatformPicksEditable).toHaveBeenCalled();
			expect(dbUpdateSet).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ defaultMarketKey: "de-DE" }),
			);
			expect(result).toEqual({ id: BRAND_ID, defaultMarketKey: "de-DE" });
		});

		it("throws when platform picks are not editable (demo/read-only)", async () => {
			requirePlatformPicksEditable.mockImplementation(() => {
				throw new Error("Platform picks are set by whoever runs this deployment.");
			});

			await expect(updateBrandMarket({ brandId: BRAND_ID, marketKey: "de-DE" })).rejects.toThrow(
				/set by whoever runs this deployment/,
			);
			expect(dbUpdateSet).not.toHaveBeenCalled();
		});

		it("checks brand access before writing anything", async () => {
			requireBrandSession.mockRejectedValue(new Error("Forbidden"));

			await expect(updateBrandMarket({ brandId: BRAND_ID, marketKey: "de-DE" })).rejects.toThrow("Forbidden");
			expect(requirePlatformPicksEditable).not.toHaveBeenCalled();
			expect(dbUpdateSet).not.toHaveBeenCalled();
		});
	});

	describe("getBrandMarketState", () => {
		it("returns editable=false in a read-only deployment", async () => {
			canEditPlatformPicks.mockReturnValue(false);

			const result = await getBrandMarketState({ brandId: BRAND_ID });

			expect(result.editable).toBe(false);
		});

		it("falls back to the deployment's effective market when the brand has none set", async () => {
			findFirst.mockResolvedValue({ id: BRAND_ID, defaultMarketKey: null });

			const result = await getBrandMarketState({ brandId: BRAND_ID });

			expect(resolveEffectiveMarket).toHaveBeenCalledWith({ defaultMarketKey: null });
			expect(result.marketKey).toBe("en-US");
		});

		it("uses the brand's stored market key when set", async () => {
			findFirst.mockResolvedValue({ id: BRAND_ID, defaultMarketKey: "tr-TR" });

			const result = await getBrandMarketState({ brandId: BRAND_ID });

			expect(result.marketKey).toBe("tr-TR");
		});

		it("returns every catalog market as an option", async () => {
			const result = await getBrandMarketState({ brandId: BRAND_ID });

			expect(result.options.map((m) => m.key)).toEqual(["tr-TR", "de-DE", "en-GB", "en-US"]);
		});
	});
});
