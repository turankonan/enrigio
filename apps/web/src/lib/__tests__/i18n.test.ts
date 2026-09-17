import { describe, expect, it } from "vitest";
import { t } from "../i18n";

describe("t", () => {
	it("returns the dictionary string for a known key", () => {
		expect(t("auth.login.title")).toBe("Sign in");
	});

	it("interpolates {placeholder} variables", () => {
		expect(t("auth.register.verification-sent", { email: "a@b.co" })).toBe("We sent a verification link to a@b.co");
	});
});
