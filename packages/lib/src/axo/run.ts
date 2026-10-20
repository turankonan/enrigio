/**
 * `runSiteAudit`: the AXO site-audit orchestrator. Composes every prior unit
 * (page selection, robots/sitemap discovery, SSRF-safe fetch, HTML checklist,
 * LLM relevance scoring) into one crash-safe run and persists the result.
 *
 * Running-row lifecycle: a `running` row is inserted FIRST, before any
 * network or LLM call, so a crash mid-run always leaves a `failed` row behind
 * rather than a phantom `running` one — the Task 12 enqueue cooldown reads
 * this table and must never see a stuck `running` attempt outlive the run
 * that crashed. Everything after the insert is wrapped in try/catch: on any
 * unexpected throw the row is updated to `failed` with a `failureSummary`,
 * and the error is then RE-THROWN (mirroring the worker's `withSentry`
 * pattern) so the crash is still visible to error tracking — only the DB
 * state is guaranteed clean, not the promise's outcome.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../db/db";
import { brands, prompts, siteAudits, usageEvents } from "../db/schema";
import { extractDomain, hostMatchesAllowlist } from "../net/hostname";
import { safeFetch } from "../net/safe-fetch";
import { estimateRunCostUsd } from "../usage/cost";
import { fetchRobots, fetchSitemapUrls, type RobotsInfo } from "./fetchers";
import { checklistForPage, extractCleanText } from "./html";
import { evaluateRobots } from "./robots";
import { type ScoreResult, scorePageRelevance } from "./score";
import { selectAuditPages } from "./select-pages";
import {
	type AiBot,
	type AuditTarget,
	type BotPosture,
	SITE_AUDIT_SCHEMA_VERSION,
	type SiteAuditReport,
} from "./types";

const AI_BOTS: AiBot[] = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"];
const PAGE_SCORE_CONCURRENCY = 3;
const FALLBACK_PAGE_LIMIT = 10;
const FALLBACK_PROMPT_CAP = 8;

interface BrandRow {
	id: string;
	organizationId: string;
	name: string;
	website: string;
	additionalDomains: string[];
}

type PageReport = SiteAuditReport["pages"][number];

/**
 * The brand's owned hosts, apex AND "www." both listed for each — required
 * because `hostMatchesAllowlist` is an exact match and does not strip "www."
 * itself (see `net/hostname` docs).
 */
export function buildAllowHosts(website: string, additionalDomains: string[]): string[] {
	const hosts = new Set<string>();
	for (const raw of [website, ...additionalDomains]) {
		const apex = extractDomain(raw);
		if (!apex) continue;
		hosts.add(apex);
		hosts.add(`www.${apex}`);
	}
	return [...hosts];
}

function safeOrigin(url: string): string | null {
	try {
		return new URL(url).origin;
	} catch {
		return null;
	}
}

/** Every `AiBot`'s posture for `url`, per RFC-9309-subset evaluation of `robotsTxt` ("" = no groups = "unspecified"). */
function buildRobotsPosture(robotsTxt: string, url: string): Record<AiBot, BotPosture> {
	const posture = {} as Record<AiBot, BotPosture>;
	for (const bot of AI_BOTS) {
		posture[bot] = evaluateRobots(robotsTxt, url, bot);
	}
	return posture;
}

/**
 * A simple manual concurrency pool: `limit` workers pull the next item off a
 * shared cursor, so at most `limit` calls to `fn` are ever in flight at once
 * — no library, no firing every item at once and hoping a semaphore catches up.
 */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let nextIndex = 0;

	async function worker(): Promise<void> {
		for (;;) {
			const i = nextIndex++;
			if (i >= items.length) return;
			results[i] = await fn(items[i] as T);
		}
	}

	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
	return results;
}

/**
 * Billing-grade attribution for one score attempt, success or failure. Never
 * throws — attribution must not break the audit (mirrors
 * `process-prompt.ts`'s `recordUsageEvent`).
 */
async function recordScoreUsage(brand: BrandRow, result: ScoreResult): Promise<void> {
	try {
		const cost = estimateRunCostUsd(result.providerId, false);
		await db.insert(usageEvents).values({
			organizationId: brand.organizationId,
			brandId: brand.id,
			promptId: null,
			eventType: result.ok ? "site_audit_score" : "site_audit_score_failed",
			provider: result.providerId,
			model: result.model,
			webSearchEnabled: false,
			units: 1,
			estimatedCostUsd: cost === null ? null : cost.toFixed(6),
		});
	} catch (error) {
		console.error("Failed to record AXO usage event:", error);
	}
}

/**
 * Fetches, checklist-analyzes, robots-evaluates, and LLM-scores one target.
 * Robots posture is always computed (it's a property of the URL, independent
 * of whether the fetch itself succeeded); checklist/score fields are `null`
 * whenever the fetch didn't come back `"ok"`.
 */
async function auditOnePage(
	target: AuditTarget,
	brand: BrandRow,
	allowHosts: string[],
	robotsByOrigin: Map<string, RobotsInfo>,
): Promise<PageReport> {
	const origin = safeOrigin(target.url);
	const robotsTxt = (origin ? robotsByOrigin.get(origin)?.robotsTxt : null) ?? "";
	const robotsPosture = buildRobotsPosture(robotsTxt, target.url);

	const fetchResult = await safeFetch(target.url, { allowHosts, accept: "html" });
	const base = {
		requestedUrl: target.url,
		finalUrl: fetchResult.finalUrl,
		fetchStatus: fetchResult.status,
		relatedPrompts: target.relatedPrompts,
		robotsPosture,
	};

	if (fetchResult.status !== "ok" || !fetchResult.body) {
		return {
			...base,
			title: null,
			hasSchema: null,
			hasMetaDescription: null,
			headingStructure: null,
			relevanceScore: null,
			relevanceNote: null,
			scoreModel: null,
		};
	}

	const checklist = checklistForPage(fetchResult.body);
	const scoreResult = await scorePageRelevance({
		pageText: extractCleanText(fetchResult.body),
		brandName: brand.name,
		relatedPrompts: target.relatedPrompts,
	});
	await recordScoreUsage(brand, scoreResult);

	return {
		...base,
		title: checklist.title,
		hasSchema: checklist.hasSchema,
		hasMetaDescription: checklist.hasMetaDescription,
		headingStructure: checklist.headingStructure,
		relevanceScore: scoreResult.ok ? scoreResult.score : null,
		relevanceNote: scoreResult.ok ? scoreResult.note : null,
		scoreModel: scoreResult.ok ? scoreResult.model : null,
	};
}

/**
 * When citation-based selection finds nothing (a brand with no tracked
 * citations yet, or none to its own domains), fall back to the homepage plus
 * whatever `fetchSitemapUrls` discovers, capped at `FALLBACK_PAGE_LIMIT`
 * pages, each carrying the brand's own top enabled prompts (there's no
 * citation data to rank prompts by relevance per-page here).
 */
async function buildFallbackTargets(brand: BrandRow, allowHosts: string[]): Promise<AuditTarget[]> {
	const origin = safeOrigin(brand.website);
	const sitemapUrls = origin ? await fetchSitemapUrls(origin, allowHosts, { maxUrls: FALLBACK_PAGE_LIMIT - 1 }) : [];

	const urls = [brand.website, ...sitemapUrls.filter((url) => url !== brand.website)].slice(0, FALLBACK_PAGE_LIMIT);

	const promptRows = await db
		.select({ value: prompts.value })
		.from(prompts)
		.where(and(eq(prompts.brandId, brand.id), eq(prompts.enabled, true)))
		.limit(FALLBACK_PROMPT_CAP);
	const relatedPrompts = promptRows.map((r) => r.value);

	return urls.map((url) => ({ url, relatedPrompts }));
}

function emptyReport(now: Date, failureSummary?: string): SiteAuditReport {
	const nowIso = now.toISOString();
	return {
		window: { fromIso: nowIso, toIso: nowIso, citationCount: 0 },
		origins: [],
		pages: [],
		...(failureSummary ? { failureSummary } : {}),
	};
}

/**
 * Runs one full site audit for `brandId` and persists it. Returns the new
 * `site_audits` row id. See module docs for the running-row crash-safety
 * contract.
 */
export async function runSiteAudit(brandId: string): Promise<string> {
	const startedAt = new Date();
	const [inserted] = await db
		.insert(siteAudits)
		.values({
			brandId,
			status: "running",
			report: emptyReport(startedAt),
			schemaVersion: SITE_AUDIT_SCHEMA_VERSION,
			startedAt,
		})
		.returning({ id: siteAudits.id });
	const auditId = (inserted as { id: string }).id;

	try {
		const [brandRow] = await db
			.select({
				id: brands.id,
				organizationId: brands.organizationId,
				name: brands.name,
				website: brands.website,
				additionalDomains: brands.additionalDomains,
			})
			.from(brands)
			.where(eq(brands.id, brandId))
			.limit(1);
		if (!brandRow) throw new Error(`AXO site audit: brand not found: ${brandId}`);
		const brand = brandRow as BrandRow;

		const allowHosts = buildAllowHosts(brand.website, brand.additionalDomains);

		const sel = await selectAuditPages(brandId);
		const usedFallback = sel.targets.length === 0;
		const targets = usedFallback ? await buildFallbackTargets(brand, allowHosts) : sel.targets;

		const origins = [...new Set(targets.map((t) => safeOrigin(t.url)).filter((o): o is string => o !== null))].filter(
			(origin) => hostMatchesAllowlist(new URL(origin).hostname, allowHosts),
		);

		const robotsByOrigin = new Map<string, RobotsInfo>(
			await Promise.all(
				origins.map(async (origin): Promise<[string, RobotsInfo]> => [origin, await fetchRobots(origin, allowHosts)]),
			),
		);

		const pages = await mapWithConcurrency(targets, PAGE_SCORE_CONCURRENCY, (target) =>
			auditOnePage(target, brand, allowHosts, robotsByOrigin),
		);

		const status = pages.every((p) => p.fetchStatus !== "ok") ? "failed" : "completed";
		const report: SiteAuditReport = {
			window: { fromIso: sel.window.fromIso, toIso: sel.window.toIso, citationCount: sel.citationCount },
			usedFallback,
			origins: origins.map((origin) => {
				const info = robotsByOrigin.get(origin);
				return { origin, llmsTxt: info?.llmsTxt ?? "unavailable", sitemap: info?.sitemap ?? "unavailable" };
			}),
			pages,
			...(status === "failed" ? { failureSummary: "All audited pages failed to fetch." } : {}),
		};

		await db
			.update(siteAudits)
			.set({ status, report, schemaVersion: SITE_AUDIT_SCHEMA_VERSION })
			.where(eq(siteAudits.id, auditId));

		return auditId;
	} catch (error) {
		const failureSummary = error instanceof Error ? error.message : String(error);
		await db
			.update(siteAudits)
			.set({ status: "failed", report: emptyReport(startedAt, failureSummary) })
			.where(eq(siteAudits.id, auditId));
		throw error;
	}
}
