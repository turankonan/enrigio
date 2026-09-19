import { ArrowRight, Plus } from "@phosphor-icons/react";
import { SiteIcon } from "@/components/site-icon";
import type { OrganizationRow } from "@/lib/organizations/tree";

export function OrganizationRowIcon({ row, size }: { row: OrganizationRow; size: "xs" | "md" }) {
	const className = size === "xs" ? "size-3.5" : undefined;

	switch (row.kind) {
		case "brand":
			return <SiteIcon domain={row.website} size={size} />;
		case "new-brand":
			return <Plus className={className} size={24} />;
		case "set-up":
			return <ArrowRight className={className} size={24} />;
	}
}
