import { createFileRoute, Link } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { OrganizationRowIcon } from "@/components/organization-row-icon";
import { useOrganization } from "@/hooks/use-organizations";
import { t } from "@/lib/i18n";
import { organizationTree } from "@/lib/organizations/tree";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/app/org/$org/settings/brands")({
	staticData: { crumb: t("settings.api_keys.col_brands") },
	head: pageHead({ description: t("settings.brands.head_description") }),
	component: OrganizationBrandsPage,
});

function OrganizationBrandsPage() {
	const organization = useOrganization();
	const { children } = organizationTree(organization);

	return (
		<div className="max-w-2xl space-y-6">
			<h1 className="text-3xl font-bold">{t("settings.api_keys.col_brands")}</h1>

			<div className="flex flex-col gap-2">
				{organization.brands.length === 0 && (
					<p className="text-sm text-muted-foreground">{t("settings.brands.empty")}</p>
				)}

				{children.map((row) => (
					<Link
						key={row.key}
						{...row.link}
						className={buttonVariants({
							variant: row.kind === "brand" ? "secondary" : "outline",
							className: "justify-start",
						})}
					>
						<OrganizationRowIcon row={row} size="md" />
						{row.label}
					</Link>
				))}

				{organization.brandCreation.kind === "denied" && (
					<p className="text-sm text-muted-foreground">{organization.brandCreation.message}</p>
				)}
			</div>
		</div>
	);
}
