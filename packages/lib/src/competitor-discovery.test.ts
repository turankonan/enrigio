import { describe, expect, it } from "vitest";
import {
	buildDiscoveryPrompt,
	filterDiscoveries,
	MAX_ANSWER_CHARS,
	MAX_DISCOVERY_ANSWERS,
	prepareAnswers,
} from "./competitor-discovery";

const brand = { name: "Rigosis", aliases: ["Rigosis Bilgi Sistemleri"], domains: ["https://www.rigosis.com"] };
const existing = [{ name: "İnnova", aliases: [], domains: ["innova.com.tr"] }];

const found = (name: string, domains: string[] = [], evidence = "seen in an answer") => ({ name, domains, evidence });

describe("filterDiscoveries", () => {
	it("keeps genuinely new organizations", () => {
		const result = filterDiscoveries([found("Netaş", ["netas.com.tr"])], brand, existing);
		expect(result).toEqual([{ name: "Netaş", domains: ["netas.com.tr"], evidence: "seen in an answer" }]);
	});

	it("drops the brand itself, by name, alias, or domain", () => {
		const result = filterDiscoveries(
			[found("Rigosis"), found("rigosis bilgi sistemleri"), found("Some Firm", ["www.rigosis.com"])],
			brand,
			existing,
		);
		expect(result).toEqual([]);
	});

	it("drops competitors that are already tracked", () => {
		const result = filterDiscoveries([found("innova"), found("Other", ["INNOVA.com.tr"])], brand, existing);
		expect(result).toEqual([]);
	});

	it("dedupes by name case-insensitively and normalizes domains", () => {
		const result = filterDiscoveries(
			[found("KoçSistem", ["https://www.kocsistem.com.tr/en"]), found("koçsistem", ["kocsistem.com.tr"])],
			brand,
			existing,
		);
		expect(result).toHaveLength(1);
		expect(result[0].domains).toEqual(["kocsistem.com.tr"]);
	});

	it("drops empty names", () => {
		expect(filterDiscoveries([found("  ")], brand, existing)).toEqual([]);
	});
});

describe("prepareAnswers", () => {
	it("drops blanks, caps count, and truncates long answers", () => {
		const texts = [
			"",
			"  ",
			...Array.from({ length: MAX_DISCOVERY_ANSWERS + 10 }, () => "x".repeat(MAX_ANSWER_CHARS + 50)),
		];
		const prepared = prepareAnswers(texts);
		expect(prepared).toHaveLength(MAX_DISCOVERY_ANSWERS);
		for (const answer of prepared) expect(answer.length).toBeLessThanOrEqual(MAX_ANSWER_CHARS + 1);
	});
});

describe("buildDiscoveryPrompt", () => {
	it("names the brand, its aliases, and the already-tracked competitors", () => {
		const prompt = buildDiscoveryPrompt({
			brandName: "Rigosis",
			brandAliases: ["Rigosis Bilgi Sistemleri"],
			existingCompetitorNames: ["İnnova"],
			answers: ["Some answer text"],
		});
		expect(prompt).toContain("Rigosis");
		expect(prompt).toContain("Rigosis Bilgi Sistemleri");
		expect(prompt).toContain("İnnova");
		expect(prompt).toContain("Some answer text");
	});
});
