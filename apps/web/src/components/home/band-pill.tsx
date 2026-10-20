import { cn } from "@workspace/ui/lib/utils";
import { type TranslationKey, t } from "@/lib/i18n";
import type { ScoreBand } from "@/lib/score-band";

const STYLE: Record<ScoreBand, string> = {
	low: "bg-rose-100 text-rose-900",
	ok: "bg-amber-100 text-amber-900",
	good: "bg-emerald-100 text-emerald-900",
};

const LABEL: Record<ScoreBand, TranslationKey> = {
	low: "home.band_low",
	ok: "home.band_ok",
	good: "home.band_good",
};

export function BandPill({ band, className }: { band: ScoreBand; className?: string }) {
	return (
		<span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", STYLE[band], className)}>
			{t(LABEL[band])}
		</span>
	);
}
