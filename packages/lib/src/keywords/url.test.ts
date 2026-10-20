import { describe, expect, it } from "vitest";
import { uniqueCanonicalUrls, withScheme } from "./url";

describe("uniqueCanonicalUrls", () => {
	it("treats a bare origin and its trailing-slash form as one page", () => {
		expect(uniqueCanonicalUrls(["https://x.com", "https://x.com/", "https://x.com/about"])).toEqual([
			"https://x.com/",
			"https://x.com/about",
		]);
	});

	it("drops values that are not valid URLs", () => {
		expect(uniqueCanonicalUrls(["not a url", "https://x.com/a"])).toEqual(["https://x.com/a"]);
	});
});

describe("withScheme", () => {
	it("assumes https for a bare domain so the homepage is still fetched", () => {
		expect(uniqueCanonicalUrls([withScheme("x.com")])).toEqual(["https://x.com/"]);
	});

	it("keeps an explicit scheme", () => {
		expect(withScheme("http://x.com/shop")).toBe("http://x.com/shop");
	});
});
