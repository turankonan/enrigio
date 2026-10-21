import { Link } from "@tanstack/react-router";
import { cn } from "@workspace/ui/lib/utils";
import { HomeCard } from "@/components/home/home-card";
import { pickNextSteps } from "@/components/home/next-steps";
import { useOpportunities } from "@/hooks/use-opportunities";
import { useDismissedOpportunities, useDismissOpportunity } from "@/hooks/use-opportunity-dismissals";
import { useBrandParams } from "@/hooks/use-route-params";
import { type TranslationKey, t } from "@/lib/i18n";
import { opportunityKey } from "@/lib/opportunity-key";

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
	const dismissed = useDismissedOpportunities();
	const dismiss = useDismissOpportunity();
	const all = data?.report?.opportunities ?? [];
	const steps = pickNextSteps(all, dismissed.data ?? []);
	const countText =
		steps.length === 0 ? null : steps.length === 1 ? t("home.next_top_one") : t("home.next_top_n", { n: steps.length });
	const emptyText = data?.report && all.length > 0 ? t("home.next_all_done") : t("home.next_empty");

	return (
		<HomeCard
			title={t("home.next_title")}
			titleId="home-next-steps"
			loading={isLoading || dismissed.isLoading}
			error={error}
			onRetry={() => refetch()}
			action={countText && <span className="text-sm text-muted-foreground">{countText}</span>}
		>
			{steps.length === 0 ? (
				<div className="rounded-xl border border-dashed border-(--dashed) p-7 text-center text-[15px] text-muted-foreground">
					{emptyText}
				</div>
			) : (
				<ol className="flex flex-col">
					{steps.map((step, index) => (
						<li
							key={opportunityKey(step.title)}
							className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-4 border-t border-divider py-4"
						>
							<span className="flex size-7 items-center justify-center rounded-full bg-muted text-[13px] font-semibold tabular-nums text-muted-foreground">
								{index + 1}
							</span>
							<div className="flex min-w-0 flex-col gap-1.5">
								<div className="text-base font-medium leading-[1.35] text-pretty">{step.title}</div>
								<div className="text-sm leading-[1.45] text-muted-foreground text-pretty">{step.why}</div>
								<div className="mt-0.5 flex flex-wrap gap-2">
									{step.priority && (
										<span
											className={cn(
												"whitespace-nowrap rounded-full px-[9px] py-[3px] text-xs font-semibold",
												step.priority === "high" ? "bg-tint text-tint-foreground" : "bg-muted text-muted-foreground",
											)}
										>
											{t(PRIORITY[step.priority])}
										</span>
									)}
									{CATEGORY[step.category] && (
										<span className="whitespace-nowrap rounded-full border bg-muted px-[9px] py-[3px] text-xs font-medium text-muted-foreground">
											{t(CATEGORY[step.category])}
										</span>
									)}
								</div>
							</div>
							<button
								type="button"
								onClick={() => dismiss.mutate(step.title)}
								disabled={dismiss.isPending && dismiss.variables === step.title}
								aria-label={t("home.next_done_label", { title: step.title })}
								className="h-9 whitespace-nowrap rounded-[10px] border bg-card px-3.5 text-sm font-medium hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
							>
								{t("home.next_done")}
							</button>
						</li>
					))}
				</ol>
			)}
			<Link
				to="/app/org/$org/brand/$brand/opportunities"
				params={params}
				className="self-start text-sm font-medium text-primary hover:underline"
			>
				{t("home.next_all")}
			</Link>
		</HomeCard>
	);
}
