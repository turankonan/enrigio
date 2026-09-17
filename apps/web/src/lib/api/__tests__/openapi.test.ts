import { describe, expect, it } from "vitest";
import { deploymentOpenApiSpec } from "../openapi";

const ANSWERECHO = { name: "AnswerEcho", url: "https://app.answerecho.com" };
const AGENCY = { name: "Acme Visibility", url: "https://visibility.acme.com" };

describe("deploymentOpenApiSpec", () => {
	it("answers with the host the spec was fetched from", () => {
		const spec = deploymentOpenApiSpec(ANSWERECHO, "https://app.answerecho.com");

		expect(spec.servers).toEqual([{ url: "https://app.answerecho.com/api/v1", description: "AnswerEcho API" }]);
	});

	it("does not leak the vendor into a whitelabel deployment", () => {
		const spec = deploymentOpenApiSpec(AGENCY, "https://visibility.acme.com");

		expect(spec.info.title).toBe("Acme Visibility API");
		expect(spec.info.contact).toEqual({ name: "Acme Visibility", url: "https://visibility.acme.com" });
		expect(spec.servers?.[0]).toEqual({
			url: "https://visibility.acme.com/api/v1",
			description: "Acme Visibility API",
		});
	});

	it("serves a self-hosted instance its own address, port and all", () => {
		const spec = deploymentOpenApiSpec({ name: "AnswerEcho", url: "http://localhost:3000" }, "http://localhost:3000");

		expect(spec.servers?.[0].url).toBe("http://localhost:3000/api/v1");
	});

	// The operator's canonical URL is a separate question from where this
	// request landed, and a stale one must not send callers somewhere they
	// cannot reach.
	it("takes the server from the request even when the configured URL differs", () => {
		const spec = deploymentOpenApiSpec(ANSWERECHO, "https://staging.answerecho.com");

		expect(spec.servers?.[0].url).toBe("https://staging.answerecho.com/api/v1");
		expect(spec.info.contact).toEqual(ANSWERECHO);
	});

	it("leaves the operations alone", () => {
		const spec = deploymentOpenApiSpec(ANSWERECHO, "https://app.answerecho.com");

		expect(Object.keys(spec.paths as object)).toContain("/brands");
	});
});
