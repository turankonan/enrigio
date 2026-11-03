import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import FullPageCard from "@/components/full-page-card";
import { useOrganizationsChanged } from "@/hooks/use-organizations";
import { useOrganizationParams } from "@/hooks/use-route-params";
import { validateWebsiteUrl } from "@/lib/brand-website";
import { t } from "@/lib/i18n";
import { trackEvent } from "@/lib/posthog";
import { pageHead } from "@/lib/route-head";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { createBrandInOrgFn } from "@/server/brands";
import { startAnalyzeBrandFn } from "@/server/onboarding";

export const Route = createFileRoute("/_authed/app/org/$org/new")({
	staticData: { crumb: t("setup.crumb") },
	loader: ({ context }) => {
		const { brandCreation, id } = context.organization;
		if (brandCreation.kind === "not-offered") {
			throw redirect({ to: "/app/org/$org", params: { org: context.organization.slug } });
		}
		return { organizationId: id, blocked: brandCreation.kind === "denied" ? brandCreation : null };
	},
	head: pageHead({ description: t("setup.head_description") }),
	component: NewBrandPage,
});

function NewBrandPage() {
	const { organizationId, blocked } = Route.useLoaderData();
	const organizationParams = useOrganizationParams();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const organizationsChanged = useOrganizationsChanged();
	const navigate = useNavigate();
	const writeError = useWriteErrorMessage();

	const submit = async (formData: FormData) => {
		const website = ((formData.get("website") as string) ?? "").trim();
		const validation = validateWebsiteUrl(website);
		if (!validation.isValid) {
			setError(validation.error);
			return;
		}
		setIsLoading(true);
		setError("");
		try {
			const { brandSlug, brandId } = await createBrandInOrgFn({ data: { website, organizationId } });
			trackEvent("brand_created", { has_website: true });
			// Fire-and-forget: the wizard polls the status and offers a retry.
			startAnalyzeBrandFn({ data: { brandId, website } }).catch(() => {});
			await organizationsChanged(() =>
				navigate({ to: "/app/org/$org/brand/$brand", params: { ...organizationParams, brand: brandSlug } }),
			);
		} catch (err) {
			setError(writeError(err, t("setup.new.error")));
		} finally {
			setIsLoading(false);
		}
	};

	if (blocked) {
		return (
			<FullPageCard
				title={blocked.code === "no-active-plan" ? t("new_brand.blocked_no_plan") : t("new_brand.blocked_limit")}
				subtitle={blocked.message}
				showBackButton
			>
				<Link
					to="/app/org/$org/settings/billing"
					params={organizationParams}
					className={buttonVariants({ className: "w-full" })}
				>
					{t("new_brand.go_to_billing")}
				</Link>
			</FullPageCard>
		);
	}

	return (
		<FullPageCard title={t("setup.new.title")} subtitle={t("setup.new.subtitle")}>
			<form action={submit} className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="website">{t("setup.new.website_label")}</Label>
					<Input
						id="website"
						name="website"
						type="text"
						placeholder={t("setup.new.website_placeholder")}
						autoFocus
						required
						disabled={isLoading}
					/>
				</div>
				{error && <p className="text-sm text-destructive">{error}</p>}
				<div className="flex gap-2">
					<Button type="submit" disabled={isLoading}>
						{t("setup.new.submit")}
					</Button>
					<Link to="/app/org/$org" params={organizationParams} className={buttonVariants({ variant: "ghost" })}>
						{t("setup.back")}
					</Link>
				</div>
			</form>
		</FullPageCard>
	);
}
