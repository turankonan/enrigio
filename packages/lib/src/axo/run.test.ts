/**
 * `runSiteAudit` orchestrator tests. The db module is mocked with a small
 * stateful fake (Phase-0 style, see `secrets/store.test.ts`) that tracks
 * every insert/update by table identity, so assertions can check the
 * running->final row lifecycle without a real database. Every other
 * collaborator (selection, network fetchers, LLM scoring) is mocked too;
 * `./html` and `./robots` are left real since they're pure and cheap.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SafeFetchResult } from "../net/safe-fetch";
import type { RobotsInfo } from "./fetchers";
import type { ScoreResult } from "./score";
import type { SelectionResult } from "./select-pages";

interface FakeInsert {
	kind: "siteAudits" | "usageEvents" | "unknown";
	values: Record<string, unknown>;
}
interface FakeUpdate {
	kind: "siteAudits" | "unknown";
	values: Record<string, unknown>;
}

// A `function` declaration (not `const`) so it's hoisted above the
// `vi.mock("../db/db", ...)` call that references it, mirroring `dbState`.
function rowsForTable(table: unknown, schema: typeof import("../db/schema")): unknown[] {
	if (table === schema.brands) return dbState.brandRow ? [dbState.brandRow] : [];
	if (table === schema.prompts) return dbState.promptRows;
	return [];
}

const dbState = vi.hoisted(() => ({
	auditId: "audit-1",
	brandRow: null as Record<string, unknown> | null,
	promptRows: [] as { value: string }[],
	inserts: [] as FakeInsert[],
	updates: [] as FakeUpdate[],
}));

vi.mock("../db/db", async () => {
	const schema = await vi.importActual<typeof import("../db/schema")>("../db/schema");
	return {
		db: {
			insert: (table: unknown) => ({
				values: (values: Record<string, unknown>) => {
					const kind =
						table === schema.siteAudits ? "siteAudits" : table === schema.usageEvents ? "usageEvents" : "unknown";
					dbState.inserts.push({ kind, values });
					// Plain (non-thenable) return value: `await db.insert(usageEvents).values(...)`
					// with no `.returning()` call just resolves to this object immediately.
					return { returning: async () => [{ id: dbState.auditId }] };
				},
			}),
			update: (table: unknown) => ({
				set: (values: Record<string, unknown>) => ({
					where: async () => {
						const kind = table === schema.siteAudits ? "siteAudits" : "unknown";
						dbState.updates.push({ kind, values });
					},
				}),
			}),
			select: (_cols: unknown) => ({
				from: (table: unknown) => ({
					where: (_cond: unknown) => ({
						limit: async (_n: number) => rowsForTable(table, schema),
					}),
				}),
			}),
		},
	};
});

vi.mock("./select-pages", () => ({ selectAuditPages: vi.fn() }));
vi.mock("./fetchers", () => ({ fetchRobots: vi.fn(), fetchSitemapUrls: vi.fn() }));
vi.mock("../net/safe-fetch", () => ({ safeFetch: vi.fn() }));
vi.mock("./score", () => ({ scorePageRelevance: vi.fn() }));

const { runSiteAudit } = await import("./run");
const { selectAuditPages } = await import("./select-pages");
const { fetchRobots, fetchSitemapUrls } = await import("./fetchers");
const { safeFetch } = await import("../net/safe-fetch");
const { scorePageRelevance } = await import("./score");

const WINDOW = { fromIso: "2026-01-01T00:00:00.000Z", toIso: "2026-01-08T00:00:00.000Z" };
const HTML = "<html><head><title>T</title></head><body><h1>H</h1></body></html>";

function okFetch(overrides: Partial<SafeFetchResult> = {}): SafeFetchResult {
	return { status: "ok", httpStatus: 200, finalUrl: null, body: HTML, contentType: "text/html", ...overrides };
}
function okScore(overrides: Partial<Extract<ScoreResult, { ok: true }>> = {}): ScoreResult {
	return { ok: true, score: 4, note: "good fit", providerId: "anthropic-api", model: "claude-x", ...overrides };
}
function selection(overrides: Partial<SelectionResult> = {}): SelectionResult {
	return { targets: [], usedFallback: false, citationCount: 0, window: WINDOW, ...overrides };
}
const emptyRobots: RobotsInfo = { robotsTxt: null, llmsTxt: "absent", sitemap: "absent" };

beforeEach(() => {
	dbState.auditId = "audit-1";
	dbState.brandRow = {
		id: "brand-1",
		organizationId: "org-1",
		name: "Acme",
		website: "https://acme.com",
		additionalDomains: [],
	};
	dbState.promptRows = [];
	dbState.inserts = [];
	dbState.updates = [];

	vi.mocked(selectAuditPages).mockReset();
	vi.mocked(fetchRobots).mockReset().mockResolvedValue(emptyRobots);
	vi.mocked(fetchSitemapUrls).mockReset().mockResolvedValue([]);
	vi.mocked(safeFetch).mockReset();
	vi.mocked(scorePageRelevance).mockReset();
});

describe("runSiteAudit", () => {
	it("inserts a running row first, then updates it to completed", async () => {
		vi.mocked(selectAuditPages).mockResolvedValue(
			selection({ targets: [{ url: "https://acme.com/a", relatedPrompts: ["q1"] }], citationCount: 3 }),
		);
		vi.mocked(safeFetch).mockResolvedValue(okFetch());
		vi.mocked(scorePageRelevance).mockResolvedValue(okScore());

		const id = await runSiteAudit("brand-1");

		expect(id).toBe("audit-1");
		expect(dbState.inserts[0]?.kind).toBe("siteAudits");
		expect(dbState.inserts[0]?.values.status).toBe("running");
		expect(dbState.inserts[0]?.values.startedAt).toBeInstanceOf(Date);

		expect(dbState.updates).toHaveLength(1);
		expect(dbState.updates[0]?.kind).toBe("siteAudits");
		expect(dbState.updates[0]?.values.status).toBe("completed");
		const report = dbState.updates[0]?.values.report as { window: unknown; pages: unknown[] };
		expect(report.window).toEqual({ ...WINDOW, citationCount: 3 });
		expect(report.pages).toHaveLength(1);
	});

	it("is crash-safe: a collaborator throwing mid-run updates the running row to failed and rethrows", async () => {
		vi.mocked(selectAuditPages).mockRejectedValue(new Error("boom"));

		await expect(runSiteAudit("brand-1")).rejects.toThrow("boom");

		expect(dbState.inserts[0]?.values.status).toBe("running");
		expect(dbState.updates).toHaveLength(1);
		expect(dbState.updates[0]?.values.status).toBe("failed");
		const report = dbState.updates[0]?.values.report as { failureSummary?: string };
		expect(report.failureSummary).toContain("boom");
	});

	it("marks the audit failed (with a failureSummary) when every page fetch fails", async () => {
		vi.mocked(selectAuditPages).mockResolvedValue(
			selection({ targets: [{ url: "https://acme.com/a", relatedPrompts: [] }] }),
		);
		vi.mocked(safeFetch).mockResolvedValue({
			status: "timeout",
			httpStatus: null,
			finalUrl: null,
			body: null,
			contentType: null,
		});

		const id = await runSiteAudit("brand-1");

		expect(id).toBe("audit-1");
		expect(dbState.updates[0]?.values.status).toBe("failed");
		const report = dbState.updates[0]?.values.report as { failureSummary?: string; pages: { fetchStatus: string }[] };
		expect(report.failureSummary).toBeTruthy();
		expect(report.pages[0]?.fetchStatus).toBe("timeout");
		expect(scorePageRelevance).not.toHaveBeenCalled();
	});

	it("falls back to the homepage + sitemap when selection finds no citations", async () => {
		vi.mocked(selectAuditPages).mockResolvedValue(selection());
		vi.mocked(fetchSitemapUrls).mockResolvedValue(["https://acme.com/about"]);
		dbState.promptRows = [{ value: "what is acme?" }];
		vi.mocked(safeFetch).mockResolvedValue(okFetch());
		vi.mocked(scorePageRelevance).mockResolvedValue(okScore());

		await runSiteAudit("brand-1");

		const report = dbState.updates[0]?.values.report as {
			usedFallback: boolean;
			pages: { requestedUrl: string; relatedPrompts: string[] }[];
		};
		expect(report.usedFallback).toBe(true);
		expect(report.pages.map((p) => p.requestedUrl)).toEqual(["https://acme.com", "https://acme.com/about"]);
		expect(report.pages.every((p) => p.relatedPrompts.includes("what is acme?"))).toBe(true);
	});

	it("records a usage event per score attempt, preserving providerId on failure", async () => {
		vi.mocked(selectAuditPages).mockResolvedValue(
			selection({
				targets: [
					{ url: "https://acme.com/a", relatedPrompts: ["q1"] },
					{ url: "https://acme.com/b", relatedPrompts: ["q2"] },
				],
			}),
		);
		vi.mocked(safeFetch).mockResolvedValue(okFetch());
		vi.mocked(scorePageRelevance)
			.mockResolvedValueOnce(okScore({ score: 5 }))
			.mockResolvedValueOnce({ ok: false, providerId: "anthropic-api", model: null, errorKind: "exception" });

		await runSiteAudit("brand-1");

		const usageInserts = dbState.inserts.filter((i) => i.kind === "usageEvents");
		expect(usageInserts).toHaveLength(2);
		expect(usageInserts.map((i) => i.values.eventType).sort()).toEqual(["site_audit_score", "site_audit_score_failed"]);

		const failedEvent = usageInserts.find((i) => i.values.eventType === "site_audit_score_failed");
		expect(failedEvent?.values.provider).toBe("anthropic-api");
		expect(failedEvent?.values.model).toBeNull();
		expect(failedEvent?.values.organizationId).toBe("org-1");
		expect(failedEvent?.values.brandId).toBe("brand-1");
	});

	it("never runs more than 3 page-scoring calls concurrently", async () => {
		const targets = Array.from({ length: 8 }, (_, i) => ({ url: `https://acme.com/p${i}`, relatedPrompts: [] }));
		vi.mocked(selectAuditPages).mockResolvedValue(selection({ targets, citationCount: 8 }));
		vi.mocked(safeFetch).mockResolvedValue(okFetch());

		let inFlight = 0;
		let peak = 0;
		vi.mocked(scorePageRelevance).mockImplementation(async () => {
			inFlight++;
			peak = Math.max(peak, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 5));
			inFlight--;
			return okScore();
		});

		await runSiteAudit("brand-1");

		expect(peak).toBeGreaterThan(1);
		expect(peak).toBeLessThanOrEqual(3);
	});
});
