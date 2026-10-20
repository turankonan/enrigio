/**
 * Shared constants used across all deployment configurations
 */

/**
 * Default branding values for local/demo modes
 * These are used when environment variables are not set
 *
 * NOTE: Whitelabel mode does NOT use these defaults - all values must be
 * provided via environment variables.
 */
export const DEFAULT_APP_NAME = "Enrigio";
export const DEFAULT_APP_ICON = "/icons/enrigio-icon.svg";
export const DEFAULT_APP_URL = "http://localhost:3000/";

/**
 * Provider setup guide, linked from SCRAPE_TARGETS errors and the LLMs page.
 * Per-provider anchors are appended to it, so it has to stay the page itself
 * rather than the docs index.
 */
export const PROVIDERS_DOCS_URL = "https://www.rigosis.com/enrigio/docs/providers";

/** The public docs, for the hosted product. In the app itself the API and MCP
 * pages document the deployment the viewer is signed in to. */
export const API_DOCS_URL = "https://www.rigosis.com/enrigio/docs/api";

/**
 * Enrigio brand constants — used for icon generation, manifest, and the brand kit.
 */
export const ENRIGIO_BRAND_COLOR = "#39b54a"; // Rigosis green — fills only, never carries white text (2.9:1)
export const ENRIGIO_BRAND_FONT = "Ubuntu";
export const ENRIGIO_THEME_COLOR = "#39b54a";
export const ENRIGIO_BACKGROUND_COLOR = "#ffffff";
/** Ink — headings, wordmark, and the glyph on the green mark. */
export const ENRIGIO_INK_COLOR = "#32373c";
/** Darkened brand green for interactive elements; 5.4:1 with white, passes AA. */
export const ENRIGIO_ACTION_COLOR = "#277a33";

/**
 * Default chart colors for the Enrigio product.
 *
 * 11 base hues (Observable + Tableau, anchored to the brand green) expanded
 * into 55 colors across five lightness tiers: base → dark → light →
 * muted → deep. This keeps harmony (same hue families throughout) while
 * supporting charts with many series. Whitelabel deployments override
 * via VITE_CHART_COLORS.
 *
 * Hue order is load-bearing, not decorative. Charts assign colors by slot,
 * so the earliest slots are the ones that end up side by side most often;
 * the order below is the one that keeps the first four furthest apart under
 * protanopia and deuteranopia. Reordering these is a visible change.
 */
export const DEFAULT_CHART_COLORS = [
	// Base
	"#1f7a3d",
	"#efb118",
	"#ff8ab7",
	"#9c6b4e",
	"#7cb342",
	"#b07aa1",
	"#a463f2",
	"#3ca951",
	"#9498a0",
	"#ff725c",
	"#38b2ac",
	// Dark
	"#14582b",
	"#bb8807",
	"#fa478c",
	"#714932",
	"#58842a",
	"#934d7f",
	"#7c1af4",
	"#247a35",
	"#5e6d8d",
	"#f9381a",
	"#22817c",
	// Light
	"#5fae79",
	"#ebc566",
	"#f877a9",
	"#b09382",
	"#9fc17b",
	"#c6a9be",
	"#b282ed",
	"#6fbe7f",
	"#a9b3c6",
	"#f88877",
	"#6ec4c0",
	// Muted
	"#4e8a63",
	"#d0aa49",
	"#eb84ac",
	"#967664",
	"#839b69",
	"#af88a4",
	"#ae87de",
	"#62936c",
	"#8e9ab4",
	"#ea8e80",
	"#5f9b98",
	// Deep
	"#0d3b1e",
	"#84620b",
	"#f9156d",
	"#493327",
	"#3e5822",
	"#6b435f",
	"#6513c9",
	"#1e5229",
	"#49566e",
	"#db2206",
	"#1c5451",
];

/** Here rather than beside the auth server so the deployment policy rules can
 * read it without pulling better-auth and a database pool into them. */
export const MCP_PATH = "/api/mcp";

/** Where an interrupted MCP sign-in resumes. Named here so the sign-in page
 * need not know the auth base path or the plugin's own. */
export const MCP_AUTHORIZE_ENDPOINT = "/api/auth/oauth2/authorize";
