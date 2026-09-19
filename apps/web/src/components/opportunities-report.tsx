/**
 * Renders the AI-generated Opportunities dashboard from getOpportunitiesFn.
 * Opportunities are grouped into Creation / Existing content / Outreach / Social;
 * each card leads with a plain-language "why", then three drill-downs — Prompts /
 * Your citations / Competitor citations — to explore the underlying data.
 */
import { Badge } from "@workspace/ui/components/badge";
import { useState } from "react";
import { BrandPromptLink } from "@/components/brand-prompt-link";
import { t } from "@/lib/i18n";
import type { CitedPage, OpportunitiesReport as OpportunitiesReportData, ReportPrompt } from "@/server/opportunities";

const CATEGORY_META = [
	{
		key: "creation",
		label: t("opportunities-report.category-creation"),
		desc: "Net-new content to publish or earn — comparisons, guides, and 'best of' angles for topics you're absent on.",
	},
	{
		key: "existing-content",
		label: t("opportunities-report.category-existing-content"),
		desc: t("opportunities-report.category-existing-content-desc"),
	},
	{
		key: "outreach",
		label: t("opportunities-report.category-outreach"),
		desc: t("opportunities-report.category-outreach-desc"),
	},
	{
		key: "social",
		label: t("opportunities-report.category-social"),
		desc: t("opportunities-report.category-social-desc"),
	},
	{
		key: "axo",
		label: t("opportunities-report.category-axo"),
		desc: t("opportunities-report.category-axo-desc"),
	},
] as const;

type Opportunity = OpportunitiesReportData["opportunities"][number];
type Tab = "prompts" | "your" | "comp";

function Bullet() {
	return <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden />;
}

function BulletList({ items }: { items: string[] }) {
	return (
		<ul className="space-y-2.5">
			{items.map((item) => (
				<li key={item} className="flex gap-2.5 text-pretty text-base">
					<Bullet />
					<span>{item}</span>
				</li>
			))}
		</ul>
	);
}

const ROW = "block truncate rounded px-1.5 py-1 text-xs hover:bg-muted hover:text-foreground";

function PromptLink({ prompt }: { prompt: ReportPrompt }) {
	if (!prompt.promptId) return <span className={`${ROW} text-muted-foreground`}>{prompt.text}</span>;
	return (
		<BrandPromptLink promptId={prompt.promptId} className={ROW}>
			{prompt.text}
		</BrandPromptLink>
	);
}

function CiteLink({ page }: { page: CitedPage }) {
	return (
		<a href={page.url} target="_blank" rel="noopener noreferrer" className={ROW}>
			{page.title || page.domain} <span className="text-muted-foreground">· {page.domain}</span>
		</a>
	);
}

function Panel({ children }: { children: React.ReactNode }) {
	return <div className="mt-2 rounded-md bg-muted/30 p-1">{children}</div>;
}

const PRIORITY_META = {
	high: { label: t("opportunities-report.priority-high"), variant: "default" as const },
	medium: { label: t("opportunities-report.priority-medium"), variant: "secondary" as const },
	low: { label: t("opportunities-report.priority-low"), variant: "outline" as const },
};
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

function OpportunityCard({ o }: { o: Opportunity }) {
	const [open, setOpen] = useState<Tab | null>(null);
	// Reports persisted before priority/expectedImpact existed have neither —
	// render those cleanly instead of crashing; they gain the fields on refresh.
	const priority = o.priority ? PRIORITY_META[o.priority] : null;
	const tabs: { key: Tab; label: string; count: number }[] = [
		{ key: "prompts", label: t("query_fan_out.prompts_title"), count: o.relatedPrompts.length },
		{ key: "your", label: t("opportunities-report.tab-your-citations"), count: o.yourCitations.length },
		{ key: "comp", label: t("opportunities-report.tab-competitor-citations"), count: o.competitorCitations.length },
	];
	return (
		<div className="rounded-xl border border-border p-4">
			<div className="flex items-start justify-between gap-2">
				<h3 className="text-pretty text-base font-semibold">{o.title}</h3>
				{priority && (
					<Badge variant={priority.variant} className="mt-0.5 shrink-0">
						{priority.label}
					</Badge>
				)}
			</div>
			<p className="mt-1 text-pretty text-sm text-muted-foreground">{o.why}</p>
			{o.expectedImpact && (
				<p className="mt-1.5 text-pretty text-sm">
					<span className="font-medium">{t("opportunities-report.expected-impact")}:</span> {o.expectedImpact}
				</p>
			)}

			<div className="mt-3 border-t border-border/60 pt-3">
				<div className="flex flex-wrap gap-2">
					{tabs.map((t) => (
						<button
							key={t.key}
							type="button"
							onClick={() => setOpen(open === t.key ? null : t.key)}
							className={`inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs ${open === t.key ? "bg-muted" : "hover:bg-muted/50"}`}
						>
							{t.label} <span className="tabular-nums text-muted-foreground">({t.count})</span>
							<span className={`text-[0.625rem] text-muted-foreground ${open === t.key ? "rotate-180" : ""}`}>▾</span>
						</button>
					))}
				</div>

				{open === "prompts" && (
					<Panel>
						{o.relatedPrompts.length === 0 ? (
							<p className="px-1.5 py-1 text-xs text-muted-foreground">{t("opportunities-report.no-prompts-linked")}</p>
						) : (
							o.relatedPrompts.map((p) => <PromptLink key={p.text} prompt={p} />)
						)}
					</Panel>
				)}
				{open === "your" && (
					<Panel>
						{o.yourCitations.length === 0 ? (
							<p className="px-1.5 py-1 text-xs text-muted-foreground">{t("opportunities-report.not-cited-yet")}</p>
						) : (
							o.yourCitations.map((c) => <CiteLink key={c.url} page={c} />)
						)}
					</Panel>
				)}
				{open === "comp" && (
					<Panel>
						{o.competitorCitations.length === 0 ? (
							<p className="px-1.5 py-1 text-xs text-muted-foreground">
								{t("opportunities-report.no-competitor-pages")}
							</p>
						) : (
							o.competitorCitations.map((c) => <CiteLink key={c.url} page={c} />)
						)}
					</Panel>
				)}
			</div>
		</div>
	);
}

export function OpportunitiesReport({ report }: { report: OpportunitiesReportData }) {
	return (
		<div className="space-y-8">
			{report.summary.length > 0 && (
				<section className="rounded-xl border border-border bg-muted/30 p-5">
					<h2 className="text-sm font-semibold text-muted-foreground">{t("opportunities-report.summary")}</h2>
					<div className="mt-2.5">
						<BulletList items={report.summary} />
					</div>
				</section>
			)}

			{CATEGORY_META.map((c) => {
				const opps = report.opportunities
					.filter((o) => o.category === c.key)
					.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1));
				if (opps.length === 0) return null;
				return (
					<section key={c.key} className="space-y-3">
						<div className="space-y-0.5">
							<h2 className="text-base font-semibold">
								{c.label} <span className="font-normal text-muted-foreground">({opps.length})</span>
							</h2>
							<p className="text-pretty text-sm text-muted-foreground">{c.desc}</p>
						</div>
						<div className="space-y-3">
							{opps.map((o) => (
								<OpportunityCard key={o.title} o={o} />
							))}
						</div>
					</section>
				);
			})}

			{report.risks.length > 0 && (
				<section className="space-y-3">
					<h2 className="text-base font-semibold">{t("opportunities-report.reality-check")}</h2>
					<BulletList items={report.risks} />
				</section>
			)}

			<p className="text-xs text-muted-foreground">{t("opportunities-report.ai-disclaimer")}</p>
		</div>
	);
}
