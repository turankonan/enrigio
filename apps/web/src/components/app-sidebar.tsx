import {
	Briefcase,
	Building,
	Buildings,
	ChartBar,
	Code,
	Cpu,
	CreditCard,
	Gauge,
	Key,
	Link as LinkIcon,
	ListChecks,
	Megaphone,
	PlugsConnected,
	Target,
	TreeStructure,
	Users,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { FeaturesConfig } from "@workspace/config/types";
import { brandLinkParams, orgLinkParams } from "@workspace/lib/app-urls";
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
import { type NavGroup, type NavItem, NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";
import { useViewer } from "@/hooks/use-route-context";
import { adminNavItems } from "@/lib/admin-nav";
import { t } from "@/lib/i18n";
import type { OrganizationSummary } from "@/lib/organizations/types";
import type { ShellScope } from "@/lib/shell-scope";

export type AppSidebarProps = ShellScope;

function organizationGroups(organization: OrganizationSummary, features?: FeaturesConfig): NavGroup[] {
	const params = orgLinkParams(organization);
	const items: NavItem[] = [
		{
			title: t("app-sidebar.organization"),
			link: { to: "/app/org/$org/settings", params },
			icon: Briefcase,
			exact: true,
		},
		{ title: t("app-sidebar.brands"), link: { to: "/app/org/$org/settings/brands", params }, icon: Buildings },
	];

	if (features?.teamInvites) {
		items.push({
			title: t("app-sidebar.team"),
			link: { to: "/app/org/$org/settings/members", params },
			icon: Users,
		});
	}

	if (features?.billing) {
		items.push({
			title: t("app-sidebar.billing"),
			link: { to: "/app/org/$org/settings/billing", params },
			icon: CreditCard,
		});
	}

	items.push({
		title: t("app-sidebar.api-keys"),
		link: { to: "/app/org/$org/settings/api-keys", params },
		icon: Key,
	});

	return [
		{ label: t("app-sidebar.organization-settings"), items },
		{
			label: t("app-sidebar.docs"),
			items: [
				{ title: t("app-sidebar.api"), link: { to: "/app/org/$org/settings/api", params }, icon: Code },
				{ title: t("app-sidebar.mcp"), link: { to: "/app/org/$org/settings/mcp", params }, icon: PlugsConnected },
			],
		},
	];
}

function brandGroups(organization: OrganizationSummary, brand: BrandWithPrompts): NavGroup[] {
	const params = brandLinkParams(organization, brand);
	const dashboard: NavItem[] = [
		{
			title: t("app-sidebar.overview"),
			link: { to: "/app/org/$org/brand/$brand", params },
			icon: Gauge,
			exact: true,
		},
	];

	if (brand.onboarded) {
		dashboard.push(
			{
				title: t("app-sidebar.visibility"),
				link: { to: "/app/org/$org/brand/$brand/visibility", params },
				icon: ChartBar,
			},
			{
				title: t("app-sidebar.share-of-voice"),
				link: { to: "/app/org/$org/brand/$brand/share-of-voice", params },
				icon: Megaphone,
			},
			{
				title: t("app-sidebar.query-fan-out"),
				link: { to: "/app/org/$org/brand/$brand/query-fan-out", params },
				icon: TreeStructure,
			},
			{
				title: t("app-sidebar.citations"),
				link: { to: "/app/org/$org/brand/$brand/citations", params },
				icon: LinkIcon,
			},
			{
				title: t("app-sidebar.opportunities"),
				link: { to: "/app/org/$org/brand/$brand/opportunities", params },
				icon: Target,
			},
		);
	}

	const groups: NavGroup[] = [{ label: t("app-sidebar.dashboard"), items: dashboard }];

	if (brand.onboarded) {
		groups.push({
			label: t("app-sidebar.settings"),
			items: [
				{
					title: t("app-sidebar.brand"),
					link: { to: "/app/org/$org/brand/$brand/settings/brand", params },
					icon: Building,
				},
				{
					title: t("app-sidebar.competitors"),
					link: { to: "/app/org/$org/brand/$brand/settings/competitors", params },
					icon: Buildings,
				},
				{
					title: t("app-sidebar.prompts"),
					link: { to: "/app/org/$org/brand/$brand/settings/prompts", params },
					icon: ListChecks,
				},
				{
					title: t("app-sidebar.llms"),
					link: { to: "/app/org/$org/brand/$brand/settings/llms", params },
					icon: Cpu,
				},
			],
		});
	}

	return groups;
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
		...(section === "brand" && organization && brand ? brandGroups(organization, brand) : []),
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
				<NavUser showOrganizations={section !== "account"} adminItems={section === "admin" ? [] : adminItems} />
				<NavAppInfo />
			</SidebarFooter>
		</Sidebar>
	);
}
