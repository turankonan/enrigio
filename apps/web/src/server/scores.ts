/**
 * Server functions for the admin score breakdown. This file exports ONLY
 * createServerFn server functions (plus types): TanStack Start replaces them
 * with RPC stubs on the client only when nothing else in the module drags in
 * server-only dependencies. The computation lives in ./scores-core.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { isAdmin, requireAuthSession } from "@/lib/auth/helpers";
import { resolveTimezone } from "@/lib/timezone-utils";
import { computeAdminScoreRows } from "@/server/scores-core";

export type { AdminScoreRow } from "@/server/scores-core";

export const getAdminScoreBreakdownFn = createServerFn({ method: "GET" }).handler(async () => {
	const session = await requireAuthSession();
	if (!isAdmin(session)) throw new Error("Unauthorized: Admin access required");
	return computeAdminScoreRows(resolveTimezone("UTC"));
});
