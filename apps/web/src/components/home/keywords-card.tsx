import type { BrandWithPrompts } from "@workspace/lib/db/schema";
import { cn } from "@workspace/ui/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { HomeCard } from "@/components/home/home-card";
import type { useUpdateBrandKeywords } from "@/hooks/use-brand-keywords";
import { t } from "@/lib/i18n";
import { dedupeKeywords, MAX_KEYWORD_LENGTH, MAX_KEYWORDS } from "@/lib/keyword-limits";

const SUGGESTION_COUNT = 10;
const SHOW_SUGGESTIONS_BELOW = 8;
const SAVED_VISIBLE_MS = 2500;

export function KeywordsCard({
	brand,
	update,
}: {
	brand: BrandWithPrompts;
	update: ReturnType<typeof useUpdateBrandKeywords>;
}) {
	const [keywords, setKeywords] = useState<string[]>(brand.keywords);
	const [draft, setDraft] = useState("");
	const full = keywords.length >= MAX_KEYWORDS;

	// "Saved" is a moment, not a state: clear it so the next change starts from a quiet line.
	useEffect(() => {
		if (!update.isSuccess) return;
		const timer = setTimeout(() => update.reset(), SAVED_VISIBLE_MS);
		return () => clearTimeout(timer);
	}, [update.isSuccess, update.reset]);

	const suggestions = useMemo(() => {
		const taken = new Set(keywords.map((k) => k.toLowerCase()));
		return [...new Set(brand.prompts.flatMap((p) => p.tags ?? []))]
			.filter((tag) => tag.length <= MAX_KEYWORD_LENGTH && !taken.has(tag.toLowerCase()))
			.slice(0, SUGGESTION_COUNT);
	}, [brand.prompts, keywords]);

	const save = (next: string[]) => {
		const list = dedupeKeywords(next).slice(0, MAX_KEYWORDS);
		setKeywords(list);
		update.mutate(list);
	};
	const add = (value: string) => {
		const v = value.trim().slice(0, MAX_KEYWORD_LENGTH);
		if (!v || full) return;
		save([...keywords, v]);
		setDraft("");
	};

	const status = update.isPending
		? t("home.keywords_saving")
		: update.isSuccess
			? t("home.keywords_saved")
			: update.isError
				? t("home.keywords_save_failed")
				: "";
	const placeholder = full
		? t("home.keywords_full")
		: keywords.length
			? t("home.keywords_add_another")
			: t("home.keywords_placeholder");

	return (
		<HomeCard
			title={t("home.keywords_title")}
			titleId="home-keywords"
			description={t("home.keywords_description")}
			action={
				<span className="text-sm tabular-nums text-muted-foreground">
					{keywords.length} / {MAX_KEYWORDS}
				</span>
			}
		>
			<div
				className={cn(
					"flex min-h-[52px] flex-wrap items-center gap-2 rounded-xl border p-2.5 focus-within:border-primary",
					full ? "bg-muted" : "bg-card",
				)}
			>
				{keywords.map((k) => (
					<span
						key={k.toLowerCase()}
						className="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-tint pl-3 pr-1.5 text-sm font-medium text-tint-foreground"
					>
						{k}
						<button
							type="button"
							onClick={() => save(keywords.filter((x) => x !== k))}
							aria-label={t("home.keywords_remove", { keyword: k })}
							className="flex size-5 items-center justify-center rounded-full text-sm leading-none hover:bg-card"
						>
							×
						</button>
					</span>
				))}
				<input
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							add(draft);
						}
					}}
					disabled={full}
					placeholder={placeholder}
					aria-label={t("home.keywords_input_label")}
					className="h-[30px] min-w-40 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
				/>
			</div>
			{keywords.length < SHOW_SUGGESTIONS_BELOW && suggestions.length > 0 && (
				<div className="flex flex-col gap-2">
					<span className="text-[13px] text-muted-foreground">{t("home.keywords_suggestions")}</span>
					<div className="flex flex-wrap gap-2">
						{suggestions.map((tag) => (
							<button
								key={tag}
								type="button"
								onClick={() => add(tag)}
								className="h-[30px] whitespace-nowrap rounded-full border border-dashed border-(--dashed) bg-card px-3 text-sm hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
							>
								+ {tag}
							</button>
						))}
					</div>
				</div>
			)}
			<span
				aria-live="polite"
				className={cn("min-h-[18px] text-[13px]", update.isError ? "text-destructive" : "text-muted-foreground")}
			>
				{status}
			</span>
		</HomeCard>
	);
}
