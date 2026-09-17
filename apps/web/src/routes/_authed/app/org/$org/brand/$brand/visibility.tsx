import { createFileRoute, Link } from "@tanstack/react-router";
import { PromptsDisplay } from "@/components/prompts-display";
import { useBrandParams } from "@/hooks/use-route-params";
import { t } from "@/lib/i18n";
import { coercePromptOrder, DEFAULT_PROMPT_ORDER, type PromptOrder } from "@/lib/prompt-order";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/visibility")({
	staticData: { crumb: t("visibility.crumb") },
	validateSearch: (search: Record<string, unknown>): { order?: PromptOrder } => {
		const order = coercePromptOrder(search.order);
		return order === DEFAULT_PROMPT_ORDER ? {} : { order };
	},
	head: pageHead({ description: t("visibility.head_description") }),
	component: VisibilityPage,
});

function VisibilityPage() {
	const params = useBrandParams();

	const infoContent = (
		<>
			Track how different LLMs respond to prompts related to your brand, products, and{" "}
			<Link to="/app/org/$org/brand/$brand/settings/competitors" params={params} className="underline">
				competitors
			</Link>
			.
		</>
	);

	return (
		<PromptsDisplay
			pageTitle={t("visibility.crumb")}
			pageDescription={t("visibility.page_description")}
			pageInfoContent={infoContent}
		/>
	);
}
