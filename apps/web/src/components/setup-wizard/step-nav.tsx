import { Button } from "@workspace/ui/components/button";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n";

/** Back/continue row shared by the steps; `next` replaces the continue button when a step has its own action. */
export function StepNav({
	onBack,
	onNext,
	nextDisabled,
	next,
}: {
	onBack?: () => void;
	onNext?: () => void;
	nextDisabled?: boolean;
	next?: ReactNode;
}) {
	return (
		<div className="flex gap-2">
			{onBack && (
				<Button variant="outline" onClick={onBack}>
					{t("setup.back")}
				</Button>
			)}
			{next ?? (
				<Button onClick={onNext} disabled={nextDisabled}>
					{t("setup.continue")}
				</Button>
			)}
		</div>
	);
}
