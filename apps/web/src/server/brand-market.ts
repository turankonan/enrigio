/**
 * Web-layer entry points for a brand's evaluation market: which country and
 * language its AI evaluations run in. `updateBrandMarket`/`getBrandMarketState`
 * are the security and validation boundary for this feature — callers must
 * not bypass `requireBrandSession`/`requirePlatformPicksEditable` by writing
 * `brands.defaultMarketKey` directly. They're exported as plain functions
 * (mirroring `@/server/site-audit`) because `createServerFn`'s RPC wrapper
 * only resolves inside the TanStack Start request runtime, so it's this layer
 * — not the `Fn` wrappers below — that unit tests call directly.
 */
import { createServerFn } from "@tanstack/react-start";
import { MARKET_CATALOG, type Market } from "@workspace/config/markets";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { resolveEffectiveMarket } from "@workspace/lib/markets";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { canEditPlatformPicks, requireBrandSession, requirePlatformPicksEditable } from "@/lib/auth/helpers";

const marketKeys = MARKET_CATALOG.map((m) => m.key) as [string, ...string[]];

const updateBrandMarketInput = z.object({
	brandId: z.string(),
	marketKey: z.enum(marketKeys),
});

const getBrandMarketStateInput = z.object({ brandId: z.string() });

export type BrandMarketState = {
	marketKey: string;
	editable: boolean;
	options: Market[];
};

/** Authorized write: sets a brand's evaluation market, rejecting demo/read-only deployments. */
export async function updateBrandMarket(input: { brandId: string; marketKey: string }) {
	const { brandId, marketKey } = updateBrandMarketInput.parse(input);

	await requireBrandSession(brandId);
	requirePlatformPicksEditable();

	const [updated] = await db
		.update(brands)
		.set({ defaultMarketKey: marketKey, updatedAt: new Date() })
		.where(eq(brands.id, brandId))
		.returning({ id: brands.id, defaultMarketKey: brands.defaultMarketKey });
	if (!updated) throw new Error("Brand not found");

	return updated;
}

/** Authorized read: the brand's evaluation market (falling back to the deployment's effective market) and whether it can be changed here. */
export async function getBrandMarketState(input: { brandId: string }): Promise<BrandMarketState> {
	const { brandId } = getBrandMarketStateInput.parse(input);

	await requireBrandSession(brandId);

	const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
	if (!brand) throw new Error("Brand not found");

	const marketKey = brand.defaultMarketKey ?? resolveEffectiveMarket({ defaultMarketKey: null }).key;

	return {
		marketKey,
		editable: canEditPlatformPicks(),
		options: [...MARKET_CATALOG],
	};
}

export const updateBrandMarketFn = createServerFn({ method: "POST" })
	.validator(updateBrandMarketInput)
	.handler(async ({ data }) => updateBrandMarket(data));

export const getBrandMarketStateFn = createServerFn({ method: "GET" })
	.validator(getBrandMarketStateInput)
	.handler(async ({ data }) => getBrandMarketState(data));
