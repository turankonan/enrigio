/** Statistics for the phase V back-test. Thresholds come from the proposal (section 5). */

export type Direction = "up" | "down" | "flat";

const MOVE_THRESHOLD = 3;
const MIN_BRANDS = 5;
const MIN_SPEARMAN = 0.7;
const MIN_CORRELATED_SHARE = 0.8;
const MAX_MEDIAN_TREND_GAP = 5;

function averageRanks(values: number[]): number[] {
	const order = values.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v);
	const ranks = new Array<number>(values.length);
	let k = 0;
	while (k < order.length) {
		let j = k;
		while (j + 1 < order.length && order[j + 1].v === order[k].v) j++;
		const rank = (k + j) / 2 + 1;
		for (let m = k; m <= j; m++) ranks[order[m].i] = rank;
		k = j + 1;
	}
	return ranks;
}

/** Pearson correlation of average ranks, which is Spearman with tie correction. */
export function spearman(a: number[], b: number[]): number | null {
	if (a.length !== b.length || a.length < 3) return null;
	const ra = averageRanks(a);
	const rb = averageRanks(b);
	const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
	const ma = mean(ra);
	const mb = mean(rb);
	let num = 0;
	let da = 0;
	let db = 0;
	for (let i = 0; i < ra.length; i++) {
		num += (ra[i] - ma) * (rb[i] - mb);
		da += (ra[i] - ma) ** 2;
		db += (rb[i] - mb) ** 2;
	}
	if (da === 0 || db === 0) return null;
	return num / Math.sqrt(da * db);
}

export function direction(now: number, before: number): Direction {
	const delta = now - before;
	if (delta >= MOVE_THRESHOLD) return "up";
	if (delta <= -MOVE_THRESHOLD) return "down";
	return "flat";
}

export interface VerdictRow {
	spearman: number | null;
	directionV1: Direction;
	directionV2: Direction;
	trendGap: number;
}

export interface Verdict {
	outcome: "pass" | "fail" | "inconclusive";
	reasons: string[];
}

export function verdict(rows: VerdictRow[]): Verdict {
	if (rows.length < MIN_BRANDS) {
		return { outcome: "inconclusive", reasons: [`${rows.length} qualifying brand(s); need ${MIN_BRANDS}`] };
	}
	const reasons: string[] = [];
	const correlated = rows.filter((r) => r.spearman !== null && r.spearman >= MIN_SPEARMAN).length;
	if (correlated / rows.length < MIN_CORRELATED_SHARE) {
		reasons.push(`only ${correlated}/${rows.length} brands have Spearman ≥ ${MIN_SPEARMAN}`);
	}
	const flips = rows.filter((r) => r.directionV1 !== r.directionV2).length;
	if (flips > 0) reasons.push(`${flips} brand(s) change direction between v1 and v2`);
	const gaps = rows.map((r) => r.trendGap).sort((x, y) => x - y);
	const median =
		gaps.length % 2 ? gaps[(gaps.length - 1) / 2] : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2;
	if (median > MAX_MEDIAN_TREND_GAP) reasons.push(`median trend gap ${median} > ${MAX_MEDIAN_TREND_GAP}`);
	return { outcome: reasons.length === 0 ? "pass" : "fail", reasons };
}
