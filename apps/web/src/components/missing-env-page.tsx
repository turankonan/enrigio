import type { MissingEnvVar } from "@workspace/config/env";
import type { DeploymentMode } from "@workspace/config/types";
import FullPageCard from "@/components/full-page-card";
import { t } from "@/lib/i18n";

interface MissingEnvPageProps {
	mode: DeploymentMode;
	missing: MissingEnvVar[];
}

export default function MissingEnvPage({ mode, missing }: MissingEnvPageProps) {
	const sortedMissing = [...missing].sort((a, b) => a.label.localeCompare(b.label));

	const localHint = mode === "local" ? t("missing-env-page.hint-local") : t("missing-env-page.hint-deployed");

	return (
		<FullPageCard
			title={t("missing-env-page.title")}
			subtitle={t("missing-env-page.subtitle", { mode })}
			className="max-w-2xl"
		>
			<div className="space-y-4 text-sm">
				<p>{localHint}</p>
				<ul className="space-y-3 rounded-md border bg-background p-4">
					{sortedMissing.map((item) => (
						<li key={item.id} className="flex flex-col gap-1">
							<span className="font-mono text-xs text-foreground">{item.label}</span>
							{item.description ? <span className="text-muted-foreground">{item.description}</span> : null}
						</li>
					))}
				</ul>
			</div>
		</FullPageCard>
	);
}
