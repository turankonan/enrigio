import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Progress } from "@workspace/ui/components/progress";
import { useBrandParams } from "@/hooks/use-route-params";
import { locale, t } from "@/lib/i18n";
import { INTENT_LABEL } from "@/lib/setup-wizard-labels";
import { retryStarterReportSectionFn, type StarterReport } from "@/server/starter-report";

interface Props {
	brandId: string;
	data: { report: StarterReport; coverage: number; partial: boolean; missingSections: string[]; createdAt: string };
	onChanged: () => void;
}

export function StarterReportView({ brandId, data, onChanged }: Props) {
	const { report } = data;
	const brandParams = useBrandParams();
	const retrySteps = useMutation({
		mutationFn: () => retryStarterReportSectionFn({ data: { brandId, section: "nextSteps" } }),
		onSuccess: onChanged,
	});
	const date = new Date(data.createdAt).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });

	return (
		<div className="mx-auto max-w-3xl space-y-6 p-4">
			{data.partial && (
				<Alert>
					<AlertDescription>
						{t("starter_report.partial_banner", { percent: Math.round(data.coverage * 100) })}
					</AlertDescription>
				</Alert>
			)}
			<section className="space-y-2">
				<h1 className="text-3xl font-bold">
					{t("starter_report.headline.title", {
						mentioned: report.headline.mentionedRuns,
						total: report.headline.totalRuns,
					})}
				</h1>
				<p className="text-muted-foreground">
					{report.headline.rivalsAhead > 0
						? t("starter_report.headline.rivals_ahead", { count: report.headline.rivalsAhead })
						: t("starter_report.headline.rivals_none")}
				</p>
				<p className="text-xs text-muted-foreground">{t("starter_report.snapshot", { date })}</p>
			</section>

			<Card>
				<CardHeader>
					<CardTitle>{t("starter_report.score.title")}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="text-4xl font-bold">{report.score.mentionPercent}%</div>
					<Progress value={report.score.mentionPercent} />
					<h3 className="text-sm font-semibold">{t("starter_report.score.by_intent")}</h3>
					<ul className="space-y-2">
						{report.score.byIntent.map((i) => (
							<li key={i.intent} className="flex items-center gap-3 text-sm">
								<span className="w-32">{INTENT_LABEL[i.intent]}</span>
								<Progress value={i.mentionPercent} className="flex-1" />
								<span className="w-24 text-right text-muted-foreground">
									{i.mentionPercent}% · {i.runs}
								</span>
							</li>
						))}
					</ul>
					<p className="text-sm text-muted-foreground">
						{report.score.accuracy
							? t("starter_report.score.accuracy", report.score.accuracy)
							: t("starter_report.score.accuracy_none")}
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("starter_report.who.title")}</CardTitle>
				</CardHeader>
				<CardContent>
					<ul className="space-y-2">
						{report.whoIsThere.map((w) => (
							<li key={w.name} className="flex items-center justify-between text-sm">
								<span className={w.isYou ? "font-semibold" : undefined}>
									{w.name} {w.isYou && <Badge variant="secondary">{t("starter_report.who.you")}</Badge>}
								</span>
								<span className="text-muted-foreground">{t("starter_report.who.runs", { count: w.count })}</span>
							</li>
						))}
					</ul>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("starter_report.why.title")}</CardTitle>
				</CardHeader>
				<CardContent>
					{report.whyThem.length === 0 ? (
						<p className="text-sm text-muted-foreground">{t("starter_report.why.empty")}</p>
					) : (
						<ul className="space-y-2">
							{report.whyThem.map((d) => (
								<li key={d.domain} className="flex items-center justify-between text-sm">
									<span>
										{d.domain} {d.isYours && <Badge variant="secondary">{t("starter_report.why.yours")}</Badge>}
									</span>
									<span className="text-muted-foreground">{d.count}</span>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("starter_report.next.title")}</CardTitle>
				</CardHeader>
				<CardContent>
					{data.missingSections.includes("nextSteps") ? (
						<div className="flex items-center gap-3">
							<span className="text-sm text-muted-foreground">{t("starter_report.next.missing")}</span>
							<Button variant="outline" size="sm" onClick={() => retrySteps.mutate()} disabled={retrySteps.isPending}>
								{t("starter_report.next.retry")}
							</Button>
						</div>
					) : (
						<ol className="list-decimal space-y-3 pl-5">
							{report.nextSteps.map((s) => (
								<li key={s.title}>
									<div className="font-medium">{s.title}</div>
									<p className="text-sm text-muted-foreground">{s.why}</p>
								</li>
							))}
						</ol>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("starter_report.answers.title")}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{report.answers.map((a) => (
						<div key={`${a.promptValue}-${a.model}`} className="space-y-1 rounded-md border p-3">
							<div className="flex items-center justify-between gap-2 text-sm">
								<span className="font-medium">{a.promptValue}</span>
								<span className="flex shrink-0 gap-2">
									<Badge variant="outline">{a.model}</Badge>
									<Badge variant={a.mentioned ? "default" : "secondary"}>
										{a.mentioned ? t("setup.scan.mentioned_badge") : t("setup.scan.not_mentioned_badge")}
									</Badge>
								</span>
							</div>
							<p className="whitespace-pre-wrap text-sm text-muted-foreground">{a.excerpt}</p>
						</div>
					))}
				</CardContent>
			</Card>

			<Link to="/app/org/$org/brand/$brand" params={brandParams} className={buttonVariants()}>
				{t("starter_report.dashboard")}
			</Link>
		</div>
	);
}
