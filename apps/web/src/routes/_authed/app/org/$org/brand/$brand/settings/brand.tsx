import { Info } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { brandSegment, brandSlugPrefix, normalizeSlug } from "@workspace/lib/app-urls";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { useCallback, useState } from "react";
import { SlugField } from "@/components/slug-field";
import { useBrand } from "@/hooks/use-brands";
import { citationKeys } from "@/hooks/use-citations";
import { dashboardKeys } from "@/hooks/use-dashboard-summary";
import { useOrganization, useOrganizationsChanged } from "@/hooks/use-organizations";
import { useBrandParams } from "@/hooks/use-route-params";
import { cleanAndValidateDomain } from "@/lib/domain-categories";
import { t } from "@/lib/i18n";
import { marketLabel } from "@/lib/market-label";
import { pageHead } from "@/lib/route-head";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { type BrandMarketState, getBrandMarketStateFn, updateBrandMarketFn } from "@/server/brand-market";
import { updateBrandFn } from "@/server/brands";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/settings/brand")({
	staticData: { crumb: t("settings.brand.crumb") },
	loader: ({ context }): Promise<BrandMarketState> => getBrandMarketStateFn({ data: { brandId: context.brandId } }),
	head: pageHead({ title: t("settings.brand.head_title"), description: t("settings.brand.head_description") }),
	component: BrandSettingsPage,
});

/** The evaluation market picker: a single select bound to the brand's
 *  `defaultMarketKey`, disabled and explained when the deployment owns it. */
function MarketPicker() {
	const { brandId } = Route.useRouteContext();
	const market = Route.useLoaderData();
	const router = useRouter();
	const writeError = useWriteErrorMessage();
	const [marketKey, setMarketKey] = useState(market.marketKey);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleChange = async (value: string | null) => {
		if (!value) return;
		const previous = marketKey;
		setMarketKey(value);
		setSaving(true);
		setError(null);
		try {
			await updateBrandMarketFn({ data: { brandId, marketKey: value } });
			await router.invalidate();
		} catch (err) {
			setMarketKey(previous);
			setError(writeError(err, "Failed to update the evaluation market."));
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="space-y-2">
			<Label htmlFor="market">{t("settings.market.label")}</Label>
			<Select value={marketKey} onValueChange={handleChange} disabled={!market.editable || saving}>
				<SelectTrigger id="market" className="w-64">
					{/* A brand's stored/effective market can fall outside the catalog
					    (unresolvable deployment env, legacy data) — the placeholder
					    covers that instead of rendering a blank trigger. */}
					<SelectValue placeholder={t("settings.market.choose")} />
				</SelectTrigger>
				<SelectContent>
					{market.options.map((option) => (
						<SelectItem key={option.key} value={option.key}>
							{marketLabel(option.key)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{!market.editable && <p className="text-xs text-muted-foreground">{t("settings.market.readonly")}</p>}
			<p className="text-xs text-muted-foreground">{t("settings.market.help")}</p>
			{error && <p className="text-sm text-destructive">{error}</p>}
		</div>
	);
}

function BrandSettingsPage() {
	const { data: brand, isLoading, refetch: refetchBrand } = useBrand();
	const queryClient = useQueryClient();
	const organization = useOrganization();
	const organizationsChanged = useOrganizationsChanged();
	const brandParams = useBrandParams();
	const navigate = useNavigate();
	const writeError = useWriteErrorMessage();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const [additionalDomains, setAdditionalDomains] = useState<string[]>([]);
	const [aliases, setAliases] = useState<string[]>([]);
	const [slug, setSlug] = useState("");

	// Reseed the fields when the brand changes server-side, without discarding
	// whatever is being typed in between.
	const [seededFrom, setSeededFrom] = useState<Date | null>(null);
	if (brand && brand.updatedAt !== seededFrom) {
		setSeededFrom(brand.updatedAt);
		setAdditionalDomains(brand.additionalDomains || []);
		setAliases(brand.aliases || []);
		setSlug(brandSegment(brand));
	}

	const validateDomain = useCallback((val: string): true | string => {
		const cleaned = cleanAndValidateDomain(val);
		if (!cleaned) return t("settings.brand.invalid_domain", { value: val });
		return true;
	}, []);
	const handleAliasesChange = useCallback((values: string[]) => setAliases(values), []);

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-3xl font-bold">{t("settings.brand.crumb")}</h1>
					<p className="text-muted-foreground">{t("settings.brand.loading")}</p>
				</div>
			</div>
		);
	}

	if (!brand) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-3xl font-bold">{t("settings.brand.crumb")}</h1>
					<p className="text-destructive">{t("settings.brand.not_found")}</p>
				</div>
			</div>
		);
	}

	const currentSlug = brandSegment(brand);

	const handleSubmit = async (formData: FormData) => {
		setIsSubmitting(true);
		setError("");
		setSuccess("");

		try {
			const name = formData.get("name") as string;
			const website = formData.get("website") as string;
			const sector = formData.get("sector") as string;
			const location = formData.get("location") as string;

			const nextSlug = normalizeSlug(slug);
			const slugMoved = nextSlug !== currentSlug;
			await updateBrandFn({
				data: {
					brandId: brand.id,
					name,
					website,
					sector,
					location,
					...(slugMoved && { slug: nextSlug }),
					additionalDomains,
					aliases,
				},
			});

			// Domain/alias changes affect citation categorization and mention detection
			queryClient.invalidateQueries({ queryKey: citationKeys.all });
			queryClient.invalidateQueries({ queryKey: dashboardKeys.all });

			setSuccess(t("settings.brand.update_success"));
			await refetchBrand();
			await organizationsChanged(
				slugMoved
					? () =>
							navigate({
								to: "/app/org/$org/brand/$brand/settings/brand",
								params: { ...brandParams, brand: nextSlug },
								replace: true,
							})
					: undefined,
			);
		} catch (err) {
			setError(writeError(err, t("settings.brand.save_error")));
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="space-y-6 max-w-2xl">
			<div>
				<h1 className="text-3xl font-bold">{t("settings.brand.crumb")}</h1>
				<p className="text-muted-foreground">{t("settings.brand.subtitle")}</p>
			</div>

			<form action={handleSubmit} className="space-y-6">
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="name">{t("new_brand.name_label")}</Label>
						<Input
							id="name"
							name="name"
							type="text"
							placeholder={t("new_brand.name_label")}
							defaultValue={brand.name}
							required
							disabled={isSubmitting}
						/>
						<p className="text-xs text-muted-foreground">{t("settings.brand.name_hint")}</p>
					</div>

					<SlugField
						id="brand-slug"
						label={t("settings.brand.slug_label")}
						prefix={brandSlugPrefix(organization)}
						value={slug}
						onChange={setSlug}
						disabled={isSubmitting}
					/>

					<div className="space-y-2">
						<Label htmlFor="website">{t("new_brand.website_label")}</Label>
						<Input
							id="website"
							name="website"
							type="text"
							placeholder={t("new_brand.website_placeholder")}
							defaultValue={brand.website}
							required
							disabled={isSubmitting}
						/>
						<p className="text-xs text-muted-foreground">{t("settings.brand.website_hint")}</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="sector">{t("settings.brand.sector_label")}</Label>
						<Input id="sector" name="sector" type="text" defaultValue={brand.sector ?? ""} disabled={isSubmitting} />
					</div>

					<div className="space-y-2">
						<Label htmlFor="location">{t("settings.brand.location_label")}</Label>
						<Input
							id="location"
							name="location"
							type="text"
							defaultValue={brand.location ?? ""}
							disabled={isSubmitting}
						/>
					</div>

					<div className="space-y-2">
						<Label className="flex items-center gap-1.5">
							{t("settings.brand.additional_domains_label")}
							<Tooltip>
								<TooltipTrigger render={<Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
								<TooltipContent className="max-w-xs text-xs font-normal">
									{t("settings.brand.additional_domains_tooltip")}
								</TooltipContent>
							</Tooltip>
						</Label>
						<TagsInput
							value={additionalDomains}
							onValueChange={setAdditionalDomains}
							placeholder={t("settings.brand.add_domain_placeholder")}
							searchPlaceholder={t("settings.brand.add_domain_placeholder")}
							maxItems={10}
							normalizeValue={(raw) => cleanAndValidateDomain(raw) ?? raw.trim()}
							onValidate={validateDomain}
						/>
					</div>

					<div className="space-y-2">
						<Label className="flex items-center gap-1.5">
							{t("settings.brand.aliases_label")}
							<Tooltip>
								<TooltipTrigger render={<Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
								<TooltipContent className="max-w-xs text-xs font-normal">
									{t("settings.brand.aliases_tooltip")}
								</TooltipContent>
							</Tooltip>
						</Label>
						<TagsInput
							value={aliases}
							onValueChange={handleAliasesChange}
							placeholder={t("settings.brand.add_alias_placeholder")}
							searchPlaceholder={t("settings.brand.add_alias_placeholder")}
							maxItems={10}
						/>
					</div>
				</div>

				{error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>}
				{success && <div className="text-sm text-green-600 bg-green-50 p-3 rounded-md">{success}</div>}

				<div className="flex gap-2">
					<Button type="submit" disabled={isSubmitting} className="cursor-pointer">
						{isSubmitting ? t("settings.brand.saving") : t("settings.brand.save_changes")}
					</Button>
				</div>
			</form>

			<MarketPicker />
		</div>
	);
}
