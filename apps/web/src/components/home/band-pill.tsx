import { cn } from "@workspace/ui/lib/utils";
import { type TranslationKey, t } from "@/lib/i18n";
import type { ScoreBand } from "@/lib/score-band";

const STYLE: Record<ScoreBand | "none", string> = {
	low: "bg-band-low text-band-low-foreground",
	ok: "bg-band-ok text-band-ok-foreground",
	good: "bg-band-good text-band-good-foreground",
	none: "bg-muted text-muted-foreground",
};

const LABEL: Record<ScoreBand | "none", TranslationKey> = {
	low: "home.band_low",
	ok: "home.band_ok",
	good: "home.band_good",
	none: "home.band_none",
};

export function BandPill({ band, className }: { band: ScoreBand | "none"; className?: string }) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full px-2.5 py-[3px] text-[13px] font-semibold",
				STYLE[band],
				className,
			)}
		>
			{t(LABEL[band])}
		</span>
	);
}
