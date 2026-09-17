import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { CitationsDisplay } from "@/components/citations-display";
import { ALL_MODELS_VALUE } from "@/components/filter-bar";
import { FilteredListShell } from "@/components/filtered-list-shell";
import { PageHeader } from "@/components/page-header";
import { brandKeys, useBrand } from "@/hooks/use-brands";
import { useCitations } from "@/hooks/use-citations";
import { dashboardKeys } from "@/hooks/use-dashboard-summary";
import { useListFilters } from "@/hooks/use-list-filters";
import { useBrandParams } from "@/hooks/use-route-params";
import { getDaysFromLookback } from "@/lib/chart-utils";
import { t } from "@/lib/i18n";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/citations")({
	staticData: { crumb: t("citations.crumb") },
	head: pageHead({ description: t("citations.head_description") }),
	component: CitationsPage,
});

function CitationsPage() {
	const brandParams = useBrandParams();
	const { brandId } = Route.useRouteContext();
	const queryClient = useQueryClient();

	const filters = useListFilters();
	const days = getDaysFromLookback(filters.lookback);

	const { data: brand } = useBrand(brandId);
	const trackedTargets = brand?.trackedTargets ?? [];

	const modelParam = filters.model === ALL_MODELS_VALUE ? undefined : filters.model;
	const {
		data: citationData,
		isLoading,
		error: citationsError,
		refetch: refetchCitations,
	} = useCitations(brandId, {
		days,
		tags: filters.tags.length > 0 ? filters.tags : undefined,
		model: modelParam,
	});

	const infoContent = (
		<>
			<p className="mb-2">{t("citations.info_what")}</p>
			<p>
				<strong>Competitor</strong> domains are only those you&apos;ve added to your{" "}
				<Link to="/app/org/$org/brand/$brand/settings/competitors" params={brandParams} className="underline">
					{t("top-urls-card.tracked-competitors-link")}
				</Link>
				. Other domains appear under their detected category (Google, Social Media, Institutional, or Other).
			</p>
		</>
	);

	const showFullSkeleton = isLoading && !citationData;

	return (
		<PageHeader title={t("citations.crumb")} subtitle={t("citations.subtitle")} infoContent={infoContent}>
			<FilteredListShell
				filters={filters}
				availableTags={citationData?.availableTags || []}
				trackedTargets={trackedTargets}
				showModelSelector
				isLoading={showFullSkeleton}
				loadingState={
					<Card>
						<CardHeader>
							<Skeleton className="h-6 w-48" />
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								<Skeleton className="h-4 w-3/4" />
								<Skeleton className="h-4 w-1/2" />
								<Skeleton className="h-4 w-2/3" />
							</div>
						</CardContent>
					</Card>
				}
				isError={Boolean(citationsError) || !citationData}
				errorState={
					<Card>
						<CardContent className="pt-6">
							<div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">{t("citations.load_error")}</div>
						</CardContent>
					</Card>
				}
				totalCount={citationData?.totalCitations}
				noMatchesTitle={t("citations.no_matches_title")}
				noMatchesDescription={t("citations.no_matches_description")}
				emptyState={
					<Card>
						<CardContent className="pt-6">
							<div className="text-muted-foreground text-center py-8">{t("citations.empty")}</div>
						</CardContent>
					</Card>
				}
			>
				{citationData && (
					<CitationsDisplay
						citationData={citationData}
						brandId={brandId}
						brandName={brand?.name}
						showStats={true}
						maxDomains={10}
						maxUrls={20}
						days={days}
						onCompetitorAdded={() => {
							refetchCitations();
							queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
							queryClient.invalidateQueries({ queryKey: brandKeys.competitors(brandId) });
							queryClient.invalidateQueries({ queryKey: brandKeys.detail(brandId) });
						}}
					/>
				)}
			</FilteredListShell>
		</PageHeader>
	);
}
