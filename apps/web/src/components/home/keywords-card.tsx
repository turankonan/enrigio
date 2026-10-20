import type { BrandWithPrompts } from "@workspace/lib/db/schema";
import { Button } from "@workspace/ui/components/button";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { useMemo, useState } from "react";
import { HomeCard } from "@/components/home/home-card";
import type { useUpdateBrandKeywords } from "@/hooks/use-brand-keywords";
import { t } from "@/lib/i18n";
import { MAX_KEYWORD_LENGTH, MAX_KEYWORDS } from "@/server/keywords-fn";

const SUGGESTION_COUNT = 10;

export function KeywordsCard({
	brand,
	update,
}: {
	brand: BrandWithPrompts;
	update: ReturnType<typeof useUpdateBrandKeywords>;
}) {
	const [draft, setDraft] = useState<string[]>(brand.keywords);
	const dirty = draft.join("\n") !== brand.keywords.join("\n");

	const suggestions = useMemo(() => {
		const taken = new Set(draft.map((k) => k.toLowerCase()));
		return [...new Set(brand.prompts.flatMap((p) => p.tags ?? []))]
			.filter((tag) => !taken.has(tag.toLowerCase()))
			.slice(0, SUGGESTION_COUNT);
	}, [brand.prompts, draft]);

	return (
		<HomeCard
			title={t("home.keywords_title")}
			description={t("home.keywords_description")}
			action={
				<span className="text-sm tabular-nums text-muted-foreground">
					{draft.length} / {MAX_KEYWORDS}
				</span>
			}
		>
			<div className="flex flex-col gap-3">
				<TagsInput
					value={draft}
					onValueChange={setDraft}
					allowCustomValues
					maxItems={MAX_KEYWORDS}
					placeholder={t("home.keywords_placeholder")}
					onValidate={(value) => (value.trim().length <= MAX_KEYWORD_LENGTH ? true : t("home.keywords_too_long"))}
					pasteSplitter={/[\n,]+/}
				/>
				{suggestions.length > 0 && (
					<div className="flex flex-wrap items-center gap-1.5 text-sm">
						<span className="text-muted-foreground">{t("home.keywords_suggestions")}</span>
						{suggestions.map((tag) => (
							<Button
								key={tag}
								type="button"
								variant="outline"
								size="sm"
								className="h-7 rounded-full"
								disabled={draft.length >= MAX_KEYWORDS}
								onClick={() => setDraft((prev) => [...prev, tag])}
							>
								+ {tag}
							</Button>
						))}
					</div>
				)}
				<div className="flex items-center gap-3">
					<Button type="button" size="sm" disabled={!dirty || update.isPending} onClick={() => update.mutate(draft)}>
						{update.isPending ? t("home.keywords_saving") : t("home.keywords_save")}
					</Button>
					{update.isSuccess && !dirty && (
						<span className="text-sm text-muted-foreground">{t("home.keywords_saved")}</span>
					)}
					{update.isError && <span className="text-sm text-destructive">{t("home.keywords_save_failed")}</span>}
				</div>
			</div>
		</HomeCard>
	);
}
