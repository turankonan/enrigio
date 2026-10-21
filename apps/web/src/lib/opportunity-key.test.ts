import { describe, expect, it } from "vitest";
import { opportunityKey } from "@/lib/opportunity-key";

describe("opportunityKey", () => {
	it("ignores case, surrounding and repeated whitespace, and unicode form", () => {
		expect(opportunityKey("  Add a  Pricing page ")).toBe("add a pricing page");
		expect(opportunityKey("Add a pricing page")).toBe(opportunityKey("ADD A PRICING PAGE"));
	});
});
