/** Server functions only; logic lives in ./first-scan-core.ts (see onboarding.ts for why). */
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { brands, firstScans, PROMPT_INTENTS } from "@workspace/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { MAX_BUYER, MAX_RIVALS } from "@/lib/setup-wizard";
import {
	AlreadyStartedError,
	getFirstScanStatus,
	getSetupDefaults,
	openPartialFirstScan,
	retryFirstScan,
	startFirstScan,
} from "@/server/first-scan-core";

export type { FirstScanLatest, FirstScanStatus } from "@/server/first-scan-core";

const draftSchema = z.object({
	step: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
	profile: z.object({
		name: z.string().trim().min(1).max(120),
		sector: z.string().trim().max(120),
		location: z.string().trim().max(120),
		marketKey: z.string().nullable(),
		aliases: z.array(z.string().trim().max(120)).max(20),
		additionalDomains: z.array(z.string().trim().max(253)).max(20),
	}),
	questions: z
		.array(
			z.object({
				text: z.string().trim().min(1).max(300),
				intent: z.enum(PROMPT_INTENTS).nullable(),
				selected: z.boolean(),
				custom: z.boolean(),
			}),
		)
		.max(MAX_BUYER + 20),
	rivals: z
		.array(
			z.object({
				name: z.string().trim().min(1).max(120),
				site: z.string().trim().max(253),
				selected: z.boolean(),
				custom: z.boolean(),
			}),
		)
		.max(MAX_RIVALS + 20),
	engines: z.array(z.string()).min(1).max(8),
});

// Saving captures work in progress, so a blank brand name or no engines yet must not
// be rejected (that would silently drop the user's edits); only starting a scan is strict.
const draftSaveSchema = draftSchema.extend({
	profile: draftSchema.shape.profile.extend({ name: z.string().trim().max(120) }),
	engines: z.array(z.string()).max(8),
});

const scanRef = z.object({ brandId: z.string(), firstScanId: z.string().uuid() });

async function requireScan(brandId: string, firstScanId: string) {
	await requireBrandSession(brandId);
	const scan = await db.query.firstScans.findFirst({ where: eq(firstScans.id, firstScanId) });
	if (!scan || scan.brandId !== brandId) throw new Error("First scan not found");
}

export const saveSetupDraftFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), draft: draftSaveSchema }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		// A save that lands after the first scan started must not resurrect the draft that scan cleared.
		await db
			.update(brands)
			.set({ setupDraft: data.draft })
			.where(and(eq(brands.id, data.brandId), eq(brands.onboarded, false)));
		return { ok: true as const };
	});

export const startFirstScanFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), draft: draftSchema }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		try {
			return await startFirstScan({ brandId: data.brandId, draft: data.draft });
		} catch (err) {
			// A double click or a second tab: hand back the scan that exists.
			if (err instanceof AlreadyStartedError) {
				const scan = await db.query.firstScans.findFirst({ where: eq(firstScans.brandId, data.brandId) });
				if (scan) return { firstScanId: scan.id };
			}
			throw err;
		}
	});

export const getFirstScanStatusFn = createServerFn({ method: "POST" })
	.validator(scanRef)
	.handler(async ({ data }) => {
		await requireScan(data.brandId, data.firstScanId);
		return getFirstScanStatus(data.firstScanId);
	});

export const retryFirstScanFn = createServerFn({ method: "POST" })
	.validator(scanRef)
	.handler(async ({ data }) => {
		await requireScan(data.brandId, data.firstScanId);
		await retryFirstScan(data.firstScanId);
		return { ok: true as const };
	});

export const openPartialFirstScanFn = createServerFn({ method: "POST" })
	.validator(scanRef)
	.handler(async ({ data }) => {
		await requireScan(data.brandId, data.firstScanId);
		await openPartialFirstScan(data.firstScanId);
		return { ok: true as const };
	});

export const getLatestFirstScanFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const scan = await db.query.firstScans.findFirst({ where: eq(firstScans.brandId, data.brandId) });
		return scan ? { firstScanId: scan.id, status: scan.status } : null;
	});

export const getSetupDefaultsFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return getSetupDefaults(data.brandId);
	});
