import { beforeEach, describe, expect, it, vi } from "vitest";

const { getLatestKeywordCheckAttempt, getLatestCompletedKeywordCheck, send, findJobs } = vi.hoisted(() => ({
	getLatestKeywordCheckAttempt: vi.fn(),
	getLatestCompletedKeywordCheck: vi.fn(),
	send: vi.fn(),
	findJobs: vi.fn(),
}));

vi.mock("@workspace/lib/keywords", () => ({ getLatestKeywordCheckAttempt, getLatestCompletedKeywordCheck }));
vi.mock("@/lib/boss-client", () => ({ getBoss: vi.fn(async () => ({ send, findJobs })) }));

import { KEYWORD_CHECK_RUNNING_STALE_MINUTES, maybeEnqueueKeywordCheck, readKeywordCheck } from "@/server/keywords";

const BRAND_ID = "brand-1";
const attemptAt = (status: "running" | "completed" | "failed", ageMs: number, failureSummary?: string) => ({
	status,
	createdAt: new Date(Date.now() - ageMs),
	report: { pages: [], keywords: [], ...(failureSummary ? { failureSummary } : {}) },
});
const MINUTE = 60 * 1000;

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
			{ singletonKey: `keywords-${BRAND_ID}`, retryLimit: 0, expireInSeconds: 600 },
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

	it("reports enqueued:false when the queue already holds a waiting job for the brand", async () => {
		getLatestKeywordCheckAttempt.mockResolvedValue(attemptAt("completed", 60 * 1000));
		send.mockResolvedValue(null);
		await expect(maybeEnqueueKeywordCheck(BRAND_ID, { force: true })).resolves.toEqual({ enqueued: false });
	});

	it("reports enqueued:false instead of throwing when the queue is down", async () => {
		getLatestKeywordCheckAttempt.mockResolvedValue(null);
		send.mockRejectedValue(new Error("queue down"));
		await expect(maybeEnqueueKeywordCheck(BRAND_ID)).resolves.toEqual({ enqueued: false });
	});
});

describe("readKeywordCheck", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		findJobs.mockResolvedValue([]);
	});

	it("is running while the worker holds a fresh running row", async () => {
		getLatestCompletedKeywordCheck.mockResolvedValue(null);
		getLatestKeywordCheckAttempt.mockResolvedValue(attemptAt("running", MINUTE));
		await expect(readKeywordCheck(BRAND_ID)).resolves.toMatchObject({ running: true, failure: null });
	});

	it("is running while a job waits in the queue, before any row exists", async () => {
		getLatestCompletedKeywordCheck.mockResolvedValue(null);
		getLatestKeywordCheckAttempt.mockResolvedValue(null);
		findJobs.mockResolvedValue([{ createdOn: new Date(Date.now() - MINUTE) }]);
		await expect(readKeywordCheck(BRAND_ID)).resolves.toMatchObject({ running: true });
	});

	it("is not running once the running row or the queued job has gone stale", async () => {
		const stale = (KEYWORD_CHECK_RUNNING_STALE_MINUTES + 1) * MINUTE;
		getLatestCompletedKeywordCheck.mockResolvedValue(null);
		getLatestKeywordCheckAttempt.mockResolvedValue(attemptAt("running", stale));
		findJobs.mockResolvedValue([{ createdOn: new Date(Date.now() - stale) }]);
		await expect(readKeywordCheck(BRAND_ID)).resolves.toMatchObject({ running: false });
	});

	it("is not running when the queue cannot be reached", async () => {
		getLatestCompletedKeywordCheck.mockResolvedValue(null);
		getLatestKeywordCheckAttempt.mockResolvedValue(null);
		findJobs.mockRejectedValue(new Error("queue down"));
		await expect(readKeywordCheck(BRAND_ID)).resolves.toMatchObject({ running: false });
	});

	it("surfaces a failure that is newer than the latest completed check", async () => {
		getLatestCompletedKeywordCheck.mockResolvedValue(attemptAt("completed", 60 * MINUTE));
		getLatestKeywordCheckAttempt.mockResolvedValue(attemptAt("failed", MINUTE, "No page on the site could be read."));
		await expect(readKeywordCheck(BRAND_ID)).resolves.toMatchObject({
			failure: "No page on the site could be read.",
		});
	});

	it("surfaces a failure when nothing ever completed, with a fallback message", async () => {
		getLatestCompletedKeywordCheck.mockResolvedValue(null);
		getLatestKeywordCheckAttempt.mockResolvedValue(attemptAt("failed", MINUTE));
		await expect(readKeywordCheck(BRAND_ID)).resolves.toMatchObject({ failure: "The check failed." });
	});

	it("hides a failure once a later check completed", async () => {
		const completed = attemptAt("completed", MINUTE);
		getLatestCompletedKeywordCheck.mockResolvedValue(completed);
		getLatestKeywordCheckAttempt.mockResolvedValue(completed);
		await expect(readKeywordCheck(BRAND_ID)).resolves.toMatchObject({ latest: completed, failure: null });
	});
});
