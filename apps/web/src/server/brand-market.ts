/**
 * Web-layer entry points for a brand's evaluation market: which country and
 * language its AI evaluations run in.
 *
 * `resolveBrandMarketState` is the only export the client route chunk can
 * actually reach (via `updateBrandMarketInput`/`BrandMarketState` it's types
 * only, erased at build time). It must stay free of every server-only
 * import: `db`, `drizzle-orm`, `@/lib/auth/helpers`, and — less obviously —
 * `@workspace/lib/markets`, whose `resolveEffectiveMarket` reaches into
 * `providers/registry/dataforseo-shared` for the deployment's location/
 * language env, which in turn loads the `dataforseo-client` SDK and the
 * DB-backed secrets store. A static top-level import of any of these here
 * makes them reachable from the client bundle through this function, and
 * TanStack Start's server-fn compiler has no way to prune an import used by
 * an exported, non-`createServerFn` binding — unlike `writeBrandMarket`/
 * `readBrandMarketState` below, which aren't exported and so get pruned
 * from the client chunk once nothing reachable from it needs them.
 *
 * So every server-only dependency is imported with a dynamic `await
 * import(...)` inside the two handler bodies instead of at module scope,
 * and the fallback market key that would otherwise come from
 * `resolveEffectiveMarket` is resolved there and passed in, keeping
 * `resolveBrandMarketState` itself import-free.
 */
import { createServerFn } from "@tanstack/react-start";
import { MARKET_CATALOG, type Market } from "@workspace/config/markets";
import { z } from "zod";

const marketKeys = MARKET_CATALOG.map((m) => m.key) as [string, ...string[]];
export const updateBrandMarketInput = z.object({ brandId: z.string(), marketKey: z.enum(marketKeys) });
const getBrandMarketStateInput = z.object({ brandId: z.string() });

export type BrandMarketState = {
	marketKey: string;
	editable: boolean;
	options: Market[];
};

/** Pure state-shape assembly: falls back to `fallbackMarketKey` only when the
 *  brand has no `defaultMarketKey` stored. The caller resolves that fallback
 *  (the deployment's effective market) since doing it here would require a
 *  server-only import — see the module comment above. */
export function resolveBrandMarketState(
	defaultMarketKey: string | null,
	editable: boolean,
	fallbackMarketKey: string,
): BrandMarketState {
	return { marketKey: defaultMarketKey ?? fallbackMarketKey, editable, options: [...MARKET_CATALOG] };
}

/** Authorized write: sets a brand's evaluation market, rejecting demo/read-only deployments. */
async function writeBrandMarket(input: { brandId: string; marketKey: string }) {
	const { requireBrandSession, requirePlatformPicksEditable } = await import("@/lib/auth/helpers");
	const { db } = await import("@workspace/lib/db/db");
	const { brands } = await import("@workspace/lib/db/schema");
	const { eq } = await import("drizzle-orm");

	await requireBrandSession(input.brandId);
	requirePlatformPicksEditable();

	const [updated] = await db
		.update(brands)
		.set({ defaultMarketKey: input.marketKey, updatedAt: new Date() })
		.where(eq(brands.id, input.brandId))
		.returning({ id: brands.id, defaultMarketKey: brands.defaultMarketKey });
	if (!updated) throw new Error("Brand not found");

	return updated;
}

/** Authorized read: the brand's evaluation market and whether it can be changed here. */
async function readBrandMarketState(input: { brandId: string }): Promise<BrandMarketState> {
	const { requireBrandSession, canEditPlatformPicks } = await import("@/lib/auth/helpers");
	const { db } = await import("@workspace/lib/db/db");
	const { brands } = await import("@workspace/lib/db/schema");
	const { eq } = await import("drizzle-orm");
	const { resolveEffectiveMarket } = await import("@workspace/lib/markets");

	await requireBrandSession(input.brandId);

	const brand = await db.query.brands.findFirst({ where: eq(brands.id, input.brandId) });
	if (!brand) throw new Error("Brand not found");

	const fallbackMarketKey = resolveEffectiveMarket({ defaultMarketKey: null }).key;
	return resolveBrandMarketState(brand.defaultMarketKey, canEditPlatformPicks(), fallbackMarketKey);
}

export const updateBrandMarketFn = createServerFn({ method: "POST" })
	.validator(updateBrandMarketInput)
	.handler(async ({ data }) => writeBrandMarket(data));

export const getBrandMarketStateFn = createServerFn({ method: "GET" })
	.validator(getBrandMarketStateInput)
	.handler(async ({ data }) => readBrandMarketState(data));
