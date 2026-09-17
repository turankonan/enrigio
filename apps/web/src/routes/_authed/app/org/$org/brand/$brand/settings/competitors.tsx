import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { DiscoveredCompetitor } from "@workspace/lib/competitor-discovery";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { AlertTriangle, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { type CompetitorEntry, CompetitorsEditor } from "@/components/competitors-editor";
import { UnsavedChangesBar } from "@/components/unsaved-changes-bar";
import { useBrand, useCompetitors } from "@/hooks/use-brands";
import { citationKeys } from "@/hooks/use-citations";
import { dashboardKeys } from "@/hooks/use-dashboard-summary";
import { pageHead } from "@/lib/route-head";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { updateCompetitors } from "@/server/brands";
import { discoverCompetitors } from "@/server/competitor-discovery";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/settings/competitors")({
	staticData: { crumb: "Competitors" },
	head: pageHead({ description: "Manage your tracked competitors." }),
	component: CompetitorsSettingsPage,
});

function saveable(competitors: CompetitorEntry[]) {
	return competitors
		.filter((c) => c.name.trim() && c.domains.some((d) => d.trim()))
		.map((c) => ({
			name: c.name.trim(),
			domains: c.domains.map((d) => d.trim()).filter(Boolean),
			aliases: c.aliases.map((a) => a.trim()).filter(Boolean),
		}));
}

/**
 * Mines the brand's stored answers for organizations the engines name as
 * alternatives — the evidence-based counterpart to onboarding's web research,
 * which stays empty when the model is unsure.
 */
function DiscoveryPanel({
	brandId,
	configuredNames,
	onAdd,
	disabled,
}: {
	brandId: string;
	configuredNames: string[];
	onAdd: (s: DiscoveredCompetitor) => void;
	disabled: boolean;
}) {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<{ suggestions: DiscoveredCompetitor[]; answersScanned: number } | null>(null);

	const discover = async () => {
		setLoading(true);
		setError(null);
		try {
			setResult(await discoverCompetitors({ data: { brandId } }));
		} catch {
			setError("Discovery failed. Check that an LLM API key is configured and try again.");
		} finally {
			setLoading(false);
		}
	};

	const open = result?.suggestions.filter((s) => !configuredNames.includes(s.name.toLowerCase())) ?? [];

	return (
		<div className="space-y-3 rounded-lg border p-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h2 className="text-sm font-semibold">Discover from answers</h2>
					<p className="text-muted-foreground text-sm">
						Scan the AI answers already collected for this brand and suggest the competitors they mention.
					</p>
				</div>
				<Button variant="outline" size="sm" onClick={discover} disabled={loading || disabled}>
					<Sparkles className="size-4" />
					{loading ? "Scanning answers…" : "Discover competitors"}
				</Button>
			</div>
			{error && <p className="text-destructive text-sm">{error}</p>}
			{result && open.length === 0 && !error && (
				<p className="text-muted-foreground text-sm">
					No new competitors found in the last {result.answersScanned} answers.
				</p>
			)}
			{open.length > 0 && (
				<ul className="space-y-2">
					{open.map((s) => (
						<li key={s.name} className="flex items-start justify-between gap-3 rounded-md border bg-card px-3 py-2">
							<div className="min-w-0">
								<p className="text-sm font-medium">
									{s.name}
									{s.domains.length > 0 && (
										<span className="text-muted-foreground ml-2 font-normal">{s.domains.join(", ")}</span>
									)}
								</p>
								{s.evidence && <p className="text-muted-foreground truncate text-xs">“{s.evidence}”</p>}
							</div>
							<Button variant="ghost" size="sm" onClick={() => onAdd(s)} disabled={disabled}>
								Add
							</Button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function CompetitorsSettingsPage() {
	const { brandId } = Route.useRouteContext();
	const { data: brand, isLoading } = useBrand(brandId);
	const {
		data: existingCompetitors,
		isLoading: competitorsLoading,
		refetch: refetchCompetitors,
	} = useCompetitors(brandId);
	const queryClient = useQueryClient();
	const writeError = useWriteErrorMessage();

	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [competitors, setCompetitors] = useState<CompetitorEntry[]>([]);

	const [seededFrom, setSeededFrom] = useState<unknown>(null);
	if (!competitorsLoading && existingCompetitors !== seededFrom) {
		setSeededFrom(existingCompetitors);
		setCompetitors(
			existingCompetitors.map((c) => ({
				_key: uuidv4(),
				name: c.name,
				domains: c.domains ?? [],
				aliases: c.aliases || [],
				expanded: false,
			})),
		);
	}

	const baseline = useMemo(
		() =>
			existingCompetitors.map((c) => ({
				name: c.name,
				domains: c.domains ?? [],
				aliases: c.aliases || [],
			})),
		[existingCompetitors],
	);
	const pending = saveable(competitors);
	const isDirty = JSON.stringify(pending) !== JSON.stringify(baseline);

	if (isLoading || competitorsLoading) {
		return (
			<div className="space-y-6">
				<h1 className="text-3xl font-bold">Competitors</h1>
				<p className="text-muted-foreground">Loading...</p>
			</div>
		);
	}

	if (!brand) {
		return (
			<div className="space-y-6">
				<h1 className="text-3xl font-bold">Competitors</h1>
				<p className="text-destructive">Brand not found</p>
			</div>
		);
	}

	const save = async () => {
		setIsSaving(true);
		setError(null);
		try {
			await updateCompetitors({ data: { brandId: brand.id, competitors: pending } });

			queryClient.invalidateQueries({ queryKey: citationKeys.all });
			queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
			await refetchCompetitors();
		} catch (err) {
			setError(writeError(err, "Failed to save competitors."));
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="max-w-2xl space-y-6">
			<div>
				<h1 className="text-3xl font-bold">Competitors</h1>
				<p className="text-muted-foreground">Manage your competitive landscape for reputation tracking.</p>
			</div>

			<Alert variant="default" className="border-yellow-200 bg-yellow-50 text-yellow-800">
				<AlertTriangle className="h-4 w-4 text-yellow-600" />
				<AlertTitle>Warning</AlertTitle>
				<AlertDescription className="text-yellow-700">
					Updating competitors will only apply to future prompt evaluations. Citation categorization updates
					retroactively.
				</AlertDescription>
			</Alert>

			<DiscoveryPanel
				brandId={brand.id}
				configuredNames={competitors.map((c) => c.name.trim().toLowerCase())}
				onAdd={(s) =>
					setCompetitors((prev) => [
						...prev,
						{
							_key: uuidv4(),
							name: s.name,
							domains: s.domains.length > 0 ? s.domains : [""],
							aliases: [],
							expanded: true,
						},
					])
				}
				disabled={isSaving}
			/>

			<CompetitorsEditor competitors={competitors} onChange={setCompetitors} disabled={isSaving} />

			<UnsavedChangesBar
				isDirty={isDirty}
				isSaving={isSaving}
				error={error}
				onSave={save}
				onDiscard={() => {
					setSeededFrom(null);
					setError(null);
				}}
			/>
		</div>
	);
}
