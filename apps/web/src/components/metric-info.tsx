import { Info } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import type { ReactNode } from "react";

/**
 * An `ⓘ` on a metric that opens a popover explaining what the number means and
 * how it's calculated. Click/tap (not hover) so it works on touch and holds the
 * multi-line calculation; the metric stays on screen while it's open.
 */
export function MetricInfo({ label, children }: { label: string; children: ReactNode }) {
	return (
		<Popover>
			<PopoverTrigger
				render={
					<button
						type="button"
						aria-label={label}
						className="inline-flex items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					/>
				}
			>
				<Info className="h-4 w-4" />
			</PopoverTrigger>
			<PopoverContent align="start" className="w-80 space-y-3 text-sm">
				{children}
			</PopoverContent>
		</Popover>
	);
}
