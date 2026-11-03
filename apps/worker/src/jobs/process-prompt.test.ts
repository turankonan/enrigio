import type { Brand, Competitor } from "@workspace/lib/db/schema";
import { resolveEffectiveMarket } from "@workspace/lib/markets";
import type { Provider, ScrapeResult } from "@workspace/lib/providers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runModelIteration } from "./process-prompt";

const insertedPromptRuns: Record<string, unknown>[] = [];

const classifyMention = vi.hoisted(() => vi.fn());
vi.mock("@workspace/lib/mention-classify", () => ({ classifyMention }));

vi.mock("@workspace/lib/db/db", async () => {
	const schema = await vi.importActual<typeof import("@workspace/lib/db/schema")>("@workspace/lib/db/schema");
	return {
		db: {
			insert: (table: unknown) => ({
				values: (vals: Record<string, unknown>) => {
					if (table === schema.promptRuns) {
						insertedPromptRuns.push(vals);
						return { returning: async () => [{ id: "run_1", createdAt: new Date("2026-01-01T00:00:00Z") }] };
					}
					// usage_events / citations inserts: no further chaining needed for a
					// non-mentioning, citation-free result.
					return Promise.resolve(undefined);
				},
			}),
		},
	};
});

vi.mock("../boss", () => ({ default: { send: vi.fn() } }));
vi.mock("../telemetry", () => ({ trackWorkerEvent: vi.fn() }));

function makeBrand(overrides: Partial<Brand> = {}): Brand {
	return {
		id: "brand_1",
		name: "Acme Corp",
		slug: "acme-corp",
		website: "https://acme.example",
		additionalDomains: [],
		aliases: [],
		keywords: [],
		enabled: true,
		onboarded: true,
		delayOverrideHours: null,
		enabledModels: null,
		defaultMarketKey: null,
		organizationId: "org_1",
		createdAt: new Date("2026-01-01T00:00:00Z"),
		updatedAt: new Date("2026-01-01T00:00:00Z"),
		...overrides,
	};
}

const competitorsList: Competitor[] = [];

// Never mentions "Acme" so the mention-classification LLM call is skipped.
const NON_MENTIONING_RESULT: ScrapeResult = {
	textContent: "Some unrelated answer about widgets in general.",
	rawOutput: {},
	webQueries: [],
	citations: [],
	modelVersion: "test-model",
};

function makeProvider(run: Provider["run"]): Provider {
	return { id: "test-provider", name: "Test Provider", access: "scraped", isConfigured: () => true, run };
}

describe("runModelIteration market stamping", () => {
	beforeEach(() => {
		insertedPromptRuns.length = 0;
	});
	afterEach(() => vi.unstubAllEnvs());

	it("stamps localizable runs with the brand's effective market and passes it to the provider", async () => {
		const brand = makeBrand({ defaultMarketKey: "de-DE" });
		const effectiveMarket = resolveEffectiveMarket({ defaultMarketKey: brand.defaultMarketKey });
		const runSpy = vi.fn(async () => NON_MENTIONING_RESULT);

		await runModelIteration({
			promptId: "prompt_1",
			promptValue: "best widgets",
			brand,
			competitorsList,
			config: { model: "google-ai-overview", provider: "dataforseo", webSearch: true },
			providerImpl: makeProvider(runSpy),
			runIndex: 1,
			effectiveMarket,
			branded: false,
		});

		expect(runSpy).toHaveBeenCalledWith(
			"google-ai-overview",
			"best widgets",
			expect.objectContaining({ market: { locationCode: 2276, languageCode: "de" } }),
		);
		expect(insertedPromptRuns).toHaveLength(1);
		expect(insertedPromptRuns[0]).toMatchObject({ marketKey: "de-DE" });
	});

	it("stamps non-localizable runs as global and passes no market to the provider", async () => {
		const brand = makeBrand({ defaultMarketKey: "de-DE" });
		const effectiveMarket = resolveEffectiveMarket({ defaultMarketKey: brand.defaultMarketKey });
		const runSpy = vi.fn(async () => NON_MENTIONING_RESULT);

		await runModelIteration({
			promptId: "prompt_1",
			promptValue: "best widgets",
			brand,
			competitorsList,
			config: { model: "chatgpt", provider: "openai-api", webSearch: true },
			providerImpl: makeProvider(runSpy),
			runIndex: 1,
			effectiveMarket,
			branded: false,
		});

		expect(runSpy).toHaveBeenCalledWith("chatgpt", "best widgets", expect.objectContaining({ market: undefined }));
		expect(insertedPromptRuns).toHaveLength(1);
		expect(insertedPromptRuns[0]).toMatchObject({ marketKey: "global" });
	});

	it("stamps a localizable run tr-TR when the brand has no default market and the env resolves there", async () => {
		vi.stubEnv("DATAFORSEO_LOCATION_CODE", "2792");
		vi.stubEnv("DATAFORSEO_LANGUAGE_CODE", "tr");
		const brand = makeBrand({ defaultMarketKey: null });
		const effectiveMarket = resolveEffectiveMarket({ defaultMarketKey: brand.defaultMarketKey });
		const runSpy = vi.fn(async () => NON_MENTIONING_RESULT);

		await runModelIteration({
			promptId: "prompt_1",
			promptValue: "best widgets",
			brand,
			competitorsList,
			config: { model: "google-ai-overview", provider: "dataforseo", webSearch: true },
			providerImpl: makeProvider(runSpy),
			runIndex: 1,
			effectiveMarket,
			branded: false,
		});

		expect(runSpy).toHaveBeenCalledWith(
			"google-ai-overview",
			"best widgets",
			expect.objectContaining({ market: { locationCode: 2792, languageCode: "tr" } }),
		);
		expect(insertedPromptRuns[0]).toMatchObject({ marketKey: "tr-TR" });
	});

	it("stamps global and still scrapes the env location when the brand's market is unresolvable", async () => {
		// No catalog entry maps to (9999, "zz"): the brand's effective market is
		// the sentinel. A localizable run must still stamp "global" (no 500) and
		// still tell the provider to scrape the deployment's configured location
		// (no change to the actual scrape).
		vi.stubEnv("DATAFORSEO_LOCATION_CODE", "9999");
		vi.stubEnv("DATAFORSEO_LANGUAGE_CODE", "zz");
		const brand = makeBrand({ defaultMarketKey: null });
		const effectiveMarket = resolveEffectiveMarket({ defaultMarketKey: brand.defaultMarketKey });
		const runSpy = vi.fn(async () => NON_MENTIONING_RESULT);

		await runModelIteration({
			promptId: "prompt_1",
			promptValue: "best widgets",
			brand,
			competitorsList,
			config: { model: "google-ai-overview", provider: "dataforseo", webSearch: true },
			providerImpl: makeProvider(runSpy),
			runIndex: 1,
			effectiveMarket,
			branded: false,
		});

		expect(runSpy).toHaveBeenCalledWith(
			"google-ai-overview",
			"best widgets",
			expect.objectContaining({ market: { locationCode: 9999, languageCode: "zz" } }),
		);
		expect(insertedPromptRuns[0]).toMatchObject({ marketKey: "global" });
	});
});

const MENTIONING_RESULT: ScrapeResult = {
	textContent: "Acme Corp is a solid choice; it is based in Berlin.",
	rawOutput: {},
	webQueries: [],
	citations: [],
	modelVersion: "test-model",
};

function iteration(branded: boolean) {
	return runModelIteration({
		promptId: "prompt_1",
		promptValue: branded ? "is acme corp any good" : "best widget makers",
		brand: makeBrand(),
		competitorsList,
		config: { model: "chatgpt", provider: "openai-api", webSearch: true },
		providerImpl: makeProvider(async () => MENTIONING_RESULT),
		runIndex: 1,
		effectiveMarket: resolveEffectiveMarket({ defaultMarketKey: null }),
		branded,
	});
}

describe("runModelIteration accuracy claims", () => {
	beforeEach(() => {
		insertedPromptRuns.length = 0;
		classifyMention.mockReset();
	});

	it("passes the brand profile for a branded prompt and stores the claims", async () => {
		classifyMention.mockResolvedValue({
			sentiment: "neutral",
			brandRank: null,
			claims: [{ claim: "based in Berlin", status: "unsupported" }],
		});
		await iteration(true);
		expect(classifyMention).toHaveBeenCalledWith(
			expect.objectContaining({
				profile: expect.objectContaining({ name: "Acme Corp", website: "https://acme.example" }),
			}),
		);
		expect(insertedPromptRuns[0]?.accuracyClaims).toEqual([{ claim: "based in Berlin", status: "unsupported" }]);
	});

	it("passes no profile for an unbranded prompt and stores null", async () => {
		classifyMention.mockResolvedValue({ sentiment: "positive", brandRank: 2 });
		await iteration(false);
		expect(classifyMention.mock.calls[0]?.[0]).not.toHaveProperty("profile");
		expect(insertedPromptRuns[0]?.accuracyClaims).toBeNull();
	});

	it("stores null when the classifier fails", async () => {
		classifyMention.mockResolvedValue(null);
		await iteration(true);
		expect(insertedPromptRuns[0]?.accuracyClaims).toBeNull();
	});
});
