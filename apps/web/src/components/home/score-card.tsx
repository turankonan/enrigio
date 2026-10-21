import { cn } from "@workspace/ui/lib/utils";
import { useEffect } from "react";
import { BandPill } from "@/components/home/band-pill";
import { HomeCard } from "@/components/home/home-card";
import { ScoreRing } from "@/components/home/score-ring";
import { Sparkline } from "@/components/home/sparkline";
import { useDashboardSummary } from "@/hooks/use-dashboard-summary";
import { type TranslationKey, t } from "@/lib/i18n";
import { setPersonProperties } from "@/lib/posthog";
import { scoreBand } from "@/lib/score-band";
import { type ScoreDeltaKind, scoreDelta } from "@/lib/score-delta";
import type { OrgBrandScore } from "@/server/dashboard";

const DELTA_KEY: Record<ScoreDeltaKind, TranslationKey> = {
	up: "home.delta_up",
	down: "home.delta_down",
	same: "home.delta_same",
	first: "home.delta_first",
	none: "home.delta_none",
};
const DELTA_INK: Record<ScoreDeltaKind, string> = {
	up: "text-delta-up",
	down: "text-delta-down",
	same: "",
	first: "",
	none: "",
};
const BAND_LABEL: Record<"low" | "ok" | "good" | "none", TranslationKey> = {
	low: "home.band_low",
	ok: "home.band_ok",
	good: "home.band_good",
	none: "home.band_none",
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
	const score = entry?.score ?? null;
	const band = scoreBand(score);
	const delta = scoreDelta(score, entry?.previousScore);
	const series = summary.data?.visibilityTimeSeries.map((p) => p.overall) ?? [];

	return (
		<HomeCard
			loading={loading}
			error={error}
			onRetry={onRetry}
			className="md:grid md:grid-cols-[minmax(180px,220px)_minmax(0,1fr)] md:items-center md:gap-8 md:py-7"
		>
			<div role="img" aria-label={`${score ?? "—"}% · ${t(BAND_LABEL[band ?? "none"])}`}>
				<ScoreRing pct={score}>
					<span className="text-[52px] font-semibold leading-none tracking-[-0.04em] tabular-nums">
						{score === null ? "—" : `${score}%`}
					</span>
					<BandPill band={band ?? "none"} />
				</ScoreRing>
			</div>
			<div className="flex min-w-0 flex-col gap-3.5">
				<h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
					{t("home.score_title")}
				</h2>
				<p className="text-[22px] font-medium leading-[1.35] tracking-[-0.01em] text-pretty">
					{t("home.score_sentence_before", { brand: brandName })}{" "}
					<strong className="font-bold">
						{t("home.score_of", { mentioned: entry?.mentionedRuns ?? 0, total: entry?.totalRuns ?? 0 })}
					</strong>{" "}
					{t("home.score_sentence_after")}{" "}
					<strong className={cn("font-bold", DELTA_INK[delta.kind])}>
						{t(DELTA_KEY[delta.kind], { points: delta.points })}
					</strong>
					.
				</p>
				<p className="text-[15px] text-muted-foreground">
					{t("home.score_coverage", { seen: entry?.promptsWithMention ?? 0, total: entry?.totalPrompts ?? 0 })}
				</p>
				<div className="mt-1 flex items-end gap-4">
					<Sparkline values={series} className="h-11 w-full max-w-[420px]" />
					<span className="whitespace-nowrap text-xs text-muted-foreground">{t("home.last_30_days")}</span>
				</div>
			</div>
		</HomeCard>
	);
}
