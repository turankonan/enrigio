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
import { adminNavItems } from "@/lib/admin-nav";
import { t } from "@/lib/i18n";
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

export function advancedGroups(
	scope: ShellScope,
	features: FeaturesConfig | undefined,
	viewer: { isAdmin: boolean; hasReportAccess: boolean },
): NavGroup[] {
	if (scope.section === "account") return [];
	const groups: NavGroup[] = [];
	const org = scope.organization;
	const brand = scope.brand;

	if (org && brand?.onboarded) {
		const params = brandLinkParams(org, brand);
		groups.push(
			{
				label: t("top-bar.group_analysis"),
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
					{
						title: t("app-sidebar.prompts"),
						link: { to: "/app/org/$org/brand/$brand/settings/prompts", params },
						icon: ListChecks,
					},
				],
			},
			{
				label: t("top-bar.group_brand"),
				items: [
					{
						title: t("top-bar.brand_settings"),
						link: { to: "/app/org/$org/brand/$brand/settings/brand", params },
						icon: Building,
					},
					{
						title: t("app-sidebar.competitors"),
						link: { to: "/app/org/$org/brand/$brand/settings/competitors", params },
						icon: Buildings,
					},
					{
						title: t("top-bar.tracked_engines"),
						link: { to: "/app/org/$org/brand/$brand/settings/llms", params },
						icon: Cpu,
					},
					{
						title: t("top-bar.evaluation_market"),
						link: { to: "/app/org/$org/brand/$brand/settings/brand", params },
						icon: Building,
					},
				],
			},
		);
	}

	const reportsEnabled = features?.reportGeneration ?? true;
	const admin = adminNavItems({ ...viewer, reportsEnabled });

	if (org) {
		const params = orgLinkParams(org);
		const items: NavItem[] = [
			{
				title: t("app-sidebar.organization"),
				link: { to: "/app/org/$org/settings", params },
				icon: Briefcase,
				exact: true,
			},
			{ title: t("app-sidebar.brands"), link: { to: "/app/org/$org/settings/brands", params }, icon: Buildings },
		];
		if (features?.teamInvites)
			items.push({ title: t("app-sidebar.team"), link: { to: "/app/org/$org/settings/members", params }, icon: Users });
		if (features?.billing)
			items.push({
				title: t("app-sidebar.billing"),
				link: { to: "/app/org/$org/settings/billing", params },
				icon: CreditCard,
			});
		items.push(
			{ title: t("app-sidebar.api-keys"), link: { to: "/app/org/$org/settings/api-keys", params }, icon: Key },
			{ title: t("app-sidebar.api"), link: { to: "/app/org/$org/settings/api", params }, icon: Code },
			{ title: t("app-sidebar.mcp"), link: { to: "/app/org/$org/settings/mcp", params }, icon: PlugsConnected },
		);
		items.push(...admin);
		groups.push({ label: t("top-bar.group_organisation"), items });
	} else if (admin.length > 0) {
		groups.push({ label: t("settings.members.role_admin"), items: admin });
	}

	return groups;
}
