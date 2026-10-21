export function sparklinePath(values: (number | null)[], width: number, height: number): string {
	const points = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => typeof p.v === "number");
	if (points.length < 2) return "";
	const max = Math.max(...points.map((p) => p.v));
	const min = Math.min(...points.map((p) => p.v)) - 4;
	const x = (i: number) => (i * width) / (values.length - 1);
	const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
	return points.map((p, n) => `${n ? "L" : "M"}${x(p.i)},${y(p.v)}`).join(" ");
}

const W = 400;
const H = 44;

export function Sparkline({ values, className }: { values: (number | null)[]; className?: string }) {
	const d = sparklinePath(values, W, H);
	if (!d) return <div className={className} aria-hidden />;
	return (
		<svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden>
			<path d={`${d} L${W},${H} L0,${H} Z`} fill="var(--primary)" fillOpacity={0.08} />
			<path d={d} fill="none" stroke="var(--primary)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
		</svg>
	);
}
