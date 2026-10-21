import { useRouteContext } from "@tanstack/react-router";
import { DEFAULT_APP_ICON, DEFAULT_APP_NAME } from "@workspace/config/constants";
import type { ClientConfig } from "@workspace/config/types";
import { cn } from "@workspace/ui/lib/utils";
import type { ComponentPropsWithoutRef } from "react";

interface LogoProps extends ComponentPropsWithoutRef<"div"> {
	iconClassName?: string;
	textClassName?: string;
}

/** Whether the Enrigio lockup renders — drives the wordmark font preload in `__root.tsx`. */
export function usesWordmarkFont(branding: { icon?: string; name?: string } | undefined) {
	const hasCustomBranding =
		Boolean(branding?.icon && branding?.name) &&
		(branding?.icon !== DEFAULT_APP_ICON || branding?.name !== DEFAULT_APP_NAME);
	return !hasCustomBranding;
}

export function Logo({ className, iconClassName, textClassName, ...props }: LogoProps) {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const branding = context.clientConfig?.branding;

	if (usesWordmarkFont(branding)) {
		return (
			<div {...props} className={cn("flex items-center gap-2.5", className)}>
				<img src="/brand/enrigio-mark.svg" alt="" className={cn("size-[34px]", iconClassName)} />
				<span
					className={cn("text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground", textClassName)}
				>
					{DEFAULT_APP_NAME.toLowerCase()}
				</span>
			</div>
		);
	}

	return (
		<div {...props} className={cn("flex items-center gap-2", className)}>
			{branding?.icon && (
				<img
					src={branding.icon}
					alt={`${branding.name} logo`}
					className={cn("size-5", iconClassName)}
					fetchPriority="low"
				/>
			)}
			<span className={cn("text-base font-semibold", textClassName)}>{branding?.name}</span>
		</div>
	);
}
