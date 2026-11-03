import { t } from "@/lib/i18n";
import { Stepper } from "./stepper";

interface Props {
	brandId: string;
	firstScanId: string;
	onReport: () => void;
}

export function StepFirstScan(_props: Props) {
	return (
		<div className="max-w-3xl space-y-6 p-4">
			<Stepper current={5} />
			<h2 className="text-2xl font-bold">{t("setup.scan.title")}</h2>
			<p className="text-muted-foreground">{t("setup.scan.subtitle")}</p>
		</div>
	);
}
