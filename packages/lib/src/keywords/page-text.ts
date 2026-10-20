import { parseHTML } from "linkedom";
import { extractCleanText } from "../axo/html";
import type { PageText } from "./types";

const BODY_MAX_CHARS = 50_000;

export function pageTextFromHtml(url: string, html: string): PageText {
	const { document } = parseHTML(html);
	const headings = [
		document.querySelector("title")?.textContent ?? "",
		...[...document.querySelectorAll("h1, h2, h3")].map((el) => el.textContent ?? ""),
	].join(" \n ");
	return { url, headings, body: extractCleanText(html, BODY_MAX_CHARS) };
}
