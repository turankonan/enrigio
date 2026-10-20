import { ArrowsClockwise } from "@phosphor-icons/react";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n";

export function HomeCard({
	title,
	description,
	action,
	loading,
	error,
	onRetry,
	children,
}: {
	title: string;
	description?: string;
	action?: ReactNode;
	loading?: boolean;
	error?: unknown;
	onRetry?: () => void;
	children: ReactNode;
}) {
	return (
		<Card className="gap-4">
			<CardHeader className="flex flex-row items-start justify-between gap-4">
				<div>
					<CardTitle className="text-lg">{title}</CardTitle>
					{description && <CardDescription>{description}</CardDescription>}
				</div>
				{action}
			</CardHeader>
			<CardContent>
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
			</CardContent>
		</Card>
	);
}
