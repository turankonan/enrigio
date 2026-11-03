import { MARKET_CATALOG } from "@workspace/config/markets";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { cleanAndValidateDomain } from "@/lib/domain-categories";
import { t } from "@/lib/i18n";
import type { SetupDraft } from "@/lib/setup-wizard";
import { StepNav } from "./step-nav";

// Base UI's Select cannot hold null as an item value, so "no market" travels as an empty string.
const UNSET = "";

const MARKET_ITEMS: Record<string, string> = {
	[UNSET]: t("settings.market.choose"),
	...Object.fromEntries(MARKET_CATALOG.map((m) => [m.key, m.key])),
};

interface Props {
	draft: SetupDraft;
	onChange: (d: SetupDraft) => void;
	onNext: () => void;
	onBack?: () => void;
}

export function StepSite({ draft, onChange, onNext, onBack }: Props) {
	const { profile } = draft;
	const set = (patch: Partial<SetupDraft["profile"]>) => onChange({ ...draft, profile: { ...profile, ...patch } });

	return (
		<div className="space-y-6">
			<h2 className="text-2xl font-bold">{t("setup.site.title")}</h2>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-2">
					<Label htmlFor="setup-name">{t("setup.site.name_label")}</Label>
					<Input id="setup-name" value={profile.name} onChange={(e) => set({ name: e.target.value })} />
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="setup-sector">{t("setup.site.sector_label")}</Label>
					<Input id="setup-sector" value={profile.sector} onChange={(e) => set({ sector: e.target.value })} />
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="setup-location">{t("setup.site.location_label")}</Label>
					<Input id="setup-location" value={profile.location} onChange={(e) => set({ location: e.target.value })} />
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="setup-market">{t("setup.site.market_label")}</Label>
					<Select
						items={MARKET_ITEMS}
						value={profile.marketKey ?? UNSET}
						onValueChange={(value) => set({ marketKey: value ? String(value) : null })}
					>
						<SelectTrigger id="setup-market" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{Object.entries(MARKET_ITEMS).map(([value, label]) => (
								<SelectItem key={value} value={value}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-2">
					<Label>{t("setup.site.aliases_label")}</Label>
					<TagsInput
						value={profile.aliases}
						onValueChange={(aliases) => set({ aliases })}
						placeholder={t("settings.brand.add_alias_placeholder")}
						searchPlaceholder={t("settings.brand.add_alias_placeholder")}
						maxItems={10}
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Label>{t("setup.site.domains_label")}</Label>
					<TagsInput
						value={profile.additionalDomains}
						onValueChange={(additionalDomains) => set({ additionalDomains })}
						placeholder={t("settings.brand.add_domain_placeholder")}
						searchPlaceholder={t("settings.brand.add_domain_placeholder")}
						maxItems={10}
						normalizeValue={(raw) => cleanAndValidateDomain(raw) ?? raw.trim()}
					/>
				</div>
			</div>
			<StepNav onBack={onBack} onNext={onNext} nextDisabled={!profile.name.trim()} />
		</div>
	);
}
