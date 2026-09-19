/**
 * AXO robots/llms/sitemap fetchers: the network-touching half of the site
 * audit's discovery step (the pure robots.txt evaluator lives in `./robots`).
 * All outbound requests go through `net/safe-fetch`, so the SSRF allowlist
 * and DNS-pinning guarantees apply here too — `allowHosts` must be the
 * brand's full host allowlist, since `robots.txt` commonly redirects
 * apex<->www and safeFetch re-validates every redirect hop against it.
 *
 * Sitemap XML is parsed with linkedom's `DOMParser` in `text/xml` mode, not a
 * DTD-aware XML parser: it has no external-entity/DTD-entity expansion, so a
 * `<!DOCTYPE ... <!ENTITY xxe ...>` payload can't leak file contents or make
 * out-of-band requests through a `<loc>` value — the raw, unexpanded entity
 * text comes back as-is. Only well-formed `&amp;`-style character references
 * are decoded, which is standard XML parsing, not entity expansion.
 */

import { DOMParser } from "linkedom";
import { hostMatchesAllowlist } from "../net/hostname";
import { type SafeFetchResult, safeFetch } from "../net/safe-fetch";
import type { ResourceStatus } from "./types";

export interface RobotsInfo {
	robotsTxt: string | null;
	llmsTxt: ResourceStatus;
	sitemap: ResourceStatus;
}

export interface SitemapCaps {
	maxDepth?: number;
	maxSitemaps?: number;
	maxUrls?: number;
}

interface ParsedSitemap {
	pages: string[];
	sitemaps: string[];
}

const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_MAX_SITEMAPS = 5;
const DEFAULT_MAX_URLS = 50;

/** Maps a `safeFetch` result to the report's tri-state resource status. */
export function statusFromFetch(r: SafeFetchResult): ResourceStatus {
	if (r.status === "ok") return "present";
	if (r.status === "not-found") return "absent";
	return "unavailable";
}

function stripTrailingSlash(origin: string): string {
	return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}

function localName(tagName: string): string {
	const idx = tagName.indexOf(":");
	return (idx === -1 ? tagName : tagName.slice(idx + 1)).toLowerCase();
}

function isHttpUrl(value: string): boolean {
	try {
		const protocol = new URL(value).protocol;
		return protocol === "http:" || protocol === "https:";
	} catch {
		return false;
	}
}

function tryParseXml(xml: string) {
	try {
		return new DOMParser().parseFromString(xml, "text/xml");
	} catch {
		return null;
	}
}

type XmlDoc = NonNullable<ReturnType<typeof tryParseXml>>;

function locsWithin(doc: XmlDoc, parentTag: string): string[] {
	const out: string[] = [];
	for (const parent of doc.querySelectorAll(parentTag)) {
		const text = parent.querySelector("loc")?.textContent?.trim();
		if (text && isHttpUrl(text)) out.push(text);
	}
	return out;
}

/**
 * Pure: distinguishes a `<urlset>` (page `<loc>`s) from a `<sitemapindex>`
 * (nested sitemap `<loc>`s). Anything else — malformed XML, an unrecognized
 * root element — yields empty results rather than throwing.
 */
export function parseSitemapDoc(xml: string): ParsedSitemap {
	const doc = tryParseXml(xml);
	if (!doc) return { pages: [], sitemaps: [] };

	const root = doc.documentElement;
	if (!root) return { pages: [], sitemaps: [] };

	const rootName = localName(root.tagName);
	if (rootName === "sitemapindex") return { pages: [], sitemaps: locsWithin(doc, "sitemap") };
	if (rootName === "urlset") return { pages: locsWithin(doc, "url"), sitemaps: [] };
	return { pages: [], sitemaps: [] };
}

/**
 * Fetches `/robots.txt`, `/llms.txt`, and `/sitemap.xml` for `origin`. Every
 * request shares the full `allowHosts` allowlist (see module docs on
 * apex<->www redirects). `robotsTxt` is the raw body on success and `null`
 * otherwise — llms/sitemap presence is reported via `ResourceStatus` only,
 * since callers don't need those bodies here.
 */
export async function fetchRobots(origin: string, allowHosts: string[]): Promise<RobotsInfo> {
	const base = stripTrailingSlash(origin);
	const [robotsResult, llmsResult, sitemapResult] = await Promise.all([
		safeFetch(`${base}/robots.txt`, { allowHosts, accept: "text" }),
		safeFetch(`${base}/llms.txt`, { allowHosts, accept: "text" }),
		safeFetch(`${base}/sitemap.xml`, { allowHosts, accept: "text" }),
	]);

	return {
		robotsTxt: robotsResult.status === "ok" ? robotsResult.body : null,
		llmsTxt: statusFromFetch(llmsResult),
		sitemap: statusFromFetch(sitemapResult),
	};
}

function hostOf(url: string): string | null {
	try {
		return new URL(url).hostname;
	} catch {
		return null;
	}
}

function isAllowlisted(url: string, allowHosts: string[]): boolean {
	const host = hostOf(url);
	return host !== null && hostMatchesAllowlist(host, allowHosts);
}

/** Merges newly-discovered pages into `pages`, deduped via `seen`, up to `maxUrls`, dropping off-allowlist hosts. */
function mergeAllowlistedPages(
	candidates: string[],
	allowHosts: string[],
	seen: Set<string>,
	pages: string[],
	maxUrls: number,
): void {
	for (const page of candidates) {
		if (pages.length >= maxUrls) return;
		if (seen.has(page) || !isAllowlisted(page, allowHosts)) continue;
		seen.add(page);
		pages.push(page);
	}
}

/** Queues newly-discovered nested sitemaps at `depth`, deduped via `seen`, dropping off-allowlist hosts. */
function enqueueAllowlistedSitemaps(
	candidates: string[],
	allowHosts: string[],
	seen: Set<string>,
	queue: { url: string; depth: number }[],
	depth: number,
): void {
	for (const nested of candidates) {
		if (seen.has(nested) || !isAllowlisted(nested, allowHosts)) continue;
		seen.add(nested);
		queue.push({ url: nested, depth });
	}
}

interface SitemapWalkState {
	allowHosts: string[];
	maxDepth: number;
	maxUrls: number;
	pages: string[];
	seenPages: Set<string>;
	seenSitemaps: Set<string>;
	queue: { url: string; depth: number }[];
}

/** Fetches and processes one sitemap document, merging its pages and (if under `maxDepth`) queueing its children. */
async function processSitemapHop(url: string, depth: number, state: SitemapWalkState): Promise<void> {
	const fetchResult = await safeFetch(url, { allowHosts: state.allowHosts, accept: "text" });
	if (fetchResult.status !== "ok" || !fetchResult.body) return;

	const parsed = parseSitemapDoc(fetchResult.body);
	mergeAllowlistedPages(parsed.pages, state.allowHosts, state.seenPages, state.pages, state.maxUrls);
	if (depth >= state.maxDepth) return;
	enqueueAllowlistedSitemaps(parsed.sitemaps, state.allowHosts, state.seenSitemaps, state.queue, depth + 1);
}

/**
 * Fetches `/sitemap.xml` for `origin` and, if it's a sitemap index, follows
 * nested sitemaps up to `maxDepth` levels — bounded overall by `maxSitemaps`
 * total sitemap-document fetches (root included) and `maxUrls` returned
 * pages, with both nested-sitemap and page URLs deduped and filtered to
 * `allowHosts`. Every fetch (root and nested) goes through `safeFetch`, so
 * each hop gets the same SSRF gate and redirect re-validation.
 */
export async function fetchSitemapUrls(
	origin: string,
	allowHosts: string[],
	caps: SitemapCaps = {},
): Promise<string[]> {
	const startUrl = `${stripTrailingSlash(origin)}/sitemap.xml`;
	const state: SitemapWalkState = {
		allowHosts,
		maxDepth: caps.maxDepth ?? DEFAULT_MAX_DEPTH,
		maxUrls: caps.maxUrls ?? DEFAULT_MAX_URLS,
		pages: [],
		seenPages: new Set(),
		seenSitemaps: new Set([startUrl]),
		queue: [{ url: startUrl, depth: 0 }],
	};
	const maxSitemaps = caps.maxSitemaps ?? DEFAULT_MAX_SITEMAPS;

	let sitemapsFetched = 0;
	while (state.queue.length > 0 && sitemapsFetched < maxSitemaps && state.pages.length < state.maxUrls) {
		const next = state.queue.shift();
		if (!next) break;
		sitemapsFetched++;
		await processSitemapHop(next.url, next.depth, state);
	}

	return state.pages;
}
