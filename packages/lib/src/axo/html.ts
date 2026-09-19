/**
 * Pure HTML analysis for the AXO site audit: a quick structural checklist and
 * a bounded, boilerplate-free text extract to feed an LLM relevance scorer.
 * No network, no I/O — callers fetch the page HTML themselves and pass the
 * body in here. Parsing uses linkedom (a real DOM), not regex, so attribute
 * order and HTML-entity decoding are handled by the parser rather than
 * reimplemented here.
 */

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

const DEFAULT_MAX_CHARS = 6000;

// Boilerplate and non-visible content that should never reach the LLM as
// "page text" — chrome (nav/footer), non-rendering script/style payloads, and
// anything explicitly hidden from assistive tech / the page.
const STRIP_SELECTOR = 'script, style, nav, footer, [hidden], [aria-hidden="true"]';

export interface PageChecklist {
	title: string | null;
	hasSchema: boolean;
	hasMetaDescription: boolean;
	headingStructure: "ok" | "no-h1" | "weak";
}

export function checklistForPage(html: string): PageChecklist {
	const { document } = parseHTML(html);

	const title = document.querySelector("title")?.textContent ?? null;

	// Either form of structured data counts: a JSON-LD script block, or
	// microdata's `itemscope` marker anywhere in the page.
	const hasSchema = document.querySelector('script[type="application/ld+json"], [itemscope]') !== null;

	// `getAttribute` (rather than the `content` DOM property) works no matter
	// where the attribute falls in the tag, since attribute selectors/lookups
	// in a real DOM are order-independent.
	const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
	const hasMetaDescription = metaDescription.trim().length > 0;

	const h1Count = document.querySelectorAll("h1").length;
	const headingStructure = h1Count === 0 ? "no-h1" : h1Count === 1 ? "ok" : "weak";

	return { title, hasSchema, hasMetaDescription, headingStructure };
}

/**
 * Extract clean, bounded body text for LLM relevance scoring. Strips chrome
 * and hidden content before attempting Readability's article extraction, so
 * the guarantee (no script/style/nav/footer/hidden content) holds even on
 * the `body.textContent` fallback path used when Readability can't isolate
 * an article (e.g. very short pages). HTML comments never appear in
 * `textContent` per DOM semantics, so no separate comment-stripping is
 * needed.
 */
export function extractCleanText(html: string, maxChars = DEFAULT_MAX_CHARS): string {
	const { document } = parseHTML(html);

	for (const el of document.querySelectorAll(STRIP_SELECTOR)) {
		el.remove();
	}

	let text = "";
	try {
		const article = new Readability(document).parse();
		text = article?.textContent ?? "";
	} catch {
		text = "";
	}
	if (!text.trim()) {
		text = document.body?.textContent ?? "";
	}

	const collapsed = text.replace(/\s+/g, " ").trim();
	return collapsed.slice(0, maxChars);
}
