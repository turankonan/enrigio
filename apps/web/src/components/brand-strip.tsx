import { Link } from "@tanstack/react-router";
import { brandLinkParams, orgLinkParams } from "@workspace/lib/app-urls";
import { cn } from "@workspace/ui/lib/utils";
import { SiteIcon } from "@/components/site-icon";
import { t } from "@/lib/i18n";
import type { OrganizationSummary } from "@/lib/organizations/types";
import { scoreDelta } from "@/lib/score-delta";

export interface BrandStripScore {
	score: number | null;
	previousScore: number | null;
}

function DeltaText({ entry }: { entry: BrandStripScore }) {
	const delta = scoreDelta(entry.score, entry.previousScore);
	if (delta.kind === "none" || delta.kind === "first") return null;
	const glyph = delta.kind === "up" ? "▲" : delta.kind === "down" ? "▼" : "—";
	const color =
		delta.kind === "up" ? "text-delta-up" : delta.kind === "down" ? "text-delta-down" : "text-muted-foreground";
	const label = t(
		delta.kind === "up"
			? "home.delta_up_short"
			: delta.kind === "down"
				? "home.delta_down_short"
				: "home.delta_same_short",
		{ points: delta.points },
	);
	return (
		<span className={cn("font-medium", color)}>
			<span aria-hidden>
				{glyph} {delta.points}
			</span>
			<span className="sr-only">{label}</span>
		</span>
	);
}

function ScoreLine({ onboarded, entry }: { onboarded: boolean; entry: BrandStripScore | undefined }) {
	if (!onboarded) return <span className="text-[13px] text-muted-foreground">{t("brand-strip.setting_up")}</span>;
	if (!entry || entry.score === null) return <span className="text-[13px] text-muted-foreground">—</span>;
	return (
		<span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
			<span className="font-semibold tabular-nums text-foreground">{entry.score}%</span>
			<DeltaText entry={entry} />
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
		<nav
			aria-label={t("brand-strip.label")}
			className="order-last flex min-w-0 basis-full gap-2.5 overflow-x-auto px-0.5 py-1 [scrollbar-width:none] md:order-none md:flex-1 md:basis-auto"
		>
			{organization.brands.map((brand) => {
				const active = brand.id === currentBrandId;
				return (
					<Link
						key={brand.id}
						to="/app/org/$org/brand/$brand"
						params={brandLinkParams(organization, brand)}
						aria-current={active ? "page" : undefined}
						className={cn(
							"flex h-[60px] min-w-[150px] shrink-0 items-center gap-3 rounded-xl border bg-card px-3 text-left text-foreground transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
							active ? "border-primary shadow-[0_0_0_1px_var(--primary)]" : "border-border",
						)}
					>
						<SiteIcon domain={brand.website} size="md" className="rounded-lg" />
						<span className="flex min-w-0 flex-col gap-[3px]">
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
					aria-label={t("brand-strip.add")}
					className="flex size-[60px] shrink-0 items-center justify-center rounded-xl border border-dashed border-(--dashed) text-[22px] leading-none text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
				>
					+
				</Link>
			)}
		</nav>
	);
}
