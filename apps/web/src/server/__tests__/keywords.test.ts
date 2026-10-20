import { beforeEach, describe, expect, it, vi } from "vitest";

const { getLatestKeywordCheckAttempt, send } = vi.hoisted(() => ({
	getLatestKeywordCheckAttempt: vi.fn(),
	send: vi.fn(),
}));

vi.mock("@workspace/lib/keywords", () => ({ getLatestKeywordCheckAttempt, getLatestCompletedKeywordCheck: vi.fn() }));
vi.mock("@/lib/boss-client", () => ({ getBoss: vi.fn(async () => ({ send })) }));

import { KEYWORD_CHECK_RUNNING_STALE_MINUTES, maybeEnqueueKeywordCheck } from "@/server/keywords";

const BRAND_ID = "brand-1";
const attemptAt = (status: "running" | "completed" | "failed", ageMs: number) => ({
	status,
	createdAt: new Date(Date.now() - ageMs),
});

describe("maybeEnqueueKeywordCheck", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		send.mockResolvedValue("job-id");
	});

	it("enqueues when nothing ran before", async () => {
		getLatestKeywordCheckAttempt.mockResolvedValue(null);
		await expect(maybeEnqueueKeywordCheck(BRAND_ID)).resolves.toEqual({ enqueued: true });
		expect(send).toHaveBeenCalledWith(
			"check-keywords",
			{ brandId: BRAND_ID },
			{ singletonKey: `keywords-${BRAND_ID}`, singletonSeconds: 600, retryLimit: 0, expireInSeconds: 600 },
		);
	});

	it("skips a fresh completed check unless forced", async () => {
		getLatestKeywordCheckAttempt.mockResolvedValue(attemptAt("completed", 60 * 60 * 1000));
		await expect(maybeEnqueueKeywordCheck(BRAND_ID)).resolves.toEqual({ enqueued: false });
		await expect(maybeEnqueueKeywordCheck(BRAND_ID, { force: true })).resolves.toEqual({ enqueued: true });
	});

	it("never double-runs a check that is still in flight, even when forced", async () => {
		getLatestKeywordCheckAttempt.mockResolvedValue(attemptAt("running", 60 * 1000));
		await expect(maybeEnqueueKeywordCheck(BRAND_ID, { force: true })).resolves.toEqual({ enqueued: false });
	});

	it("treats a running row older than the stale window as crashed", async () => {
		getLatestKeywordCheckAttempt.mockResolvedValue(
			attemptAt("running", (KEYWORD_CHECK_RUNNING_STALE_MINUTES + 1) * 60 * 1000),
		);
		await expect(maybeEnqueueKeywordCheck(BRAND_ID)).resolves.toEqual({ enqueued: true });
	});

	it("skips a recent failure", async () => {
		getLatestKeywordCheckAttempt.mockResolvedValue(attemptAt("failed", 60 * 60 * 1000));
		await expect(maybeEnqueueKeywordCheck(BRAND_ID)).resolves.toEqual({ enqueued: false });
	});

	it("reports enqueued:false instead of throwing when the queue is down", async () => {
		getLatestKeywordCheckAttempt.mockResolvedValue(null);
		send.mockRejectedValue(new Error("queue down"));
		await expect(maybeEnqueueKeywordCheck(BRAND_ID)).resolves.toEqual({ enqueued: false });
	});
});
