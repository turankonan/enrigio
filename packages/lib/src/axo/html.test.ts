import { describe, expect, it } from "vitest";
import { checklistForPage, extractCleanText } from "./html";

describe("checklistForPage", () => {
	it("decodes HTML entities in the title", () => {
		const html = "<html><head><title>A &amp; B</title></head><body></body></html>";
		expect(checklistForPage(html).title).toBe("A & B");
	});

	it("returns a null title when there is no title tag", () => {
		const html = "<html><head></head><body></body></html>";
		expect(checklistForPage(html).title).toBeNull();
	});

	it("detects a meta description regardless of attribute order", () => {
		const html = '<html><head><meta content="Some description" name="description"></head><body></body></html>';
		expect(checklistForPage(html).hasMetaDescription).toBe(true);
	});

	it("does not count an empty meta description as present", () => {
		const html = '<html><head><meta name="description" content=""></head><body></body></html>';
		expect(checklistForPage(html).hasMetaDescription).toBe(false);
	});

	it("does not count a missing meta description as present", () => {
		const html = "<html><head></head><body></body></html>";
		expect(checklistForPage(html).hasMetaDescription).toBe(false);
	});

	it("detects schema via a JSON-LD script block", () => {
		const html = '<html><head><script type="application/ld+json">{"@type":"Organization"}</script></head></html>';
		expect(checklistForPage(html).hasSchema).toBe(true);
	});

	it("detects schema via microdata itemscope", () => {
		const html = '<html><body><div itemscope itemtype="https://schema.org/Organization"></div></body></html>';
		expect(checklistForPage(html).hasSchema).toBe(true);
	});

	it("reports no schema when neither JSON-LD nor itemscope is present", () => {
		const html = "<html><body><div>hello</div></body></html>";
		expect(checklistForPage(html).hasSchema).toBe(false);
	});

	it("reports no-h1 when the page has zero h1 elements", () => {
		const html = "<html><body><h2>Section</h2></body></html>";
		expect(checklistForPage(html).headingStructure).toBe("no-h1");
	});

	it("reports ok when the page has exactly one h1", () => {
		const html = "<html><body><h1>Title</h1></body></html>";
		expect(checklistForPage(html).headingStructure).toBe("ok");
	});

	it("reports weak when the page has more than one h1", () => {
		const html = "<html><body><h1>First</h1><h1>Second</h1></body></html>";
		expect(checklistForPage(html).headingStructure).toBe("weak");
	});
});

describe("extractCleanText", () => {
	it("excludes script contents", () => {
		const html = "<html><body><p>Visible text.</p><script>window.SECRET_SCRIPT_MARKER=1;</script></body></html>";
		expect(extractCleanText(html)).not.toContain("SECRET_SCRIPT_MARKER");
	});

	it("excludes style contents", () => {
		const html = "<html><body><p>Visible text.</p><style>.secret-style-marker{color:red}</style></body></html>";
		expect(extractCleanText(html)).not.toContain("secret-style-marker");
	});

	it("excludes hidden elements", () => {
		const html =
			"<html><body><p>Visible text that is long enough to read normally without any special treatment at all.</p><p hidden>SECRET_HIDDEN_MARKER</p></body></html>";
		expect(extractCleanText(html)).not.toContain("SECRET_HIDDEN_MARKER");
	});

	it("excludes aria-hidden elements", () => {
		const html =
			'<html><body><p>Visible text that is long enough to read normally without any special treatment at all.</p><p aria-hidden="true">SECRET_ARIA_MARKER</p></body></html>';
		expect(extractCleanText(html)).not.toContain("SECRET_ARIA_MARKER");
	});

	it("excludes nav and footer boilerplate", () => {
		const html =
			"<html><body><nav>Home About Contact NAV_MARKER</nav><p>Visible text that is long enough to read normally without any special treatment at all.</p><footer>Copyright FOOTER_MARKER</footer></body></html>";
		const result = extractCleanText(html);
		expect(result).not.toContain("NAV_MARKER");
		expect(result).not.toContain("FOOTER_MARKER");
	});

	it("excludes HTML comments", () => {
		const html =
			"<html><body><p>Visible text that is long enough to read normally without any special treatment at all.</p><!-- SECRET_COMMENT_MARKER --></body></html>";
		expect(extractCleanText(html)).not.toContain("SECRET_COMMENT_MARKER");
	});

	it("collapses whitespace runs into single spaces", () => {
		const html = "<html><body><p>Hello   \n\n   world.\t\tThis  is   a   test.</p></body></html>";
		const result = extractCleanText(html);
		expect(result).not.toMatch(/\s{2,}/);
		expect(result).toContain("Hello world");
	});

	it("bounds output to the default max length", () => {
		const longParagraph = `<p>${"word ".repeat(2000)}</p>`;
		const html = `<html><body>${longParagraph}</body></html>`;
		expect(extractCleanText(html).length).toBeLessThanOrEqual(6000);
	});

	it("bounds output to a custom max length", () => {
		const longParagraph = `<p>${"word ".repeat(2000)}</p>`;
		const html = `<html><body>${longParagraph}</body></html>`;
		expect(extractCleanText(html, 50).length).toBeLessThanOrEqual(50);
	});

	it("falls back to body text when Readability can't isolate an article", () => {
		const html = "<html><body><p>Short.</p></body></html>";
		expect(extractCleanText(html)).toContain("Short.");
	});
});
