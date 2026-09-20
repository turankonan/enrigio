import { describe, expect, it } from "vitest";
import { requireMarketCodes } from "./dataforseo";

describe("requireMarketCodes", () => {
	it("returns the market codes when present", () => {
		expect(requireMarketCodes({ market: { locationCode: 2792, languageCode: "tr" } })).toEqual({
			locationCode: 2792,
			languageCode: "tr",
		});
	});
	it("throws when a localizable route is called without a market", () => {
		expect(() => requireMarketCodes({})).toThrow(/requires options\.market/i);
		expect(() => requireMarketCodes(undefined)).toThrow(/requires options\.market/i);
	});
});
