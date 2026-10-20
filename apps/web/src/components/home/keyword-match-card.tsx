import { ArrowsClockwise, CheckCircle, Warning, XCircle } from "@phosphor-icons/react";
import type { KeywordCheck } from "@workspace/lib/keywords";
import { overlapScore } from "@workspace/lib/keywords/match";
import type { KeywordResult, KeywordStatus } from "@workspace/lib/keywords/types";
import { Button } from "@workspace/ui/components/button";
import { BandPill } from "@/components/home/band-pill";
import { HomeCard } from "@/components/home/home-card";
import { useKeywordCheck, useRequestKeywordCheck } from "@/hooks/use-keyword-check";
import { type TranslationKey, t } from "@/lib/i18n";
import { keywordsDiffer } from "@/lib/keyword-limits";
import { scoreBand } from "@/lib/score-band";
import type { KeywordCheckView } from "@/server/keywords";

const ORDER: KeywordStatus[] = ["missing", "weak", "found"];
const STATUS: Record<KeywordStatus, { label: TranslationKey; icon: typeof CheckCircle; className: string }> = {
	missing: { label: "home.match_missing", icon: XCircle, className: "text-rose-700" },
	weak: { label: "home.match_weak", icon: Warning, className: "text-amber-700" },
	found: { label: "home.match_found", icon: CheckCircle, className: "text-emerald-700" },
};

function relative(date: Date): string {
	const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
	if (days <= 0) return t("home.match_checked_today");
	if (days === 1) return t("home.match_checked_day");
	return t("home.match_checked_days", { days });
}

function Row({ result }: { result: KeywordResult }) {
	const meta = STATUS[result.status];
	return (
		<li className="flex items-center gap-3 py-2">
			<meta.icon className={`size-5 shrink-0 ${meta.className}`} weight="fill" />
			<span className="min-w-0 flex-1 truncate">{result.keyword}</span>
			<span className={`text-sm ${meta.className}`}>{t(meta.label)}</span>
			{result.url ? (
				<a
					href={result.url}
					target="_blank"
					rel="noreferrer"
					className="max-w-48 truncate text-sm text-primary underline"
				>
					{new URL(result.url).pathname || "/"}
				</a>
			) : (
				<span className="text-sm text-muted-foreground">{t("home.match_add_hint")}</span>
			)}
		</li>
	);
}

function Results({ latest, failure, stale }: { latest: KeywordCheck; failure: string | null; stale: boolean }) {
	const results = latest.report.keywords;
	const score = overlapScore(results);
	const band = scoreBand(score);
	const present = results.filter((r) => r.status !== "missing").length;
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-3">
				<span className="text-3xl font-bold tabular-nums">{score ?? 0}%</span>
				{band && <BandPill band={band} />}
				<span className="text-muted-foreground">{t("home.match_headline", { present, total: results.length })}</span>
			</div>
			{failure && <p className="text-sm text-amber-800">{t("home.match_failed")}</p>}
			{stale && <p className="text-sm text-muted-foreground">{t("home.match_stale")}</p>}
			<ul className="divide-y">
				{ORDER.flatMap((status) => results.filter((r) => r.status === status)).map((result) => (
					<Row key={result.keyword} result={result} />
				))}
			</ul>
			<p className="text-xs text-muted-foreground">{relative(new Date(latest.createdAt))}</p>
		</div>
	);
}

function Body({ keywords, check }: { keywords: string[]; check: KeywordCheckView | undefined }) {
	if (keywords.length === 0) return <p className="text-muted-foreground">{t("home.match_no_keywords")}</p>;
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
		return <Results latest={latest} failure={check?.failure ?? null} stale={stale} />;
	}
	return (
		<p className="text-muted-foreground">
			{check?.failure && !running ? t("home.match_failed") : t("home.match_pending")}
		</p>
	);
}

export function KeywordMatchCard({ keywords }: { keywords: string[] }) {
	const { data, isLoading, error, refetch } = useKeywordCheck();
	const request = useRequestKeywordCheck();
	const running = data?.running ?? false;

	return (
		<HomeCard
			title={t("home.match_title")}
			description={t("home.match_description")}
			loading={isLoading}
			error={error}
			onRetry={() => refetch()}
			action={
				keywords.length > 0 && (
					<Button variant="outline" size="sm" disabled={running || request.isPending} onClick={() => request.mutate()}>
						<ArrowsClockwise className={`size-4 ${running ? "animate-spin" : ""}`} />
						{running ? t("home.match_checking") : t("home.match_check_again")}
					</Button>
				)
			}
		>
			<Body keywords={keywords} check={data} />
		</HomeCard>
	);
}
