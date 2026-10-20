#!/usr/bin/env tsx
/**
 * Generates the Enrigio brand kit as a zip of PNGs using Takumi (JSX → PNG).
 *
 * Output: apps/web/enrigio-brand-kit.zip
 *
 *   Icons (square, the mark):
 *     enrigio-icon-{size}.png              Transparent background
 *     enrigio-icon-white-{size}.png        White background
 *     enrigio-icon-dark-{size}.png         Dark background
 *     enrigio-icon-maskable-{size}.png     Maskable/PWA (white bg, safe-zone padding)
 *
 *   Logos ("Enrigio" wordmark, sm/md/lg × 3 backgrounds):
 *     enrigio-logo[-white|-dark]-{sm|md|lg}.png
 *
 *   OG images (1200×630):
 *     og-default.png                    Default Open Graph image
 *
 *   Social banners:
 *     twitter-banner.png                3000×1000 (Twitter/X header)
 *     linkedin-banner.png               3384×573 (LinkedIn personal)
 *
 * Usage:
 *   pnpm --filter @workspace/web generate-brand-kit
 */
import { createWriteStream, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_APP_NAME, ENRIGIO_BRAND_COLOR, ENRIGIO_INK_COLOR } from "@workspace/config/constants";
import { renderOgPng } from "@workspace/og/rasterize";
import { OG_HEIGHT, OG_WIDTH, renderOgImage } from "@workspace/og/render";
import { ZipArchive } from "archiver";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const BRAND_COLOR = ENRIGIO_BRAND_COLOR;
const INK = ENRIGIO_INK_COLOR;
const SITE_URL = "https://www.rigosis.com";
const OUTPUT_ZIP = resolve(__dirname, "../enrigio-brand-kit.zip");

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

function loadFont(path: string): Buffer {
	return readFileSync(require.resolve(path));
}

const fonts = [
	{
		name: "Ubuntu",
		data: loadFont("@fontsource/ubuntu/files/ubuntu-latin-700-normal.woff2"),
		style: "normal" as const,
		weight: 700 as const,
	},
	{
		name: "Geist Sans",
		data: loadFont("@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff2"),
		style: "normal" as const,
		weight: 400 as const,
	},
	{
		name: "Geist Sans",
		data: loadFont("@fontsource/geist-sans/files/geist-sans-latin-500-normal.woff2"),
		style: "normal" as const,
		weight: 500 as const,
	},
	{
		name: "Geist Mono",
		data: loadFont("@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff2"),
		style: "normal" as const,
		weight: 400 as const,
	},
];

async function render(element: React.ReactElement, width: number, height: number): Promise<Buffer> {
	return renderOgPng(element, { width, height, fonts });
}

// ---------------------------------------------------------------------------
// Icon — the mark: ink "a" on the green rounded square
// ---------------------------------------------------------------------------

function Icon({ bg, size }: { bg?: string; size: number }) {
	return (
		<div tw="flex items-center justify-center w-full h-full" style={{ backgroundColor: bg || "transparent" }}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					width: size,
					height: size,
					backgroundColor: BRAND_COLOR,
					borderRadius: Math.round(size * 0.26),
				}}
			>
				<div
					style={{
						fontFamily: "Ubuntu",
						fontWeight: 700,
						fontSize: Math.round(size * 0.65),
						color: INK,
						lineHeight: 1,
						marginTop: -Math.round(size * 0.06),
					}}
				>
					a
				</div>
			</div>
		</div>
	);
}

function MaskableIcon({ size }: { size: number }) {
	return (
		<div tw="flex items-center justify-center w-full h-full" style={{ backgroundColor: BRAND_COLOR }}>
			<div
				style={{
					fontFamily: "Ubuntu",
					fontWeight: 700,
					fontSize: Math.round(size * 0.52),
					color: INK,
					lineHeight: 1,
					marginTop: -Math.round(size * 0.05),
				}}
			>
				a
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Logo — "Enrigio" wordmark with equal padding on all sides
// ---------------------------------------------------------------------------

function Logo({ bg, fontSize }: { bg?: string; fontSize: number }) {
	const onDark = bg === "#111827";
	return (
		<div tw="flex items-center justify-center w-full h-full" style={{ backgroundColor: bg || "transparent" }}>
			<div style={{ display: "flex", fontFamily: "Ubuntu", fontWeight: 700, fontSize, lineHeight: 1 }}>
				<div style={{ color: onDark ? "#ffffff" : INK }}>Answer</div>
				<div style={{ color: onDark ? "#4ade80" : "#277a33" }}>Echo</div>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// PatternBanner — repeating "Enrigio" wordmark at an angle, wrapping-paper style.
// ---------------------------------------------------------------------------

function PatternBanner({
	width,
	height,
	bg,
	colors,
	angle,
	fontScale,
}: {
	width: number;
	height: number;
	bg: string;
	colors: readonly string[];
	angle: number;
	fontScale: number;
}) {
	const fontSize = Math.round(height * fontScale);
	const wordWidth = Math.round(fontSize * 3.2);
	const gap = Math.round(fontSize * 0.5);
	const cellWidth = wordWidth + gap;
	const rowHeight = Math.round(fontSize * 1.5);

	const diagonal = Math.ceil(Math.sqrt(width * width + height * height));
	const gridSize = Math.round(diagonal * 1.5);

	const cols = Math.ceil(gridSize / cellWidth) + 2;
	const rows = Math.ceil(gridSize / rowHeight) + 2;

	const offsetX = -Math.round((gridSize - width) / 2);
	const offsetY = -Math.round((gridSize - height) / 2);

	const rowElements: React.ReactElement[] = [];
	for (let r = 0; r < rows; r++) {
		const cells: React.ReactElement[] = [];
		const brickOffset = r % 2 === 0 ? 0 : Math.round(cellWidth * 0.5);
		for (let c = 0; c < cols; c++) {
			const colorIdx = (r * 3 + c) % colors.length;
			cells.push(
				<div
					style={{
						fontFamily: "Ubuntu",
						fontWeight: 700,
						fontSize,
						color: colors[colorIdx],
						lineHeight: 1,
						marginRight: gap,
					}}
				>
					Enrigio
				</div>,
			);
		}
		rowElements.push(
			<div
				style={{
					display: "flex",
					marginLeft: brickOffset,
					height: rowHeight,
					alignItems: "center",
				}}
			>
				{cells}
			</div>,
		);
	}

	return (
		<div tw="flex w-full h-full relative overflow-hidden" style={{ backgroundColor: bg, opacity: 0.99 }}>
			<div
				style={{
					position: "absolute",
					display: "flex",
					flexDirection: "column",
					transform: `rotate(${angle}deg)`,
					left: offsetX,
					top: offsetY,
					width: gridSize,
					height: gridSize,
				}}
			>
				{rowElements}
			</div>
		</div>
	);
}

const files: { name: string; data: Buffer }[] = [];

async function addFile(name: string, data: Buffer | Promise<Buffer>) {
	const resolved = await data;
	files.push({ name, data: resolved });
	console.log(`  ✓ ${name}`);
}

console.log("Generating brand kit…\n");

// Icons — the mark, bg varies
const iconVariants = [
	{ suffix: "", bg: undefined },
	{ suffix: "-white", bg: "#ffffff" },
	{ suffix: "-dark", bg: "#111827" },
];
const iconSizes = [16, 32, 64, 128, 256, 512];

console.log("Icons:");
for (const v of iconVariants) {
	for (const size of iconSizes) {
		await addFile(`icons/enrigio-icon${v.suffix}-${size}.png`, render(<Icon bg={v.bg} size={size} />, size, size));
	}
}

console.log("\nIcons — Maskable (PWA):");
for (const size of [64, 128, 256, 512]) {
	await addFile(`icons/enrigio-icon-maskable-${size}.png`, render(<MaskableIcon size={size} />, size, size));
}

// Logos — two-tone wordmark, colors follow the background
console.log("\nLogos:");
const logoBgs = [
	{ suffix: "", bg: undefined },
	{ suffix: "-white", bg: "#ffffff" },
	{ suffix: "-dark", bg: "#111827" },
];
const logoSizes = [
	{ label: "sm", fontSize: 64, w: 190, h: 90 },
	{ label: "md", fontSize: 100, w: 290, h: 140 },
	{ label: "lg", fontSize: 160, w: 470, h: 220 },
	{ label: "xl", fontSize: 240, w: 700, h: 330 },
	{ label: "2xl", fontSize: 360, w: 1050, h: 500 },
];
for (const bg of logoBgs) {
	for (const sz of logoSizes) {
		await addFile(
			`logos/enrigio-logo${bg.suffix}-${sz.label}.png`,
			render(<Logo bg={bg.bg} fontSize={sz.fontSize} />, sz.w, sz.h),
		);
	}
}

// OG
console.log("\nOG Images:");
const ogData = await render(renderOgImage({ appName: DEFAULT_APP_NAME, url: SITE_URL }), OG_WIDTH, OG_HEIGHT);
files.push({ name: "og/og-default.png", data: ogData });
console.log("  ✓ og/og-default.png  (1200×630)");

// Banners — wrapping-paper style, wildly different per platform
console.log("\nSocial Banners:");

const sharedBannerStyle = {
	bg: "#ffffff",
	colors: ["#39b54a", "#277a33", "#1f7a3d", "#4ade80", "#a3e635", "#86efac"],
	angle: 15,
} as const;

await addFile(
	"banners/twitter-banner.png",
	render(<PatternBanner width={3000} height={1000} {...sharedBannerStyle} fontScale={0.105} />, 3000, 1000),
);

await addFile(
	"banners/linkedin-banner.png",
	render(<PatternBanner width={3384} height={573} {...sharedBannerStyle} fontScale={0.18} />, 3384, 573),
);

// Write zip
console.log("\nPacking zip…");

const output = createWriteStream(OUTPUT_ZIP);
const archive = new ZipArchive({ zlib: { level: 9 } });

const done = new Promise<void>((res, rej) => {
	output.on("close", res);
	archive.on("error", rej);
});

archive.pipe(output);

for (const file of files) {
	archive.append(file.data, { name: file.name });
}

await archive.finalize();
await done;

const zipSize = readFileSync(OUTPUT_ZIP).length;
const kb = (zipSize / 1024).toFixed(1);
console.log(`\n✅ enrigio-brand-kit.zip (${kb} KB, ${files.length} files) → ${OUTPUT_ZIP}`);
