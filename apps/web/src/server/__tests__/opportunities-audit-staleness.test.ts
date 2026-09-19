/**
 * `resolveOpportunities` now treats a stored report as stale not only when it's
 * old, but also when a newer site audit has completed since it was generated —
 * even if the report is otherwise within the time-based freshness window.
 * `resolveFilteredPrompts` stands in for "the regenerate path was entered": it's
 * the first thing `buildDigest` does, so returning `[]` from it short-circuits
 * before any LLM call or DB write, letting these tests observe which branch
 * `resolveOpportunities` took without standing up the whole generation pipeline.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireBrandSession, enqueueSiteAuditIfStale, getLatestBrandAudit, resolveFilteredPrompts, dbState } =
	vi.hoisted(() => ({
		requireBrandSession: vi.fn(async () => ({ user: { id: "u1" } })),
		enqueueSiteAuditIfStale: vi.fn(async () => ({ enqueued: false })),
		getLatestBrandAudit: vi.fn(),
		resolveFilteredPrompts: vi.fn(async () => []),
		dbState: { latest: null as Record<string, unknown> | null },
	}));

vi.mock("@/lib/auth/helpers", () => ({ requireBrandSession }));
vi.mock("@/server/site-audit", () => ({ enqueueSiteAuditIfStale, getLatestBrandAudit }));
vi.mock("@/server/prompt-resolution", () => ({ resolveFilteredPrompts }));
vi.mock("@workspace/lib/db/db", () => {
	const chain = {
		select: () => chain,
		from: () => chain,
		where: () => chain,
		orderBy: () => chain,
		limit: async () => (dbState.latest ? [dbState.latest] : []),
		insert: () => {
			throw new Error("insert should not be reached in these tests");
		},
	};
	return { db: chain };
});

const { resolveOpportunities } = await import("@/server/opportunities");

const BRAND_ID = "brand-1";

function storedReport(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: "row-1",
		createdAt: new Date(),
		model: "test-model",
		siteAuditId: null,
		report: { summary: ["existing summary"], opportunities: [], risks: [] },
		...overrides,
	};
}

function completedAudit(id: string) {
	return {
		id,
		createdAt: new Date(),
		report: { window: { fromIso: "", toIso: "", citationCount: 0 }, origins: [], pages: [] },
	};
}

describe("resolveOpportunities — audit staleness", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		requireBrandSession.mockResolvedValue({ user: { id: "u1" } });
		enqueueSiteAuditIfStale.mockResolvedValue({ enqueued: false });
		resolveFilteredPrompts.mockResolvedValue([]);
		dbState.latest = null;
	});

	it("serves the stored report when the audit id matches and the report is within the freshness window", async () => {
		dbState.latest = storedReport({ siteAuditId: "audit-1", createdAt: new Date() });
		getLatestBrandAudit.mockResolvedValue(completedAudit("audit-1"));

		const result = await resolveOpportunities(BRAND_ID);

		expect(resolveFilteredPrompts).not.toHaveBeenCalled();
		expect(result.report).toEqual(dbState.latest.report);
	});

	it("regenerates when a newer completed audit exists, even within the time-based freshness window", async () => {
		dbState.latest = storedReport({ siteAuditId: "audit-old", createdAt: new Date() });
		getLatestBrandAudit.mockResolvedValue(completedAudit("audit-new"));

		await resolveOpportunities(BRAND_ID);

		expect(resolveFilteredPrompts).toHaveBeenCalledWith(BRAND_ID, {});
	});

	it("treats a never-audited brand's null audit id and a stored report's null siteAuditId as equal (no churn)", async () => {
		dbState.latest = storedReport({ siteAuditId: null, createdAt: new Date() });
		getLatestBrandAudit.mockResolvedValue(null);

		const result = await resolveOpportunities(BRAND_ID);

		expect(resolveFilteredPrompts).not.toHaveBeenCalled();
		expect(result.report).toEqual(dbState.latest.report);
	});

	it("authorizes before touching anything else", async () => {
		requireBrandSession.mockRejectedValue(new Error("Forbidden"));

		await expect(resolveOpportunities(BRAND_ID)).rejects.toThrow("Forbidden");
		expect(enqueueSiteAuditIfStale).not.toHaveBeenCalled();
		expect(getLatestBrandAudit).not.toHaveBeenCalled();
	});
});
