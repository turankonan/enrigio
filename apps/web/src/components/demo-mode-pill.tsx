import { Info } from "@phosphor-icons/react";
import { useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { t } from "@/lib/i18n";

export function DemoModePill() {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const isReadOnly = context.clientConfig?.features.readOnly ?? false;

	if (!isReadOnly) return null;

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-400" />
				}
			>
				<Info className="size-3" />
				{t("demo-mode-pill.demo")}
			</TooltipTrigger>
			<TooltipContent>{t("demo-mode-pill.read-only-tooltip")}</TooltipContent>
		</Tooltip>
	);
}
