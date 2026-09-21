/**
 * Web-layer entry points for a brand's evaluation market: which country and
 * language its AI evaluations run in.
 *
 * Everything the `createServerFn` chains below need — schemas, types, and
 * helpers — is defined in this one file rather than imported from a sibling
 * module. TanStack Start's server-fn compiler splits each `.validator()` /
 * `.handler()` chain into a separate client-side RPC stub and a server-side
 * implementation; that split only handles same-module references. Pointing
 * `.validator()` or a handler body at a binding imported from elsewhere
 * corrupts the generated client chunk (a syntax error at build time), even
 * for something as inert as a schema object or a side-effect-free helper.
 *
 * `requireBrandSession`/`requirePlatformPicksEditable`/`canEditPlatformPicks`
 * (from `@/lib/auth/helpers`) are used only inside `writeBrandMarket` and
 * `readBrandMarketState`, which are NOT exported: the compiler can prove
 * they're unreachable from the client bundle and prunes them (and their
 * `@/lib/auth/helpers` import, which pulls in the server-only
 * `getRequestHeaders`) from the client chunk. Exporting either — e.g. so a
 * test could call them directly, as an earlier version of this file did —
 * defeats that pruning and reintroduces server-only code into the client
 * bundle. `resolveBrandMarketState` has no such dependency, so it's exported
 * and unit-tested directly; the auth+db orchestration around it is exercised
 * through the route/component tests instead.
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
export const updateBrandMarketInput = z.object({ brandId: z.string(), marketKey: z.enum(marketKeys) });
const getBrandMarketStateInput = z.object({ brandId: z.string() });

export type BrandMarketState = {
	marketKey: string;
	editable: boolean;
	options: Market[];
};

export function resolveBrandMarketState(defaultMarketKey: string | null, editable: boolean): BrandMarketState {
	const marketKey = defaultMarketKey ?? resolveEffectiveMarket({ defaultMarketKey: null }).key;
	return { marketKey, editable, options: [...MARKET_CATALOG] };
}

/** Authorized write: sets a brand's evaluation market, rejecting demo/read-only deployments. */
async function writeBrandMarket(input: { brandId: string; marketKey: string }) {
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
	await requireBrandSession(input.brandId);

	const brand = await db.query.brands.findFirst({ where: eq(brands.id, input.brandId) });
	if (!brand) throw new Error("Brand not found");

	return resolveBrandMarketState(brand.defaultMarketKey, canEditPlatformPicks());
}

export const updateBrandMarketFn = createServerFn({ method: "POST" })
	.validator(updateBrandMarketInput)
	.handler(async ({ data }) => writeBrandMarket(data));

export const getBrandMarketStateFn = createServerFn({ method: "GET" })
	.validator(getBrandMarketStateInput)
	.handler(async ({ data }) => readBrandMarketState(data));
