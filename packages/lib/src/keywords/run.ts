import { eq } from "drizzle-orm";
import { buildAllowHosts } from "../axo/run";
import { selectAuditPages } from "../axo/select-pages";
import { db } from "../db/db";
import { brands, keywordChecks } from "../db/schema";
import { resolveEffectiveMarket } from "../markets/effective";
import { safeFetch } from "../net/safe-fetch";
import { matchKeywords } from "./match";
import { pageTextFromHtml } from "./page-text";
import type { KeywordCheckReport, PageText } from "./types";
import { uniqueCanonicalUrls, withScheme } from "./url";

const MAX_PAGES = 10;

/** Runs one keyword↔website check for `brandId` and persists it. Returns the row id. */
export async function runKeywordCheck(brandId: string): Promise<string> {
	const startedAt = new Date();
	const empty: KeywordCheckReport = { pages: [], keywords: [] };
	const [inserted] = await db
		.insert(keywordChecks)
		.values({ brandId, status: "running", report: empty, startedAt })
		.returning({ id: keywordChecks.id });
	const checkId = (inserted as { id: string }).id;

	try {
		const [brand] = await db
			.select({
				website: brands.website,
				additionalDomains: brands.additionalDomains,
				keywords: brands.keywords,
				defaultMarketKey: brands.defaultMarketKey,
			})
			.from(brands)
			.where(eq(brands.id, brandId))
			.limit(1);
		if (!brand) throw new Error(`Keyword check: brand not found: ${brandId}`);

		if (brand.keywords.length === 0) {
			await db.update(keywordChecks).set({ status: "completed", report: empty }).where(eq(keywordChecks.id, checkId));
			return checkId;
		}

		const lang = resolveEffectiveMarket({ defaultMarketKey: brand.defaultMarketKey }).languageCode;
		const allowHosts = buildAllowHosts(brand.website, brand.additionalDomains);
		const selection = await selectAuditPages(brandId);
		const urls = uniqueCanonicalUrls([withScheme(brand.website), ...selection.targets.map((t) => t.url)]).slice(0, MAX_PAGES);

		const fetched = await Promise.all(
			urls.map(async (url) => {
				const result = await safeFetch(url, { allowHosts, accept: "html" });
				return { url, body: result.status === "ok" ? result.body : null };
			}),
		);
		const pages: PageText[] = fetched
			.filter((p): p is { url: string; body: string } => typeof p.body === "string")
			.map((p) => pageTextFromHtml(p.url, p.body));

		const report: KeywordCheckReport = {
			pages: fetched.map((p) => ({ url: p.url, fetched: p.body !== null })),
			keywords: matchKeywords(brand.keywords, pages, lang),
			...(pages.length === 0 ? { failureSummary: "No page on the site could be read." } : {}),
		};
		await db
			.update(keywordChecks)
			.set({ status: pages.length === 0 ? "failed" : "completed", report })
			.where(eq(keywordChecks.id, checkId));
		return checkId;
	} catch (error) {
		const failureSummary = error instanceof Error ? error.message : String(error);
		await db
			.update(keywordChecks)
			.set({ status: "failed", report: { ...empty, failureSummary } })
			.where(eq(keywordChecks.id, checkId));
		throw error;
	}
}
