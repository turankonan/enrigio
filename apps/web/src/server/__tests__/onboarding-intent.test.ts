import { beforeEach, describe, expect, it, vi } from "vitest";

const inserted: Record<string, unknown>[][] = [];
vi.mock("@workspace/lib/db/db", async () => {
	const schema = await vi.importActual<typeof import("@workspace/lib/db/schema")>("@workspace/lib/db/schema");
	const conn = {
		query: { prompts: { findMany: async () => [] } },
		insert: (table: unknown) => ({
			values: (rows: Record<string, unknown>[]) => {
				if (table === schema.prompts) inserted.push(rows);
				return { returning: async () => rows.map((_, i) => ({ id: `p${i}` })) };
			},
		}),
	};
	return { db: conn };
});
vi.mock("@workspace/lib/entitlements", () => ({
	assertCanAddPrompts: async () => {},
	assertCompetitorCap: async () => {},
	getBrandOrganizationId: async () => "org_1",
}));
vi.mock("@/lib/job-scheduler", () => ({ createMultiplePromptJobSchedulers: async () => {} }));

const { insertPrompts, createBrandInputSchema } = await import("@/server/onboarding-core");

describe("insertPrompts intent", () => {
	beforeEach(() => {
		inserted.length = 0;
	});

	it("persists a given intent and nulls a missing one", async () => {
		await insertPrompts({
			brandId: "brand_1",
			brandName: "Acme",
			website: "https://acme.example",
			source: [
				{ value: "best widgets", tags: [], enabled: true, intent: "discovery" },
				{ value: "is acme good", tags: [], enabled: true },
			],
			dedupeAgainstExisting: false,
		});

		expect(inserted[0]?.map((r) => r.intent)).toEqual(["discovery", null]);
	});
});

describe("public create-brand input", () => {
	it("does not carry a prompt intent", () => {
		const parsed = createBrandInputSchema.parse({
			id: "acme",
			name: "Acme",
			domains: ["acme.example"],
			prompts: [{ value: "best widgets", intent: "discovery" }],
		});

		expect(parsed.prompts?.[0]).not.toHaveProperty("intent");
	});
});
