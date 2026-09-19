import type { IncomingMessage } from "node:http";
import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isDisallowedAddress, type SafeFetchOptions, safeFetch, type TransportRequestOptions } from "./safe-fetch";

describe("isDisallowedAddress", () => {
	it("blocks IPv4 private/reserved ranges", () => {
		expect(isDisallowedAddress("127.0.0.1")).toBe(true);
		expect(isDisallowedAddress("10.1.2.3")).toBe(true);
		expect(isDisallowedAddress("172.16.0.5")).toBe(true);
		expect(isDisallowedAddress("192.168.1.1")).toBe(true);
		expect(isDisallowedAddress("169.254.169.254")).toBe(true); // cloud metadata
		expect(isDisallowedAddress("0.0.0.0")).toBe(true);
		expect(isDisallowedAddress("224.0.0.1")).toBe(true); // multicast
		expect(isDisallowedAddress("255.255.255.255")).toBe(true);
	});

	it("allows public IPv4 addresses", () => {
		expect(isDisallowedAddress("93.184.216.34")).toBe(false);
		expect(isDisallowedAddress("8.8.8.8")).toBe(false);
		expect(isDisallowedAddress("172.32.0.5")).toBe(false); // just outside 172.16/12
	});

	it("blocks IPv6 loopback/unspecified/ULA/link-local/multicast", () => {
		expect(isDisallowedAddress("::1")).toBe(true);
		expect(isDisallowedAddress("::")).toBe(true);
		expect(isDisallowedAddress("fc00::1")).toBe(true);
		expect(isDisallowedAddress("fe80::1")).toBe(true);
		expect(isDisallowedAddress("ff02::1")).toBe(true);
	});

	it("blocks IPv4-mapped IPv6 addresses by checking the embedded v4", () => {
		expect(isDisallowedAddress("::ffff:10.0.0.1")).toBe(true);
		expect(isDisallowedAddress("::ffff:127.0.0.1")).toBe(true);
		expect(isDisallowedAddress("::ffff:93.184.216.34")).toBe(false);
	});

	it("allows public IPv6 addresses", () => {
		expect(isDisallowedAddress("2001:4860:4860::8888")).toBe(false);
	});

	it("fails closed on unparseable input", () => {
		expect(isDisallowedAddress("not-an-ip")).toBe(true);
	});
});

describe("safeFetch behavior", () => {
	let server: ReturnType<typeof createServer>;
	let port: number;
	let bigBody: string;

	beforeAll(async () => {
		bigBody = "x".repeat(2_000_000);
		server = createServer((req, res) => {
			const url = new URL(req.url ?? "/", "http://fixture.local");
			switch (url.pathname) {
				case "/ok":
					res.writeHead(200, { "content-type": "text/html" });
					res.end("<html><body>ok</body></html>");
					return;
				case "/redirect-same-host":
					res.writeHead(302, { location: "/ok" });
					res.end();
					return;
				case "/redirect-off-allowlist":
					res.writeHead(302, { location: "https://evil.example.com/steal" });
					res.end();
					return;
				case "/too-large":
					res.writeHead(200, { "content-type": "text/html" });
					res.end(bigBody);
					return;
				case "/missing":
					res.writeHead(404, { "content-type": "text/html" });
					res.end();
					return;
				case "/gone":
					res.writeHead(410, { "content-type": "text/html" });
					res.end();
					return;
				case "/broken":
					res.writeHead(500, { "content-type": "text/html" });
					res.end("boom");
					return;
				case "/wrong-content-type":
					res.writeHead(200, { "content-type": "application/json" });
					res.end("{}");
					return;
				default:
					res.writeHead(404);
					res.end();
			}
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		port = (server.address() as AddressInfo).port;
	});

	afterAll(async () => {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});

	function toHeaderRecord(headers: IncomingMessage["headers"]): Record<string, string> {
		const out: Record<string, string> = {};
		for (const [key, value] of Object.entries(headers)) {
			if (value === undefined) continue;
			out[key] = Array.isArray(value) ? value.join(", ") : value;
		}
		return out;
	}

	function makeFixtureTransport(calls: TransportRequestOptions[]): NonNullable<SafeFetchOptions["transport"]> {
		return (opts) => {
			calls.push(opts);
			return new Promise((resolve, reject) => {
				const req = httpRequest(
					{
						hostname: "127.0.0.1",
						port,
						path: opts.path,
						method: "GET",
						headers: { ...opts.headers, host: opts.hostname },
						signal: opts.signal,
					},
					(res: IncomingMessage) => {
						resolve({ statusCode: res.statusCode ?? 0, headers: toHeaderRecord(res.headers), stream: res });
					},
				);
				req.on("error", reject);
				req.end();
			});
		};
	}

	const approvedResolver = async () => ["93.184.216.34"];

	it("(a) pins the socket to the exact resolver-returned IP", async () => {
		const calls: TransportRequestOptions[] = [];
		const result = await safeFetch("https://rigosis.com/ok", {
			allowHosts: ["rigosis.com"],
			accept: "html",
			resolver: approvedResolver,
			transport: makeFixtureTransport(calls),
		});
		expect(result.status).toBe("ok");
		expect(calls.length).toBeGreaterThan(0);
		expect(calls[0].pinnedIp).toBe("93.184.216.34");
	});

	it("(b) rejects a URL with embedded credentials", async () => {
		const calls: TransportRequestOptions[] = [];
		const result = await safeFetch("https://u:p@rigosis.com/ok", {
			allowHosts: ["rigosis.com"],
			accept: "html",
			resolver: approvedResolver,
			transport: makeFixtureTransport(calls),
		});
		expect(result.status).toBe("blocked");
		expect(calls.length).toBe(0);
	});

	it("(c) rejects a disallowed port", async () => {
		const calls: TransportRequestOptions[] = [];
		const result = await safeFetch("https://rigosis.com:8443/ok", {
			allowHosts: ["rigosis.com"],
			accept: "html",
			resolver: approvedResolver,
			transport: makeFixtureTransport(calls),
		});
		expect(result.status).toBe("blocked");
		expect(calls.length).toBe(0);
	});

	it("(d) blocks a redirect to a host outside the allowlist", async () => {
		const calls: TransportRequestOptions[] = [];
		const result = await safeFetch("https://rigosis.com/redirect-off-allowlist", {
			allowHosts: ["rigosis.com"],
			accept: "html",
			resolver: approvedResolver,
			transport: makeFixtureTransport(calls),
		});
		expect(result.status).toBe("blocked");
		// the first hop was allowed through, only the redirect target was rejected
		expect(calls.length).toBe(1);
	});

	it("(e) enforces maxBytes without truncating to ok", async () => {
		const calls: TransportRequestOptions[] = [];
		const result = await safeFetch("https://rigosis.com/too-large", {
			allowHosts: ["rigosis.com"],
			accept: "html",
			maxBytes: 1000,
			resolver: approvedResolver,
			transport: makeFixtureTransport(calls),
		});
		expect(result.status).toBe("too-large");
		expect(result.body).toBeNull();
	});

	it("(f) maps 404/410 to not-found and 500 to failed with httpStatus", async () => {
		const missing = await safeFetch("https://rigosis.com/missing", {
			allowHosts: ["rigosis.com"],
			accept: "html",
			resolver: approvedResolver,
			transport: makeFixtureTransport([]),
		});
		expect(missing.status).toBe("not-found");
		expect(missing.httpStatus).toBe(404);

		const gone = await safeFetch("https://rigosis.com/gone", {
			allowHosts: ["rigosis.com"],
			accept: "html",
			resolver: approvedResolver,
			transport: makeFixtureTransport([]),
		});
		expect(gone.status).toBe("not-found");
		expect(gone.httpStatus).toBe(410);

		const broken = await safeFetch("https://rigosis.com/broken", {
			allowHosts: ["rigosis.com"],
			accept: "html",
			resolver: approvedResolver,
			transport: makeFixtureTransport([]),
		});
		expect(broken.status).toBe("failed");
		expect(broken.httpStatus).toBe(500);
	});

	it("rejects a 2xx response with the wrong content-type", async () => {
		const result = await safeFetch("https://rigosis.com/wrong-content-type", {
			allowHosts: ["rigosis.com"],
			accept: "html",
			resolver: approvedResolver,
			transport: makeFixtureTransport([]),
		});
		expect(result.status).toBe("unsupported-content-type");
	});

	it("(g) destroys the redirect response stream before following the next hop", async () => {
		const calls: TransportRequestOptions[] = [];
		const responses: { stream: NodeJS.ReadableStream }[] = [];
		const transport = makeFixtureTransport(calls);
		const wrapped: NonNullable<SafeFetchOptions["transport"]> = async (opts) => {
			const res = await transport(opts);
			responses.push(res);
			return res;
		};
		const result = await safeFetch("https://rigosis.com/redirect-same-host", {
			allowHosts: ["rigosis.com"],
			accept: "html",
			resolver: approvedResolver,
			transport: wrapped,
		});
		expect(result.status).toBe("ok");
		expect(responses.length).toBe(2);
		// the first hop's stream (the redirect response) must be destroyed before
		// the second hop is followed, not merely at the very end via `finally`.
		expect((responses[0].stream as IncomingMessage).destroyed).toBe(true);
	});

	it("(h) blocks when the resolver returns an IPv4-mapped private address", async () => {
		const calls: TransportRequestOptions[] = [];
		const result = await safeFetch("https://rigosis.com/ok", {
			allowHosts: ["rigosis.com"],
			accept: "html",
			resolver: async () => ["::ffff:10.0.0.1"],
			transport: makeFixtureTransport(calls),
		});
		expect(result.status).toBe("blocked");
		expect(calls.length).toBe(0);
	});

	it("(i) times out and aborts the signal before headers arrive when the transport hangs", async () => {
		let abortFired = false;
		let sawSignal: AbortSignal | undefined;
		const hangingTransport: NonNullable<SafeFetchOptions["transport"]> = (opts) => {
			sawSignal = opts.signal;
			opts.signal.addEventListener("abort", () => {
				abortFired = true;
			});
			return new Promise(() => {
				// never resolves — simulates a connect/TLS/header hang
			});
		};
		const result = await safeFetch("https://rigosis.com/ok", {
			allowHosts: ["rigosis.com"],
			accept: "html",
			timeoutMs: 40,
			resolver: approvedResolver,
			transport: hangingTransport,
		});
		expect(result.status).toBe("timeout");
		expect(sawSignal).toBeDefined();
		expect(abortFired).toBe(true);
	});

	it("rejects a resolver result of 127.0.0.1 on the default (non-injected) transport path", async () => {
		const result = await safeFetch("http://localhost/ok", {
			allowHosts: ["localhost"],
			accept: "html",
			resolver: async () => ["127.0.0.1"],
			// no transport override: exercises the real default transport code path,
			// which must never be reached because the resolver gate blocks first.
		});
		expect(result.status).toBe("blocked");
	});
});
