import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useMatch, useRouteContext, useRouter } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { BrandHome } from "@/components/home/brand-home";
import { SetupWizard } from "@/components/setup-wizard/setup-wizard";
import { StepFirstScan } from "@/components/setup-wizard/step-first-scan";
import { useBrandParams } from "@/hooks/use-route-params";
import { t } from "@/lib/i18n";
import { pageHead } from "@/lib/route-head";
import { BRAND_ROUTE_ID } from "@/lib/route-subject";
import { getLatestFirstScanFn } from "@/server/first-scan";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/")({
	staticData: { crumb: t("dashboard.crumb"), bareHeader: true },
	head: pageHead({ description: t("dashboard.head_description") }),
	component: DashboardPage,
});

function DashboardPage() {
	const { brandId, organization } = Route.useRouteContext();
	const brand = useMatch({ from: BRAND_ROUTE_ID, select: (match) => match.loaderData?.brand });
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const router = useRouter();
	const params = useBrandParams();
	const onboarded = brand?.onboarded ?? false;
	const latestScan = useQuery({
		queryKey: ["first-scan-latest", brandId],
		queryFn: () => getLatestFirstScanFn({ data: { brandId } }),
		enabled: onboarded,
		staleTime: Number.POSITIVE_INFINITY,
	});

	const openReport = () => {
		const template = context.clientConfig?.branding.onboardingRedirectUrlTemplate;
		if (template) window.location.href = template.replace("{brandId}", brandId);
		else router.navigate({ to: "/app/org/$org/brand/$brand/report", params });
	};

	if (!brand) return null;
	// The router keeps this component mounted across brand switches; keying drops drafts and mutation state.
	if (!brand.onboarded) return <SetupWizard key={brand.id} brand={brand} onReport={openReport} />;
	// Hold the page until we know whether a first scan is still running, so the dashboard does not flash first.
	if (latestScan.isPending) return null;
	const scan = latestScan.data;
	if (scan && (scan.status === "queued" || scan.status === "running")) {
		return <StepFirstScan key={brand.id} brandId={brand.id} firstScanId={scan.firstScanId} onReport={openReport} />;
	}
	return <BrandHome key={brand.id} brand={brand} organization={organization} />;
}
