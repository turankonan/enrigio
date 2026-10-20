import { createFileRoute, useMatch, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { BrandHome } from "@/components/home/brand-home";
import PromptWizard from "@/components/prompt-wizard";
import { t } from "@/lib/i18n";
import { pageHead } from "@/lib/route-head";
import { BRAND_ROUTE_ID } from "@/lib/route-subject";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/")({
	staticData: { crumb: t("dashboard.crumb"), bareHeader: true },
	head: pageHead({ description: t("dashboard.head_description") }),
	component: DashboardPage,
});

function ResearchBrandData({ brandId, clientConfig }: { brandId: string; clientConfig?: ClientConfig }) {
	return (
		<div className="space-y-6 max-w-2xl p-4">
			<div className="space-y-2">
				<h2 className="text-2xl font-bold">{t("dashboard.research_title")}</h2>
				<p className="text-muted-foreground text-balance">{t("dashboard.research_description")}</p>
			</div>
			<PromptWizard
				onComplete={() => {
					const template = clientConfig?.branding.onboardingRedirectUrlTemplate;
					if (template) window.location.href = template.replace("{brandId}", brandId);
				}}
			/>
		</div>
	);
}

function DashboardPage() {
	const { brandId, organization } = Route.useRouteContext();
	const brand = useMatch({ from: BRAND_ROUTE_ID, select: (match) => match.loaderData?.brand });
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };

	if (!brand) return null;
	if (!brand.onboarded) return <ResearchBrandData brandId={brandId} clientConfig={context.clientConfig} />;
	// The router keeps this component mounted across brand switches; keying drops drafts and mutation state.
	return <BrandHome key={brand.id} brand={brand} organization={organization} />;
}
