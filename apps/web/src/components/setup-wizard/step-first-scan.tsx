import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Progress } from "@workspace/ui/components/progress";
import { useEffect, useRef } from "react";
import { t } from "@/lib/i18n";
import type { FirstScanStatus } from "@/server/first-scan";
import { getFirstScanStatusFn, openPartialFirstScanFn, retryFirstScanFn } from "@/server/first-scan";
import { Stepper } from "./stepper";

const POLL_MS = 3000;
// No answer for this long with pairs still missing: offer retry / partial.
const STALL_MS = 3 * 60 * 1000;

export function StepFirstScan({
	brandId,
	firstScanId,
	onReport,
	onDashboard,
}: {
	brandId: string;
	firstScanId: string;
	onReport: () => void;
	onDashboard: () => void;
}) {
	const status = useQuery({
		queryKey: ["first-scan", firstScanId],
		queryFn: () => getFirstScanStatusFn({ data: { brandId, firstScanId } }),
		refetchInterval: (q) =>
			q.state.data?.status === "complete" || q.state.data?.status === "partial" ? false : POLL_MS,
	});
	const retry = useMutation({
		mutationFn: () => retryFirstScanFn({ data: { brandId, firstScanId } }),
		onSuccess: () => status.refetch(),
	});
	const openPartial = useMutation({
		mutationFn: () => openPartialFirstScanFn({ data: { brandId, firstScanId } }),
		onSuccess: () => onReport(),
	});

	const s = status.data;
	// onReport may be a new function each render; hand off only once.
	const handedOff = useRef(false);
	useEffect(() => {
		if (s?.status === "complete" && !handedOff.current) {
			handedOff.current = true;
			onReport();
		}
	}, [s?.status, onReport]);

	if (!s) return null;
	const finished = s.done + s.failed;
	const lastAt = s.latest[0] ? new Date(s.latest[0].createdAt).getTime() : null;
	const stalled = s.missing > 0 && lastAt !== null && Date.now() - lastAt > STALL_MS;
	const needsAttention = s.status !== "complete" && s.status !== "partial" && (stalled || (s.settled && s.failed > 0));
	const donePercent = s.expected === 0 ? 0 : Math.round((s.done * 100) / s.expected);

	return (
		<div className="max-w-3xl space-y-6 p-4">
			<Stepper current={5} />
			<div className="space-y-1">
				<h2 className="text-2xl font-bold">
					{s.status === "complete" ? t("setup.scan.complete") : t("setup.scan.title")}
				</h2>
				<p className="text-muted-foreground">{t("setup.scan.subtitle")}</p>
			</div>
			<Progress value={s.expected === 0 ? 0 : (finished * 100) / s.expected} />
			<ScanStats s={s} finished={finished} />
			<LatestAnswers latest={s.latest} />
			{needsAttention && (
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-sm text-muted-foreground">
						{s.settled ? t("setup.scan.settled_with_failures") : t("setup.scan.stalled")}
					</span>
					<Button variant="outline" onClick={() => retry.mutate()} disabled={retry.isPending}>
						{s.settled ? t("setup.scan.retry_failed") : t("setup.scan.retry")}
					</Button>
					{s.canOpenPartial && (
						<Button onClick={() => openPartial.mutate()} disabled={openPartial.isPending}>
							{t("setup.scan.open_partial", { percent: donePercent })}
						</Button>
					)}
				</div>
			)}
			<div className="flex flex-wrap gap-2">
				{s.reportReady && <Button onClick={onReport}>{t("setup.scan.open_report")}</Button>}
				<Button variant="ghost" onClick={onDashboard}>
					{t("starter_report.dashboard")}
				</Button>
			</div>
		</div>
	);
}

function ScanStats({ s, finished }: { s: FirstScanStatus; finished: number }) {
	return (
		<div className="flex flex-wrap gap-4 text-sm">
			<span>{t("setup.scan.progress", { done: finished, expected: s.expected })}</span>
			<span>
				{s.etaSeconds === null
					? t("setup.scan.eta_unknown")
					: t("setup.scan.eta", { minutes: Math.max(1, Math.ceil(s.etaSeconds / 60)) })}
			</span>
			<span>{t("setup.scan.mentioned", { count: s.mentioned })}</span>
			{s.topRival && <span>{t("setup.scan.top_rival", s.topRival)}</span>}
			{s.failed > 0 && <span className="text-destructive">{t("setup.scan.failed", { count: s.failed })}</span>}
		</div>
	);
}

function LatestAnswers({ latest }: { latest: FirstScanStatus["latest"] }) {
	return (
		<div className="space-y-2">
			<h3 className="font-semibold">{t("setup.scan.latest")}</h3>
			<ul className="space-y-2">
				{latest.map((r) => (
					<li
						key={`${r.promptValue}-${r.model}-${r.createdAt}`}
						className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
					>
						<span className="truncate">{r.promptValue}</span>
						<span className="flex shrink-0 items-center gap-2">
							<Badge variant="outline">{r.model}</Badge>
							<Badge variant={r.mentioned ? "default" : "secondary"}>
								{r.mentioned ? t("setup.scan.mentioned_badge") : t("setup.scan.not_mentioned_badge")}
							</Badge>
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}
