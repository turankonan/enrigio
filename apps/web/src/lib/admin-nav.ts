import { ChartLine, FileText, Table, Wrench } from "@phosphor-icons/react";
import type { NavItem } from "@/components/nav-main";

export function adminNavItems({
	isAdmin,
	hasReportAccess,
	reportsEnabled,
}: {
	isAdmin: boolean;
	hasReportAccess: boolean;
	reportsEnabled: boolean;
}): NavItem[] {
	const reports: NavItem = { title: "Reports", link: { to: "/reports" }, icon: FileText };

	if (!isAdmin) return hasReportAccess && reportsEnabled ? [reports] : [];

	return [
		{ title: "Brands", link: { to: "/admin" }, icon: Table },
		...(reportsEnabled ? [reports] : []),
		{ title: "Workflows", link: { to: "/admin/workflows" }, icon: ChartLine },
		{ title: "Tools", link: { to: "/admin/tools" }, icon: Wrench },
	];
}
