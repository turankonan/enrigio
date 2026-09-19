/**
 * SSRF-safe fetch: the security boundary between AXO site-audit requests and
 * the target's declared URL. This is the ONLY place in the codebase that is
 * allowed to make an outbound HTTP(S) request to a user-supplied host.
 *
 * The core defense is DNS pinning: we resolve the hostname ourselves, reject
 * the request if any resolved address is loopback/private/link-local/
 * multicast/metadata/IPv4-mapped-private, and then connect directly to the
 * validated IP (never letting the OS/Node re-resolve the hostname at connect
 * time, which would reopen a TOCTOU/DNS-rebinding hole). Every redirect hop
 * repeats the full validation — scheme, credentials, port, allowlist,
 * resolve, gate, pin — from scratch.
 *
 * `resolver` and `transport` are injectable so tests can exercise the gate
 * with an approved public IP and a local fixture server without ever
 * whitelisting loopback in the gate itself.
 */

import { lookup as dnsLookup } from "node:dns/promises";
import { Agent as HttpAgent, request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { BlockList, isIPv4, isIPv6, type LookupFunction } from "node:net";
import { hostMatchesAllowlist } from "./hostname";

export type SafeFetchStatus =
	| "ok"
	| "not-found"
	| "blocked"
	| "timeout"
	| "too-large"
	| "unsupported-content-type"
	| "failed";

export interface SafeFetchResult {
	status: SafeFetchStatus;
	httpStatus: number | null;
	finalUrl: string | null;
	body: string | null;
	contentType: string | null;
}

export interface TransportRequestOptions {
	protocol: "http:" | "https:";
	hostname: string;
	port: number;
	pinnedIp: string;
	path: string;
	headers: Record<string, string>;
	signal: AbortSignal;
}

export interface TransportResponse {
	statusCode: number;
	headers: Record<string, string>;
	stream: NodeJS.ReadableStream;
}

export interface SafeFetchOptions {
	allowHosts: string[];
	accept: "html" | "text";
	maxBytes?: number;
	timeoutMs?: number;
	maxRedirects?: number;
	allowPorts?: number[];
	/** Injectable DNS resolution — tests control what a host "resolves" to. */
	resolver?: (host: string) => Promise<string[]>;
	/** Injectable request transport. `signal` fires on timeout so connect/TLS/header hangs are cancellable. */
	transport?: (opts: TransportRequestOptions) => Promise<TransportResponse>;
}

const DEFAULT_MAX_BYTES = 2_000_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_ALLOW_PORTS = [80, 443];
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const USER_AGENT = "AnswerEchoSiteAudit/1.0 (+https://answerecho.ai/site-audit-bot)";

// Built on node:net's BlockList (native CIDR matching, incl. automatic
// IPv4-mapped-IPv6 normalization when checked with family "ipv6") rather
// than a hand-rolled range parser — fewer places for an SSRF bypass to hide.
const disallowedAddresses = new BlockList();
// IPv4: this-network, loopback, RFC1918 private, link-local (incl. cloud
// metadata 169.254.169.254), and 224.0.0.0/3 (multicast + reserved + broadcast).
disallowedAddresses.addSubnet("0.0.0.0", 8, "ipv4");
disallowedAddresses.addSubnet("10.0.0.0", 8, "ipv4");
disallowedAddresses.addSubnet("127.0.0.0", 8, "ipv4");
disallowedAddresses.addSubnet("169.254.0.0", 16, "ipv4");
disallowedAddresses.addSubnet("172.16.0.0", 12, "ipv4");
disallowedAddresses.addSubnet("192.168.0.0", 16, "ipv4");
disallowedAddresses.addSubnet("224.0.0.0", 3, "ipv4");
// IPv6: unspecified, loopback, unique-local, link-local, multicast.
disallowedAddresses.addAddress("::", "ipv6");
disallowedAddresses.addAddress("::1", "ipv6");
disallowedAddresses.addSubnet("fc00::", 7, "ipv6");
disallowedAddresses.addSubnet("fe80::", 10, "ipv6");
disallowedAddresses.addSubnet("ff00::", 8, "ipv6");

/**
 * Parse an IPv6 literal into its eight 16-bit groups, handling "::"
 * compression and a trailing dotted-decimal IPv4 tail (e.g. "::ffff:1.2.3.4").
 * Returns null for anything malformed — callers must fail closed on that.
 */
function parseIPv6Groups(address: string): number[] | null {
	const firstDoubleColon = address.indexOf("::");
	const lastDoubleColon = address.lastIndexOf("::");
	if (firstDoubleColon !== -1 && firstDoubleColon !== lastDoubleColon) return null; // "::" used twice
	const head = firstDoubleColon === -1 ? address : address.slice(0, firstDoubleColon);
	const tail = firstDoubleColon === -1 ? "" : address.slice(firstDoubleColon + 2);

	const parseSide = (side: string): number[] | null => {
		if (side === "") return [];
		const parts = side.split(":");
		const groups: number[] = [];
		for (const [i, part] of parts.entries()) {
			if (i === parts.length - 1 && part.includes(".")) {
				// Trailing embedded IPv4 in dotted-decimal form, e.g. "::ffff:1.2.3.4".
				if (!isIPv4(part)) return null;
				const octets = part.split(".").map(Number);
				groups.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
				continue;
			}
			if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null;
			groups.push(Number.parseInt(part, 16));
		}
		return groups;
	};

	const headGroups = parseSide(head);
	const tailGroups = parseSide(tail);
	if (headGroups === null || tailGroups === null) return null;

	if (firstDoubleColon === -1) {
		return headGroups.length === 8 ? headGroups : null;
	}
	const missing = 8 - headGroups.length - tailGroups.length;
	if (missing < 0) return null;
	return [...headGroups, ...new Array(missing).fill(0), ...tailGroups];
}

/**
 * Node's `BlockList.check(addr, "ipv6")` only auto-normalizes IPv4-**mapped**
 * addresses (`::ffff:a.b.c.d`) against the IPv4 subnets. It does NOT unwrap:
 *  - NAT64 `64:ff9b::/96` (e.g. `64:ff9b::a9fe:a9fe` is `169.254.169.254` on
 *    an IPv6-only host behind a NAT64 gateway), or
 *  - the deprecated IPv4-compatible `::/96` (e.g. `::a9fe:a9fe` is also
 *    `169.254.169.254`).
 * Both would otherwise let a private/metadata IPv4 address slip past the
 * gate wrapped in an IPv6 literal. We don't blanket-block either prefix —
 * NAT64 legitimately carries public IPv4 for IPv6-only egress — we only
 * extract the embedded v4 and run it through the same IPv4 BlockList check.
 * Returns null (no embedding) for anything else, including addresses that
 * happen to fail to parse — callers already fail closed via the ipv6 check.
 */
function extractNat64OrCompatIPv4(address: string): string | null {
	const groups = parseIPv6Groups(address);
	if (!groups) return null;
	const prefixIsZero = groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0;
	const isNat64 = groups[0] === 0x0064 && groups[1] === 0xff9b && groups[2] === 0 && groups[3] === 0 && groups[4] === 0;
	const isIPv4Compatible = prefixIsZero && groups[5] === 0;
	if (!isNat64 && !isIPv4Compatible) return null;
	const hi = groups[6];
	const lo = groups[7];
	return `${(hi >>> 8) & 0xff}.${hi & 0xff}.${(lo >>> 8) & 0xff}.${lo & 0xff}`;
}

/**
 * True if `ip` is loopback/private/link-local/multicast/metadata, or an
 * IPv6 address (IPv4-mapped, NAT64, or IPv4-compatible) whose embedded v4
 * address is any of those.
 * Fails closed: anything that isn't a parseable IPv4/IPv6 literal is treated
 * as disallowed.
 */
export function isDisallowedAddress(ip: string): boolean {
	const address = ip.split("%")[0]; // strip a zone id, e.g. "fe80::1%eth0"
	if (isIPv4(address)) {
		return disallowedAddresses.check(address, "ipv4");
	}
	if (isIPv6(address)) {
		// BlockList.check(..., "ipv6") normalizes IPv4-mapped addresses
		// (::ffff:a.b.c.d) against ipv4 subnets automatically.
		if (disallowedAddresses.check(address, "ipv6")) return true;
		const embeddedV4 = extractNat64OrCompatIPv4(address);
		return embeddedV4 !== null && disallowedAddresses.check(embeddedV4, "ipv4");
	}
	return true;
}

async function dnsLookupAll(host: string): Promise<string[]> {
	try {
		const results = await dnsLookup(host, { all: true, verbatim: true });
		return results.map((r) => r.address);
	} catch {
		return [];
	}
}

/**
 * The public `TransportResponse.stream` type is `NodeJS.ReadableStream` per
 * the injectable-transport contract, which doesn't declare `destroy()` — but
 * every real stream we hand back here (http.IncomingMessage, or whatever a
 * test's fixture transport returns) is a `stream.Readable` and does have it.
 */
function destroySafely(stream: NodeJS.ReadableStream): void {
	(stream as unknown as { destroy?: () => void }).destroy?.();
}

function flattenHeaders(headers: IncomingHttpHeaders): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		if (value === undefined) continue;
		out[key] = Array.isArray(value) ? value.join(", ") : value;
	}
	return out;
}

function defaultTransport(opts: TransportRequestOptions): Promise<TransportResponse> {
	return new Promise((resolve, reject) => {
		const isHttps = opts.protocol === "https:";
		const agent = isHttps
			? new HttpsAgent({ keepAlive: false, maxSockets: 1 })
			: new HttpAgent({ keepAlive: false, maxSockets: 1 });

		// Pin the connection to the pre-validated IP regardless of what the
		// hostname would otherwise resolve to. `hostname`/`host` stay the real
		// domain so the Host header and TLS SNI are correct.
		const pinnedLookup: LookupFunction = (_hostname, lookupOptions, callback) => {
			const family = isIPv6(opts.pinnedIp) ? 6 : 4;
			if (lookupOptions?.all) {
				callback(null, [{ address: opts.pinnedIp, family }]);
			} else {
				callback(null, opts.pinnedIp, family);
			}
		};

		const requestFn = isHttps ? httpsRequest : httpRequest;
		const req = requestFn(
			{
				protocol: opts.protocol,
				hostname: opts.hostname,
				host: opts.hostname,
				port: opts.port,
				path: opts.path,
				method: "GET",
				headers: opts.headers,
				agent,
				signal: opts.signal,
				lookup: pinnedLookup,
			},
			(res) => {
				resolve({ statusCode: res.statusCode ?? 0, headers: flattenHeaders(res.headers), stream: res });
			},
		);
		req.on("close", () => agent.destroy());
		req.on("error", (err) => reject(err));
		req.end();
	});
}

function isAcceptableContentType(contentType: string | null, accept: "html" | "text"): boolean {
	if (!contentType) return false;
	const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
	if (accept === "html") return mime === "text/html" || mime === "application/xhtml+xml";
	return (
		mime.startsWith("text/") || mime === "application/xhtml+xml" || mime.endsWith("+xml") || mime === "application/xml"
	);
}

interface UrlValidation {
	ok: boolean;
	hostname: string;
	port: number;
}

function validateRequestUrl(u: URL, allowHosts: string[], allowPorts: number[]): UrlValidation | null {
	if (u.protocol !== "http:" && u.protocol !== "https:") return null;
	if (u.username || u.password) return null;
	const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
	if (!allowPorts.includes(port)) return null;
	if (!hostMatchesAllowlist(u.hostname, allowHosts)) return null;
	return { ok: true, hostname: u.hostname, port };
}

type BodyReadResult = { kind: "ok"; body: string } | { kind: "too-large" } | { kind: "aborted" } | { kind: "error" };

function readBodyCapped(stream: NodeJS.ReadableStream, maxBytes: number, signal: AbortSignal): Promise<BodyReadResult> {
	return new Promise((resolve) => {
		let settled = false;
		let received = 0;
		const chunks: Buffer[] = [];

		const finish = (result: BodyReadResult) => {
			if (settled) return;
			settled = true;
			signal.removeEventListener("abort", onAbort);
			stream.removeAllListeners("data");
			stream.removeAllListeners("end");
			stream.removeAllListeners("error");
			resolve(result);
		};

		const onAbort = () => {
			destroySafely(stream);
			finish({ kind: "aborted" });
		};

		if (signal.aborted) {
			onAbort();
			return;
		}
		signal.addEventListener("abort", onAbort, { once: true });

		stream.on("data", (chunk: Buffer) => {
			received += chunk.length;
			if (received > maxBytes) {
				destroySafely(stream);
				finish({ kind: "too-large" });
				return;
			}
			chunks.push(chunk);
		});
		stream.on("end", () => finish({ kind: "ok", body: Buffer.concat(chunks).toString("utf8") }));
		stream.on("error", () => finish({ kind: "error" }));
	});
}

type TransportOutcome = { kind: "response"; response: TransportResponse } | { kind: "timeout" } | { kind: "error" };

function runTransport(
	transport: NonNullable<SafeFetchOptions["transport"]>,
	reqOpts: TransportRequestOptions,
): Promise<TransportOutcome> {
	return new Promise((resolve) => {
		let settled = false;

		const onAbort = () => {
			if (settled) return;
			settled = true;
			resolve({ kind: "timeout" });
		};

		if (reqOpts.signal.aborted) {
			onAbort();
			return;
		}
		reqOpts.signal.addEventListener("abort", onAbort, { once: true });

		transport(reqOpts).then(
			(response) => {
				if (settled) {
					// Timed out before this arrived — don't leak the socket.
					destroySafely(response.stream);
					return;
				}
				settled = true;
				reqOpts.signal.removeEventListener("abort", onAbort);
				resolve({ kind: "response", response });
			},
			() => {
				if (settled) return;
				settled = true;
				reqOpts.signal.removeEventListener("abort", onAbort);
				resolve({ kind: "error" });
			},
		);
	});
}

function blockedResult(): SafeFetchResult {
	return { status: "blocked", httpStatus: null, finalUrl: null, body: null, contentType: null };
}

function timeoutResult(): SafeFetchResult {
	return { status: "timeout", httpStatus: null, finalUrl: null, body: null, contentType: null };
}

interface HopHandshake {
	hostname: string;
	port: number;
	pinnedIp: string;
}

type HopGateResult = { ok: true; handshake: HopHandshake } | { ok: false };

/**
 * Full pre-flight for one hop: scheme/credentials/port/allowlist, then
 * resolve + reject-if-any-disallowed. Run again from scratch for every
 * redirect target — nothing here is cached across hops.
 */
async function gateHop(
	currentUrl: URL,
	allowHosts: string[],
	allowPorts: number[],
	resolver: NonNullable<SafeFetchOptions["resolver"]>,
): Promise<HopGateResult> {
	const validation = validateRequestUrl(currentUrl, allowHosts, allowPorts);
	if (!validation) return { ok: false };

	let addresses: string[];
	try {
		addresses = await resolver(validation.hostname);
	} catch {
		return { ok: false };
	}
	if (addresses.length === 0 || addresses.some(isDisallowedAddress)) {
		return { ok: false };
	}

	return { ok: true, handshake: { hostname: validation.hostname, port: validation.port, pinnedIp: addresses[0] } };
}

function buildRequestHeaders(): Record<string, string> {
	return { "user-agent": USER_AGENT, accept: "*/*", connection: "close" };
}

type HopOutcome = { kind: "redirect"; nextUrl: URL } | { kind: "result"; result: SafeFetchResult };

/** Interpret one hop's response: follow a same-loop redirect, or produce a terminal result. */
async function interpretResponse(
	transportResponse: TransportResponse,
	currentUrl: URL,
	accept: "html" | "text",
	maxBytes: number,
	signal: AbortSignal,
): Promise<HopOutcome> {
	const { statusCode, headers } = transportResponse;
	const contentType = headers["content-type"] ?? null;
	const finalUrl = currentUrl.toString();

	if (REDIRECT_STATUSES.has(statusCode) && headers.location) {
		try {
			return { kind: "redirect", nextUrl: new URL(headers.location, currentUrl) };
		} catch {
			return { kind: "result", result: blockedResult() };
		}
	}

	if (statusCode === 404 || statusCode === 410) {
		return {
			kind: "result",
			result: { status: "not-found", httpStatus: statusCode, finalUrl, body: null, contentType },
		};
	}

	if (statusCode < 200 || statusCode >= 300) {
		return { kind: "result", result: { status: "failed", httpStatus: statusCode, finalUrl, body: null, contentType } };
	}

	if (!isAcceptableContentType(contentType, accept)) {
		return {
			kind: "result",
			result: { status: "unsupported-content-type", httpStatus: statusCode, finalUrl, body: null, contentType },
		};
	}

	const bodyResult = await readBodyCapped(transportResponse.stream, maxBytes, signal);
	if (bodyResult.kind === "too-large") {
		return {
			kind: "result",
			result: { status: "too-large", httpStatus: statusCode, finalUrl, body: null, contentType },
		};
	}
	if (bodyResult.kind === "aborted") {
		return { kind: "result", result: timeoutResult() };
	}
	if (bodyResult.kind === "error") {
		return { kind: "result", result: { status: "failed", httpStatus: statusCode, finalUrl, body: null, contentType } };
	}
	return {
		kind: "result",
		result: { status: "ok", httpStatus: statusCode, finalUrl, body: bodyResult.body, contentType },
	};
}

interface SafeFetchConfig {
	allowPorts: number[];
	maxBytes: number;
	timeoutMs: number;
	maxRedirects: number;
	resolver: NonNullable<SafeFetchOptions["resolver"]>;
	transport: NonNullable<SafeFetchOptions["transport"]>;
}

function resolveConfig(opts: SafeFetchOptions): SafeFetchConfig {
	return {
		allowPorts: opts.allowPorts ?? DEFAULT_ALLOW_PORTS,
		maxBytes: opts.maxBytes ?? DEFAULT_MAX_BYTES,
		timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		maxRedirects: opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
		resolver: opts.resolver ?? dnsLookupAll,
		transport: opts.transport ?? defaultTransport,
	};
}

/**
 * Gate, connect, and interpret exactly one hop (initial request or a single
 * redirect target). Guarantees the transport's response stream is destroyed
 * before returning, whether that's a terminal result or a redirect to follow.
 */
async function runHop(
	currentUrl: URL,
	opts: SafeFetchOptions,
	config: SafeFetchConfig,
	signal: AbortSignal,
): Promise<HopOutcome> {
	if (signal.aborted) return { kind: "result", result: timeoutResult() };

	const gate = await gateHop(currentUrl, opts.allowHosts, config.allowPorts, config.resolver);
	if (!gate.ok) return { kind: "result", result: blockedResult() };

	if (signal.aborted) return { kind: "result", result: timeoutResult() };

	const outcome = await runTransport(config.transport, {
		protocol: currentUrl.protocol as "http:" | "https:",
		hostname: gate.handshake.hostname,
		port: gate.handshake.port,
		pinnedIp: gate.handshake.pinnedIp,
		path: `${currentUrl.pathname}${currentUrl.search}`,
		headers: buildRequestHeaders(),
		signal,
	});

	if (outcome.kind === "timeout") return { kind: "result", result: timeoutResult() };
	if (outcome.kind === "error") {
		const failed: SafeFetchResult = {
			status: "failed",
			httpStatus: null,
			finalUrl: currentUrl.toString(),
			body: null,
			contentType: null,
		};
		return { kind: "result", result: failed };
	}

	const transportResponse = outcome.response;
	try {
		return await interpretResponse(transportResponse, currentUrl, opts.accept, config.maxBytes, signal);
	} finally {
		// Guaranteed cleanup for every hop, including redirects (destroying an
		// already-destroyed stream is a safe no-op) — no per-redirect socket/agent leak.
		destroySafely(transportResponse.stream);
	}
}

export async function safeFetch(url: string, opts: SafeFetchOptions): Promise<SafeFetchResult> {
	let currentUrl: URL;
	try {
		currentUrl = new URL(url);
	} catch {
		return blockedResult();
	}

	const config = resolveConfig(opts);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), config.timeoutMs);

	try {
		for (let hop = 0; hop <= config.maxRedirects; hop++) {
			const hopOutcome = await runHop(currentUrl, opts, config, controller.signal);
			if (hopOutcome.kind === "result") {
				return hopOutcome.result;
			}
			// Redirect target is re-validated (scheme/creds/port/allowlist/resolve/gate) at the top of the loop.
			currentUrl = hopOutcome.nextUrl;
		}

		// Exhausted maxRedirects without landing on a terminal status.
		return { status: "failed", httpStatus: null, finalUrl: currentUrl.toString(), body: null, contentType: null };
	} finally {
		clearTimeout(timer);
	}
}
