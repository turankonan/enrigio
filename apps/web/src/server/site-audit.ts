/**
 * Web-layer entry points for AXO site audits: an authorized, cooldown-gated
 * enqueue and an authorized read of the latest completed audit. Both are the
 * security boundary for this feature — callers must not bypass
 * `requireBrandSession` by reaching into `@workspace/lib/axo` directly.
 */
import { getLatestAuditAttempt, getLatestCompletedAudit, type SiteAudit } from "@workspace/lib/axo";
import { requireBrandSession } from "@/lib/auth/helpers";
import { getBoss } from "@/lib/boss-client";

/** Re-audit cadence after a successful crawl. */
export const AUDIT_REFRESH_AFTER_DAYS = 7;
/** Don't re-crawl a site whose last attempt failed more than once a day. */
export const AUDIT_FAILED_RETRY_DAYS = 1;
/** A `running` row older than this is treated as crashed, not in flight. */
export const AUDIT_RUNNING_STALE_MINUTES = 20;

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function ageMs(createdAt: Date): number {
	return Date.now() - createdAt.getTime();
}

/**
 * Whether the latest attempt (any status) puts a new audit on cooldown. Keys
 * off the latest attempt rather than the latest completed audit so a
 * repeatedly-failing or in-flight site isn't re-enqueued the moment the
 * singleton window lapses.
 */
function isOnCooldown(attempt: SiteAudit): boolean {
	const age = ageMs(attempt.createdAt);
	if (attempt.status === "running") return age < AUDIT_RUNNING_STALE_MINUTES * MINUTE_MS;
	if (attempt.status === "completed") return age < AUDIT_REFRESH_AFTER_DAYS * DAY_MS;
	if (attempt.status === "failed") return age < AUDIT_FAILED_RETRY_DAYS * DAY_MS;
	return false;
}

/**
 * Enqueues a site audit for `brandId` unless the latest attempt is still on
 * cooldown (in flight, a fresh success, or a recent failure). Sending is
 * best-effort: a queue error is caught and logged rather than thrown, since a
 * failed enqueue should never break the page that triggered it.
 *
 * Does NOT authorize on its own — it's the shared core for both the public
 * browser entry point (`enqueueSiteAuditIfStale`, which authorizes first) and
 * callers like `resolveOpportunities` that authorize at their own entry point
 * (v1 API / MCP) and must not be forced through a browser-session check.
 */
export async function maybeEnqueueSiteAudit(brandId: string): Promise<{ enqueued: boolean }> {
	const attempt = await getLatestAuditAttempt(brandId);
	if (attempt && isOnCooldown(attempt)) {
		return { enqueued: false };
	}

	try {
		const boss = await getBoss();
		await boss.send(
			"audit-site",
			{ brandId },
			{
				singletonKey: `audit-${brandId}`,
				singletonSeconds: AUDIT_RUNNING_STALE_MINUTES * 60,
				retryLimit: 0,
				expireInSeconds: 15 * 60,
			},
		);
		return { enqueued: true };
	} catch (error) {
		console.error(`Failed to enqueue site audit for brand ${brandId}:`, error);
		return { enqueued: false };
	}
}

/** Authorized browser entry point: a signed-in user asking to (re)audit their
 * own brand's site. Authorizes, then defers to the shared core. */
export async function enqueueSiteAuditIfStale(brandId: string): Promise<{ enqueued: boolean }> {
	await requireBrandSession(brandId);
	return maybeEnqueueSiteAudit(brandId);
}

/** The latest completed audit for `brandId`, for display. */
export async function getLatestBrandAudit(brandId: string): Promise<SiteAudit | null> {
	await requireBrandSession(brandId);
	return getLatestCompletedAudit(brandId);
}
