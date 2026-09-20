import { describe, expect, it } from "vitest";
import { brands, promptRuns } from "./schema";

describe("market schema columns", () => {
	it("brands has a nullable default_market_key", () => {
		const col = (brands as any).default_market_key ?? (brands as any).defaultMarketKey;
		expect(col).toBeDefined();
		expect(col.name).toBe("default_market_key");
		expect(col.notNull).toBe(false);
	});
	it("prompt_runs has market_key NOT NULL with temporary 'legacy' default", () => {
		const col = (promptRuns as any).market_key ?? (promptRuns as any).marketKey;
		expect(col).toBeDefined();
		expect(col.name).toBe("market_key");
		expect(col.notNull).toBe(true);
		expect(col.default).toBe("legacy");
	});
});
