import { describe, expect, it } from "vitest";
import en from "../../locales/en.json";
import tr from "../../locales/tr.json";

describe("i18n parity", () => {
	it("tr.json has every key en.json has", () => {
		const missing = Object.keys(en).filter((k) => !(k in tr));
		expect(missing).toEqual([]);
	});

	it("en.json has every key tr.json has", () => {
		const missing = Object.keys(tr).filter((k) => !(k in en));
		expect(missing).toEqual([]);
	});
});
