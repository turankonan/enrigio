import { PgBoss } from "pg-boss";

let bossInstance: PgBoss | null = null;
let bossPromise: Promise<PgBoss> | null = null;

/**
 * Get or create a pg-boss client instance.
 * Uses singleton pattern to avoid multiple connections.
 */
export async function getBoss(): Promise<PgBoss> {
	if (bossInstance) {
		return bossInstance;
	}

	if (bossPromise) {
		return bossPromise;
	}

	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error("DATABASE_URL is required for pg-boss");
	}

	bossPromise = (async () => {
		const boss = new PgBoss({
			connectionString,
			schema: "pgboss",
			// Web app only needs to send/schedule jobs, not process them
			supervise: false, // Let worker handle supervision
		});

		await boss.start();

		// Create queues if they don't exist (required in pg-boss v12)
		// createQueue is idempotent - safe to call multiple times
		await boss.createQueue("process-prompt", {
			retryLimit: 3,
			retryDelay: 60,
			retryBackoff: true,
			expireInSeconds: 60 * 15,
		});
		await boss.createQueue("generate-report", {
			retryLimit: 3,
			retryDelay: 60,
			retryBackoff: true,
			expireInSeconds: 60 * 60,
		});
		await boss.createQueue("analyze-brand", {
			retryLimit: 1,
			retryDelay: 10,
			retryBackoff: false,
			expireInSeconds: 60 * 15,
		});
		await boss.createQueue("audit-site", {
			retryLimit: 0, // paid LLM fan-out; a retry would double-charge usage
			// Intentionally shorter than the 20-minute AUDIT_RUNNING_STALE_MINUTES/
			// singletonSeconds in apps/web/src/server/site-audit.ts: if pg-boss
			// expires a crawl first, the audit's own completed row still gets
			// written and cached — the gap doesn't strand anything.
			expireInSeconds: 60 * 15,
		});

		bossInstance = boss;
		return boss;
	})();

	return bossPromise;
}
