import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { t } from "@/lib/i18n";
import { StepEngines } from "./step-engines";
import { StepFirstScan } from "./step-first-scan";
import { StepQuestions } from "./step-questions";
import { StepRivals } from "./step-rivals";
import { StepSite } from "./step-site";
import { Stepper } from "./stepper";
import { useSetupWizard, type WizardBrand } from "./use-setup-wizard";

// Matches the worker's RUNS_PER_PROMPT fallback; the estimate is informational.
const RUNS_PER_DAY = 1;

interface Props {
	brand: WizardBrand;
	onReport: () => void;
}

export function SetupWizard({ brand, onReport }: Props) {
	const wizard = useSetupWizard(brand);
	const { phase } = wizard;

	if (phase.kind === "booting") return <Spinner />;

	if (phase.kind === "analyzing") {
		return <AnalyzingScreen failed={phase.failed} onRetry={wizard.retryAnalysis} onManual={wizard.continueByHand} />;
	}

	if (phase.kind === "scanning") {
		return <StepFirstScan brandId={brand.id} firstScanId={phase.firstScanId} onReport={onReport} />;
	}

	const { draft } = phase;
	const stepProps = { draft, onChange: wizard.update };
	return (
		<div className="max-w-3xl space-y-6 p-4">
			<Stepper current={draft.step} />
			{draft.step === 1 && <StepSite {...stepProps} onNext={() => wizard.goto(draft, 2)} />}
			{draft.step === 2 && (
				<StepQuestions {...stepProps} onBack={() => wizard.goto(draft, 1)} onNext={() => wizard.goto(draft, 3)} />
			)}
			{draft.step === 3 && (
				<StepRivals {...stepProps} onBack={() => wizard.goto(draft, 2)} onNext={() => wizard.goto(draft, 4)} />
			)}
			{draft.step === 4 && (
				<StepEngines
					{...stepProps}
					available={wizard.available}
					runsPerDay={RUNS_PER_DAY}
					onBack={() => wizard.goto(draft, 3)}
					onStart={() => wizard.start.mutateAsync(draft).then(() => undefined)}
					startError={wizard.start.isError ? t("setup.engines.start_error") : null}
				/>
			)}
			<div className="flex items-center gap-3 text-xs text-muted-foreground">
				<Button variant="ghost" size="sm" onClick={wizard.continueLater}>
					{t("setup.continue_later")}
				</Button>
				{wizard.saved && <span>{t("setup.saved")}</span>}
			</div>
		</div>
	);
}

function AnalyzingScreen({
	failed,
	onRetry,
	onManual,
}: {
	failed: boolean;
	onRetry: () => void;
	onManual: () => void;
}) {
	return (
		<div className="max-w-2xl space-y-4 p-4">
			<Stepper current={1} />
			<h2 className="text-2xl font-bold">{t("setup.analyzing.title")}</h2>
			{failed ? (
				<>
					<Alert variant="destructive">
						<AlertDescription>{t("setup.analyzing.failed")}</AlertDescription>
					</Alert>
					<div className="flex gap-2">
						<Button onClick={onRetry}>{t("setup.analyzing.retry")}</Button>
						<Button variant="outline" onClick={onManual}>
							{t("setup.analyzing.manual")}
						</Button>
					</div>
				</>
			) : (
				<>
					<p className="text-muted-foreground">{t("setup.analyzing.body")}</p>
					<Spinner />
				</>
			)}
		</div>
	);
}
