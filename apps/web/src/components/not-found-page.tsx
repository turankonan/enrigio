import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@workspace/ui/components/skeleton";
import FullPageCard from "@/components/full-page-card";
import { OrganizationDirectory } from "@/components/organization-directory";
import { t } from "@/lib/i18n";
import { organizationsQuery } from "@/lib/organizations/queries";

const TITLE = t("not-found-page.title");
const SUBTITLE = t("not-found-page.subtitle");

export function NotFoundPage() {
	const { data, isLoading } = useQuery(organizationsQuery);

	if (isLoading) {
		return (
			<FullPageCard title={TITLE} subtitle={SUBTITLE}>
				<div className="flex min-w-[240px] flex-col space-y-3">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			</FullPageCard>
		);
	}

	if (!data?.signedIn) {
		return <FullPageCard title={TITLE} subtitle={SUBTITLE} showBackButton={true} />;
	}

	return (
		<FullPageCard logoHref="/app" title={TITLE} subtitle={SUBTITLE} showBackButton={data.organizations.length === 0}>
			{data.organizations.length > 0 ? <OrganizationDirectory organizations={data.organizations} /> : undefined}
		</FullPageCard>
	);
}
