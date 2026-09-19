import { describe, expect, it } from "vitest";
import { extractDomain, hostMatchesAllowlist } from "./hostname";

describe("extractDomain", () => {
	it("normalizes host for grouping", () => {
		expect(extractDomain("https://WWW.Rigosis.com:443/x?y")).toBe("rigosis.com");
		expect(extractDomain("rigosis.com.")).toBe("rigosis.com");
		expect(extractDomain("rigosis.com:8443")).toBe("rigosis.com"); // schemeless host:port
	});
});

describe("hostMatchesAllowlist", () => {
	it("is exact (no www strip), port-agnostic, rejects look-alikes", () => {
		expect(hostMatchesAllowlist("rigosis.com:443", ["rigosis.com"])).toBe(true);
		expect(hostMatchesAllowlist("www.rigosis.com", ["rigosis.com"])).toBe(false); // caller must add the www variant
		expect(hostMatchesAllowlist("rigosis.com.evil.test", ["rigosis.com"])).toBe(false);
		expect(hostMatchesAllowlist("[::1]", ["::1"])).toBe(true); // IPv6 literal
	});
});
