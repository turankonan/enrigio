/**
 * AXO page selection: which of the brand's own cited pages get audited.
 *
 * `chooseAuditTargets` is the pure ranking core — no DB, no fallback. It
 * returns cited targets only; when the brand has no owned citations it
 * returns `[]`. Injecting the homepage + sitemap fallback is the
 * orchestrator's job (Task 10), so the "no citations" contract stays
 * unambiguous here.
 *
 * Ranking order matters: the owned-domain filter runs BEFORE the page
 * limit, so competitor/third-party citations — however numerous — can
 * never consume the page-limit budget and wrongly force a fallback.
 */

import { and, count, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/db";
import { brands, citations, prompts } from "../db/schema";
import { extractDomain } from "../net/hostname";
import type { AuditTarget, AuditWindow } from "./types";

const DEFAULT_PROMPT_CAP = 8;
const DEFAULT_PAGE_LIMIT = 10;
const DEFAULT_WINDOW_DAYS = 30;

export interface CitationAggregate {
	url: string;
	domain: string;
	promptValue: string;
	count: number;
}

export interface ChooseAuditTargetsInput {
	citations: CitationAggregate[];
	ownedDomains: string[];
	promptCap?: number;
	pageLimit?: number;
}

export interface SelectionResult {
	targets: AuditTarget[];
	usedFallback: boolean;
	citationCount: number;
	window: AuditWindow;
}

/** Brand's owned domains, normalized for citation-domain grouping (see `extractDomain`). */
function normalizeOwnedDomains(ownedDomains: string[]): Set<string> {
	return new Set(ownedDomains.map(extractDomain).filter(Boolean));
}

function isOwned(domain: string, owned: Set<string>): boolean {
	return owned.has(extractDomain(domain));
}

/**
 * Total citations to the brand's OWNED domains only — the report's provenance
 * count. Competitor/third-party volume must never inflate it, so this applies
 * the same owned-domain filter `chooseAuditTargets` uses before summing.
 */
export function countOwnedCitations(rows: CitationAggregate[], ownedDomains: string[]): number {
	const owned = normalizeOwnedDomains(ownedDomains);
	if (owned.size === 0) return 0;
	return rows.reduce((sum, row) => (isOwned(row.domain, owned) ? sum + row.count : sum), 0);
}

/**
 * Pure ranking core.
 *
 * 1. restrict to the brand's normalized owned domains (`extractDomain`);
 * 2. aggregate the remaining rows by `(url, promptValue)` (merges any
 *    duplicate rows for the same pair by summing their counts — this is
 *    what a caller who hasn't pre-aggregated in SQL relies on for dedup);
 * 3. rank each page's prompts by count and cap at `promptCap`;
 * 4. rank pages by total citation count;
 * 5. apply `pageLimit`.
 */
export function chooseAuditTargets(input: ChooseAuditTargetsInput): AuditTarget[] {
	const { citations: rows, ownedDomains, promptCap = DEFAULT_PROMPT_CAP, pageLimit = DEFAULT_PAGE_LIMIT } = input;

	const owned = normalizeOwnedDomains(ownedDomains);
	if (owned.size === 0) return [];

	const byUrl = new Map<string, { total: number; prompts: Map<string, number> }>();
	for (const row of rows) {
		if (!isOwned(row.domain, owned)) continue;

		let entry = byUrl.get(row.url);
		if (!entry) {
			entry = { total: 0, prompts: new Map() };
			byUrl.set(row.url, entry);
		}
		entry.total += row.count;
		entry.prompts.set(row.promptValue, (entry.prompts.get(row.promptValue) ?? 0) + row.count);
	}

	return [...byUrl.entries()]
		.sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
		.slice(0, pageLimit)
		.map(([url, entry]) => ({
			url,
			relatedPrompts: [...entry.prompts.entries()]
				.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
				.slice(0, promptCap)
				.map(([promptValue]) => promptValue),
		}));
}

export interface SelectAuditPagesOptions {
	windowDays?: number;
	promptCap?: number;
	pageLimit?: number;
	now?: Date;
}

/**
 * DB-backed wrapper: aggregates citations for `brandId` in SQL (never loads
 * every citation row into memory) and hands the grouped rows to the pure
 * core. Always returns `usedFallback: false` — the orchestrator decides
 * whether to fall back to the homepage + sitemap.
 */
export async function selectAuditPages(brandId: string, opts: SelectAuditPagesOptions = {}): Promise<SelectionResult> {
	const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
	const now = opts.now ?? new Date();
	const from = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
	const window: AuditWindow = { fromIso: from.toISOString(), toIso: now.toISOString() };

	const [brand] = await db
		.select({ website: brands.website, additionalDomains: brands.additionalDomains })
		.from(brands)
		.where(eq(brands.id, brandId))
		.limit(1);
	const ownedDomains = brand ? [brand.website, ...brand.additionalDomains] : [];

	const rows = await db
		.select({
			url: citations.url,
			domain: citations.domain,
			promptValue: prompts.value,
			count: count(),
		})
		.from(citations)
		.innerJoin(prompts, eq(citations.promptId, prompts.id))
		.where(and(eq(citations.brandId, brandId), gte(citations.createdAt, from), lte(citations.createdAt, now)))
		.groupBy(citations.url, citations.domain, prompts.value);

	const citationCount = countOwnedCitations(rows, ownedDomains);
	const targets = chooseAuditTargets({
		citations: rows,
		ownedDomains,
		promptCap: opts.promptCap,
		pageLimit: opts.pageLimit,
	});

	return { targets, usedFallback: false, citationCount, window };
}
