import { Link } from "@tanstack/react-router";
import { getModelMeta } from "@workspace/config/models";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { cn } from "@workspace/ui/lib/utils";
import { useState } from "react";
import { HomeCard } from "@/components/home/home-card";
import { useEngineComparison } from "@/hooks/use-engine-comparison";
import { useBrandParams } from "@/hooks/use-route-params";
import { useShareOfVoice } from "@/hooks/use-share-of-voice";
import type { EngineVerdict } from "@/lib/engine-comparison";
import { type TranslationKey, t } from "@/lib/i18n";

const TAG: Record<EngineVerdict, { label: TranslationKey; className: string }> = {
	lead: { label: "home.engines_lead", className: "bg-band-good text-band-good-foreground" },
	close: { label: "home.engines_close", className: "bg-band-ok text-band-ok-foreground" },
	behind: { label: "home.engines_behind", className: "bg-band-low text-band-low-foreground" },
};

const pct = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);
const LEADERBOARD_ROWS = 5;
const ROW_GRID = "grid grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1.6fr)_auto] gap-3";

export function EnginesCard({ hasCompetitors }: { hasCompetitors: boolean }) {
	const params = useBrandParams();
	const [model, setModel] = useState<string>("all");
	const engines = useEngineComparison();
	const sov = useShareOfVoice(undefined, model === "all" ? undefined : { model });
	const leaderboard = (sov.data?.entries ?? []).slice(0, LEADERBOARD_ROWS);
	const max = leaderboard[0]?.share || 1;
	const rows = engines.data ?? [];

	return (
		<HomeCard
			title={t("home.engines_title")}
			titleId="home-engines"
			loading={engines.isLoading}
			error={engines.error}
			onRetry={() => engines.refetch()}
		>
			{rows.length === 0 ? (
				<div className="rounded-xl border border-dashed border-(--dashed) p-7 text-center text-[15px] text-muted-foreground">
					{t("home.engines_empty")}
				</div>
			) : (
				<div className="grid gap-8 md:grid-cols-[repeat(auto-fit,minmax(380px,1fr))]">
					<div className="flex min-w-0 flex-col">
						<div
							className={cn(ROW_GRID, "pb-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground")}
						>
							<span>{t("home.engines_engine")}</span>
							<span className="text-right">{t("home.engines_you")}</span>
							<span>{t("home.engines_top_rival")}</span>
							<span className="sr-only">{t("home.engines_status")}</span>
						</div>
						{rows.map((row) => (
							<div key={row.model} className={cn(ROW_GRID, "items-center border-t border-divider py-[11px] text-sm")}>
								<span className="flex min-w-0 items-center gap-2.5">
									<span className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-muted">
										<ModelIcon iconId={getModelMeta(row.model).iconId} className="size-4" />
									</span>
									<span className="truncate">{row.label}</span>
								</span>
								<span className="text-right font-semibold tabular-nums">{pct(row.brandRate)}</span>
								<span className="truncate text-muted-foreground">
									{hasCompetitors && row.topCompetitor ? (
										<>
											{row.topCompetitor.name}{" "}
											<span className="font-medium tabular-nums text-foreground">{pct(row.topCompetitor.rate)}</span>
										</>
									) : (
										"—"
									)}
								</span>
								{!hasCompetitors ? (
									<Link
										to="/app/org/$org/brand/$brand/settings/competitors"
										params={params}
										className="whitespace-nowrap rounded-full bg-tint px-[9px] py-[3px] text-xs font-semibold text-tint-foreground hover:underline"
									>
										{t("home.engines_add_competitors")}
									</Link>
								) : row.verdict ? (
									<span
										className={cn(
											"whitespace-nowrap rounded-full px-[9px] py-[3px] text-xs font-semibold",
											TAG[row.verdict].className,
										)}
									>
										{t(TAG[row.verdict].label)}
									</span>
								) : (
									<span />
								)}
							</div>
						))}
					</div>
					<div className="flex min-w-0 flex-col gap-3">
						<div className="flex items-center justify-between gap-3">
							<span className="text-sm font-medium">{t("home.engines_leaderboard")}</span>
							<select
								value={model}
								onChange={(e) => setModel(e.target.value)}
								aria-label={t("home.engines_filter_label")}
								className="h-8 rounded-lg border bg-card px-2.5 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
							>
								<option value="all">{t("home.engines_all")}</option>
								{rows.map((row) => (
									<option key={row.model} value={row.model}>
										{row.label}
									</option>
								))}
							</select>
						</div>
						<ol className="flex flex-col gap-2.5">
							{leaderboard.map((entry) => (
								<li key={entry.name} className="grid grid-cols-[120px_minmax(0,1fr)_44px] items-center gap-3 text-sm">
									<span className={cn("flex items-center gap-1.5 truncate", entry.isBrand && "font-semibold")}>
										{entry.name}
										{entry.isBrand && (
											<span className="rounded-full bg-tint px-1.5 py-px text-[11px] font-semibold text-tint-foreground">
												{t("home.engines_you")}
											</span>
										)}
									</span>
									<span className="block h-3 overflow-hidden rounded-full bg-divider">
										<span
											className={cn("block h-full rounded-full", entry.isBrand ? "bg-primary" : "bg-dashed")}
											style={{ width: `${Math.round((entry.share / max) * 100)}%` }}
										/>
									</span>
									<span className="text-right tabular-nums text-muted-foreground">
										{Math.round(entry.share * 100)}%
									</span>
								</li>
							))}
						</ol>
						<Link
							to="/app/org/$org/brand/$brand/share-of-voice"
							params={params}
							className="mt-1 self-start text-sm font-medium text-primary hover:underline"
						>
							{t("home.engines_full")}
						</Link>
					</div>
				</div>
			)}
		</HomeCard>
	);
}
