import { createFileRoute, Link } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { useBrandParams } from "@/hooks/use-route-params";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/$")({
	staticData: { crumb: t("not_found.crumb") },
	component: BrandSubpathNotFound,
});

function BrandSubpathNotFound() {
	const params = useBrandParams();

	return (
		<div className="space-y-0">
			<div className="mb-4">
				<h1 className="text-3xl font-bold tracking-tight">{t("not_found.title")}</h1>
				<p className="text-muted-foreground mt-1">{t("not_found.description")}</p>
			</div>

			<div className="pt-2">
				<Link to="/app/org/$org/brand/$brand" params={params} className={buttonVariants({ variant: "outline" })}>
					{t("not_found.go_back")}
				</Link>
			</div>
		</div>
	);
}
