import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { addCustomRival, MAX_RIVALS, type SetupDraft, toggleRival } from "@/lib/setup-wizard";
import { StepNav } from "./step-nav";

interface Props {
	draft: SetupDraft;
	onChange: (d: SetupDraft) => void;
	onNext: () => void;
	onBack?: () => void;
}

export function StepRivals({ draft, onChange, onNext, onBack }: Props) {
	const [name, setName] = useState("");
	const [site, setSite] = useState("");
	const count = draft.rivals.filter((r) => r.selected).length;
	const atMax = count >= MAX_RIVALS;

	const add = () => {
		onChange(addCustomRival(draft, name, site));
		setName("");
		setSite("");
	};

	return (
		<div className="space-y-6">
			<div className="space-y-1">
				<h2 className="text-2xl font-bold">{t("setup.rivals.title")}</h2>
				<p className="text-muted-foreground">{t("setup.rivals.subtitle")}</p>
				<p className="text-sm font-medium">{t("setup.rivals.selected", { count, max: MAX_RIVALS })}</p>
			</div>

			<div className="space-y-2">
				{draft.rivals.map((rival, index) => {
					const id = `setup-rival-${index}`;
					return (
						<label key={id} htmlFor={id} className="flex items-center gap-3 text-sm">
							<Checkbox
								id={id}
								checked={rival.selected}
								disabled={!rival.selected && atMax}
								onCheckedChange={() => onChange(toggleRival(draft, index))}
							/>
							<span>{rival.name}</span>
							{rival.site && <span className="text-muted-foreground">{rival.site}</span>}
						</label>
					);
				})}
			</div>

			<form
				className="flex flex-wrap gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					add();
				}}
			>
				<Input
					aria-label={t("setup.rivals.add_name")}
					className="min-w-48 flex-1"
					value={name}
					placeholder={t("setup.rivals.add_name")}
					disabled={atMax}
					onChange={(e) => setName(e.target.value)}
				/>
				<Input
					aria-label={t("setup.rivals.add_site")}
					className="min-w-48 flex-1"
					value={site}
					placeholder={t("setup.rivals.add_site")}
					disabled={atMax}
					onChange={(e) => setSite(e.target.value)}
				/>
				<Button type="submit" variant="outline" disabled={atMax || !name.trim()}>
					{t("setup.rivals.add")}
				</Button>
			</form>

			<StepNav onBack={onBack} onNext={onNext} />
		</div>
	);
}
