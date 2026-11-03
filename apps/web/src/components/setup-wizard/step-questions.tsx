import type { PromptIntent } from "@workspace/lib/db/schema";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { useState } from "react";
import { t } from "@/lib/i18n";
import {
	addCustomQuestion,
	canContinueFromQuestions,
	INTENT_ORDER,
	isBuyer,
	MAX_BUYER,
	MIN_BUYER,
	type SetupDraft,
	selectedBuyerCount,
	toggleQuestion,
} from "@/lib/setup-wizard";
import { INTENT_LABEL } from "@/lib/setup-wizard-labels";
import { StepNav } from "./step-nav";

interface Props {
	draft: SetupDraft;
	onChange: (d: SetupDraft) => void;
	onNext: () => void;
	onBack?: () => void;
}

export function StepQuestions({ draft, onChange, onNext, onBack }: Props) {
	const [text, setText] = useState("");
	const [intent, setIntent] = useState<PromptIntent>("discovery");
	const count = selectedBuyerCount(draft);
	const atMax = count >= MAX_BUYER;
	// Indices into draft.questions, because toggleQuestion addresses the full list.
	const indexed = draft.questions.map((q, index) => ({ q, index }));
	const branded = indexed.filter(({ q }) => !isBuyer(q));

	const add = () => {
		onChange(addCustomQuestion(draft, text, intent));
		setText("");
	};

	return (
		<div className="space-y-6">
			<div className="space-y-1">
				<h2 className="text-2xl font-bold">{t("setup.questions.title")}</h2>
				<p className="text-muted-foreground">{t("setup.questions.subtitle")}</p>
				<p className="text-sm font-medium">
					{t("setup.questions.selected", { count, min: MIN_BUYER, max: MAX_BUYER })}
				</p>
			</div>

			{INTENT_ORDER.map((group) => {
				const rows = indexed.filter(({ q }) => q.intent === group);
				if (rows.length === 0) return null;
				return (
					<section key={group} className="space-y-2">
						<h3 className="font-semibold">{INTENT_LABEL[group]}</h3>
						{rows.map(({ q, index }) => {
							const id = `setup-question-${index}`;
							return (
								<label key={id} htmlFor={id} className="flex items-start gap-3 text-sm">
									<Checkbox
										id={id}
										checked={q.selected}
										disabled={!q.selected && atMax}
										onCheckedChange={() => onChange(toggleQuestion(draft, index))}
									/>
									<span>{q.text}</span>
								</label>
							);
						})}
					</section>
				);
			})}

			{branded.length > 0 && (
				<section className="space-y-2">
					<div className="flex items-center gap-2">
						<h3 className="font-semibold">{t("setup.questions.branded_title")}</h3>
						<Badge variant="secondary">{t("setup.questions.branded_hint")}</Badge>
					</div>
					<ul className="space-y-1 text-sm text-muted-foreground">
						{branded.map(({ q, index }) => (
							<li key={index}>{q.text}</li>
						))}
					</ul>
				</section>
			)}

			<form
				className="space-y-2"
				onSubmit={(e) => {
					e.preventDefault();
					add();
				}}
			>
				<Label htmlFor="setup-question-add">{t("setup.questions.add_label")}</Label>
				<div className="flex flex-wrap gap-2">
					<Input
						id="setup-question-add"
						className="min-w-60 flex-1"
						value={text}
						placeholder={t("setup.questions.add_placeholder")}
						disabled={atMax}
						onChange={(e) => setText(e.target.value)}
					/>
					<Select
						items={INTENT_LABEL}
						value={intent}
						onValueChange={(value) => setIntent(value as PromptIntent)}
						disabled={atMax}
					>
						<SelectTrigger className="w-36">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{INTENT_ORDER.map((value) => (
								<SelectItem key={value} value={value}>
									{INTENT_LABEL[value]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button type="submit" variant="outline" disabled={atMax || !text.trim()}>
						{t("setup.questions.add")}
					</Button>
				</div>
				{atMax && <p className="text-sm text-muted-foreground">{t("setup.questions.at_max", { max: MAX_BUYER })}</p>}
			</form>

			{count < MIN_BUYER && (
				<p className="text-sm text-destructive">{t("setup.questions.too_few", { min: MIN_BUYER })}</p>
			)}
			<StepNav onBack={onBack} onNext={onNext} nextDisabled={!canContinueFromQuestions(draft)} />
		</div>
	);
}
