/** Plain functions with db access; server functions live in ./first-scan.ts. */
import { MARKET_CATALOG } from "@workspace/config/markets";
import { getDefaultDelayHours, getRunsPerPrompt } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import {
	brands,
	type FirstScanExpectedPair,
	firstScans,
	promptRuns,
	prompts,
	starterReports,
} from "@workspace/lib/db/schema";
import { getOrgEntitlements } from "@workspace/lib/entitlements";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getBoss } from "@/lib/boss-client";
import { dedupeAliases, dedupeDomains } from "@/lib/domain-categories";
import { getFirstScanFinishedPairs } from "@/lib/postgres-read";
import { expectedPairs, isBuyer, type SetupDraft } from "@/lib/setup-wizard";
import { insertCompetitors, insertPrompts } from "@/server/onboarding-core";

const ETA_MIN_SAMPLES = 5;
const PARTIAL_MIN_COVERAGE = 0.5;
const LATEST_LIMIT = 6;
// No answer for this long with pairs still missing: the user is offered a retry or the partial report.
const STALL_MS = 3 * 60 * 1000;

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
		if (promptIds.length === 0) throw new Error("No questions to scan");
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
				sector: draft.profile.sector?.trim() || null,
				location: draft.profile.location?.trim() || null,
				defaultMarketKey: MARKET_CATALOG.some((m) => m.key === draft.profile.marketKey)
					? draft.profile.marketKey
					: brand.defaultMarketKey,
				aliases: dedupeAliases(draft.profile.aliases),
				additionalDomains: dedupeDomains(draft.profile.additionalDomains).filter((d) => d !== websiteHost),
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
		const jobId = await boss.send(
			"process-prompt",
			{ promptId, firstScanId },
			// The heartbeat fails a job a dead or sleeping worker holds within minutes, not at the 90-minute expiry.
			{
				singletonKey: `first-scan-${promptId}`,
				singletonSeconds: 60 * 60,
				retryLimit: 0,
				expireInSeconds: 60 * 90,
				heartbeatSeconds: 60,
			},
		);
		// null means a job for this prompt already holds the singleton slot.
		if (jobId === null) console.info("first scan job already queued", { firstScanId, promptId });
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
	/** Pairs are missing and nothing has finished for a while, counted from the start when nothing has finished yet. */
	stalled: boolean;
	canOpenPartial: boolean;
	reportReady: boolean;
}

const pairKey = (p: { promptId: string; model: string }) => `${p.promptId}:${p.model}`;

/** A retried pair can hold more than one answer; only its newest one counts. */
export function latestPerPair<T extends { promptId: string; model: string; createdAt: Date }>(runs: T[]): T[] {
	const latest = new Map<string, T>();
	for (const r of runs) {
		const k = pairKey(r);
		const held = latest.get(k);
		if (!held || r.createdAt > held.createdAt) latest.set(k, r);
	}
	return [...latest.values()];
}

export function computeStatus(args: {
	expected: FirstScanExpectedPair[];
	finished: { promptId: string; model: string; failed: boolean; finishedAt: Date }[];
	startedAt: Date;
	now: Date;
}): Pick<FirstScanStatus, "done" | "failed" | "missing" | "etaSeconds" | "canOpenPartial" | "settled" | "stalled"> {
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
	const lastProgressAt = Math.max(args.startedAt.getTime(), ...args.finished.map((f) => f.finishedAt.getTime()));
	return {
		done,
		failed,
		missing,
		etaSeconds,
		settled: missing === 0,
		stalled: missing > 0 && args.now.getTime() - lastProgressAt > STALL_MS,
		canOpenPartial: wanted.size > 0 && done / wanted.size >= PARTIAL_MIN_COVERAGE,
	};
}

export async function getFirstScanStatus(firstScanId: string): Promise<FirstScanStatus> {
	const scan = await db.query.firstScans.findFirst({ where: eq(firstScans.id, firstScanId) });
	if (!scan) throw new Error("First scan not found");
	if (!scan.enqueuedAt)
		await enqueueFirstScanJobs(firstScanId).catch((err) => console.error("first scan enqueue retry failed", err));

	const finished = await getFirstScanFinishedPairs(firstScanId);
	const counts = computeStatus({
		expected: scan.expected,
		finished: finished.map((f) => ({
			promptId: f.prompt_id,
			model: f.model,
			failed: f.failed,
			finishedAt: new Date(f.finished_at),
		})),
		startedAt: scan.startedAt,
		now: new Date(),
	});

	let status = scan.status;
	if (counts.settled && counts.failed === 0 && (status === "queued" || status === "running")) {
		status = "complete";
		await db
			.update(firstScans)
			.set({ status, completedAt: new Date() })
			.where(and(eq(firstScans.id, firstScanId), inArray(firstScans.status, ["queued", "running"])));
	}

	const runs = await db
		.select({
			promptId: promptRuns.promptId,
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

	const answers = latestPerPair(runs);
	const rivalCounts = new Map<string, number>();
	for (const r of answers) for (const c of r.competitorsMentioned) rivalCounts.set(c, (rivalCounts.get(c) ?? 0) + 1);
	const top = [...rivalCounts.entries()].sort((a, b) => b[1] - a[1])[0];
	const report = await db.query.starterReports.findFirst({ where: eq(starterReports.firstScanId, firstScanId) });

	return {
		firstScanId,
		status,
		expected: scan.expected.length,
		...counts,
		mentioned: answers.filter((r) => r.mentioned).length,
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
	// In-flight work is never duplicated, so a retry is idempotent against
	// double-clicks and spam: only prompts with a failed or missing pair and no
	// queued or running job are re-sent.
	const inFlightRows = await db.execute(sql`
		SELECT data->>'promptId' AS prompt_id
		FROM pgboss.job
		WHERE name = 'process-prompt' AND state IN ('created', 'active') AND data->>'firstScanId' = ${firstScanId}
	`);
	const inFlight = new Set((inFlightRows.rows as { prompt_id: string }[]).map((r) => r.prompt_id));
	const promptIds = [
		...new Set(
			scan.expected.filter((p) => !succeeded.has(pairKey(p)) && !inFlight.has(p.promptId)).map((p) => p.promptId),
		),
	];
	if (promptIds.length === 0) return;
	const boss = await getBoss();
	let sent = 0;
	for (const promptId of promptIds) {
		// A fresh key per retry: pg-boss singleton slots are epoch-aligned and finished jobs still hold them.
		const jobId = await boss.send(
			"process-prompt",
			{ promptId, firstScanId },
			{
				singletonKey: `first-scan-${promptId}-retry-${Date.now()}`,
				retryLimit: 0,
				expireInSeconds: 60 * 90,
				heartbeatSeconds: 60,
			},
		);
		if (jobId === null) console.warn("first scan retry job was not sent", { firstScanId, promptId });
		else sent++;
	}
	if (sent === 0) return;
	await db
		.update(firstScans)
		.set({ status: "running" })
		.where(and(eq(firstScans.id, firstScanId), inArray(firstScans.status, ["queued", "running"])));
}

/**
 * Answers per prompt per engine per day once tracking runs, for the setup estimate. Mirrors the run policy:
 * unmetered deployments run RUNS_PER_PROMPT times per firing at the brand cadence, plans at their own rate
 * and replication, with an override that can only slow them down.
 */
export async function getSetupDefaults(brandId: string): Promise<{ runsPerDay: number }> {
	const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
	if (!brand) throw new Error("Brand not found");
	const entitlements = await getOrgEntitlements(brand.organizationId);
	if (entitlements.unlimited) {
		const delayHours = brand.delayOverrideHours ?? getDefaultDelayHours();
		return { runsPerDay: (getRunsPerPrompt() * 24) / Math.max(1, delayHours) };
	}
	const planHours = 24 / Math.max(1, entitlements.standardRunsPerDay ?? 1);
	const hours = Math.max(brand.delayOverrideHours ?? planHours, planHours);
	return { runsPerDay: ((entitlements.replication ?? 1) * 24) / hours };
}

export async function openPartialFirstScan(firstScanId: string): Promise<void> {
	const status = await getFirstScanStatus(firstScanId);
	if (status.status === "complete" || status.status === "partial") return;
	if (!status.canOpenPartial) throw new Error("Not enough answers yet");
	await db
		.update(firstScans)
		.set({ status: "partial", completedAt: new Date() })
		.where(and(eq(firstScans.id, firstScanId), inArray(firstScans.status, ["queued", "running"])));
}
