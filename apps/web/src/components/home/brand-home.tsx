import type { BrandWithPrompts } from "@workspace/lib/db/schema";
import { EnginesCard } from "@/components/home/engines-card";
import { KeywordMatchCard } from "@/components/home/keyword-match-card";
import { KeywordsCard } from "@/components/home/keywords-card";
import { NextStepsCard } from "@/components/home/next-steps-card";
import { ScoreCard } from "@/components/home/score-card";
import { useUpdateBrandKeywords } from "@/hooks/use-brand-keywords";
import { useOrgBrandScores } from "@/hooks/use-org-brand-scores";
import { t } from "@/lib/i18n";
import type { OrganizationSummary } from "@/lib/organizations/types";

function displayHost(website: string): string {
	try {
		return new URL(website).hostname;
	} catch {
		return website;
	}
}

export function BrandHome({ brand, organization }: { brand: BrandWithPrompts; organization: OrganizationSummary }) {
	const scores = useOrgBrandScores(organization.id);
	const updateKeywords = useUpdateBrandKeywords(brand.id);
	return (
		<div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 pb-10 pt-1">
			<div className="flex flex-wrap items-baseline gap-3">
				<h1 className="text-[26px] font-semibold tracking-[-0.02em]">{brand.name}</h1>
				<span className="text-sm text-muted-foreground">
					{t("home.site_this_month", { host: displayHost(brand.website) })}
				</span>
			</div>
			<ScoreCard
				brandName={brand.name}
				entry={scores.data?.[brand.id]}
				loading={scores.isLoading}
				error={scores.error}
				onRetry={() => scores.refetch()}
			/>
			<NextStepsCard />
			<div className="grid gap-5 md:grid-cols-[repeat(auto-fit,minmax(380px,1fr))]">
				<KeywordsCard brand={brand} update={updateKeywords} />
				<KeywordMatchCard keywords={brand.keywords} />
			</div>
			<EnginesCard hasCompetitors={brand.competitors.length > 0} />
		</div>
	);
}
