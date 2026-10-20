import type { Icon } from "@phosphor-icons/react";
import {
	Briefcase,
	Building,
	Buildings,
	ChartBar,
	Code,
	Cpu,
	CreditCard,
	Key,
	Link as LinkIcon,
	ListChecks,
	Megaphone,
	PlugsConnected,
	Target,
	TreeStructure,
	Users,
} from "@phosphor-icons/react";
import type { LinkProps } from "@tanstack/react-router";
import type { FeaturesConfig } from "@workspace/config/types";
import { brandLinkParams, orgLinkParams } from "@workspace/lib/app-urls";
import type { BrandWithPrompts } from "@workspace/lib/db/schema";
import { adminNavItems } from "@/lib/admin-nav";
import { t } from "@/lib/i18n";
import type { OrganizationSummary } from "@/lib/organizations/types";
import type { ShellScope } from "@/lib/shell-scope";

export interface NavItem {
	title: string;
	link: LinkProps;
	icon?: Icon;
	exact?: boolean;
}

export interface NavGroup {
	label: string;
	items: NavItem[];
}

export function organizationGroups(organization: OrganizationSummary, features?: FeaturesConfig): NavGroup[] {
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

export function brandGroups(organization: OrganizationSummary, brand: BrandWithPrompts): NavGroup[] {
	if (!brand.onboarded) return [];
	const params = brandLinkParams(organization, brand);

	return [
		{
			label: t("app-sidebar.dashboard"),
			items: [
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
			],
		},
		{
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
		},
	];
}

export function advancedGroups(
	scope: ShellScope,
	features: FeaturesConfig | undefined,
	viewer: { isAdmin: boolean; hasReportAccess: boolean },
): NavGroup[] {
	const reportsEnabled = features?.reportGeneration ?? true;
	const groups: NavGroup[] = [];
	if (scope.organization && scope.brand) groups.push(...brandGroups(scope.organization, scope.brand));
	if (scope.organization) groups.push(...organizationGroups(scope.organization, features));
	const admin = scope.section === "account" ? [] : adminNavItems({ ...viewer, reportsEnabled });
	if (admin.length > 0) groups.push({ label: t("settings.members.role_admin"), items: admin });
	return groups;
}
