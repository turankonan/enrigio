import type { PromptIntent } from "@workspace/lib/db/schema";
import { t } from "@/lib/i18n";

export const INTENT_LABEL: Record<PromptIntent, string> = {
	discovery: t("setup.intent.discovery"),
	comparison: t("setup.intent.comparison"),
	local: t("setup.intent.local"),
	price: t("setup.intent.price"),
};
