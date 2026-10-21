import type { ReactNode } from "react";

const R = 88;
const C = 2 * Math.PI * R;

export function ScoreRing({ pct, children }: { pct: number | null; children: ReactNode }) {
	const filled = pct === null ? 0 : (C * Math.min(100, Math.max(0, pct))) / 100;
	return (
		<div className="relative mx-auto size-[200px]">
			<svg viewBox="0 0 200 200" className="block size-full -rotate-90" aria-hidden>
				<circle cx={100} cy={100} r={R} fill="none" stroke="var(--divider)" strokeWidth={14} />
				<circle
					cx={100}
					cy={100}
					r={R}
					fill="none"
					stroke={pct === null ? "var(--divider)" : "var(--primary)"}
					strokeWidth={14}
					strokeLinecap="round"
					strokeDasharray={`${filled} ${C}`}
					className="transition-[stroke-dasharray] duration-500"
				/>
			</svg>
			<div className="absolute inset-0 flex flex-col items-center justify-center gap-1">{children}</div>
		</div>
	);
}
