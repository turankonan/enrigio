import { describe, expect, it } from "vitest";
import { initials } from "@/lib/initials";

describe("initials", () => {
	it("takes the first letters of the first two words of the name", () => {
		expect(initials("Maya Demir", "x@y.z")).toBe("MD");
		expect(initials("ayşe", "x@y.z")).toBe("A");
	});
	it("falls back to the email, then to a question mark", () => {
		expect(initials(undefined, "semi.hop@rigosis.com")).toBe("S");
		expect(initials("", "")).toBe("?");
	});
});
