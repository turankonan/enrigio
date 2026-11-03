import { lookup } from "node:dns/promises";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { isDisallowedAddress, safeFetch } from "./net/safe-fetch";

const MAX_EXCERPT_LINES = 200;
const JINA_TIMEOUT_MS = 30_000;
const DIRECT_TIMEOUT_MS = 15_000;

// A realistic desktop-browser UA. The Jina reader — and especially direct site
// fetches — are less likely to be treated as bot traffic than a custom UA.
const BROWSER_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * Fetch a short text excerpt of a website for brand-analysis context.
 *
 * Tries two sources in order, falling through whenever one is blocked,
 * rate-limited, or returns nothing:
 *
 *   1. Jina Reader (r.jina.ai) — LLM-friendly markdown, renders JS. Works
 *      anonymously, but Jina reputation-blocks anonymous requests from some IP
 *      ranges with a 401 ("bad network reputation"). Set the optional
 *      JINA_API_KEY env var to send an authenticated request — Jina then tracks
 *      rate limits by key instead of IP, sidestepping that block and raising the
 *      limit. No key is required; it is only read if present.
 *   2. Backend fetch + Readability — pull the raw HTML ourselves and extract the
 *      main content as clean text with @mozilla/readability + linkedom. This
 *      runs server-side (in the worker), so there are no CORS constraints and no
 *      third party left to rate-limit or block us.
 *
 * Returns "" when every source fails — callers treat an empty excerpt as a
 * best-effort miss rather than an error.
 */
export async function getWebsiteExcerpt(url: string): Promise<string> {
	if (!url) {
		return "";
	}

	// Ensure the URL has a scheme so the reader and our own fetch resolve it
	// consistently.
	const cleanUrl = url.startsWith("http") ? url : `https://${url}`;

	if (!(await isPublicWebsite(cleanUrl))) {
		console.warn(`[website-excerpt] refusing non-public url ${cleanUrl}`);
		return "";
	}

	const sources = [
		{ name: "jina", fetch: () => fromJina(cleanUrl) },
		{ name: "readability", fetch: () => fromReadability(cleanUrl) },
	];

	for (const source of sources) {
		try {
			const content = await source.fetch();
			if (content) {
				return toExcerpt(content);
			}
			console.warn(`[website-excerpt] ${source.name} returned no content for ${cleanUrl}`);
		} catch (error) {
			console.warn(`[website-excerpt] ${source.name} failed for ${cleanUrl}:`, error);
		}
	}

	console.error(`[website-excerpt] all sources failed for ${cleanUrl}`);
	return "";
}

/**
 * Jina fetches on our behalf, so safeFetch's per-hop checks never see that
 * request: refuse anything but a public http(s) host up front.
 * Resolve-then-fetch, so a DNS rebind between the two is not covered by this
 * gate; the direct path re-checks every hop through safeFetch.
 */
async function isPublicWebsite(url: string): Promise<boolean> {
	let u: URL;
	try {
		u = new URL(url);
	} catch {
		return false;
	}
	if ((u.protocol !== "http:" && u.protocol !== "https:") || u.username || u.password) {
		return false;
	}
	try {
		const addresses = await lookup(u.hostname, { all: true });
		return addresses.length > 0 && addresses.every((a) => !isDisallowedAddress(a.address));
	} catch {
		return false;
	}
}

/** The site's own apex and www hosts; a redirect anywhere else is refused. */
function allowedHosts(url: string): string[] {
	const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
	return [host, `www.${host}`];
}

/**
 * Jina Reader — prepend r.jina.ai to any URL to get back clean markdown. Sends
 * an Authorization header when JINA_API_KEY is set, which lifts Jina's
 * anonymous-IP rate limit / reputation block.
 */
async function fromJina(url: string): Promise<string | null> {
	const headers: Record<string, string> = { "User-Agent": BROWSER_UA };
	const apiKey = process.env.JINA_API_KEY;
	if (apiKey) {
		headers.Authorization = `Bearer ${apiKey}`;
	}
	const response = await fetch(`https://r.jina.ai/${url}`, {
		headers,
		signal: AbortSignal.timeout(JINA_TIMEOUT_MS),
	});
	if (!response.ok) {
		return null;
	}
	const content = (await response.text()).trim();
	return content || null;
}

/**
 * Last resort: fetch the raw HTML ourselves (server-side, so no CORS) and
 * extract the main article text with Readability, backed by linkedom's DOM.
 * Only handles HTML responses; falls back to whole-body text when Readability
 * can't isolate an article.
 */
async function fromReadability(url: string): Promise<string | null> {
	// A user-supplied URL must never reach a bare fetch: safeFetch refuses
	// private, loopback, link-local and metadata addresses and re-checks every
	// redirect hop against the allow-list.
	const result = await safeFetch(url, {
		allowHosts: allowedHosts(url),
		accept: "html",
		timeoutMs: DIRECT_TIMEOUT_MS,
	});
	if (result.status !== "ok" || !result.body?.trim()) {
		return null;
	}
	const html = result.body;
	const { document } = parseHTML(html);
	const article = new Readability(document).parse();
	const text = article?.textContent?.trim();
	if (text) {
		return text;
	}
	// Readability couldn't isolate an article; fall back to all visible text.
	return document.body?.textContent?.trim() || null;
}

/** Bound excerpts by line count without reflowing the extracted text. */
function toExcerpt(content: string): string {
	return content.split("\n").slice(0, MAX_EXCERPT_LINES).join("\n");
}
