/**
 * Shared hostname/domain normalization.
 *
 * `extractDomain` is for citation-domain **grouping only**: it strips
 * scheme/path/port, lowercases, and drops a leading "www." and trailing dot.
 * It deliberately treats the apex and "www." forms of a domain as the same
 * group — never use it for security-sensitive host comparisons.
 *
 * `hostMatchesAllowlist` is the SSRF allowlist gate: exact normalized-host
 * match (lowercase + strip port + strip trailing dot — nothing else). It does
 * NOT strip "www.", so an allowlist that should accept both the apex and
 * "www." host must list both forms explicitly.
 */

const HAS_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Strip a trailing ":port" from a host string. Bracketed IPv6 literals
 * (`[::1]`, `[::1]:8080`) have their brackets removed and any trailing port
 * dropped. An unbracketed host is only treated as `host:port` when it has
 * exactly one colon and the suffix is all digits — a bare IPv6 address like
 * `::1` has more than one colon and is left untouched.
 */
function stripPort(host: string): string {
	if (host.startsWith("[")) {
		const closeIdx = host.indexOf("]");
		return closeIdx === -1 ? host.slice(1) : host.slice(1, closeIdx);
	}
	const colonCount = (host.match(/:/g) ?? []).length;
	if (colonCount === 1) {
		const idx = host.indexOf(":");
		const maybePort = host.slice(idx + 1);
		if (/^\d+$/.test(maybePort)) return host.slice(0, idx);
	}
	return host;
}

function stripTrailingDot(host: string): string {
	return host.endsWith(".") ? host.slice(0, -1) : host;
}

/**
 * Lowercase host, drop scheme/path/query/fragment/port, drop a trailing dot,
 * and drop a leading "www." — used for grouping citations by domain, not for
 * security decisions.
 */
export function extractDomain(urlOrDomain: string): string {
	const input = urlOrDomain.trim();
	try {
		let host: string;
		if (HAS_SCHEME_RE.test(input)) {
			host = new URL(input).hostname;
		} else {
			const withoutPath = input.split(/[/?#]/)[0];
			host = stripPort(withoutPath);
		}
		let normalized = stripTrailingDot(host.toLowerCase());
		if (normalized.startsWith("www.")) normalized = normalized.slice(4);
		return normalized;
	} catch {
		return input.toLowerCase();
	}
}

/**
 * SSRF allowlist gate: true iff `host` exactly matches one of `allow` after
 * lowercasing and stripping the port and a trailing dot from both sides. No
 * "www." stripping and no subdomain/suffix matching — `rigosis.com.evil.test`
 * and `www.rigosis.com` are rejected against an allowlist of `["rigosis.com"]`.
 * Callers that want to accept both the apex and "www." host must list both.
 */
export function hostMatchesAllowlist(host: string, allow: string[]): boolean {
	const normalize = (h: string) => stripTrailingDot(stripPort(h.trim()).toLowerCase());
	const normalizedHost = normalize(host);
	return allow.some((entry) => normalize(entry) === normalizedHost);
}
