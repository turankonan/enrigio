import { ArrowRight } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { HomeCard } from "@/components/home/home-card";
import { pickNextSteps } from "@/components/home/next-steps";
import { useOpportunities } from "@/hooks/use-opportunities";
import { useBrandParams } from "@/hooks/use-route-params";
import { type TranslationKey, t } from "@/lib/i18n";

const CATEGORY: Record<string, TranslationKey> = {
	creation: "home.cat_creation",
	"existing-content": "home.cat_existing",
	outreach: "home.cat_outreach",
	social: "home.cat_social",
	axo: "home.cat_axo",
};
const PRIORITY: Record<string, TranslationKey> = {
	high: "home.impact_high",
	medium: "home.impact_medium",
	low: "home.impact_low",
};

export function NextStepsCard() {
	const params = useBrandParams();
	const { data, isLoading, error, refetch } = useOpportunities();
	const steps = pickNextSteps(data?.report?.opportunities ?? [], []);

	return (
		<HomeCard
			title={t("home.next_title")}
			description={t("home.next_description")}
			loading={isLoading}
			error={error}
			onRetry={() => refetch()}
			action={
				<Link
					to="/app/org/$org/brand/$brand/opportunities"
					params={params}
					className="flex items-center gap-1 text-sm text-primary"
				>
					{t("home.next_all")} <ArrowRight className="size-4" />
				</Link>
			}
		>
			{steps.length === 0 ? (
				<p className="text-muted-foreground">{t("home.next_empty")}</p>
			) : (
				<ol className="flex flex-col divide-y">
					{steps.map((step, index) => (
						<li key={step.title} className="flex gap-4 py-3">
							<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
								{index + 1}
							</span>
							<div className="flex min-w-0 flex-col gap-1">
								<span className="font-medium">{step.title}</span>
								<span className="text-sm text-muted-foreground">{step.why}</span>
								<span className="flex flex-wrap gap-1.5 pt-1">
									{step.priority && (
										<Badge variant={step.priority === "high" ? "default" : "secondary"}>
											{t(PRIORITY[step.priority])}
										</Badge>
									)}
									{CATEGORY[step.category] && <Badge variant="outline">{t(CATEGORY[step.category])}</Badge>}
								</span>
							</div>
						</li>
					))}
				</ol>
			)}
		</HomeCard>
	);
}
