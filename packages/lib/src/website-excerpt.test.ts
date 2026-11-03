import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const safeFetch = vi.hoisted(() => vi.fn());
const lookup = vi.hoisted(() => vi.fn());
vi.mock("./net/safe-fetch", async (importOriginal) => ({ ...(await importOriginal<object>()), safeFetch }));
vi.mock("node:dns/promises", () => ({ lookup }));

import { getWebsiteExcerpt } from "./website-excerpt";

type FakeResponse = {
	ok: boolean;
	status: number;
	headers: { get: (key: string) => string | null };
	text: () => Promise<string>;
};

function response(opts: { ok?: boolean; status?: number; contentType?: string; body?: string }): FakeResponse {
	const { ok = true, status = 200, contentType = "text/plain", body = "" } = opts;
	return {
		ok,
		status,
		headers: { get: (key) => (key.toLowerCase() === "content-type" ? contentType : null) },
		text: async () => body,
	};
}

/**
 * Stub the Jina tier through the global fetch and the tier-2 direct fetch
 * through safeFetch (the only sanctioned path to a user-supplied host).
 */
function stubFetch(tiers: { jina?: FakeResponse; direct?: FakeResponse }) {
	const fetchMock = vi.fn(async (_input: unknown, _init?: unknown) => {
		if (!tiers.jina) throw new Error("unexpected jina call");
		return tiers.jina;
	});
	vi.stubGlobal("fetch", fetchMock);
	safeFetch.mockImplementation(async (url: string) => {
		if (!tiers.direct) throw new Error("unexpected direct call");
		const d = tiers.direct;
		return {
			status: d.ok ? "ok" : "failed",
			httpStatus: d.status,
			finalUrl: url,
			contentType: d.headers.get("content-type"),
			body: d.ok ? await d.text() : null,
		};
	});
	return fetchMock;
}

function headersOf(call: unknown[]): Record<string, string> {
	return (call[1] as { headers: Record<string, string> }).headers;
}

// A real article so tier 2 exercises linkedom + Readability for real.
const ARTICLE_HTML = `<!DOCTYPE html>
<html><head><title>Acme Robotics</title></head>
<body>
	<nav>Home About Careers Contact</nav>
	<article>
		<h1>Acme Robotics builds warehouse automation</h1>
		<p>Acme Robotics designs autonomous mobile robots that move inventory through
		fulfillment centers, replacing fixed conveyor systems with fleets that route
		themselves around obstacles. The company sells to mid-market retailers who need
		to scale peak-season throughput without rebuilding their warehouses, and its
		software coordinates hundreds of robots from a single control plane.</p>
		<p>Founded in 2019, Acme now operates in twelve distribution centers across
		North America and reports that its robots cut order-picking time roughly in half.</p>
	</article>
	<footer>Copyright Acme Robotics</footer>
</body></html>`;

beforeEach(() => {
	lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	vi.clearAllMocks();
});

describe("getWebsiteExcerpt", () => {
	it("returns Jina content and skips the fallback when Jina succeeds", async () => {
		const fetchMock = stubFetch({
			jina: response({ contentType: "text/plain", body: "# Acme\nFrom Jina reader" }),
		});

		const excerpt = await getWebsiteExcerpt("acme.com");

		expect(excerpt).toContain("From Jina reader");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(String(fetchMock.mock.calls[0][0])).toBe("https://r.jina.ai/https://acme.com");
	});

	it("prepends a scheme to a bare domain that carries a path", async () => {
		const fetchMock = stubFetch({ jina: response({ body: "content" }) });

		await getWebsiteExcerpt("nike.com/golf");

		expect(String(fetchMock.mock.calls[0][0])).toBe("https://r.jina.ai/https://nike.com/golf");
	});

	it("preserves an absolute page URL through both excerpt sources", async () => {
		const pageUrl = "https://www.nike.com/golf?category=clubs#featured";
		const fetchMock = stubFetch({
			jina: response({ ok: false, status: 401 }),
			direct: response({ contentType: "text/html; charset=utf-8", body: ARTICLE_HTML }),
		});

		await getWebsiteExcerpt(pageUrl);

		expect(String(fetchMock.mock.calls[0][0])).toBe(`https://r.jina.ai/${pageUrl}`);
		expect(safeFetch.mock.calls[0][0]).toBe(pageUrl);
	});

	it("sends an Authorization header to Jina when JINA_API_KEY is set", async () => {
		vi.stubEnv("JINA_API_KEY", "jina_test_key");
		const fetchMock = stubFetch({ jina: response({ body: "content" }) });

		await getWebsiteExcerpt("acme.com");

		expect(headersOf(fetchMock.mock.calls[0]).Authorization).toBe("Bearer jina_test_key");
	});

	it("sends no Authorization header when JINA_API_KEY is unset", async () => {
		vi.stubEnv("JINA_API_KEY", "");
		const fetchMock = stubFetch({ jina: response({ body: "content" }) });

		await getWebsiteExcerpt("acme.com");

		expect(headersOf(fetchMock.mock.calls[0]).Authorization).toBeUndefined();
	});

	it("falls back to backend fetch + Readability when Jina is blocked (401)", async () => {
		const fetchMock = stubFetch({
			jina: response({ ok: false, status: 401 }),
			direct: response({ contentType: "text/html; charset=utf-8", body: ARTICLE_HTML }),
		});

		const excerpt = await getWebsiteExcerpt("acme.com");

		expect(excerpt).toContain("autonomous mobile robots");
		// Readability strips chrome like the nav and returns clean text (no HTML tags).
		expect(excerpt).not.toContain("Careers");
		expect(excerpt).not.toContain("<p>");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(safeFetch).toHaveBeenCalledTimes(1);
	});

	it("continues past Jina when it throws (network error)", async () => {
		const fetchMock = vi.fn(async (_input: unknown, _init?: unknown) => {
			throw new Error("network down");
		});
		vi.stubGlobal("fetch", fetchMock);
		safeFetch.mockResolvedValue({
			status: "ok",
			httpStatus: 200,
			finalUrl: "https://acme.com",
			contentType: "text/html",
			body: ARTICLE_HTML,
		});

		expect(await getWebsiteExcerpt("acme.com")).toContain("autonomous mobile robots");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(safeFetch).toHaveBeenCalledTimes(1);
	});

	it("returns an empty string when both tiers fail", async () => {
		stubFetch({
			jina: response({ ok: false, status: 401 }),
			direct: response({ ok: false, status: 500 }),
		});

		expect(await getWebsiteExcerpt("acme.com")).toBe("");
	});

	it("caps the excerpt at 200 lines", async () => {
		const body = Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n");
		stubFetch({ jina: response({ body }) });

		const excerpt = await getWebsiteExcerpt("acme.com");

		expect(excerpt.split("\n")).toHaveLength(200);
		expect(excerpt).toContain("line 199");
		expect(excerpt).not.toContain("line 200");
	});

	it("returns an empty string for an empty URL without fetching", async () => {
		const fetchMock = stubFetch({});
		expect(await getWebsiteExcerpt("")).toBe("");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("fetches the fallback through safeFetch, allowing only the site's apex and www hosts", async () => {
		stubFetch({
			jina: response({ ok: false, status: 503 }),
			direct: response({ contentType: "text/html", body: ARTICLE_HTML }),
		});

		await getWebsiteExcerpt("https://www.acme.example/");

		expect(safeFetch).toHaveBeenCalledWith(
			"https://www.acme.example/",
			expect.objectContaining({ allowHosts: ["acme.example", "www.acme.example"], accept: "html" }),
		);
	});

	it("refuses a private address before contacting Jina or the site", async () => {
		// A literal IP resolves to itself.
		lookup.mockResolvedValue([{ address: "10.0.0.1", family: 4 }]);
		const fetchMock = stubFetch({ jina: response({ body: "secret" }), direct: response({ body: "secret" }) });

		expect(await getWebsiteExcerpt("http://10.0.0.1/")).toBe("");
		expect(fetchMock).not.toHaveBeenCalled();
		expect(safeFetch).not.toHaveBeenCalled();
	});

	it("refuses a hostname that resolves to a private address", async () => {
		lookup.mockResolvedValue([{ address: "192.168.1.10", family: 4 }]);
		const fetchMock = stubFetch({ jina: response({ body: "secret" }), direct: response({ body: "secret" }) });

		expect(await getWebsiteExcerpt("https://intranet.example/")).toBe("");
		expect(fetchMock).not.toHaveBeenCalled();
		expect(safeFetch).not.toHaveBeenCalled();
	});
});
