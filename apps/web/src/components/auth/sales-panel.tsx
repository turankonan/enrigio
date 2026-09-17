/**
 * The pitch shown beside the sign-in and sign-up forms in local and cloud mode.
 *
 * Sign-in is the highest-intent page either deployment has, so it carries the
 * argument for the product: what AnswerEcho does and which engines it reaches.
 * No borrowed social proof — we don't ship someone else's customers or badges.
 *
 * Demo and whitelabel deliberately never see this. A demo visitor has already
 * decided to look, and a whitelabel tenant is not ours to sell to.
 */

import { IconCheck } from "@tabler/icons-react";
import { platformTierMembers } from "@workspace/config/plans";
import type { ReferralSource } from "@workspace/config/referrals";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n";

/** Everything AnswerEcho reaches, named — the coverage claim is the product. */
const ENGINES = [...platformTierMembers("scraped"), ...platformTierMembers("api")];

const DOCS_URL = "https://www.rigosis.com/answerecho/docs";

const PITCH = {
	headline: t("sales-panel.headline"),
	bullets: [
		t("sales-panel.bullet-track-visibility"),
		t("sales-panel.bullet-benchmark"),
		t("sales-panel.bullet-analyze-citations"),
		t("sales-panel.bullet-unlimited"),
	],
};

type SalesPanelVariant = "cloud" | "self-hosted";

export function SalesPanel({
	variant: _variant,
	source: _source,
}: {
	variant: SalesPanelVariant;
	source: ReferralSource;
}) {
	return (
		<div className="flex flex-1 flex-col justify-between gap-8">
			<h2 className="text-3xl font-semibold leading-[1.1] tracking-tight text-balance">{PITCH.headline}</h2>

			<ul className="space-y-2.5">
				{PITCH.bullets.map((bullet) => (
					<li key={bullet} className="flex items-start gap-2.5 text-sm">
						<IconCheck className="mt-0.5 size-4 shrink-0 text-primary" />
						<span>{bullet}</span>
					</li>
				))}
			</ul>

			<EngineStrip />
		</div>
	);
}

/** The coverage claim, spelled out. Names sit beside logos because three Google surfaces share a mark. */
function EngineStrip() {
	return (
		<div>
			<p className="font-mono text-[10px] uppercase leading-none tracking-[0.2em] text-muted-foreground">
				{t("sales-panel.tracking")}
			</p>
			<ul className="mt-3 flex flex-wrap gap-1.5">
				{ENGINES.map((engine) => (
					<li
						key={engine.model}
						className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-[11px] leading-none"
					>
						<ModelIcon iconId={engine.iconId} className="size-3 shrink-0 text-muted-foreground" />
						{engine.label}
					</li>
				))}
			</ul>
		</div>
	);
}

/** The bottom of the form column: docs on the left, attribution on the right. */
export function SalesFooterLinks({ source: _source }: { source: ReferralSource }): ReactNode {
	return (
		<div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
			<a href={DOCS_URL} className="hover:text-foreground">
				{t("sales-panel.docs")}
			</a>
			<p>
				AnswerEcho <span className="opacity-60">{t("sales-panel.by-rigosis")}</span>
			</p>
		</div>
	);
}
