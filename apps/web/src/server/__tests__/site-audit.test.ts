import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireBrandSession, getLatestAuditAttempt, getLatestCompletedAudit, send } = vi.hoisted(() => ({
	requireBrandSession: vi.fn(),
	getLatestAuditAttempt: vi.fn(),
	getLatestCompletedAudit: vi.fn(),
	send: vi.fn(),
}));

vi.mock("@/lib/auth/helpers", () => ({ requireBrandSession }));
vi.mock("@workspace/lib/axo", () => ({ getLatestAuditAttempt, getLatestCompletedAudit }));
vi.mock("@/lib/boss-client", () => ({ getBoss: vi.fn(async () => ({ send })) }));

import {
	AUDIT_FAILED_RETRY_DAYS,
	AUDIT_RUNNING_STALE_MINUTES,
	enqueueSiteAuditIfStale,
	getLatestBrandAudit,
} from "@/server/site-audit";

const BRAND_ID = "brand-1";

function attemptAt(status: "running" | "completed" | "failed", ageMs: number) {
	return { status, createdAt: new Date(Date.now() - ageMs) };
}

describe("site-audit web layer", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		requireBrandSession.mockResolvedValue({ user: { id: "u1" } });
		send.mockResolvedValue("job-id");
	});

	describe("enqueueSiteAuditIfStale", () => {
		it("rejects when the caller may not access the brand", async () => {
			requireBrandSession.mockRejectedValue(new Error("Forbidden"));
			await expect(enqueueSiteAuditIfStale(BRAND_ID)).rejects.toThrow("Forbidden");
			expect(getLatestAuditAttempt).not.toHaveBeenCalled();
			expect(send).not.toHaveBeenCalled();
		});

		it("checks authorization before anything else", async () => {
			requireBrandSession.mockRejectedValue(new Error("Forbidden"));
			await expect(enqueueSiteAuditIfStale(BRAND_ID)).rejects.toThrow();
			expect(requireBrandSession).toHaveBeenCalledWith(BRAND_ID);
		});

		it("enqueues when there is no prior attempt", async () => {
			getLatestAuditAttempt.mockResolvedValue(null);

			const result = await enqueueSiteAuditIfStale(BRAND_ID);

			expect(result).toEqual({ enqueued: true });
			expect(send).toHaveBeenCalledTimes(1);
			expect(send).toHaveBeenCalledWith(
				"audit-site",
				{ brandId: BRAND_ID },
				{
					singletonKey: `audit-${BRAND_ID}`,
					singletonSeconds: 20 * 60,
					retryLimit: 0,
					expireInSeconds: 15 * 60,
				},
			);
		});

		it("skips when the latest attempt is a fresh completed audit", async () => {
			getLatestAuditAttempt.mockResolvedValue(attemptAt("completed", 60 * 60 * 1000)); // 1h old

			const result = await enqueueSiteAuditIfStale(BRAND_ID);

			expect(result).toEqual({ enqueued: false });
			expect(send).not.toHaveBeenCalled();
		});

		it("skips when the latest attempt is a recent failure", async () => {
			getLatestAuditAttempt.mockResolvedValue(attemptAt("failed", 60 * 60 * 1000)); // 1h old

			const result = await enqueueSiteAuditIfStale(BRAND_ID);

			expect(result).toEqual({ enqueued: false });
			expect(send).not.toHaveBeenCalled();
		});

		it("enqueues when the latest failure is older than the retry window", async () => {
			getLatestAuditAttempt.mockResolvedValue(attemptAt("failed", (AUDIT_FAILED_RETRY_DAYS + 1) * 24 * 60 * 60 * 1000));

			const result = await enqueueSiteAuditIfStale(BRAND_ID);

			expect(result).toEqual({ enqueued: true });
			expect(send).toHaveBeenCalledTimes(1);
		});

		it("skips when the latest attempt is a fresh running audit", async () => {
			getLatestAuditAttempt.mockResolvedValue(attemptAt("running", 60 * 1000)); // 1 minute old

			const result = await enqueueSiteAuditIfStale(BRAND_ID);

			expect(result).toEqual({ enqueued: false });
			expect(send).not.toHaveBeenCalled();
		});

		it("enqueues when the latest running audit is stale (crashed)", async () => {
			getLatestAuditAttempt.mockResolvedValue(attemptAt("running", (AUDIT_RUNNING_STALE_MINUTES + 5) * 60 * 1000));

			const result = await enqueueSiteAuditIfStale(BRAND_ID);

			expect(result).toEqual({ enqueued: true });
			expect(send).toHaveBeenCalledTimes(1);
		});

		it("returns enqueued:false without throwing when send fails", async () => {
			getLatestAuditAttempt.mockResolvedValue(null);
			send.mockRejectedValue(new Error("queue down"));

			const result = await enqueueSiteAuditIfStale(BRAND_ID);

			expect(result).toEqual({ enqueued: false });
		});
	});

	describe("getLatestBrandAudit", () => {
		it("rejects when the caller may not access the brand", async () => {
			requireBrandSession.mockRejectedValue(new Error("Forbidden"));
			await expect(getLatestBrandAudit(BRAND_ID)).rejects.toThrow("Forbidden");
			expect(getLatestCompletedAudit).not.toHaveBeenCalled();
		});

		it("returns the latest completed audit once authorized", async () => {
			const audit = { status: "completed", createdAt: new Date() };
			getLatestCompletedAudit.mockResolvedValue(audit);

			const result = await getLatestBrandAudit(BRAND_ID);

			expect(requireBrandSession).toHaveBeenCalledWith(BRAND_ID);
			expect(result).toBe(audit);
		});
	});
});
