import { runSiteAudit } from "@workspace/lib/axo";
import type { Job } from "pg-boss";

export interface AuditSiteData {
	brandId: string;
}

export async function auditSiteJob(jobs: Job<AuditSiteData>[]): Promise<void> {
	for (const job of jobs) {
		const id = await runSiteAudit(job.data.brandId);
		console.log(`Completed site audit ${id} for brand ${job.data.brandId}`);
	}
}
