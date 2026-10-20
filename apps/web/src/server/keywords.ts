/**
 * Enqueue gate and reads for keyword checks. Authorization happens in
 * `keywords-fn.ts`; this module is also called from server code that has
 * already authorized (brand keyword updates).
 */
import {
	getLatestCompletedKeywordCheck,
	getLatestKeywordCheckAttempt,
	type KeywordCheck,
} from "@workspace/lib/keywords";
import { getBoss } from "@/lib/boss-client";

export const KEYWORD_CHECK_REFRESH_AFTER_DAYS = 7;
export const KEYWORD_CHECK_FAILED_RETRY_DAYS = 1;
export const KEYWORD_CHECK_RUNNING_STALE_MINUTES = 10;

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function isRunning(attempt: KeywordCheck | null): boolean {
	return (
		attempt?.status === "running" &&
		Date.now() - attempt.createdAt.getTime() < KEYWORD_CHECK_RUNNING_STALE_MINUTES * MINUTE_MS
	);
}

function isOnCooldown(attempt: KeywordCheck, force: boolean): boolean {
	const age = Date.now() - attempt.createdAt.getTime();
	if (attempt.status === "running") return isRunning(attempt);
	if (attempt.status === "completed") return !force && age < KEYWORD_CHECK_REFRESH_AFTER_DAYS * DAY_MS;
	if (attempt.status === "failed") return !force && age < KEYWORD_CHECK_FAILED_RETRY_DAYS * DAY_MS;
	return false;
}

const singletonKey = (brandId: string) => `keywords-${brandId}`;

/** A job waiting in pg-boss has no `keyword_checks` row yet, but the user should still see it as running. */
async function hasQueuedJob(brandId: string): Promise<boolean> {
	try {
		const boss = await getBoss();
		const jobs = await boss.findJobs("check-keywords", { key: singletonKey(brandId), queued: true });
		// A job left waiting by a stopped worker should not keep the card spinning forever.
		return jobs.some(
			(job) => Date.now() - new Date(job.createdOn).getTime() < KEYWORD_CHECK_RUNNING_STALE_MINUTES * MINUTE_MS,
		);
	} catch (error) {
		console.error(`Failed to look up queued keyword checks for brand ${brandId}:`, error);
		return false;
	}
}

export async function maybeEnqueueKeywordCheck(
	brandId: string,
	opts: { force?: boolean } = {},
): Promise<{ enqueued: boolean }> {
	const attempt = await getLatestKeywordCheckAttempt(brandId);
	if (attempt && isOnCooldown(attempt, opts.force ?? false)) return { enqueued: false };

	try {
		const boss = await getBoss();
		// The queue is `stately`: while this brand already has a job waiting, send resolves to null
		// and that waiting job (which reads the keywords when it starts) covers this request.
		const jobId = await boss.send(
			"check-keywords",
			{ brandId },
			{
				singletonKey: singletonKey(brandId),
				retryLimit: 0,
				expireInSeconds: KEYWORD_CHECK_RUNNING_STALE_MINUTES * 60,
			},
		);
		return { enqueued: jobId !== null };
	} catch (error) {
		console.error(`Failed to enqueue keyword check for brand ${brandId}:`, error);
		return { enqueued: false };
	}
}

export interface KeywordCheckView {
	latest: KeywordCheck | null;
	running: boolean;
	/** Failure text of the newest attempt when it failed after the latest success, else null. */
	failure: string | null;
}

export async function readKeywordCheck(brandId: string): Promise<KeywordCheckView> {
	const [latest, attempt] = await Promise.all([
		getLatestCompletedKeywordCheck(brandId),
		getLatestKeywordCheckAttempt(brandId),
	]);
	const failedAfterLatest =
		attempt?.status === "failed" && (!latest || attempt.createdAt > latest.createdAt)
			? (attempt.report.failureSummary ?? "The check failed.")
			: null;
	const running = isRunning(attempt) || (await hasQueuedJob(brandId));
	return { latest, running, failure: failedAfterLatest };
}
