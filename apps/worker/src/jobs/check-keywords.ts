import { runKeywordCheck } from "@workspace/lib/keywords";
import type { Job } from "pg-boss";

export interface CheckKeywordsData {
	brandId: string;
}

export async function checkKeywordsJob(jobs: Job<CheckKeywordsData>[]): Promise<void> {
	for (const job of jobs) {
		const id = await runKeywordCheck(job.data.brandId);
		console.log(`Completed keyword check ${id} for brand ${job.data.brandId}`);
	}
}
