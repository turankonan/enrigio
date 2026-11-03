/** Server functions only; the builder lives in ./starter-report-core.ts. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { getOrBuildStarterReport, retryStarterReportSection } from "@/server/starter-report-core";

export type { StarterReport } from "@/server/starter-report-core";

export const getStarterReportFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return getOrBuildStarterReport(data.brandId);
	});

export const retryStarterReportSectionFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), section: z.literal("nextSteps") }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		await retryStarterReportSection(data.brandId, data.section);
		return { ok: true as const };
	});
