import { Check, Circle, type Icon, Warning } from "@phosphor-icons/react";
import type { KeywordCheck } from "@workspace/lib/keywords";
import { overlapScore } from "@workspace/lib/keywords/match";
import type { KeywordResult, KeywordStatus } from "@workspace/lib/keywords/types";
import { cn } from "@workspace/ui/lib/utils";
import { BandPill } from "@/components/home/band-pill";
import { HomeCard } from "@/components/home/home-card";
import { useKeywordCheck, useRequestKeywordCheck } from "@/hooks/use-keyword-check";
import { type TranslationKey, t } from "@/lib/i18n";
import { keywordsDiffer } from "@/lib/keyword-limits";
import { scoreBand } from "@/lib/score-band";
import type { KeywordCheckView } from "@/server/keywords";

const GROUPS: { status: KeywordStatus; label: TranslationKey; word: TranslationKey; icon: Icon; className: string }[] =
	[
		{
			status: "missing",
			label: "home.match_missing",
			word: "home.match_missing",
			icon: Circle,
			className: "text-band-low-foreground",
		},
		{
			status: "weak",
			label: "home.match_weak",
			word: "home.match_weak",
			icon: Warning,
			className: "text-band-ok-foreground",
		},
		{
			status: "found",
			label: "home.match_found",
			word: "home.match_found",
			icon: Check,
			className: "text-band-good-foreground",
		},
	];

function relative(date: Date): string {
	const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
	if (days <= 0) return t("home.match_checked_today");
	if (days === 1) return t("home.match_checked_day");
	return t("home.match_checked_days", { days });
}

function pageLabel(url: string): string {
	try {
		const u = new URL(url);
		return `${u.hostname}${u.pathname === "/" ? "/" : u.pathname}`;
	} catch {
		return url;
	}
}

function detailKey(r: KeywordResult): TranslationKey | null {
	if (r.status === "missing") return null;
	if (r.status === "weak") return "home.match_detail_weak";
	return r.where === "heading" ? "home.match_detail_heading" : "home.match_detail_body";
}

function Row({ result, group }: { result: KeywordResult; group: (typeof GROUPS)[number] }) {
	const detail = detailKey(result);
	return (
		<li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-divider py-[9px]">
			<span className="text-[15px] font-medium">{result.keyword}</span>
			<span
				className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold", group.className)}
			>
				<group.icon className="size-3.5" aria-hidden /> {t(group.word)}
			</span>
			<span className="col-span-full text-[13px] text-muted-foreground">
				{detail && result.url ? (
					<>
						{t(detail)}{" "}
						<a href={result.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
							{pageLabel(result.url)}
						</a>
					</>
				) : (
					t("home.match_add_hint")
				)}
			</span>
		</li>
	);
}

function CheckAgainButton({ running, onClick }: { running: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			className="h-8 rounded-lg border bg-card px-3 text-[13px] font-medium hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
			disabled={running}
			onClick={onClick}
		>
			{running ? t("home.match_checking") : t("home.match_check_again")}
		</button>
	);
}

function Results({
	latest,
	failure,
	stale,
	running,
	requesting,
	onCheckAgain,
}: {
	latest: KeywordCheck;
	failure: string | null;
	stale: boolean;
	running: boolean;
	requesting: boolean;
	onCheckAgain: () => void;
}) {
	const results = latest.report.keywords;
	const score = overlapScore(results);
	const band = scoreBand(score);
	const present = results.filter((r) => r.status !== "missing").length;
	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-3">
				<span className="text-[28px] font-semibold tracking-[-0.03em] tabular-nums">
					<strong className="font-bold">{t("home.match_found_of", { present, total: results.length })}</strong>{" "}
					{t("home.match_headline_rest", { pct: score ?? 0 })}
				</span>
				<BandPill band={band ?? "none"} />
			</div>
			<p className="text-sm leading-[1.45] text-muted-foreground">{t("home.match_description")}</p>
			{failure && <p className="text-sm text-band-ok-foreground">{t("home.match_failed")}</p>}
			{stale && <p className="text-sm text-muted-foreground">{t("home.match_stale")}</p>}
			{GROUPS.map((group) => {
				const rows = results.filter((r) => r.status === group.status);
				if (rows.length === 0) return null;
				return (
					<div key={group.status}>
						<div className="flex items-center gap-2 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
							{t(group.label)}{" "}
							<span className="text-xs font-medium normal-case tracking-normal text-muted-foreground/70">
								{rows.length}
							</span>
						</div>
						<ul>
							{rows.map((result) => (
								<Row key={result.keyword} result={result} group={group} />
							))}
						</ul>
					</div>
				);
			})}
			<div className="flex flex-wrap items-center gap-3 pt-1 text-[13px] text-muted-foreground">
				{t("home.match_checked", { ago: relative(new Date(latest.createdAt)) })} ·{" "}
				<CheckAgainButton running={running || requesting} onClick={onCheckAgain} />
			</div>
		</div>
	);
}

function Body({
	keywords,
	check,
	requesting,
	onCheckAgain,
}: {
	keywords: string[];
	check: KeywordCheckView | undefined;
	requesting: boolean;
	onCheckAgain: () => void;
}) {
	if (keywords.length === 0) {
		return (
			<div className="rounded-xl border border-dashed border-(--dashed) p-7 text-center text-[15px] text-muted-foreground">
				{t("home.match_no_keywords")}
			</div>
		);
	}
	const latest = check?.latest;
	const running = check?.running ?? false;
	// A report for an older keyword list would otherwise read as the answer for the current one.
	const stale =
		!!latest &&
		keywordsDiffer(
			latest.report.keywords.map((r) => r.keyword),
			keywords,
		);
	if (latest && !(stale && running)) {
		return (
			<Results
				latest={latest}
				failure={check?.failure ?? null}
				stale={stale}
				running={running}
				requesting={requesting}
				onCheckAgain={onCheckAgain}
			/>
		);
	}
	if (!running) {
		return (
			<div className="flex flex-col items-start gap-3">
				{check?.failure && <p className="text-sm text-muted-foreground">{t("home.match_failed")}</p>}
				<CheckAgainButton running={requesting} onClick={onCheckAgain} />
			</div>
		);
	}
	return (
		<div className="flex flex-col gap-2.5 py-2">
			{["w-3/5", "w-4/5", "w-[45%]"].map((w) => (
				<div key={w} className={cn("h-3.5 animate-pulse rounded-md bg-divider motion-reduce:animate-none", w)} />
			))}
			<p className="mt-1.5 text-sm text-muted-foreground">{t("home.match_pending")}</p>
		</div>
	);
}

export function KeywordMatchCard({ keywords }: { keywords: string[] }) {
	const { data, isLoading, error, refetch } = useKeywordCheck();
	const request = useRequestKeywordCheck();

	return (
		<HomeCard
			title={t("home.match_title")}
			titleId="home-match"
			description={undefined}
			loading={isLoading}
			error={error}
			onRetry={() => refetch()}
		>
			<Body keywords={keywords} check={data} requesting={request.isPending} onCheckAgain={() => request.mutate()} />
		</HomeCard>
	);
}
