/** Plain functions with db access; server functions live in ./first-scan.ts. */
import { db } from "@workspace/lib/db/db";
import {
	brands,
	type FirstScanExpectedPair,
	firstScans,
	promptRuns,
	prompts,
	starterReports,
} from "@workspace/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getBoss } from "@/lib/boss-client";
import { getFirstScanFinishedPairs } from "@/lib/postgres-read";
import { expectedPairs, isBuyer, type SetupDraft } from "@/lib/setup-wizard";
import { insertCompetitors, insertPrompts } from "@/server/onboarding-core";

const ETA_MIN_SAMPLES = 5;
const PARTIAL_MIN_COVERAGE = 0.5;
const LATEST_LIMIT = 6;

export interface StartFirstScanInput {
	brandId: string;
	draft: SetupDraft;
}

export class AlreadyStartedError extends Error {
	constructor() {
		super("First scan already started");
		this.name = "AlreadyStartedError";
	}
}

export async function startFirstScan(input: StartFirstScanInput): Promise<{ firstScanId: string }> {
	const { brandId, draft } = input;
	const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
	if (!brand) throw new Error("Brand not found");
	if (brand.onboarded) throw new AlreadyStartedError();
	const websiteHost = new URL(brand.website).hostname.replace(/^www\./, "");

	const firstScanId = await db.transaction(async (tx) => {
		// The guarded update takes the brand's row lock: a concurrent start
		// blocks here, then sees onboarded = true and gets zero rows. Doing it
		// first costs nothing — the transaction is atomic either way — and the
		// unique first_scans.brand_id index is the second line of defence.
		const claimed = await tx
			.update(brands)
			.set({ onboarded: true, updatedAt: new Date() })
			.where(and(eq(brands.id, brandId), eq(brands.onboarded, false)))
			.returning({ id: brands.id });
		if (claimed.length === 0) throw new AlreadyStartedError();

		await insertCompetitors({
			brandId,
			websiteHost,
			source: draft.rivals
				.filter((r) => r.selected)
				.map((r) => ({ name: r.name, domains: r.site ? [r.site] : [], aliases: [] })),
			conn: tx,
		});
		const promptIds = await insertPrompts({
			brandId,
			brandName: draft.profile.name,
			website: brand.website,
			source: draft.questions
				.filter((q) => q.selected || !isBuyer(q))
				.map((q) => ({ value: q.text, tags: [], enabled: true, intent: q.intent })),
			dedupeAgainstExisting: true,
			conn: tx,
			organizationId: brand.organizationId,
		});
		const [scan] = await tx
			.insert(firstScans)
			.values({
				brandId,
				expected: expectedPairs(
					promptIds.map((id) => ({ id })),
					draft.engines,
				),
			})
			.returning({ id: firstScans.id });
		await tx
			.update(brands)
			.set({
				name: draft.profile.name,
				sector: draft.profile.sector || null,
				location: draft.profile.location || null,
				defaultMarketKey: draft.profile.marketKey ?? brand.defaultMarketKey,
				aliases: draft.profile.aliases,
				additionalDomains: draft.profile.additionalDomains,
				enabledModels: draft.engines,
				setupDraft: null,
			})
			.where(eq(brands.id, brandId));
		return scan!.id;
	});

	// After commit, so a failed enqueue never leaves a half-written brand; the
	// status poll retries while enqueuedAt is null.
	await enqueueFirstScanJobs(firstScanId).catch((err) => console.error("first scan enqueue failed", err));
	return { firstScanId };
}

export async function enqueueFirstScanJobs(firstScanId: string): Promise<void> {
	const scan = await db.query.firstScans.findFirst({ where: eq(firstScans.id, firstScanId) });
	if (!scan || scan.enqueuedAt) return;
	const boss = await getBoss();
	const promptIds = [...new Set(scan.expected.map((p) => p.promptId))];
	for (const promptId of promptIds) {
		await boss.send(
			"process-prompt",
			{ promptId, firstScanId },
			{ singletonKey: `first-scan-${promptId}`, singletonSeconds: 60 * 60, retryLimit: 0, expireInSeconds: 60 * 90 },
		);
	}
	await db.update(firstScans).set({ enqueuedAt: new Date() }).where(eq(firstScans.id, firstScanId));
}

export interface FirstScanLatest {
	promptValue: string;
	model: string;
	mentioned: boolean;
	brandRank: number | null;
	competitorsMentioned: string[];
	createdAt: string;
}

export interface FirstScanStatus {
	firstScanId: string;
	status: "queued" | "running" | "complete" | "partial";
	expected: number;
	done: number;
	failed: number;
	mentioned: number;
	missing: number;
	topRival: { name: string; count: number } | null;
	latest: FirstScanLatest[];
	etaSeconds: number | null;
	/** Every expected pair has an outcome (success or failure). */
	settled: boolean;
	canOpenPartial: boolean;
	reportReady: boolean;
}

const pairKey = (p: { promptId: string; model: string }) => `${p.promptId}:${p.model}`;

export function computeStatus(args: {
	expected: FirstScanExpectedPair[];
	finished: { promptId: string; model: string; failed: boolean }[];
	startedAt: Date;
	now: Date;
}): Pick<FirstScanStatus, "done" | "failed" | "missing" | "etaSeconds" | "canOpenPartial" | "settled"> {
	const wanted = new Set(args.expected.map(pairKey));
	const seen = new Map<string, boolean>();
	for (const f of args.finished) {
		const k = pairKey(f);
		if (!wanted.has(k)) continue;
		// A success beats an earlier failure for the same pair (retry).
		seen.set(k, (seen.get(k) ?? true) && f.failed);
	}
	const finishedCount = seen.size;
	const failed = [...seen.values()].filter(Boolean).length;
	const done = finishedCount - failed;
	const missing = wanted.size - finishedCount;
	const elapsed = (args.now.getTime() - args.startedAt.getTime()) / 1000;
	const etaSeconds = finishedCount >= ETA_MIN_SAMPLES ? Math.round((elapsed / finishedCount) * missing) : null;
	return {
		done,
		failed,
		missing,
		etaSeconds,
		settled: missing === 0,
		canOpenPartial: wanted.size > 0 && done / wanted.size >= PARTIAL_MIN_COVERAGE,
	};
}

export async function getFirstScanStatus(firstScanId: string): Promise<FirstScanStatus> {
	const scan = await db.query.firstScans.findFirst({ where: eq(firstScans.id, firstScanId) });
	if (!scan) throw new Error("First scan not found");
	if (!scan.enqueuedAt) await enqueueFirstScanJobs(firstScanId).catch(() => {});

	const finished = await getFirstScanFinishedPairs(firstScanId);
	const counts = computeStatus({
		expected: scan.expected,
		finished: finished.map((f) => ({ promptId: f.prompt_id, model: f.model, failed: f.failed })),
		startedAt: scan.startedAt,
		now: new Date(),
	});

	let status = scan.status;
	if (counts.settled && counts.failed === 0 && (status === "queued" || status === "running")) {
		status = "complete";
		await db.update(firstScans).set({ status, completedAt: new Date() }).where(eq(firstScans.id, firstScanId));
	}

	const runs = await db
		.select({
			promptValue: prompts.value,
			model: promptRuns.model,
			mentioned: promptRuns.brandMentioned,
			brandRank: promptRuns.brandRank,
			competitorsMentioned: promptRuns.competitorsMentioned,
			createdAt: promptRuns.createdAt,
		})
		.from(promptRuns)
		.innerJoin(prompts, eq(prompts.id, promptRuns.promptId))
		.where(eq(promptRuns.firstScanId, firstScanId))
		.orderBy(desc(promptRuns.createdAt));

	const rivalCounts = new Map<string, number>();
	for (const r of runs) for (const c of r.competitorsMentioned) rivalCounts.set(c, (rivalCounts.get(c) ?? 0) + 1);
	const top = [...rivalCounts.entries()].sort((a, b) => b[1] - a[1])[0];
	const report = await db.query.starterReports.findFirst({ where: eq(starterReports.firstScanId, firstScanId) });

	return {
		firstScanId,
		status,
		expected: scan.expected.length,
		...counts,
		mentioned: runs.filter((r) => r.mentioned).length,
		topRival: top ? { name: top[0], count: top[1] } : null,
		latest: runs.slice(0, LATEST_LIMIT).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
		reportReady: status === "complete" || status === "partial" || !!report,
	};
}

/** Re-sends every prompt that still has a failed or missing pair. A finished scan (complete or partial) is frozen. */
export async function retryFirstScan(firstScanId: string): Promise<void> {
	const scan = await db.query.firstScans.findFirst({ where: eq(firstScans.id, firstScanId) });
	if (!scan) throw new Error("First scan not found");
	if (scan.status === "complete" || scan.status === "partial") return;
	const succeeded = new Set(
		(await getFirstScanFinishedPairs(firstScanId))
			.filter((f) => !f.failed)
			.map((f) => pairKey({ promptId: f.prompt_id, model: f.model })),
	);
	const promptIds = [...new Set(scan.expected.filter((p) => !succeeded.has(pairKey(p))).map((p) => p.promptId))];
	if (promptIds.length === 0) return;
	const boss = await getBoss();
	for (const promptId of promptIds) {
		await boss.send(
			"process-prompt",
			{ promptId, firstScanId },
			{ singletonKey: `first-scan-${promptId}`, singletonSeconds: 60 * 5, retryLimit: 0, expireInSeconds: 60 * 90 },
		);
	}
	await db
		.update(firstScans)
		.set({ status: "running" })
		.where(and(eq(firstScans.id, firstScanId), inArray(firstScans.status, ["queued", "running"])));
}

export async function openPartialFirstScan(firstScanId: string): Promise<void> {
	const status = await getFirstScanStatus(firstScanId);
	if (status.status === "complete" || status.status === "partial") return;
	if (!status.canOpenPartial) throw new Error("Not enough answers yet");
	await db.update(firstScans).set({ status: "partial", completedAt: new Date() }).where(eq(firstScans.id, firstScanId));
}
