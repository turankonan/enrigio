/** @jsxRuntime automatic */
// The pragma keeps this file rendering under tsx (the brand-kit script), which
// compiles it outside any tsconfig that sets the automatic JSX runtime.
import { DEFAULT_APP_NAME } from "@workspace/config/constants";
import type { ReactNode } from "react";

export const ACCENT_COLORS = ["#39b54a", "#4ade80", "#277a33", "#1f7a3d"];
export const DEFAULT_TAGLINE = "AI Search Optimization";
export const DEFAULT_DESCRIPTION = "Track and optimize your brand's visibility across AI models.";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const PADDING = 64;

/** Ink ground from the brand sheet; all card text is white or white-alpha. */
const INK = "#32373c";
const WHITE = "#ffffff";
const WHITE_72 = "rgba(255,255,255,0.72)";
const WHITE_55 = "rgba(255,255,255,0.55)";
const WHITE_15 = "rgba(255,255,255,0.15)";
const RING = "rgba(255,255,255,0.07)";

// Only the faces in OG_FONTS exist.
const SANS = "Geist Sans";
const MONO = "Geist Mono";
const WORDMARK = "Ubuntu";

function parseHex(color: string): number | undefined {
	const hex = color.trim().replace(/^#/, "");
	const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
	return /^[0-9a-f]{6}$/i.test(full) ? Number.parseInt(full, 16) : undefined;
}

function withAlpha(rgb: number, alpha: number): string {
	return `rgba(${(rgb >> 16) & 255},${(rgb >> 8) & 255},${rgb & 255},${alpha})`;
}

// Alpha steps down quadratically so the glow stays concentrated near its center.
function glowGradient(rgb: number): string {
	const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => `${withAlpha(rgb, 0.16 * (1 - t) ** 2)} ${t * 60}%`);
	return `radial-gradient(circle, ${stops.join(", ")})`;
}

export interface OgFrameOptions {
	/** Accent colors for the top bar (and the glow, from the first one). */
	accentColors: string[];
	/** Bottom-left footer text, usually the site host. */
	footer?: string;
	children: ReactNode;
}

/**
 * The shared card chrome: ink canvas, concentric echo rings radiating from the
 * right edge, a soft accent glow, a segmented brand bar along the top edge,
 * and a mono footer. Content is laid out in a column inside the padding.
 */
export function OgFrame({ accentColors, footer, children }: OgFrameOptions) {
	const accents = [...new Set(accentColors.map(parseHex).filter((rgb) => rgb !== undefined))];
	const colors = accents.length > 0 ? accents.map((rgb) => withAlpha(rgb, 1)) : [WHITE_15];
	const glow = accents.length > 0 ? glowGradient(accents[0]) : undefined;
	// The echo motif: rings spreading from a point past the right edge.
	const RING_CENTER = { x: OG_WIDTH + 60, y: OG_HEIGHT / 2 };
	const ringRadii = [140, 280, 420, 560, 700, 840];

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				width: "100%",
				height: "100%",
				position: "relative",
				overflow: "hidden",
				backgroundColor: INK,
				fontFamily: SANS,
				color: WHITE,
			}}
		>
			<div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
				{ringRadii.map((r) => (
					<div
						key={`ring${r}`}
						style={{
							position: "absolute",
							left: RING_CENTER.x - r,
							top: RING_CENTER.y - r,
							width: r * 2,
							height: r * 2,
							borderRadius: 9999,
							borderWidth: 2,
							borderStyle: "solid",
							borderColor: RING,
						}}
					/>
				))}
			</div>
			{glow ? (
				<div
					style={{
						position: "absolute",
						top: -260,
						right: -260,
						width: 900,
						height: 900,
						backgroundImage: glow,
					}}
				/>
			) : null}
			<div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: "100%", height: 8 }}>
				{colors.map((color) => (
					<div key={color} style={{ flex: 1, height: "100%", backgroundColor: color }} />
				))}
			</div>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					position: "relative",
					flex: 1,
					paddingTop: PADDING - 8,
					paddingBottom: PADDING - 12,
					paddingLeft: PADDING,
					paddingRight: PADDING,
				}}
			>
				{children}
				{footer ? (
					<div style={{ display: "flex", alignItems: "center", marginTop: "auto" }}>
						<div style={{ fontFamily: MONO, fontSize: 22, color: WHITE_55, letterSpacing: 0.5 }}>{footer}</div>
					</div>
				) : null}
			</div>
		</div>
	);
}

export function OgLabel({ children }: { children: string }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				fontFamily: MONO,
				fontSize: 22,
				letterSpacing: 0.5,
				color: WHITE_72,
				paddingTop: 10,
				paddingBottom: 10,
				paddingLeft: 20,
				paddingRight: 20,
				borderRadius: 999,
				borderWidth: 1,
				borderStyle: "solid",
				borderColor: WHITE_15,
				backgroundColor: "rgba(255,255,255,0.06)",
			}}
		>
			{children}
		</div>
	);
}

export interface OgHeaderOptions {
	appName: string;
	iconDataUri?: string;
	/** Short context shown as a pill on the right, e.g. "Docs" or "Blog". */
	label?: string;
}

/** Wordmark (or whitelabel icon + name) on the left, optional label pill on the right. */
export function OgHeader({ appName, iconDataUri, label }: OgHeaderOptions) {
	const isAnswerEcho = appName === DEFAULT_APP_NAME;
	return (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
			{isAnswerEcho ? (
				// All-white wordmark on the ink ground, per the brand sheet.
				<div
					style={{
						fontFamily: WORDMARK,
						fontSize: 52,
						fontWeight: 700,
						lineHeight: 1,
						color: WHITE,
						letterSpacing: -1,
					}}
				>
					AnswerEcho
				</div>
			) : (
				<div style={{ display: "flex", alignItems: "center" }}>
					{iconDataUri ? (
						<img
							src={iconDataUri}
							alt=""
							width={56}
							height={56}
							style={{ marginRight: 20, objectFit: "contain", borderRadius: 12 }}
						/>
					) : null}
					<div style={{ fontSize: 40, fontWeight: 500, letterSpacing: -0.5, color: WHITE }}>{appName}</div>
				</div>
			)}
			{label ? <OgLabel>{label}</OgLabel> : null}
		</div>
	);
}

// Scale the headline to its length so a nine-word blog title and a one-word
// docs page both fill the card without wrapping past three lines.
function titleFontSize(title: string): number {
	const n = title.length;
	if (n <= 22) return 92;
	if (n <= 40) return 80;
	if (n <= 60) return 68;
	if (n <= 85) return 58;
	return 50;
}

export interface OgImageOptions {
	appName: string;
	title?: string;
	description?: string;
	accentColors?: string[];
	iconDataUri?: string;
	label?: string;
	/** Site or app URL; only its host is shown, in the footer. */
	url?: string;
}

function hostOf(url: string | undefined): string | undefined {
	if (!url) return undefined;
	try {
		return new URL(url).host.replace(/^www\./, "");
	} catch {
		return undefined;
	}
}

export function renderOgImage({ appName, title, description, accentColors, iconDataUri, label, url }: OgImageOptions) {
	const isAnswerEcho = appName === DEFAULT_APP_NAME;
	const colors = isAnswerEcho ? ACCENT_COLORS : (accentColors?.filter(Boolean).slice(0, 4) ?? []);
	const heading = title || DEFAULT_TAGLINE;
	const fontSize = titleFontSize(heading);
	const short = fontSize >= 80;

	return (
		<OgFrame accentColors={colors} footer={hostOf(url)}>
			<OgHeader appName={appName} iconDataUri={iconDataUri} label={label} />
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					justifyContent: "center",
					flex: 1,
					paddingTop: 24,
					paddingBottom: 24,
				}}
			>
				<div
					style={{
						fontSize,
						fontWeight: 500,
						lineHeight: 1.08,
						letterSpacing: -fontSize * 0.03,
						color: WHITE,
						lineClamp: 3,
						textWrap: "balance",
					}}
				>
					{heading}
				</div>
				<div
					style={{
						marginTop: short ? 28 : 22,
						maxWidth: 920,
						fontSize: short ? 32 : 28,
						lineHeight: 1.4,
						color: WHITE_72,
						lineClamp: short ? 3 : 2,
						textWrap: "balance",
					}}
				>
					{description || DEFAULT_DESCRIPTION}
				</div>
			</div>
		</OgFrame>
	);
}
