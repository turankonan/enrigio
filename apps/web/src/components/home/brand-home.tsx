import type { BrandWithPrompts } from "@workspace/lib/db/schema";
import { EnginesCard } from "@/components/home/engines-card";
import { KeywordMatchCard } from "@/components/home/keyword-match-card";
import { KeywordsCard } from "@/components/home/keywords-card";
import { NextStepsCard } from "@/components/home/next-steps-card";
import { ScoreCard } from "@/components/home/score-card";
import { useOrgBrandScores } from "@/hooks/use-org-brand-scores";
import type { OrganizationSummary } from "@/lib/organizations/types";

export function BrandHome({ brand, organization }: { brand: BrandWithPrompts; organization: OrganizationSummary }) {
	const scores = useOrgBrandScores(organization.id);
	return (
		<div className="mx-auto flex w-full max-w-4xl flex-col gap-4 py-2">
			<h1 className="px-1 text-2xl font-bold">{brand.name}</h1>
			<ScoreCard brandName={brand.name} entry={scores.data?.[brand.id]} loading={scores.isLoading} />
			<NextStepsCard />
			<KeywordsCard key={brand.keywords.join("\n")} brand={brand} />
			<KeywordMatchCard hasKeywords={brand.keywords.length > 0} />
			<EnginesCard />
		</div>
	);
}
