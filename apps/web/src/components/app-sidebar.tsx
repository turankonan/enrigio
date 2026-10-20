import { Gauge } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { brandLinkParams } from "@workspace/lib/app-urls";
import type { BrandWithPrompts } from "@workspace/lib/db/schema";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@workspace/ui/components/sidebar";
import { DemoModePill } from "@/components/demo-mode-pill";
import { Logo } from "@/components/logo";
import { NavAppInfo } from "@/components/nav-app-info";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";
import { useViewer } from "@/hooks/use-route-context";
import { adminNavItems } from "@/lib/admin-nav";
import { t } from "@/lib/i18n";
import { brandGroups, type NavGroup, organizationGroups } from "@/lib/nav-links";
import type { OrganizationSummary } from "@/lib/organizations/types";
import type { ShellScope } from "@/lib/shell-scope";

export type AppSidebarProps = ShellScope;

function sidebarBrandGroups(organization: OrganizationSummary, brand: BrandWithPrompts): NavGroup[] {
	const overview: NavGroup = {
		label: t("app-sidebar.dashboard"),
		items: [
			{
				title: t("app-sidebar.overview"),
				link: { to: "/app/org/$org/brand/$brand", params: brandLinkParams(organization, brand) },
				icon: Gauge,
				exact: true,
			},
		],
	};
	const [dashboard, ...rest] = brandGroups(organization, brand);
	return [dashboard ? { ...dashboard, items: [...overview.items, ...dashboard.items] } : overview, ...rest];
}

export function AppSidebar({ section, organization, brand }: AppSidebarProps) {
	const { setOpenMobile } = useSidebar();
	const { isAdmin, hasReportAccess } = useViewer();
	const features = useDeploymentFeatures();
	// Reports are disabled entirely in cloud; hide the nav entry there.
	const reportsEnabled = features?.reportGeneration ?? true;

	// A gate page offers no destinations: every link would either 404 or bounce
	// the user straight back to the gate.
	const adminItems = section === "account" ? [] : adminNavItems({ isAdmin, hasReportAccess, reportsEnabled });

	const groups: NavGroup[] = [
		...(section === "brand" && organization && brand ? sidebarBrandGroups(organization, brand) : []),
		...(section === "organization" && organization ? organizationGroups(organization, features) : []),
		...(section === "admin" && adminItems.length > 0
			? [{ label: t("settings.members.role_admin"), items: adminItems }]
			: []),
	];
	const brandmark = (
		<>
			<Logo iconClassName="!size-5" />
			<div className="ml-auto group-data-[collapsible=icon]:hidden">
				<DemoModePill />
			</div>
		</>
	);

	return (
		<Sidebar variant="inset">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						{/* On a gate page the mark still says whose product this is, but it
						    leads nowhere — /app would redirect right back here. */}
						{section === "account" ? (
							<div className="flex items-center gap-2 p-2">{brandmark}</div>
						) : (
							<SidebarMenuButton size="lg" render={<Link to="/app" onClick={() => setOpenMobile(false)} />}>
								{brandmark}
							</SidebarMenuButton>
						)}
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<NavMain groups={groups} />
			</SidebarContent>
			<SidebarFooter>
				<NavUser />
				<NavAppInfo />
			</SidebarFooter>
		</Sidebar>
	);
}
