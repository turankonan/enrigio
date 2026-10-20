import { ArrowRight } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { getModelMeta } from "@workspace/config/models";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { cn } from "@workspace/ui/lib/utils";
import { HomeCard } from "@/components/home/home-card";
import { useEngineComparison } from "@/hooks/use-engine-comparison";
import { useBrandParams } from "@/hooks/use-route-params";
import { useShareOfVoice } from "@/hooks/use-share-of-voice";
import type { EngineVerdict } from "@/lib/engine-comparison";
import { type TranslationKey, t } from "@/lib/i18n";

const VERDICT: Record<EngineVerdict, { label: TranslationKey; className: string }> = {
	lead: { label: "home.engines_lead", className: "bg-emerald-100 text-emerald-900" },
	close: { label: "home.engines_close", className: "bg-amber-100 text-amber-900" },
	behind: { label: "home.engines_behind", className: "bg-rose-100 text-rose-900" },
};

const pct = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);

export function EnginesCard() {
	const params = useBrandParams();
	const engines = useEngineComparison();
	const sov = useShareOfVoice();
	const leaderboard = (sov.data?.entries ?? []).slice(0, 6);
	const max = Math.max(...leaderboard.map((e) => e.share), 0.0001);

	return (
		<HomeCard
			title={t("home.engines_title")}
			description={t("home.engines_description")}
			loading={engines.isLoading}
			error={engines.error}
			onRetry={() => engines.refetch()}
			action={
				<Link
					to="/app/org/$org/brand/$brand/share-of-voice"
					params={params}
					className="flex items-center gap-1 text-sm text-primary"
				>
					{t("home.engines_full")} <ArrowRight className="size-4" />
				</Link>
			}
		>
			{(engines.data?.length ?? 0) === 0 ? (
				<p className="text-muted-foreground">{t("home.engines_empty")}</p>
			) : (
				<div className="flex flex-col gap-6">
					<table className="w-full text-sm">
						<thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
							<tr>
								<th className="py-1 font-medium">{t("home.engines_engine")}</th>
								<th className="py-1 text-right font-medium">{t("home.engines_you")}</th>
								<th className="py-1 text-right font-medium">{t("home.engines_top_rival")}</th>
								<th className="py-1 text-right font-medium" />
							</tr>
						</thead>
						<tbody className="divide-y">
							{engines.data?.map((row) => (
								<tr key={row.model}>
									<td className="flex items-center gap-2 py-2">
										<ModelIcon iconId={getModelMeta(row.model).iconId} className="size-5" />
										{row.label}
									</td>
									<td className="py-2 text-right font-semibold tabular-nums">{pct(row.brandRate)}</td>
									<td className="py-2 text-right tabular-nums text-muted-foreground">
										{row.topCompetitor
											? `${row.topCompetitor.name} · ${pct(row.topCompetitor.rate)}`
											: t("home.engines_no_rival")}
									</td>
									<td className="py-2 text-right">
										{row.verdict && (
											<span
												className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", VERDICT[row.verdict].className)}
											>
												{t(VERDICT[row.verdict].label)}
											</span>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{leaderboard.length > 0 && (
						<div>
							<h3 className="mb-2 text-sm font-medium">{t("home.engines_leaderboard")}</h3>
							<ol className="flex flex-col gap-1.5">
								{leaderboard.map((entry) => (
									<li key={entry.name} className="flex items-center gap-3 text-sm">
										<span className={cn("w-32 truncate", entry.isBrand && "font-semibold")}>{entry.name}</span>
										<span className="h-3 flex-1 rounded-full bg-muted">
											<span
												className={cn(
													"block h-3 rounded-full",
													entry.isBrand ? "bg-primary" : "bg-muted-foreground/40",
												)}
												style={{ width: `${(entry.share / max) * 100}%` }}
											/>
										</span>
										<span className="w-12 text-right tabular-nums">{Math.round(entry.share * 100)}%</span>
									</li>
								))}
							</ol>
						</div>
					)}
				</div>
			)}
		</HomeCard>
	);
}
