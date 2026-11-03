import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { isBuyer, monthlyAnswerEstimate, type SetupDraft, selectedBuyerCount } from "@/lib/setup-wizard";
import { StepNav } from "./step-nav";

interface Props {
	draft: SetupDraft;
	onChange: (d: SetupDraft) => void;
	onBack?: () => void;
	available: { model: string; label: string }[];
	/** Null until the server answers; the estimate waits for it rather than guess. */
	runsPerDay: number | null;
	onStart: () => Promise<void>;
	startError: string | null;
}

export function StepEngines({ draft, onChange, onBack, available, runsPerDay, onStart, startError }: Props) {
	const [starting, setStarting] = useState(false);
	const brandedCount = draft.questions.filter((q) => !isBuyer(q)).length;
	const answers = (selectedBuyerCount(draft) + brandedCount) * draft.engines.length;
	const none = draft.engines.length === 0;

	const toggle = (model: string, on: boolean) => {
		const engines = on ? [...draft.engines, model] : draft.engines.filter((m) => m !== model);
		onChange({ ...draft, engines });
	};

	const start = async () => {
		setStarting(true);
		try {
			await onStart();
		} catch {
			// The parent reports the failure through startError.
		} finally {
			setStarting(false);
		}
	};

	return (
		<div className="space-y-6">
			<div className="space-y-1">
				<h2 className="text-2xl font-bold">{t("setup.engines.title")}</h2>
				<p className="text-muted-foreground">{t("setup.engines.subtitle")}</p>
			</div>

			<div className="grid gap-2 sm:grid-cols-2">
				{available.map(({ model, label }) => {
					const id = `setup-engine-${model}`;
					return (
						<label key={model} htmlFor={id} className="flex items-center gap-3 rounded-md border p-3 text-sm">
							<Checkbox
								id={id}
								checked={draft.engines.includes(model)}
								onCheckedChange={(value) => toggle(model, value === true)}
							/>
							<span>{label || model}</span>
						</label>
					);
				})}
			</div>

			{runsPerDay !== null && (
				<p className="text-sm text-muted-foreground">
					{t("setup.engines.estimate", { answers, monthly: monthlyAnswerEstimate(draft, runsPerDay) })}
				</p>
			)}
			{none && <p className="text-sm text-destructive">{t("setup.engines.none")}</p>}
			{startError && (
				<Alert variant="destructive">
					<AlertDescription>{startError}</AlertDescription>
				</Alert>
			)}

			<StepNav
				onBack={onBack}
				next={
					<Button onClick={start} disabled={none || starting}>
						{starting ? t("setup.engines.starting") : t("setup.engines.start")}
					</Button>
				}
			/>
		</div>
	);
}
