import { afterEach, describe, expect, it, vi } from "vitest";
import type { SafeFetchResult } from "../net/safe-fetch";

vi.mock("../net/safe-fetch", () => ({
	safeFetch: vi.fn(),
}));

import { safeFetch } from "../net/safe-fetch";
import { fetchRobots, fetchSitemapUrls, parseSitemapDoc, statusFromFetch } from "./fetchers";

function result(overrides: Partial<SafeFetchResult>): SafeFetchResult {
	return { status: "ok", httpStatus: 200, finalUrl: null, body: null, contentType: null, ...overrides };
}

describe("statusFromFetch", () => {
	it("maps ok to present", () => {
		expect(statusFromFetch(result({ status: "ok" }))).toBe("present");
	});

	it("maps not-found to absent", () => {
		expect(statusFromFetch(result({ status: "not-found" }))).toBe("absent");
	});

	it("maps blocked to unavailable", () => {
		expect(statusFromFetch(result({ status: "blocked" }))).toBe("unavailable");
	});

	it("maps timeout to unavailable", () => {
		expect(statusFromFetch(result({ status: "timeout" }))).toBe("unavailable");
	});

	it("maps too-large to unavailable", () => {
		expect(statusFromFetch(result({ status: "too-large" }))).toBe("unavailable");
	});

	it("maps unsupported-content-type to unavailable", () => {
		expect(statusFromFetch(result({ status: "unsupported-content-type" }))).toBe("unavailable");
	});

	it("maps failed to unavailable", () => {
		expect(statusFromFetch(result({ status: "failed" }))).toBe("unavailable");
	});
});

describe("parseSitemapDoc", () => {
	it("extracts page locs from a urlset document", () => {
		const xml = [
			'<?xml version="1.0"?>',
			'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
			"<url><loc>https://example.com/a</loc></url>",
			"<url><loc>https://example.com/b</loc></url>",
			"</urlset>",
		].join("\n");
		expect(parseSitemapDoc(xml)).toEqual({
			pages: ["https://example.com/a", "https://example.com/b"],
			sitemaps: [],
		});
	});

	it("extracts nested sitemap locs from a sitemapindex document", () => {
		const xml = [
			'<?xml version="1.0"?>',
			'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
			"<sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>",
			"<sitemap><loc>https://example.com/sitemap-2.xml</loc></sitemap>",
			"</sitemapindex>",
		].join("\n");
		expect(parseSitemapDoc(xml)).toEqual({
			pages: [],
			sitemaps: ["https://example.com/sitemap-1.xml", "https://example.com/sitemap-2.xml"],
		});
	});

	it("decodes XML entities like &amp; in loc text", () => {
		const xml = [
			'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
			"<url><loc>https://example.com/a?x=1&amp;y=2</loc></url>",
			"</urlset>",
		].join("\n");
		expect(parseSitemapDoc(xml).pages).toEqual(["https://example.com/a?x=1&y=2"]);
	});

	it("does not expand a DTD-defined entity (XXE protection)", () => {
		const xml = [
			'<?xml version="1.0"?>',
			'<!DOCTYPE urlset [ <!ENTITY xxe "PWNED_VALUE"> ]>',
			'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
			"<url><loc>https://example.com/&xxe;</loc></url>",
			"</urlset>",
		].join("\n");
		const parsed = parseSitemapDoc(xml);
		expect(parsed.pages.join(",")).not.toContain("PWNED_VALUE");
	});

	it("drops non-http(s) scheme locs such as ftp", () => {
		const xml = [
			'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
			"<url><loc>ftp://example.com/a</loc></url>",
			"<url><loc>https://example.com/b</loc></url>",
			"</urlset>",
		].join("\n");
		expect(parseSitemapDoc(xml).pages).toEqual(["https://example.com/b"]);
	});

	it("returns empty arrays for a document with neither urlset nor sitemapindex root", () => {
		expect(parseSitemapDoc("<somethingelse></somethingelse>")).toEqual({ pages: [], sitemaps: [] });
	});

	it("returns empty arrays for malformed xml without throwing", () => {
		expect(() => parseSitemapDoc("not xml at all <<<")).not.toThrow();
		expect(parseSitemapDoc("not xml at all <<<")).toEqual({ pages: [], sitemaps: [] });
	});
});

describe("fetchRobots", () => {
	afterEach(() => {
		vi.mocked(safeFetch).mockReset();
	});

	it("returns robots.txt body plus present/absent/unavailable statuses for llms.txt and sitemap", async () => {
		vi.mocked(safeFetch).mockImplementation(async (url: string) => {
			if (url.endsWith("/robots.txt")) return result({ status: "ok", body: "User-agent: *\nDisallow:" });
			if (url.endsWith("/llms.txt")) return result({ status: "not-found", body: null });
			if (url.endsWith("/sitemap.xml")) return result({ status: "ok", body: "<urlset></urlset>" });
			throw new Error(`unexpected url ${url}`);
		});

		const info = await fetchRobots("https://example.com", ["example.com"]);
		expect(info).toEqual({
			robotsTxt: "User-agent: *\nDisallow:",
			llmsTxt: "absent",
			sitemap: "present",
		});
	});

	it("returns a null robots body when robots.txt is unavailable", async () => {
		vi.mocked(safeFetch).mockResolvedValue(result({ status: "blocked", body: null }));
		const info = await fetchRobots("https://example.com", ["example.com"]);
		expect(info.robotsTxt).toBeNull();
		expect(info.llmsTxt).toBe("unavailable");
		expect(info.sitemap).toBe("unavailable");
	});

	it("passes the full allowHosts list through to every safeFetch call", async () => {
		vi.mocked(safeFetch).mockResolvedValue(result({ status: "not-found" }));
		await fetchRobots("https://example.com", ["example.com", "www.example.com"]);
		for (const call of vi.mocked(safeFetch).mock.calls) {
			expect(call[1]).toMatchObject({ allowHosts: ["example.com", "www.example.com"], accept: "text" });
		}
	});
});

describe("fetchSitemapUrls", () => {
	afterEach(() => {
		vi.mocked(safeFetch).mockReset();
	});

	it("returns pages directly from a urlset sitemap", async () => {
		vi.mocked(safeFetch).mockResolvedValue(
			result({
				status: "ok",
				body: [
					'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
					"<url><loc>https://example.com/a</loc></url>",
					"<url><loc>https://example.com/b</loc></url>",
					"</urlset>",
				].join("\n"),
			}),
		);

		const urls = await fetchSitemapUrls("https://example.com", ["example.com"]);
		expect(urls).toEqual(["https://example.com/a", "https://example.com/b"]);
		expect(safeFetch).toHaveBeenCalledTimes(1);
	});

	it("follows a sitemap index one level and merges child pages", async () => {
		vi.mocked(safeFetch).mockImplementation(async (url: string) => {
			if (url === "https://example.com/sitemap.xml") {
				return result({
					status: "ok",
					body: [
						'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
						"<sitemap><loc>https://example.com/sitemap-a.xml</loc></sitemap>",
						"<sitemap><loc>https://example.com/sitemap-b.xml</loc></sitemap>",
						"</sitemapindex>",
					].join("\n"),
				});
			}
			if (url === "https://example.com/sitemap-a.xml") {
				return result({
					status: "ok",
					body: '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/a</loc></url></urlset>',
				});
			}
			if (url === "https://example.com/sitemap-b.xml") {
				return result({
					status: "ok",
					body: '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/b</loc></url></urlset>',
				});
			}
			throw new Error(`unexpected url ${url}`);
		});

		const urls = await fetchSitemapUrls("https://example.com", ["example.com"]);
		expect(urls.sort()).toEqual(["https://example.com/a", "https://example.com/b"]);
		expect(safeFetch).toHaveBeenCalledTimes(3);
	});

	it("caps total sitemap fetches at maxSitemaps", async () => {
		vi.mocked(safeFetch).mockImplementation(async (url: string) => {
			if (url === "https://example.com/sitemap.xml") {
				const sitemapLocs = Array.from(
					{ length: 10 },
					(_, i) => `<sitemap><loc>https://example.com/sitemap-${i}.xml</loc></sitemap>`,
				).join("\n");
				return result({
					status: "ok",
					body: `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapLocs}</sitemapindex>`,
				});
			}
			return result({
				status: "ok",
				body: `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url}#page</loc></url></urlset>`,
			});
		});

		await fetchSitemapUrls("https://example.com", ["example.com"], { maxSitemaps: 3 });
		expect(safeFetch).toHaveBeenCalledTimes(3);
	});

	it("caps returned pages at maxUrls", async () => {
		vi.mocked(safeFetch).mockResolvedValue(
			result({
				status: "ok",
				body: `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Array.from(
					{ length: 20 },
					(_, i) => `<url><loc>https://example.com/page-${i}</loc></url>`,
				).join("\n")}</urlset>`,
			}),
		);

		const urls = await fetchSitemapUrls("https://example.com", ["example.com"], { maxUrls: 5 });
		expect(urls).toHaveLength(5);
	});

	it("dedups page URLs that appear in more than one sitemap", async () => {
		vi.mocked(safeFetch).mockImplementation(async (url: string) => {
			if (url === "https://example.com/sitemap.xml") {
				return result({
					status: "ok",
					body: [
						'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
						"<sitemap><loc>https://example.com/sitemap-a.xml</loc></sitemap>",
						"<sitemap><loc>https://example.com/sitemap-b.xml</loc></sitemap>",
						"</sitemapindex>",
					].join("\n"),
				});
			}
			return result({
				status: "ok",
				body: '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/shared</loc></url></urlset>',
			});
		});

		const urls = await fetchSitemapUrls("https://example.com", ["example.com"]);
		expect(urls).toEqual(["https://example.com/shared"]);
	});

	it("drops nested sitemaps and pages that are not on the allowlisted hosts", async () => {
		vi.mocked(safeFetch).mockImplementation(async (url: string) => {
			if (url === "https://example.com/sitemap.xml") {
				return result({
					status: "ok",
					body: [
						'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
						"<sitemap><loc>https://evil.example.net/sitemap.xml</loc></sitemap>",
						"</sitemapindex>",
					].join("\n"),
				});
			}
			throw new Error(`unexpected fetch of off-allowlist url ${url}`);
		});

		const urls = await fetchSitemapUrls("https://example.com", ["example.com"]);
		expect(urls).toEqual([]);
		expect(safeFetch).toHaveBeenCalledTimes(1);
	});

	it("returns an empty array when the root sitemap fetch is unavailable", async () => {
		vi.mocked(safeFetch).mockResolvedValue(result({ status: "not-found", body: null }));
		const urls = await fetchSitemapUrls("https://example.com", ["example.com"]);
		expect(urls).toEqual([]);
	});
});
