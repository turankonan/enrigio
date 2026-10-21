import { CaretDown } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
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
			<DropdownMenuTrigger
				render={<Button variant="outline" className="h-10 gap-2 rounded-[10px] px-3.5 text-sm font-medium" />}
			>
				{t("top-bar.advanced")}
				<CaretDown className="size-3" />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				sideOffset={8}
				className="grid w-[520px] max-w-[calc(100vw-2rem)] grid-cols-1 gap-[18px] rounded-[14px] p-[18px] sm:grid-cols-3"
			>
				{groups.map((group) => (
					<DropdownMenuGroup key={group.label} className="flex flex-col gap-0.5">
						<DropdownMenuLabel className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
							{group.label}
						</DropdownMenuLabel>
						{group.items.map((item) => (
							<DropdownMenuItem
								key={`${item.link.to}:${item.title}`}
								render={<Link {...item.link} />}
								className="cursor-pointer rounded-lg px-2 py-[7px] text-sm data-highlighted:bg-muted data-highlighted:text-primary"
							>
								{item.title}
							</DropdownMenuItem>
						))}
					</DropdownMenuGroup>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
