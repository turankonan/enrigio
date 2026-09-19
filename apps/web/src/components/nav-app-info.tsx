import { Globe } from "@phosphor-icons/react";
import { useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { t } from "@/lib/i18n";

export function NavAppInfo() {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const mode = context.clientConfig?.mode;

	// Whitelabel deployments hide the version/website links.
	if (mode === "whitelabel") return null;

	const linkClass =
		"text-muted-foreground hover:text-foreground inline-flex size-7 items-center justify-center rounded-md transition-colors";

	return (
		<div className="mx-2 mt-1 flex items-center gap-2 border-t border-sidebar-border/60 px-1 pt-2">
			<span className="flex-1 text-xs font-medium text-muted-foreground">v{__APP_VERSION__}</span>
			<div className="flex items-center gap-1">
				<Tooltip>
					<TooltipTrigger
						render={<a href="https://www.rigosis.com/" target="_blank" className={linkClass} rel="noopener" />}
					>
						<Globe className="size-4" />
					</TooltipTrigger>
					<TooltipContent>{t("nav-app-info.website-tooltip")}</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
