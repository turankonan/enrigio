import { describe, expect, it } from "vitest";
import { sparklinePath } from "@/components/home/sparkline";

describe("sparklinePath", () => {
	it("draws one point per value from left to right, higher values nearer the top", () => {
		const d = sparklinePath([10, 20, 30], 400, 44);
		const points = d.match(/[ML]([\d.]+),([\d.]+)/g) ?? [];
		expect(points).toHaveLength(3);
		const ys = points.map((p) => Number(p.split(",")[1]));
		expect(ys[0]).toBeGreaterThan(ys[1]);
		expect(ys[1]).toBeGreaterThan(ys[2]);
		expect(d.startsWith("M0,")).toBe(true);
		expect(points[2]?.startsWith("L400,")).toBe(true);
	});
	it("skips gaps and returns an empty path with fewer than two points", () => {
		expect(sparklinePath([null, 5, null], 400, 44)).toBe("");
		expect(sparklinePath([5, null, 9], 400, 44)).toMatch(/^M0,.* L400,/);
	});
});
