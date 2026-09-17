import { IconInfoCircle } from "@tabler/icons-react";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { t } from "@/lib/i18n";

function StatCard({ title, tooltip, value }: { title: string; tooltip: React.ReactNode; value: React.ReactNode }) {
	return (
		<Card className="flex flex-col">
			<CardHeader className="gap-0">
				<CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
					{title}
					<Tooltip>
						<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 cursor-help" />} />
						<TooltipContent className="max-w-xs text-sm font-normal">{tooltip}</TooltipContent>
					</Tooltip>
				</CardTitle>
			</CardHeader>
			<CardContent className="flex-1 flex items-center">
				<div className="text-2xl sm:text-3xl lg:text-4xl font-bold">{value}</div>
			</CardContent>
		</Card>
	);
}

export function CitationStatsCards({
	brandShare,
	uniqueDomains,
	totalCitations,
}: {
	brandShare: number;
	uniqueDomains: number;
	totalCitations: number;
}) {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
			<StatCard
				title={t("stats-cards.brand-citation-share")}
				tooltip={t("stats-cards.brand-citation-share-tooltip")}
				value={`${brandShare}%`}
			/>
			<StatCard
				title={t("stats-cards.unique-domains")}
				tooltip={t("stats-cards.unique-domains-tooltip")}
				value={uniqueDomains.toLocaleString()}
			/>
			{/* Kept deliberately simple: the user doesn't need the Google AI Mode
			    search/shopping nuance. Those surfaces aren't citations in the
			    traditional sense (they point back into Google's own product/search
			    results, not an external domain w.r.t. the model), so they're
			    excluded from this count and broken out in the Google Shopping card. */}
			<StatCard
				title={t("stats-cards.total-citations")}
				tooltip={t("stats-cards.total-citations-tooltip")}
				value={totalCitations.toLocaleString()}
			/>
		</div>
	);
}
