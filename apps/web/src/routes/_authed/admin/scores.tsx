/** /admin/scores - v1 beside v2, intent sub-scores and brand accuracy, with coverage. */
import { createFileRoute } from "@tanstack/react-router";
import type { PromptIntent } from "@workspace/lib/db/schema";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { useEffect, useState } from "react";
import { pageHead } from "@/lib/route-head";
import { type AdminScoreRow, getAdminScoreBreakdownFn } from "@/server/scores";

export const Route = createFileRoute("/_authed/admin/scores")({
	staticData: { crumb: "Scores" },
	head: pageHead({ description: "Shipped score beside the rank-weighted candidate." }),
	component: ScoresPage,
});

// Listed here rather than imported from the schema module: a runtime import of
// it would pull drizzle and pg into the client bundle.
const INTENTS = ["discovery", "comparison", "local", "price"] as const satisfies readonly PromptIntent[];

const INTENT_LABEL: Record<PromptIntent, string> = {
	discovery: "Discovery",
	comparison: "Comparison",
	local: "Local",
	price: "Price",
};

function pct(value: number | null): string {
	return value === null ? "—" : `${value}%`;
}

function ScoresPage() {
	const [rows, setRows] = useState<AdminScoreRow[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		getAdminScoreBreakdownFn()
			.then(setRows)
			.catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
	}, []);

	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<h1 className="text-3xl font-bold tracking-tight">Scores</h1>
				<p className="text-muted-foreground">
					Last 30 days per brand. v1 is what users see today. v2 is the rank-weighted candidate over buyer prompts; it
					replaces v1 only after the back-test passes. "No contradiction" covers brand questions only: the share of
					assessed answers that contradict none of the facts we hold, which until the wizard stores address, hours and
					services are the name, aliases (including the parent company), website and domains, and the owner's keywords.
					"Unsupported" counts answers that state something those facts neither confirm nor deny; it is shown, never
					scored.
				</p>
			</div>
			{error && <p className="text-destructive">{error}</p>}
			{!rows && !error && <Skeleton className="h-40 w-full" />}
			{rows && (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Brand</TableHead>
							<TableHead>Runs · models</TableHead>
							<TableHead>v1</TableHead>
							<TableHead>v2 (cohort)</TableHead>
							{INTENTS.map((i) => (
								<TableHead key={i}>{INTENT_LABEL[i]}</TableHead>
							))}
							<TableHead>Classified</TableHead>
							<TableHead title="Assessed brand-question runs with no contradicted claim ÷ assessed. Identity facts only in this phase.">
								No contradiction
							</TableHead>
							<TableHead title="Assessed runs with at least one claim the profile cannot confirm. Not scored.">
								Unsupported
							</TableHead>
							<TableHead>Unrecognised</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((r) => (
							<TableRow key={r.brandId}>
								<TableCell>
									{r.name} <span className="text-muted-foreground">· {r.marketKey}</span>
								</TableCell>
								<TableCell>
									{r.totalRuns} · {r.models}
								</TableCell>
								<TableCell>{pct(r.v1)}</TableCell>
								<TableCell>
									{pct(r.v2)} <span className="text-muted-foreground">({r.cohortPrompts})</span>
								</TableCell>
								{INTENTS.map((i) => (
									<TableCell key={i}>
										{r.intents[i].promptCount === 0 ? "—" : pct(r.intents[i].score)}{" "}
										<span className="text-muted-foreground">({r.intents[i].promptCount})</span>
									</TableCell>
								))}
								<TableCell>
									{r.classifiedPrompts} / {r.unbrandedPrompts}
								</TableCell>
								<TableCell>
									{pct(r.noContradiction)}{" "}
									<span className="text-muted-foreground">
										({r.accurateRuns} / {r.assessedRuns})
									</span>
								</TableCell>
								<TableCell>{r.unsupportedRuns}</TableCell>
								<TableCell>{r.unrecognisedRuns}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</div>
	);
}
