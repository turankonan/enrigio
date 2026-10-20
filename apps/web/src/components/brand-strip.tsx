import { ArrowDown, ArrowUp, Plus } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { brandLinkParams, orgLinkParams } from "@workspace/lib/app-urls";
import { cn } from "@workspace/ui/lib/utils";
import { SiteIcon } from "@/components/site-icon";
import { t } from "@/lib/i18n";
import type { OrganizationSummary } from "@/lib/organizations/types";
import { scoreBand } from "@/lib/score-band";

export interface BrandStripScore {
	score: number | null;
	previousScore: number | null;
}

const BAND_TEXT = { low: "text-rose-700", ok: "text-amber-700", good: "text-emerald-700" } as const;

function ScoreLine({ onboarded, entry }: { onboarded: boolean; entry: BrandStripScore | undefined }) {
	if (!onboarded) return <span className="text-xs text-muted-foreground">{t("brand-strip.setting_up")}</span>;
	if (!entry || entry.score === null) return <span className="text-xs text-muted-foreground">—</span>;
	const band = scoreBand(entry.score);
	const delta = entry.previousScore === null ? null : entry.score - entry.previousScore;
	return (
		<span className="flex items-center gap-1 text-sm">
			<span className={cn("font-semibold tabular-nums", band && BAND_TEXT[band])}>{entry.score}%</span>
			{delta !== null && delta !== 0 && (
				<span className={cn("flex items-center text-xs", delta > 0 ? "text-emerald-700" : "text-rose-700")}>
					{delta > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
					{Math.abs(delta)}
				</span>
			)}
		</span>
	);
}

export function BrandStrip({
	organization,
	currentBrandId,
	scores,
}: {
	organization: OrganizationSummary;
	currentBrandId: string | undefined;
	scores: Record<string, BrandStripScore>;
}) {
	return (
		<nav aria-label={t("brand-strip.label")} className="flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto py-2">
			{organization.brands.map((brand) => {
				const active = brand.id === currentBrandId;
				return (
					<Link
						key={brand.id}
						to="/app/org/$org/brand/$brand"
						params={brandLinkParams(organization, brand)}
						aria-current={active ? "page" : undefined}
						className={cn(
							"flex shrink-0 snap-start items-center gap-3 rounded-xl border bg-card px-3 py-2 transition-colors",
							active ? "border-primary ring-2 ring-primary/25" : "border-border hover:bg-accent",
						)}
					>
						<SiteIcon domain={brand.website} size="md" />
						<span className="flex min-w-0 flex-col">
							<span className="max-w-40 truncate text-sm font-medium">{brand.name}</span>
							<ScoreLine onboarded={brand.onboarded} entry={scores[brand.id]} />
						</span>
					</Link>
				);
			})}
			{organization.brandCreation.kind !== "not-offered" && (
				<Link
					to="/app/org/$org/new"
					params={orgLinkParams(organization)}
					className="flex shrink-0 items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
				>
					<Plus className="size-4" />
					{t("brand-strip.add")}
				</Link>
			)}
		</nav>
	);
}
