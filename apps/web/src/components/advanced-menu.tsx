import { CaretDown, SlidersHorizontal } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Fragment } from "react";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";
import { useViewer } from "@/hooks/use-route-context";
import { t } from "@/lib/i18n";
import { advancedGroups } from "@/lib/nav-links";
import type { ShellScope } from "@/lib/shell-scope";

/** Every detailed page lives here so the Home stays free of technical surfaces. */
export function AdvancedMenu({ scope }: { scope: ShellScope }) {
	const features = useDeploymentFeatures();
	const viewer = useViewer();
	const groups = advancedGroups(scope, features, viewer);
	if (groups.length === 0) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
				<SlidersHorizontal className="size-4" />
				{t("top-bar.advanced")}
				<CaretDown className="size-3.5 opacity-70" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" sideOffset={8} className="min-w-60">
				{groups.map((group, index) => (
					<Fragment key={group.label}>
						{index > 0 && <DropdownMenuSeparator />}
						<DropdownMenuGroup>
							<DropdownMenuLabel className="text-muted-foreground text-xs">{group.label}</DropdownMenuLabel>
							{group.items.map((item) => (
								<DropdownMenuItem key={item.title} render={<Link {...item.link} />} className="cursor-pointer">
									{item.icon && <item.icon className="size-4" />}
									{item.title}
								</DropdownMenuItem>
							))}
						</DropdownMenuGroup>
					</Fragment>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
