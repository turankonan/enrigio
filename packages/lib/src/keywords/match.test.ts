import { describe, expect, it } from "vitest";
import { matchKeywords, overlapScore } from "./match";

const page = (url: string, headings: string, body: string) => ({ url, headings, body });

describe("matchKeywords", () => {
	it("marks a keyword found when it appears in a heading or title", () => {
		const [r] = matchKeywords(["dental implants"], [page("/a", "Dental Implants in Izmir", "")]);
		expect(r).toEqual({ keyword: "dental implants", status: "found", url: "/a", where: "heading" });
	});

	it("marks a keyword found when the body mentions it at least twice across pages", () => {
		const pages = [page("/a", "", "we do dental implants"), page("/b", "", "dental implants cost")];
		expect(matchKeywords(["dental implants"], pages)[0]).toMatchObject({ status: "found", url: "/a", where: "body" });
	});

	it("marks a single body mention weak", () => {
		const [r] = matchKeywords(["veneers"], [page("/a", "", "we also offer veneers")]);
		expect(r).toMatchObject({ status: "weak", url: "/a", where: "body" });
	});

	it("marks absent keywords missing", () => {
		const [r] = matchKeywords(["orthodontics"], [page("/a", "Smile", "teeth whitening")]);
		expect(r).toEqual({ keyword: "orthodontics", status: "missing", url: null, where: null });
	});

	it("ignores case, extra whitespace and unicode form", () => {
		const [r] = matchKeywords(["Teeth   Whitening"], [page("/a", "TEETH WHITENING", "")]);
		expect(r.status).toBe("found");
	});

	it("lowercases Turkish dotted I correctly when the market language is tr", () => {
		const [r] = matchKeywords(["diş implantı"], [page("/a", "DİŞ İMPLANTI", "")], "tr");
		expect(r.status).toBe("found");
	});
});

describe("overlapScore", () => {
	it("counts found and weak keywords as present, as a rounded percentage", () => {
		expect(
			overlapScore([
				{ keyword: "a", status: "found", url: "/", where: "body" },
				{ keyword: "b", status: "weak", url: "/", where: "body" },
				{ keyword: "c", status: "missing", url: null, where: null },
			]),
		).toBe(67);
	});

	it("has no score without keywords", () => {
		expect(overlapScore([])).toBeNull();
	});
});
