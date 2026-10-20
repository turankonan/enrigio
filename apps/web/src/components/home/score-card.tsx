import { ArrowDown, ArrowUp } from "@phosphor-icons/react";
import { cn } from "@workspace/ui/lib/utils";
import { useEffect } from "react";
import { BandPill } from "@/components/home/band-pill";
import { HomeCard } from "@/components/home/home-card";
import { TrendChart } from "@/components/trend-chart";
import { useDashboardSummary } from "@/hooks/use-dashboard-summary";
import { t } from "@/lib/i18n";
import { setPersonProperties } from "@/lib/posthog";
import { scoreBand } from "@/lib/score-band";
import type { OrgBrandScore } from "@/server/dashboard";

const RING: Record<"low" | "ok" | "good", string> = {
	low: "border-rose-500",
	ok: "border-amber-500",
	good: "border-emerald-500",
};

export function ScoreCard({
	brandName,
	entry,
	loading,
	error,
	onRetry,
}: {
	brandName: string;
	entry: OrgBrandScore | undefined;
	loading: boolean;
	error?: unknown;
	onRetry?: () => void;
}) {
	const summary = useDashboardSummary(undefined, "1m");
	const totalPrompts = entry?.totalPrompts;
	// Analytics consumers segment on this person property.
	useEffect(() => {
		if (typeof totalPrompts === "number") setPersonProperties({ active_prompt_count: totalPrompts });
	}, [totalPrompts]);
	const band = scoreBand(entry?.score);
	const delta =
		entry && entry.score !== null && entry.previousScore !== null ? entry.score - entry.previousScore : null;

	return (
		<HomeCard title={t("home.score_title")} loading={loading} error={error} onRetry={onRetry}>
			{!entry || entry.score === null ? (
				<p className="text-muted-foreground">{t("home.score_pending")}</p>
			) : (
				<div className="flex flex-col gap-6 md:flex-row md:items-center">
					<div
						className={cn(
							"flex size-36 shrink-0 flex-col items-center justify-center rounded-full border-8",
							band && RING[band],
						)}
						role="img"
						aria-label={`${entry.score}%`}
					>
						<span className="text-4xl font-bold tabular-nums">{entry.score}%</span>
						{band && <BandPill band={band} className="mt-1" />}
					</div>
					<div className="flex min-w-0 flex-1 flex-col gap-2">
						<p className="text-lg">
							{t("home.score_sentence", {
								brand: brandName,
								mentioned: entry.mentionedRuns,
								total: entry.totalRuns,
							})}{" "}
							{delta !== null && delta !== 0 && (
								<span
									className={cn(
										"inline-flex items-center gap-0.5 font-medium",
										delta > 0 ? "text-emerald-700" : "text-rose-700",
									)}
								>
									{delta > 0 ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
									{t(delta > 0 ? "home.score_up" : "home.score_down", { points: Math.abs(delta) })}
								</span>
							)}
						</p>
						<p className="text-sm text-muted-foreground">
							{t("home.score_coverage", { seen: entry.promptsWithMention, total: entry.totalPrompts })}
						</p>
						{summary.data && (
							<TrendChart
								data={summary.data.visibilityTimeSeries.map((p) => ({ date: p.date, value: p.overall }))}
								label={t("home.score_title")}
								color="var(--primary)"
								className="h-16"
							/>
						)}
					</div>
				</div>
			)}
		</HomeCard>
	);
}
