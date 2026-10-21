import { ArrowsClockwise } from "@phosphor-icons/react";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n";

export function HomeCard({
	title,
	titleId,
	description,
	action,
	loading,
	error,
	onRetry,
	className,
	children,
}: {
	title?: string;
	titleId?: string;
	description?: string;
	action?: ReactNode;
	loading?: boolean;
	error?: unknown;
	onRetry?: () => void;
	className?: string;
	children: ReactNode;
}) {
	return (
		<section
			aria-labelledby={title ? titleId : undefined}
			className={cn("flex min-w-0 flex-col gap-3.5 rounded-2xl border bg-card p-6 md:px-8", className)}
		>
			{title && (
				<div className="flex flex-wrap items-baseline justify-between gap-3">
					<h2 id={titleId} className="text-xl font-semibold tracking-[-0.01em]">
						{title}
					</h2>
					{action}
				</div>
			)}
			{description && <p className="text-sm text-muted-foreground">{description}</p>}
			{loading ? (
				<div className="space-y-3">
					<Skeleton className="h-8 w-40" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-3/4" />
				</div>
			) : error ? (
				<div className="flex items-center gap-3 text-sm text-muted-foreground">
					{t("home.card_error")}
					{onRetry && (
						<Button variant="outline" size="sm" onClick={onRetry}>
							<ArrowsClockwise className="size-4" /> {t("home.try_again")}
						</Button>
					)}
				</div>
			) : (
				children
			)}
		</section>
	);
}
