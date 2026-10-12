#!/usr/bin/env node
// Regenerates project/tokens.json for the AnswerEcho design-system artifact
// from the values the app actually ships: the theme variables in
// apps/web/src/styles.css and the brand/chart constants in
// packages/config/src/constants.ts. Usage notes live here; values never do.
//
//   node design-system/generate-tokens.mjs           # rewrite tokens.json
//   node design-system/generate-tokens.mjs --check   # exit 1 if tokens.json is stale

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const out = join(here, "project/tokens.json");

const css = readFileSync(join(repo, "apps/web/src/styles.css"), "utf8");
const constants = readFileSync(join(repo, "packages/config/src/constants.ts"), "utf8");

function cssVars(selector) {
	const m = css.match(new RegExp(`(?:^|\\n)${selector.replace(".", "\\.")} \\{([^}]*)\\}`));
	if (!m) throw new Error(`no ${selector} block in styles.css`);
	const vars = {};
	for (const [, name, value] of m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) {
		vars[name] = value.trim();
	}
	return vars;
}

function constant(name) {
	const m = constants.match(new RegExp(`${name} = "([^"]+)"`));
	if (!m) throw new Error(`missing ${name} in constants.ts`);
	return m[1];
}

const light = cssVars(":root");
const dark = cssVars(".dark");

const catColors = [
	...constants.slice(constants.indexOf("DEFAULT_CHART_COLORS")).matchAll(/"(#[0-9a-f]{6})"/g),
]
	.slice(0, 11)
	.map((m) => m[1]);
if (catColors.length !== 11) throw new Error("expected 11 categorical chart colors");

const USAGE = {
	background: "Page background.",
	foreground: "Default text on background.",
	card: "Card surfaces.",
	"card-foreground": "Text on card.",
	popover: "Popover, dropdown and tooltip surfaces.",
	"popover-foreground": "Text on popover.",
	primary:
		"Primary actions, links, focus rings. Light = action green #277a33 with white text; dark = #4ade80-range green that holds contrast on dark surfaces and takes ink text.",
	"primary-foreground":
		"Text on primary — white in light mode, ink in dark mode (the dark green fails 4.5:1 with white).",
	secondary: "Secondary buttons and quiet fills.",
	"secondary-foreground": "Text on secondary.",
	muted: "Muted fills: table header rows, skeletons, inset wells.",
	"muted-foreground": "Secondary text, captions, placeholders.",
	accent: "Hover fills on menu items and ghost buttons.",
	"accent-foreground": "Text on accent.",
	destructive: "Destructive actions and error text.",
	border: "Hairline borders and separators.",
	input: "Form control borders.",
	ring: "Focus ring — follows primary so keyboard focus reads as brand green.",
	"chart-1": "shadcn chart slot 1 (generic charts; product charts use the categorical palette below).",
	"chart-2": "shadcn chart slot 2.",
	"chart-3": "shadcn chart slot 3.",
	"chart-4": "shadcn chart slot 4.",
	"chart-5": "shadcn chart slot 5.",
	sidebar: "Sidebar surface.",
	"sidebar-foreground": "Sidebar text.",
	"sidebar-primary": "Active nav item.",
	"sidebar-primary-foreground": "Text on active nav item.",
	"sidebar-accent": "Sidebar hover fill.",
	"sidebar-accent-foreground": "Text on sidebar hover.",
	"sidebar-border": "Sidebar separator.",
	"sidebar-ring": "Sidebar focus ring.",
};

const colorTokens = [
	{
		name: "brand-green",
		value: constant("ANSWERECHO_BRAND_COLOR"),
		usage:
			"Rigosis brand green. Fills, highlights and the logo mark only — it never carries white text (2.9:1 on white).",
	},
	{
		name: "action-green",
		value: constant("ANSWERECHO_ACTION_COLOR"),
		usage:
			"Darkened brand green for interactive elements in light mode; 5.4:1 with white, passes AA. In dark mode use primary instead.",
	},
	{
		name: "ink",
		value: constant("ANSWERECHO_INK_COLOR"),
		usage: "Rigosis dark slate — headings, the wordmark, and the glyph on the green mark.",
	},
	...Object.keys(light)
		.filter((name) => name !== "radius")
		.map((name) => ({
			name,
			value: light[name] === dark[name] ? light[name] : { light: light[name], dark: dark[name] },
			usage: USAGE[name] ?? "",
		})),
	...catColors.map((value, i) => ({
		name: `cat-${i + 1}`,
		value,
		usage:
			i === 0
				? "Categorical chart hue 1 — brand-anchored green, always the first series. Hue order is load-bearing for color-blind separation; never reorder."
				: i === 10
					? "Categorical chart hue 11. DEFAULT_CHART_COLORS expands these 11 hues into 55 colors across five lightness tiers (base, dark, light, muted, deep) — see packages/config/src/constants.ts."
					: `Categorical chart hue ${i + 1}.`,
	})),
];

const basePx = Number.parseFloat(light.radius) * 16;
const rem = (px) => `${px / 16}rem`;

const tokens = {
	name: "AnswerEcho",
	version: 1,
	meta: {
		source: "code",
		repo: "elmo monorepo (design-system/generate-tokens.mjs)",
		package: "packages/ui + apps/web",
		paths: {
			tokens: [
				"apps/web/src/styles.css",
				"packages/ui/src/styles/globals.css",
				"packages/config/src/constants.ts",
			],
			fonts: ["@fontsource/ubuntu", "@fontsource/geist-sans", "@fontsource/geist-mono"],
			assets: ["apps/web/public/icons/"],
			docs: ["UX-BRIEF.md"],
		},
	},
	color: {
		themes: [
			{ id: "light", name: "Light" },
			{ id: "dark", name: "Dark" },
		],
		tokens: colorTokens,
	},
	type: {
		fonts: [
			{ family: "Ubuntu", file: "fonts/ubuntu-latin-700-normal.woff2", weight: "700", style: "normal" },
			{ family: "Geist Sans", file: "fonts/geist-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
			{ family: "Geist Sans", file: "fonts/geist-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
			{ family: "Geist Sans", file: "fonts/geist-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
			{ family: "Geist Mono", file: "fonts/geist-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
		],
		families: {
			display: '"Ubuntu", system-ui, sans-serif',
			sans: '"Geist Sans", ui-sans-serif, system-ui, sans-serif',
			mono: '"Geist Mono", ui-monospace, monospace',
		},
		groups: [
			{
				name: "Wordmark",
				family: "display",
				styles: [
					{
						name: "wordmark",
						fontSize: "24px",
						lineHeight: "32px",
						fontWeight: 700,
						letterSpacing: "-0.025em",
						sample: "AnswerEcho",
						usage:
							'The wordmark and nothing else. Ubuntu Bold, ink with green on the "Echo" half; the app ships only the 700 weight.',
					},
				],
			},
			{
				name: "Text",
				family: "sans",
				styles: [
					{ name: "page-title", fontSize: "24px", lineHeight: "32px", fontWeight: 600, usage: "Page headings." },
					{ name: "heading", fontSize: "18px", lineHeight: "28px", fontWeight: 600, usage: "Card and section headings." },
					{
						name: "body",
						fontSize: "14px",
						lineHeight: "20px",
						fontWeight: 400,
						usage: "Default UI text — the dashboard sets text-sm as its base.",
					},
					{ name: "label", fontSize: "14px", lineHeight: "14px", fontWeight: 500, usage: "Form labels and button text." },
					{
						name: "caption",
						fontSize: "12px",
						lineHeight: "16px",
						fontWeight: 400,
						usage: "Captions, helper text, table metadata — pair with muted-foreground.",
					},
				],
			},
			{
				name: "Data",
				family: "mono",
				styles: [
					{
						name: "code",
						fontSize: "13px",
						lineHeight: "20px",
						fontWeight: 400,
						sample: "GET /api/v1/mentions",
						usage: "Code, API paths, IDs.",
					},
					{
						name: "metric",
						fontSize: "14px",
						lineHeight: "20px",
						fontWeight: 400,
						sample: "48.3%",
						usage: "Tabular numbers in data tables; use tabular-nums where digits align.",
					},
				],
			},
		],
	},
	spacing: {
		note: "Tailwind's 4px scale; these are the steps the dashboard actually leans on.",
		tokens: [
			{ name: "space-1", value: "4px", usage: "Icon-to-label gaps." },
			{ name: "space-2", value: "8px", usage: "Gaps inside controls; badge padding." },
			{ name: "space-3", value: "12px", usage: "Input padding; tight stacks." },
			{ name: "space-4", value: "16px", usage: "Default gap between siblings; page gutter on mobile." },
			{ name: "space-6", value: "24px", usage: "Card padding; section gaps." },
			{ name: "space-8", value: "32px", usage: "Page-level separation." },
		],
	},
	radius: {
		note: `Everything derives from --radius: ${light.radius}.`,
		tokens: [
			{ name: "radius-sm", value: rem(basePx - 4), usage: "Badges, kbd, small chips." },
			{ name: "radius-md", value: rem(basePx - 2), usage: "Buttons, inputs, menu items." },
			{ name: "radius-lg", value: rem(basePx), usage: "The base radius — cards, popovers, dialogs." },
			{ name: "radius-xl", value: rem(basePx + 4), usage: "Large containers and charts." },
		],
	},
};

const json = `${JSON.stringify(tokens, null, "\t")}\n`;

if (process.argv.includes("--check")) {
	const current = readFileSync(out, "utf8");
	if (current !== json) {
		console.error("design-system/project/tokens.json is stale — run: node design-system/generate-tokens.mjs");
		process.exit(1);
	}
	console.log("tokens.json is in sync");
} else {
	writeFileSync(out, json);
	console.log(`wrote ${out} (${colorTokens.length} color tokens)`);
}
