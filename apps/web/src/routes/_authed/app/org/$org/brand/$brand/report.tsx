import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { StarterReportView } from "@/components/starter-report/starter-report-view";
import { useBrandParams } from "@/hooks/use-route-params";
import { t } from "@/lib/i18n";
import { pageHead } from "@/lib/route-head";
import { getStarterReportFn } from "@/server/starter-report";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/report")({
	staticData: { crumb: t("starter_report.crumb"), bareHeader: true },
	head: pageHead({ description: t("starter_report.head_description") }),
	component: ReportPage,
});

function ReportPage() {
	const { brandId } = Route.useRouteContext();
	const brandParams = useBrandParams();
	const report = useQuery({
		queryKey: ["starter-report", brandId],
		queryFn: () => getStarterReportFn({ data: { brandId } }),
	});

	if (report.isPending) return <Spinner />;
	if (!report.data) {
		return (
			<div className="space-y-4 p-4">
				<p>{t("starter_report.not_ready")}</p>
				<Link to="/app/org/$org/brand/$brand" params={brandParams} className={buttonVariants({ variant: "outline" })}>
					{t("starter_report.back_to_scan")}
				</Link>
			</div>
		);
	}
	return <StarterReportView brandId={brandId} data={report.data} onChanged={() => report.refetch()} />;
}
