#!/usr/bin/env tsx
/**
 * Generates static AnswerEcho brand icon assets served from /icons/*.
 *
 * Output directory: apps/web/public/icons/
 *
 * SVG (vector, used by modern browsers as `<link rel="icon">`):
 *   - answerecho-icon.svg           The mark: ink "a" on the green rounded square
 *   - answerecho-icon-maskable.svg  Maskable variant, full-bleed green with safe-zone padding
 *
 * PNG (raster, required by the PWA manifest + iOS touch icon):
 *   - answerecho-icon-96.png               Standard, 96×96 (desktop PNG favicon)
 *   - answerecho-icon-192.png              Standard, 192×192 (PWA manifest)
 *   - answerecho-icon-512.png              Standard, 512×512 (PWA manifest)
 *   - answerecho-icon-maskable-192.png     Maskable, 192×192 (PWA manifest)
 *   - answerecho-icon-maskable-512.png     Maskable, 512×512 (PWA manifest)
 *   - apple-touch-icon.png           iOS home-screen icon, 180×180, opaque bg
 *
 * ICO (classic Windows favicon, referenced as `/icons/favicon.ico`):
 *   - favicon.ico   Multi-resolution (16, 32, 48) PNG-in-ICO
 *
 * SVGs embed the Ubuntu Bold WOFF2 font as base64 so they render without any
 * external fetches. PNGs are rasterized with Takumi (same pipeline used by the
 * brand-kit generator) so the glyph matches across formats.
 *
 * Usage:
 *   npx tsx apps/web/scripts/generate-brand-icons.tsx
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ANSWERECHO_BRAND_COLOR, ANSWERECHO_BRAND_FONT, ANSWERECHO_INK_COLOR } from "@workspace/config/constants";
import { renderOgPng } from "@workspace/og/rasterize";
import pngToIco from "png-to-ico";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const OUTPUT_DIR = resolve(__dirname, "../public/icons");

// The mark from the brand sheet: lowercase "a" in ink on the green rounded
// square. Glyph is ~65% of the box, corner radius ~26%.
const GLYPH = "a";
const GLYPH_RATIO = 0.65;
const RADIUS_RATIO = 0.26;

// ---------------------------------------------------------------------------
// SVG icons — hand-built strings with Ubuntu Bold embedded as base64
// ---------------------------------------------------------------------------

const UBUNTU_BOLD = readFileSync(require.resolve("@fontsource/ubuntu/files/ubuntu-latin-700-normal.woff2"));

function fontFaceRule(base64: string): string {
	return `@font-face { font-family: '${ANSWERECHO_BRAND_FONT}'; font-weight: 700; src: url(data:font/woff2;base64,${base64}) format('woff2'); }`;
}

/** Standard icon — the mark at full size in a 128×128 viewBox. */
function buildStandardSvg(fontBase64: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <style>${fontFaceRule(fontBase64)}</style>
  <rect width="128" height="128" rx="${Math.round(128 * RADIUS_RATIO)}" fill="${ANSWERECHO_BRAND_COLOR}"/>
  <text x="50%" y="67%" font-family="'${ANSWERECHO_BRAND_FONT}', sans-serif" font-size="${Math.round(128 * GLYPH_RATIO)}" font-weight="700" fill="${ANSWERECHO_INK_COLOR}" text-anchor="middle" dominant-baseline="middle">${GLYPH}</text>
</svg>`;
}

/**
 * Maskable icon — full-bleed green (adaptive icon contexts crop their own
 * shape), glyph held inside the inner ~80% safe zone.
 */
function buildMaskableSvg(fontBase64: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <style>${fontFaceRule(fontBase64)}</style>
  <rect width="128" height="128" fill="${ANSWERECHO_BRAND_COLOR}"/>
  <text x="50%" y="66%" font-family="'${ANSWERECHO_BRAND_FONT}', sans-serif" font-size="${Math.round(128 * GLYPH_RATIO * 0.8)}" font-weight="700" fill="${ANSWERECHO_INK_COLOR}" text-anchor="middle" dominant-baseline="middle">${GLYPH}</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// PNG icons — rendered via Takumi (JSX → image), matches brand-kit sizing
// ---------------------------------------------------------------------------

const fonts = [{ name: ANSWERECHO_BRAND_FONT, data: UBUNTU_BOLD, style: "normal" as const, weight: 700 as const }];

async function renderPng(element: React.ReactElement, size: number): Promise<Buffer> {
	return renderOgPng(element, { width: size, height: size, fonts });
}

function Mark({
	size,
	rounded = true,
	glyphRatio = GLYPH_RATIO,
}: {
	size: number;
	rounded?: boolean;
	glyphRatio?: number;
}) {
	return (
		<div
			tw="flex items-center justify-center w-full h-full"
			style={{
				backgroundColor: ANSWERECHO_BRAND_COLOR,
				borderRadius: rounded ? Math.round(size * RADIUS_RATIO) : 0,
			}}
		>
			<div
				style={{
					fontFamily: ANSWERECHO_BRAND_FONT,
					fontWeight: 700,
					fontSize: Math.round(size * glyphRatio),
					color: ANSWERECHO_INK_COLOR,
					lineHeight: 1,
					// Optical centering: Ubuntu's lowercase "a" sits low in its em box.
					marginTop: -Math.round(size * 0.06),
				}}
			>
				{GLYPH}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

mkdirSync(OUTPUT_DIR, { recursive: true });

const fontBase64 = UBUNTU_BOLD.toString("base64");

const svgIcons = [
	{ name: "answerecho-icon.svg", build: buildStandardSvg },
	{ name: "answerecho-icon-maskable.svg", build: buildMaskableSvg },
];

for (const { name, build } of svgIcons) {
	writeFileSync(resolve(OUTPUT_DIR, name), build(fontBase64), "utf-8");
	console.log(`  ✓ ${name}`);
}

const pngIcons = [
	{ name: "answerecho-icon-96.png", element: <Mark size={96} />, size: 96 },
	{ name: "answerecho-icon-192.png", element: <Mark size={192} />, size: 192 },
	{ name: "answerecho-icon-512.png", element: <Mark size={512} />, size: 512 },
	// Maskable: full-bleed square, smaller glyph so it survives circular crops.
	{
		name: "answerecho-icon-maskable-192.png",
		element: <Mark size={192} rounded={false} glyphRatio={GLYPH_RATIO * 0.8} />,
		size: 192,
	},
	{
		name: "answerecho-icon-maskable-512.png",
		element: <Mark size={512} rounded={false} glyphRatio={GLYPH_RATIO * 0.8} />,
		size: 512,
	},
	// Apple touch icons must be opaque — iOS rounds the corners itself.
	{ name: "apple-touch-icon.png", element: <Mark size={180} rounded={false} />, size: 180 },
];

for (const { name, element, size } of pngIcons) {
	const buffer = await renderPng(element, size);
	writeFileSync(resolve(OUTPUT_DIR, name), buffer);
	console.log(`  ✓ ${name}`);
}

// ---------------------------------------------------------------------------
// ICO — multi-resolution PNG-in-ICO built from the rendered PNGs.
// Kept at /icons/favicon.ico (not /favicon.ico at the root) so whitelabel
// deployments don't end up serving AnswerEcho's ICO for default browser requests.
// ---------------------------------------------------------------------------

const icoPngs: Buffer[] = [];
for (const size of [16, 32, 48]) {
	icoPngs.push(await renderPng(<Mark size={size} />, size));
}
writeFileSync(resolve(OUTPUT_DIR, "favicon.ico"), await pngToIco(icoPngs));
console.log("  ✓ favicon.ico");

console.log(`\nIcons written to ${OUTPUT_DIR}`);
