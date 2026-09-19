import { ArrowRight, ArrowsClockwise, Clock, Eye, Info, List, Megaphone, Pulse } from "@phosphor-icons/react";
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { labelForModelFilter } from "@workspace/config/model-filter";
import type { ClientConfig } from "@workspace/config/types";
import { buttonVariants } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { type ReactNode, useEffect } from "react";
import PromptWizard from "@/components/prompt-wizard";
import { TrendChart, type TrendPoint } from "@/components/trend-chart";
import { useBrand } from "@/hooks/use-brands";
import { useDashboardSummary } from "@/hooks/use-dashboard-summary";
import { useBrandParams } from "@/hooks/use-route-params";
import { useShareOfVoice } from "@/hooks/use-share-of-voice";
import { t } from "@/lib/i18n";
import { describeTargetSchedule, type TrackedTarget } from "@/lib/model-filter";
import { setPersonProperties } from "@/lib/posthog";
import { pageHead } from "@/lib/route-head";

function getVisibilityBgColor(value: number): string {
	if (value > 75) return "bg-emerald-50 dark:bg-emerald-950/30";
	if (value > 45) return "bg-amber-50 dark:bg-amber-950/30";
	return "bg-rose-50 dark:bg-rose-950/30";
}

function getVisibilityTextColor(value: number): string {
	if (value > 75) return "text-emerald-700 dark:text-emerald-400";
	if (value > 45) return "text-amber-700 dark:text-amber-400";
	return "text-rose-700 dark:text-rose-400";
}

function getVisibilityBorderColor(value: number): string {
	if (value > 75) return "border-emerald-200 dark:border-emerald-800";
	if (value > 45) return "border-amber-200 dark:border-amber-800";
	return "border-rose-200 dark:border-rose-800";
}

/** Most recent non-null value in a daily series — matches the right end of the trend line. */
function lastValue<T>(series: T[], key: keyof T): number | null {
	for (let i = series.length - 1; i >= 0; i--) {
		const v = series[i]?.[key];
		if (typeof v === "number") return v;
	}
	return null;
}

function formatRelativeTime(dateString: string | null): string {
	if (!dateString) return t("dashboard.time_never");

	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return t("dashboard.time_just_now");
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;

	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatRunFrequency(hours: number): string {
	const weeks = Math.floor(hours / (7 * 24));
	const days = Math.floor((hours % (7 * 24)) / 24);
	const remainingHours = hours % 24;

	const parts: string[] = [];
	if (weeks > 0) parts.push(`${weeks}w`);
	if (days > 0) parts.push(`${days}d`);
	if (remainingHours > 0) parts.push(`${remainingHours}h`);

	return parts.length > 0 ? `~${parts.join(" ")}` : "~1h";
}

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/")({
	staticData: { crumb: t("dashboard.crumb") },
	head: pageHead({ description: t("dashboard.head_description") }),
	component: DashboardPage,
});

function StatWithTooltip({
	icon: Icon,
	label,
	value,
	tooltip,
}: {
	icon: typeof List;
	label: string;
	value: string | number;
	tooltip: ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger render={<div className="flex items-center gap-2 cursor-help" />}>
				<Icon className="h-4 w-4 flex-shrink-0" />
				<span>
					<span className="font-semibold text-foreground">{value}</span> {label}
				</span>
				<Info className="h-3.5 w-3.5 opacity-50" />
			</TooltipTrigger>
			<TooltipContent className="max-w-xs text-sm">{tooltip}</TooltipContent>
		</Tooltip>
	);
}

function CardTitleWithTooltip({
	title,
	tooltip,
	className = "",
}: {
	title: string;
	/** Absent while the figures it would quote are still loading. */
	tooltip?: string;
	className?: string;
}) {
	return (
		<CardTitle className={`text-sm font-medium flex items-center gap-1.5 ${className}`}>
			{title}
			{tooltip ? (
				<Tooltip>
					<TooltipTrigger render={<Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
					<TooltipContent className="max-w-xs text-sm font-normal">{tooltip}</TooltipContent>
				</Tooltip>
			) : (
				<Info className="h-3.5 w-3.5 opacity-70" />
			)}
		</CardTitle>
	);
}

/**
 * One dashboard band: the headline number beside the 30-day line it is the
 * latest point of. Renders its own skeletons, so the loading dashboard is the
 * same tree as the loaded one rather than a second copy of this markup.
 */
function TrendSection({
	icon: Icon,
	title,
	linkTo,
	linkLabel,
	chartTitle,
	chartLabel,
	tooltip,
	value,
	series,
	loading,
}: {
	icon: typeof Eye;
	title: string;
	linkTo: "/app/org/$org/brand/$brand/visibility" | "/app/org/$org/brand/$brand/share-of-voice";
	linkLabel: string;
	chartTitle: string;
	chartLabel: string;
	tooltip?: string;
	value: number | null;
	series: TrendPoint[];
	loading: boolean;
}) {
	const params = useBrandParams();
	const heroTone = value === null ? "" : `${getVisibilityBgColor(value)} ${getVisibilityBorderColor(value)}`;
	return (
		<section className="space-y-2">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold flex items-center gap-2">
					<Icon className="h-5 w-5 text-muted-foreground" />
					{title}
				</h2>
				<Link
					to={linkTo}
					params={params}
					className={buttonVariants({ variant: "ghost", size: "sm", className: "h-8" })}
				>
					{linkLabel} <ArrowRight className="h-4 w-4 ml-1" />
				</Link>
			</div>

			<div className="grid gap-4 lg:grid-cols-4">
				<Card className={`shadow-none flex flex-col gap-3 py-4 ${heroTone}`}>
					<HeroStat value={value} loading={loading} />
				</Card>
				<Card className="shadow-none lg:col-span-3 flex flex-col gap-3 py-4">
					<CardHeader className="border-b border-dotted pb-2!">
						<CardTitleWithTooltip title={chartTitle} tooltip={tooltip} />
					</CardHeader>
					<CardContent className="flex-1 min-h-[100px]">
						{loading ? (
							<Skeleton className="h-full w-full" />
						) : (
							<TrendChart data={series} label={chartLabel} color="#1f7a3d" />
						)}
					</CardContent>
				</Card>
			</div>
		</section>
	);
}

const STAT_PLACEHOLDERS = [
	{ label: t("dashboard.stat_prompts_tracked"), icon: List },
	{ label: t("dashboard.stat_coverage"), icon: Eye },
	{ label: t("dashboard.stat_evaluations"), icon: Pulse },
	{ label: t("dashboard.stat_run_frequency"), icon: Clock },
	{ label: t("dashboard.stat_last_updated"), icon: ArrowsClockwise },
];

function TrackingStats({
	loading,
	totalPrompts,
	promptsWithMention,
	totalRuns,
	lastUpdatedAt,
	delayHours,
	trackedTargets,
}: {
	loading: boolean;
	totalPrompts: number;
	promptsWithMention: number;
	totalRuns: number;
	lastUpdatedAt: string | null;
	delayHours: number;
	trackedTargets: TrackedTarget[];
}) {
	if (loading) {
		return (
			<div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
				{STAT_PLACEHOLDERS.map(({ label, icon: Icon }) => (
					<div key={label} className="flex items-center gap-2">
						<Icon className="h-4 w-4 flex-shrink-0" />
						<Skeleton className="h-4 w-28" />
					</div>
				))}
			</div>
		);
	}

	return (
		<div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
			<StatWithTooltip
				icon={List}
				label={t("dashboard.stat_prompts_tracked")}
				value={totalPrompts.toLocaleString()}
				tooltip={
					trackedTargets.length > 0 ? (
						<>
							<p>{t("dashboard.prompts_tooltip_intro")}</p>
							<ul className="mt-1 space-y-0.5">
								{trackedTargets.map((target) => (
									<li key={target.value}>{labelForModelFilter(target.value)}</li>
								))}
							</ul>
						</>
					) : (
						t("dashboard.prompts_tooltip_no_platforms")
					)
				}
			/>
			<StatWithTooltip
				icon={Eye}
				label={t("dashboard.stat_coverage")}
				value={t("dashboard.coverage_value", { mentioned: promptsWithMention, total: totalPrompts })}
				tooltip={t("dashboard.coverage_tooltip")}
			/>
			<StatWithTooltip
				icon={Pulse}
				label={t("dashboard.stat_evaluations_30d")}
				value={totalRuns.toLocaleString()}
				tooltip={t("dashboard.evaluations_tooltip")}
			/>
			<StatWithTooltip
				icon={Clock}
				label={t("dashboard.stat_run_frequency")}
				value={formatRunFrequency(delayHours)}
				tooltip={
					trackedTargets.length > 0 ? (
						<>
							{/* One rate for the brand is a summary, not the truth: a
							    grounded call samples far less often than a scraped one,
							    and self-hosted repeats every sample. */}
							<p>{t("dashboard.frequency_tooltip_intro")}</p>
							<ul className="mt-1 space-y-0.5">
								{trackedTargets.map((target) => (
									<li key={target.value}>{describeTargetSchedule(target)}</li>
								))}
							</ul>
						</>
					) : (
						t("dashboard.frequency_tooltip_no_platforms")
					)
				}
			/>
			<StatWithTooltip
				icon={ArrowsClockwise}
				label={t("dashboard.stat_last_updated")}
				value={formatRelativeTime(lastUpdatedAt)}
				tooltip={
					lastUpdatedAt
						? `The last prompts we evaluated for your brand were run on ${new Date(lastUpdatedAt).toLocaleString()}`
						: t("dashboard.last_updated_tooltip_never")
				}
			/>
		</div>
	);
}

/**
 * Shown until the first evaluation lands. What to do next depends on whether
 * any prompt is configured, and whether any of them are enabled.
 */
function AwaitingFirstEvaluation({ totalPrompts, hasPrompts }: { totalPrompts: number; hasPrompts: boolean }) {
	const params = useBrandParams();
	const hasEnabledPrompts = totalPrompts > 0;
	const message = hasEnabledPrompts
		? t("dashboard.awaiting_message_ready")
		: hasPrompts
			? t("dashboard.awaiting_message_disabled")
			: t("dashboard.awaiting_message_none");

	return (
		<div className="flex flex-1 flex-col items-center justify-center p-8 max-w-xl mx-auto text-center">
			<div className="rounded-full bg-muted p-4 mb-6">
				<Clock className="h-10 w-10 text-muted-foreground" />
			</div>
			<h2 className="text-2xl font-bold mb-3">
				{hasEnabledPrompts ? t("dashboard.awaiting_title") : t("dashboard.no_data_title")}
			</h2>
			<p className="text-muted-foreground mb-6 text-balance">{message}</p>
			<div className="flex flex-col gap-3 w-full">
				{hasEnabledPrompts && (
					<div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
						<div className="flex items-center gap-2">
							<List className="h-5 w-5 text-muted-foreground" />
							<span className="text-sm">{t("dashboard.prompts_configured_enabled")}</span>
						</div>
						<span className="font-semibold">{totalPrompts.toLocaleString()}</span>
					</div>
				)}
				<Link
					to="/app/org/$org/brand/$brand/settings/prompts"
					params={params}
					className={buttonVariants({ variant: "outline", className: "w-full" })}
				>
					{hasEnabledPrompts
						? t("dashboard.view_your_prompts")
						: hasPrompts
							? t("dashboard.edit_prompts_cta")
							: t("dashboard.set_up_prompts")}{" "}
					<ArrowRight className="h-4 w-4 ml-1" />
				</Link>
			</div>
			{hasEnabledPrompts && <p className="text-xs text-muted-foreground mt-6">{t("dashboard.refresh_hint")}</p>}
		</div>
	);
}

function ResearchBrandData({ brandId, clientConfig }: { brandId: string; clientConfig?: ClientConfig }) {
	return (
		<div className="space-y-6 max-w-2xl p-4">
			<div className="space-y-2">
				<h2 className="text-2xl font-bold">{t("dashboard.research_title")}</h2>
				<p className="text-muted-foreground text-balance">{t("dashboard.research_description")}</p>
			</div>
			<PromptWizard
				onComplete={() => {
					const template = clientConfig?.branding.onboardingRedirectUrlTemplate;
					if (template) window.location.href = template.replace("{brandId}", brandId);
				}}
			/>
		</div>
	);
}

/** The big "current" stat that fills a card — the latest point of its trend, colour-coded by value. */
function HeroStat({ value, loading }: { value: number | null; loading: boolean }) {
	return (
		<CardContent className="flex-1 flex items-center justify-center">
			<div
				className={`font-bold tracking-tight tabular-nums ${value === null ? "text-muted-foreground" : getVisibilityTextColor(value)}`}
				style={{ fontSize: "clamp(2.5rem, 6vw, 5rem)" }}
			>
				{loading ? <Skeleton className="h-16 w-32" /> : value === null ? "—" : `${value}%`}
			</div>
		</CardContent>
	);
}

/** Everything the two trend sections plot, plus the loading flags they key off.
 *  Reads only; the analytics write lives in `useReportedPromptCount`. */
function useDashboardMetrics(brandId: string | undefined) {
	const { data: dashboardSummary, isLoading: isLoadingSummary } = useDashboardSummary(brandId, "1m");
	const { data: sovData, isLoading: isLoadingSov } = useShareOfVoice(brandId, { lookback: "1m" });

	return {
		isLoadingSummary,
		isLoadingSov,
		totalRuns: dashboardSummary?.totalRuns || 0,
		totalPrompts: dashboardSummary?.totalPrompts,
		promptsWithMention: dashboardSummary?.promptsWithMention || 0,
		visibilityTimeSeries: dashboardSummary?.visibilityTimeSeries || [],
		sovTimeSeries: sovData?.shareTimeSeries ?? [],
		nonBrandedVisibility: dashboardSummary?.nonBrandedVisibility || 0,
		lastUpdatedAt: dashboardSummary?.lastUpdatedAt || null,
	};
}

/** Mirrors the brand's active prompt count onto the PostHog person. */
function useReportedPromptCount(totalPrompts: number | undefined) {
	useEffect(() => {
		if (totalPrompts != null) setPersonProperties({ active_prompt_count: totalPrompts });
	}, [totalPrompts]);
}

const visibilityTooltipText = (nonBrandedVisibility: number) =>
	`The percentage of AI answers to your prompts that mention your brand — the big number is the latest point on this line. For prompts that don't name your brand, it's ${nonBrandedVisibility}%. Visibility shifts as AI models, the prompts you track, or the sites AI scans change; the line is smoothed for staggered prompt schedules.`;

const SOV_TOOLTIP =
	"Your brand's share of all brand and competitor mentions across the AI answers to your prompts — the big number is the latest point on this line. It shifts as AI models change, as you and competitors publish, or as the sites AI scans move; the line is smoothed for staggered prompt schedules.";

function DashboardPage() {
	const { brandId } = Route.useRouteContext();
	const { data: brand, isLoading: isLoadingBrand } = useBrand();
	// The footer reports what this brand actually runs, resolved server-side.
	const trackedTargets = brand?.trackedTargets ?? [];
	const {
		isLoadingSummary,
		isLoadingSov,
		totalRuns,
		totalPrompts,
		promptsWithMention,
		visibilityTimeSeries,
		sovTimeSeries,
		nonBrandedVisibility,
		lastUpdatedAt,
	} = useDashboardMetrics(brand?.id);
	useReportedPromptCount(totalPrompts);
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const clientConfig = context.clientConfig;

	const loadingVisibility = isLoadingBrand || isLoadingSummary;
	const loadingSov = isLoadingBrand || isLoadingSov;

	if (!isLoadingBrand && !brand?.onboarded) {
		return <ResearchBrandData brandId={brandId} clientConfig={clientConfig} />;
	}

	// No runs yet: the dashboard has nothing to plot, so point at what to do next.
	if (!loadingVisibility && totalRuns === 0) {
		return <AwaitingFirstEvaluation totalPrompts={totalPrompts ?? 0} hasPrompts={(brand?.prompts?.length ?? 0) > 0} />;
	}

	return (
		<div className="flex flex-1 flex-col">
			<div className="m-auto flex w-full max-w-[1600px] flex-col gap-3 p-4">
				<TrendSection
					icon={Eye}
					title={t("dashboard.ai_visibility_title")}
					linkTo="/app/org/$org/brand/$brand/visibility"
					linkLabel={t("dashboard.view_visibility")}
					chartTitle={t("dashboard.visibility_chart_title")}
					chartLabel={t("dashboard.visibility_chart_label")}
					// The tooltips quote live figures, so they stay off until those have loaded.
					tooltip={loadingVisibility ? undefined : visibilityTooltipText(nonBrandedVisibility)}
					// t("plan-comparison.badge-current") = the latest plotted point, so the hero number always
					// matches the right end of the chart beside it (rather than the
					// whole-window average).
					value={lastValue(visibilityTimeSeries, "overall")}
					series={visibilityTimeSeries.map((p) => ({ date: p.date, value: p.overall }))}
					loading={loadingVisibility}
				/>

				<TrendSection
					icon={Megaphone}
					title={t("dashboard.sov_title")}
					linkTo="/app/org/$org/brand/$brand/share-of-voice"
					linkLabel={t("dashboard.view_sov")}
					chartTitle={t("dashboard.sov_chart_title")}
					chartLabel={t("dashboard.sov_title")}
					tooltip={loadingSov ? undefined : SOV_TOOLTIP}
					value={lastValue(sovTimeSeries, "share")}
					series={sovTimeSeries.map((p) => ({ date: p.date, value: p.share }))}
					loading={loadingSov}
				/>

				<section className="pt-2">
					<TrackingStats
						loading={loadingVisibility}
						totalPrompts={totalPrompts ?? 0}
						promptsWithMention={promptsWithMention}
						totalRuns={totalRuns}
						lastUpdatedAt={lastUpdatedAt}
						delayHours={brand?.delayOverrideHours ?? clientConfig?.defaultDelayHours ?? 24}
						trackedTargets={trackedTargets}
					/>
				</section>
			</div>
		</div>
	);
}
