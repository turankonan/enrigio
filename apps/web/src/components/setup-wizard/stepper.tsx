import { cn } from "@workspace/ui/lib/utils";
import { t } from "@/lib/i18n";
import type { SetupStep } from "@/lib/setup-wizard";

const STEP_LABELS = [
	t("setup.steps.site"),
	t("setup.steps.questions"),
	t("setup.steps.rivals"),
	t("setup.steps.engines"),
	t("setup.steps.scan"),
];

export function Stepper({ current }: { current: SetupStep }) {
	return (
		<div className="space-y-1">
			<p className="text-xs text-muted-foreground">{t("setup.step_of", { current, total: STEP_LABELS.length })}</p>
			<ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
				{STEP_LABELS.map((label, i) => {
					const step = i + 1;
					return (
						<li
							key={label}
							aria-current={step === current ? "step" : undefined}
							className={cn(step === current && "font-bold", step < current && "text-muted-foreground")}
						>
							{label}
						</li>
					);
				})}
			</ol>
		</div>
	);
}
