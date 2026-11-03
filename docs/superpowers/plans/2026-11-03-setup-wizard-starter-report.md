# Setup Wizard and Starter Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A logged-in user adds a brand through a 5-step wizard (site → questions → rivals → engines → first scan), watches the first scan arrive live, and opens a frozen starter report.

**Architecture:** The wizard replaces `PromptWizard` on the brand route while `brands.onboarded` is false and keeps its working state in `brands.setup_draft`. Starting the scan claims the brand and writes everything in one transaction plus a `first_scans` row (one per brand) that lists every expected prompt × engine pair, then enqueues one `process-prompt` job per prompt carrying `firstScanId`; the worker runs those once per engine and stamps `first_scan_id` on runs and failure events. Completion is "every expected pair finished". The report is a snapshot built from that scan's runs and stored in `starter_reports`.

**Tech Stack:** TypeScript, TanStack Start server functions + TanStack Query, React + shadcn (`@workspace/ui`), Drizzle + PostgreSQL, pg-boss worker, zod, Vitest, i18n via `t()` with `apps/web/src/locales/{en,tr}.json`.

**Spec:** `docs/superpowers/specs/2026-11-03-setup-wizard-starter-report-design.md`

## Global Constraints

- pnpm only. Focused tests: `cd packages/lib && pnpm exec vitest run <file>`, `cd apps/web && pnpm exec vitest run --project=unit <file>`, `cd apps/worker && pnpm exec vitest run <file>`. Type checks: `pnpm --filter @workspace/<pkg> check-types`. `pnpm lint` must pass before hand-back; never add `biome-ignore`; run `pnpm lint:fix` for formatting.
- Migrations: `cd packages/lib && pnpm exec drizzle-kit generate --name <name>`. **Never run `drizzle-kit migrate`** (Render applies migrations on deploy).
- Server modules that export anything besides `createServerFn` stubs are shipped whole to the client. Keep `*-core.ts` (plain functions, db imports) separate from `*.ts` (server functions only), as `onboarding.ts` / `onboarding-core.ts` do. Route and component files import from `@workspace/lib/db/schema` with `import type` only.
- Every user-visible string goes through `t("setup.…")` / `t("starter_report.…")` with entries in **both** `apps/web/src/locales/en.json` and `tr.json`; Turkish copy comes from the board, English is the equivalent.
- First-scan runs: replication 1, limited to the scan's engines, stamped with `first_scan_id`; regular tracking after the scan is unchanged.
- Starting the scan is one transaction that first claims the brand with a guarded `onboarded = false → true` update (second caller gets `AlreadyStartedError`), and `first_scans.brand_id` is unique; enqueue happens after commit and is retried by the status poll; job `singletonKey: first-scan-${promptId}`.
- Scan words: *done* = run saved, *failed* = failure event, *missing* = no outcome, *settled* = nothing missing. `complete` needs settled and zero failures; coverage and the 50 % partial threshold count successes only; `partial` is final.
- Report snapshot numbers are computed once from runs with the scan's `first_scan_id` and never recomputed; `partial` only via the user's action at ≥ 50 % successful pairs.
- No fixed duration is promised anywhere; `etaSeconds` is null until 5 pairs finished.
- Commit subjects are plain imperative sentences. Comments explain why only. Mark deliberate shortcuts with `// ponytail:`.
- Phase 1b items (public sign-up, plans, share links, PDF, email, locks) are out of scope; do not add them.

---

## File map

| File | Responsibility |
|---|---|
| `packages/lib/src/db/schema.ts` + migration 0028 | `brands.sector/location/setupDraft`, `firstScans`, `prompt_runs.firstScanId`, `usage_events.firstScanId`, `starterReports` |
| `packages/lib/src/website-excerpt.ts` (+ test) | Direct-HTML fallback through `safeFetch` |
| `packages/lib/src/onboarding/analyze.ts` (+ test) | `sector`, `location`, `marketKey`; exactly 16 unbranded (4/intent) + 3 branded, in the market language |
| `apps/worker/src/jobs/process-prompt.ts` (+ test) | `firstScanId` job field handling |
| `apps/web/src/lib/setup-wizard.ts` (+ test) | Pure wizard rules: draft shape, preselection, limits, engine defaults, estimate, expected pairs |
| `apps/web/src/server/first-scan-core.ts` (+ test) | `startFirstScan`, `enqueueFirstScanJobs`, `getFirstScanStatus`, `openPartialFirstScan`, `retryFirstScan` |
| `apps/web/src/server/first-scan.ts` | Server functions wrapping the above + `saveSetupDraftFn` |
| `apps/web/src/server/starter-report-core.ts` (+ test) | `buildStarterReport` (pure) + `getOrBuildStarterReport`, `retryStarterReportSection` |
| `apps/web/src/server/starter-report.ts` | Server functions |
| `apps/web/src/lib/postgres-read.ts` | `getFirstScanRuns`, `getFirstScanFinishedPairs`, `getFirstScanRivalCitations` |
| `apps/web/src/routes/_authed/app/org/$org/new.tsx` | URL-only entry, enqueues analysis |
| `apps/web/src/components/setup-wizard/*.tsx` | `SetupWizard`, `StepSite`, `StepQuestions`, `StepRivals`, `StepEngines`, `StepFirstScan`, `Stepper` |
| `apps/web/src/routes/_authed/app/org/$org/brand/$brand/index.tsx` | Render `SetupWizard` while not onboarded |
| `apps/web/src/routes/_authed/app/org/$org/brand/$brand/report.tsx` + `components/starter-report/*.tsx` | Report page |
| `apps/web/src/routes/_authed/app/org/$org/brand/$brand/settings/brand.tsx`, `apps/web/src/server/brands.ts` | Sector and location fields |
| `apps/web/src/locales/en.json`, `tr.json` | Strings |

---

### Task 1: Schema and migration

**Files:**
- Modify: `packages/lib/src/db/schema.ts` (enums near line 28; `brands` ~43–72; `promptRuns` ~113; `usageEvents` ~370; add two tables after `opportunityDismissals`)
- Create (generated): `packages/lib/src/db/migrations/0028_first_scans.sql`

**Interfaces:**
- Produces: `firstScanStatusEnum` (`queued | running | complete | partial`), `firstScans` table, `starterReports` table, `brands.sector`, `brands.location`, `brands.setupDraft`, `promptRuns.firstScanId`, `usageEvents.firstScanId`; types `FirstScan`, `StarterReportRow`, `FirstScanExpectedPair = { promptId: string; model: string }`.

- [ ] **Step 1: Add the enum, columns and tables**

After `keywordCheckStatusEnum`:

```ts
export const firstScanStatusEnum = pgEnum("first_scan_status", ["queued", "running", "complete", "partial"]);

/** One prompt × engine the first scan must produce. */
export interface FirstScanExpectedPair {
	promptId: string;
	model: string;
}
```

In `brands`, after `keywords`:

```ts
		/** From the setup analysis, e.g. "fizyoterapi merkezi". Editable in settings. */
		sector: text("sector"),
		/** City or region the business serves, from the setup analysis. */
		location: text("location"),
		// The wizard's unsaved state, so "continue later" resumes where the user
		// left off; cleared when the first scan starts.
		setupDraft: jsonb("setup_draft"),
```

In `promptRuns`, after `accuracyClaims`:

```ts
		// Set only on runs produced by a first scan; the starter report is built
		// from exactly these rows.
		firstScanId: uuid("first_scan_id"),
```

In `usageEvents`, after `promptId`:

```ts
		firstScanId: uuid("first_scan_id"),
```

After `opportunityDismissals`:

```ts
export const firstScans = pgTable(
	"first_scans",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		// One first scan per brand: the unique index is what makes a double
		// "start" click or two concurrent requests collapse into one scan.
		brandId: text("brand_id")
			.references(() => brands.id)
			.notNull()
			.unique(),
		status: firstScanStatusEnum("status").notNull().default("queued"),
		expected: jsonb("expected").$type<FirstScanExpectedPair[]>().notNull(),
		startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
		// Null until every job was handed to pg-boss; the status poll retries the
		// enqueue while it is null.
		enqueuedAt: timestamp("enqueued_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
	},
).enableRLS();

export type FirstScan = typeof firstScans.$inferSelect;

export const starterReports = pgTable(
	"starter_reports",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		brandId: text("brand_id")
			.references(() => brands.id)
			.notNull()
			.unique(),
		firstScanId: uuid("first_scan_id")
			.references(() => firstScans.id)
			.notNull(),
		report: jsonb("report").notNull(),
		/** finished ÷ expected pairs at build time, 0..1 */
		coverage: real("coverage").notNull(),
		partial: boolean("partial").notNull().default(false),
		missingSections: text("missing_sections").array().notNull().default([]),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		finalizedAt: timestamp("finalized_at", { withTimezone: true }),
	},
).enableRLS();

export type StarterReportRow = typeof starterReports.$inferSelect;
```

Add `real` to the drizzle-orm/pg-core import if missing. The status poll filters both tables by scan id every few seconds, so add to the `promptRuns` index block `firstScanIdx: index("prompt_runs_first_scan_id_idx").on(table.firstScanId).where(sql\`first_scan_id IS NOT NULL\`)` and to the `usageEvents` index block `firstScanIdx: index("usage_events_first_scan_id_idx").on(table.firstScanId).where(sql\`first_scan_id IS NOT NULL\`)` (import `sql` from `drizzle-orm` if the file does not already).

- [ ] **Step 2: Generate the migration**

```bash
cd packages/lib && DATABASE_URL=postgres://x pnpm exec drizzle-kit generate --name first_scans
```

Expected: `src/db/migrations/0028_first_scans.sql` with `CREATE TYPE "public"."first_scan_status"`, `CREATE TABLE "first_scans"`, `CREATE TABLE "starter_reports"` (with a unique constraint on `brand_id`), `ALTER TABLE "brands" ADD COLUMN "sector"/"location"/"setup_draft"`, `ALTER TABLE "prompt_runs" ADD COLUMN "first_scan_id" uuid`, `ALTER TABLE "usage_events" ADD COLUMN "first_scan_id" uuid`, two partial `CREATE INDEX ... WHERE first_scan_id IS NOT NULL`, a unique constraint on `first_scans.brand_id`, plus `meta/0028_snapshot.json` and `_journal.json`. Confirm no `DEFAULT` on `setup_draft` or `first_scan_id`.

- [ ] **Step 3: Type-check and run lib tests**

Run: `pnpm --filter @workspace/lib check-types && cd packages/lib && pnpm exec vitest run`
Expected: clean, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/lib/src/db
git commit -m "add first scan and starter report tables"
```

---

### Task 2: Safe fetch for the website excerpt fallback

**Files:**
- Modify: `packages/lib/src/website-excerpt.ts:86-110` (`fromReadability`)
- Create: `packages/lib/src/website-excerpt.test.ts` (if one exists, add to it)

**Interfaces:**
- Consumes: `safeFetch(url, { allowHosts, accept: "html", timeoutMs })` from `./net/safe-fetch` returning `{ status, body, contentType, finalUrl }`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/lib/src/website-excerpt.test.ts (append or create)
import { describe, expect, it, vi } from "vitest";

const safeFetch = vi.hoisted(() => vi.fn());
const lookup = vi.hoisted(() => vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]));
vi.mock("./net/safe-fetch", async (importOriginal) => ({ ...(await importOriginal<object>()), safeFetch }));
vi.mock("node:dns/promises", () => ({ lookup }));
// Jina is tried first; make it fail so the fallback runs.
vi.stubGlobal(
	"fetch",
	vi.fn(async () => ({ ok: false, status: 503, headers: new Headers(), text: async () => "" })),
);

const { getWebsiteExcerpt } = await import("./website-excerpt");

describe("website excerpt fallback", () => {
	it("fetches the page through safeFetch, allowing only the site's apex and www hosts", async () => {
		safeFetch.mockResolvedValue({
			status: "ok",
			httpStatus: 200,
			finalUrl: "https://acme.example/",
			contentType: "text/html",
			body: "<html><body><article><h1>Acme</h1><p>We make widgets for everyone in Istanbul.</p></article></body></html>",
		});
		const excerpt = await getWebsiteExcerpt("https://acme.example/");
		expect(excerpt).toContain("widgets");
		expect(safeFetch).toHaveBeenCalledWith(
			"https://acme.example/",
			expect.objectContaining({ allowHosts: ["acme.example", "www.acme.example"], accept: "html" }),
		);
	});

	it("refuses a private address before contacting Jina or the site", async () => {
		(globalThis.fetch as ReturnType<typeof vi.fn>).mockClear();
		safeFetch.mockClear();
		const excerpt = await getWebsiteExcerpt("http://10.0.0.1/");
		expect(excerpt).toBe("");
		expect(globalThis.fetch).not.toHaveBeenCalled();
		expect(safeFetch).not.toHaveBeenCalled();
	});

	it("refuses a hostname that resolves to a private address", async () => {
		lookup.mockResolvedValueOnce([{ address: "192.168.1.10", family: 4 }]);
		(globalThis.fetch as ReturnType<typeof vi.fn>).mockClear();
		const excerpt = await getWebsiteExcerpt("https://intranet.example/");
		expect(excerpt).toBe("");
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});
});
```

`getWebsiteExcerpt` (line 33) returns `""` when both sources fail; `safeFetch` already checks the content type for `accept: "html"`, so the extra `contentType` guard below is belt and braces and can be dropped if it duplicates.

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/lib && pnpm exec vitest run src/website-excerpt.test.ts`
Expected: FAIL (the fallback still calls the global `fetch`, so `safeFetch` is never called; the private address reaches Jina).

- [ ] **Step 3: Implement**

Gate the URL once, before either source, in `getWebsiteExcerpt` right after `cleanUrl` is built:

```ts
import { lookup } from "node:dns/promises";
import { isDisallowedAddress, safeFetch } from "./net/safe-fetch";

/**
 * Jina fetches on our behalf, so safeFetch's per-hop checks never see that
 * request: refuse anything but a public http(s) host up front.
 * ponytail: resolve-then-fetch, so a DNS rebind between the two is not covered;
 * the direct path re-checks every hop through safeFetch.
 */
async function isPublicWebsite(url: string): Promise<boolean> {
	let u: URL;
	try {
		u = new URL(url);
	} catch {
		return false;
	}
	if (u.protocol !== "http:" && u.protocol !== "https:" || u.username || u.password) return false;
	try {
		const addresses = await lookup(u.hostname, { all: true });
		return addresses.length > 0 && addresses.every((a) => !isDisallowedAddress(a.address));
	} catch {
		return false;
	}
}
```

and in `getWebsiteExcerpt`:

```ts
	if (!(await isPublicWebsite(cleanUrl))) {
		console.warn(`[website-excerpt] refusing non-public url ${cleanUrl}`);
		return "";
	}
```

`isDisallowedAddress` is exported from `./net/safe-fetch:173` and already covers loopback, private, link-local, metadata and IPv6-mapped ranges; a literal IP hostname goes through `lookup` unchanged and is checked the same way.

Then replace the body of `fromReadability` up to the `parseHTML` line:

```ts

/** The site's own apex and www hosts; a redirect anywhere else is refused. */
function allowedHosts(url: string): string[] {
	const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
	return [host, `www.${host}`];
}

async function fromReadability(url: string): Promise<string | null> {
	// A user-supplied URL must never reach a bare fetch: safeFetch refuses
	// private, loopback, link-local and metadata addresses and re-checks every
	// redirect hop against the allow-list.
	const result = await safeFetch(url, { allowHosts: allowedHosts(url), accept: "html", timeoutMs: DIRECT_TIMEOUT_MS });
	if (result.status !== "ok" || !result.body) return null;
	if (!(result.contentType ?? "").includes("html")) return null;
	const html = result.body;
	if (!html.trim()) return null;
	const { document } = parseHTML(html);
	// ... the existing Readability code continues unchanged from here
```

Remove the now-unused `BROWSER_UA` header use in this function only if nothing else references it (Jina may). Keep `DIRECT_TIMEOUT_MS`.

- [ ] **Step 4: Run the test and the lib suite**

Run: `cd packages/lib && pnpm exec vitest run src/website-excerpt.test.ts && pnpm exec vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/lib/src/website-excerpt.ts packages/lib/src/website-excerpt.test.ts
git commit -m "refuse non-public websites before fetching their excerpt"
```

---

### Task 3: Analysis extracts sector, location, market and a fixed question set

**Files:**
- Modify: `packages/lib/src/onboarding/analyze.ts` (`buildSchema` ~58–92, `OnboardingSuggestion` ~100–115, `buildAnalysisContext`/`buildPrompt` ~155–300, `normalize` ~300–340)
- Modify: `packages/lib/src/onboarding/analyze.test.ts`

**Interfaces:**
- Produces: `OnboardingSuggestion` gains `sector: string | null`, `location: string | null`, `marketKey: string | null` (one of `MARKET_CATALOG` keys or null); `suggestedPrompts` is normalised to at most 16 unbranded (at most 4 per intent, filled in catalog order discovery, comparison, local, price) followed by at most 3 branded. `AnalyzeBrandOptions` gains `language?: string` (BCP-47 language code, e.g. `"tr"`) used in the prompt.

- [ ] **Step 1: Write the failing tests** (append to the existing `analyze.test.ts`, following its mocked-LLM pattern)

```ts
describe("analyzeBrand profile fields and question set", () => {
	it("returns sector, location and a catalog market key, nulling an unknown market", async () => {
		mockLlm({
			brandName: "Atlas Fizyo",
			additionalDomains: [],
			aliases: [],
			competitors: [],
			suggestedPrompts: [],
			sector: "fizyoterapi merkezi",
			location: "Kadıköy, İstanbul",
			marketKey: "xx-XX",
		});
		const out = await analyzeBrand({ website: "https://atlasfizyo.com" });
		expect(out.sector).toBe("fizyoterapi merkezi");
		expect(out.location).toBe("Kadıköy, İstanbul");
		expect(out.marketKey).toBeNull();
	});

	it("keeps at most 4 unbranded prompts per intent and at most 3 branded, unbranded first", async () => {
		const unbranded = (intent: string, n: number) =>
			Array.from({ length: n }, (_, i) => ({ prompt: `${intent} q${i}`, tags: [], intent }));
		mockLlm({
			brandName: "Atlas Fizyo",
			additionalDomains: [],
			aliases: [],
			competitors: [],
			sector: null,
			location: null,
			marketKey: "tr-TR",
			suggestedPrompts: [
				...unbranded("discovery", 6),
				...unbranded("comparison", 4),
				...unbranded("local", 2),
				...unbranded("price", 5),
				{ prompt: "atlas fizyo güvenilir mi", tags: [], intent: null },
				{ prompt: "atlas fizyo adresi", tags: [], intent: null },
				{ prompt: "atlas fizyo yorumlar", tags: [], intent: null },
				{ prompt: "atlas fizyo fiyat", tags: [], intent: null },
			],
		});
		const out = await analyzeBrand({ website: "https://atlasfizyo.com", brandName: "Atlas Fizyo" });
		const intents = out.suggestedPrompts.map((p) => p.intent);
		expect(intents.filter((i) => i === "discovery")).toHaveLength(4);
		expect(intents.filter((i) => i === "comparison")).toHaveLength(4);
		expect(intents.filter((i) => i === "local")).toHaveLength(2);
		expect(intents.filter((i) => i === "price")).toHaveLength(4);
		expect(intents.filter((i) => i === null)).toHaveLength(3);
		expect(intents.indexOf(null)).toBe(14); // unbranded first
		expect(out.marketKey).toBe("tr-TR");
	});

	it("tells the model which language to write the questions in", async () => {
		mockLlm({ brandName: "Acme", additionalDomains: [], aliases: [], competitors: [], suggestedPrompts: [], sector: null, location: null, marketKey: null });
		await analyzeBrand({ website: "https://acme.example", language: "tr" });
		expect(lastPrompt()).toContain("Turkish");
	});
});
```

`mockLlm` and `lastPrompt` are whatever helpers the existing test file uses to stub `runStructuredResearchPrompt` and read the prompt it received; if it has none, add two small helpers next to its existing `vi.mock` of `./llm`. Branded detection in the normaliser uses the same `isPromptBranded(prompt, brandName, website)` from `../tag-utils` the app uses, so the branded fixtures must contain "atlas fizyo".

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/lib && pnpm exec vitest run src/onboarding/analyze.test.ts`
Expected: the three new tests FAIL.

- [ ] **Step 3: Implement**

In `buildSchema`, add after `aliases`:

```ts
		sector: z
			.string()
			.nullable()
			.describe('What the business is, in 2-5 words in the site\'s language (e.g. "fizyoterapi merkezi", "SaaS invoicing tool"). Null if unclear.'),
		location: z
			.string()
			.nullable()
			.describe('The city or region the business serves, as written on the site (e.g. "Kadıköy, İstanbul"). Null for a global or online-only business.'),
		marketKey: z
			.enum(MARKET_CATALOG.map((m) => m.key) as [string, ...string[]]) // readonly Market[]; keys tr-TR, en-TR, de-DE, en-GB, en-US
			.nullable()
			.describe("The market the site addresses, as language-country: pick from the allowed keys by the site's language and the country it serves. Null if none fits."),
```

and change the `suggestedPrompts` description to:

```ts
			.describe(
				`Exactly ${UNBRANDED_PER_INTENT * PROMPT_INTENTS.length} UNBRANDED buyer questions — ${UNBRANDED_PER_INTENT} for each intent: discovery (finding options, "best X", "which X"), comparison (X vs Y, what to look for), local ("near me", in <city>), price (cost, insurance, what's included) — followed by exactly ${BRANDED_COUNT} BRANDED questions that name the brand (trust/reviews, services/address, alternatives). Write them the way a real customer types into ChatGPT, in the language given in the prompt. ${TAG_GUIDANCE}`,
			),
```

Add constants and imports near the top:

```ts
import { MARKET_CATALOG } from "@workspace/config/markets";
import { PROMPT_INTENTS, type PromptIntent } from "../db/schema";
import { isPromptBranded } from "../tag-utils";

export const UNBRANDED_PER_INTENT = 4;
export const BRANDED_COUNT = 3;
```

`OnboardingSuggestion` gains `sector: string | null; location: string | null; marketKey: string | null;` and `AnalyzeBrandOptions` gains `/** BCP-47 language code the questions are written in; defaults to the site's language. */ language?: string;`.

`buildAnalysisContext` passes `language: options.language` into `buildPrompt`; `buildPrompt` gains a `language?: string` arg and appends, before the "Use web search" line:

```ts
	const languageLine = args.language
		? `Write suggestedPrompts in ${languageName(args.language)}.`
		: "Write suggestedPrompts in the language the site is written in.";
```

with

```ts
const LANGUAGE_NAMES: Record<string, string> = { tr: "Turkish", en: "English", de: "German" };
function languageName(code: string): string {
	return LANGUAGE_NAMES[code.toLowerCase().split("-")[0]] ?? code;
}
```

In `normalize`, after `aliases`:

```ts
	const marketKey = MARKET_CATALOG.some((m) => m.key === raw.marketKey) ? (raw.marketKey as string) : null;
```

and in the returned object add `sector: raw.sector?.trim() || null, location: raw.location?.trim() || null, marketKey,`. Replace the `suggestedPrompts` value with `includePrompts ? selectQuestionSet(normalizePrompts(raw.suggestedPrompts ?? [], Number.MAX_SAFE_INTEGER), brandName, website) : []` and add:

```ts
/**
 * The fixed shape the wizard expects: up to 4 unbranded questions per intent,
 * intents in catalog order, then up to 3 branded. Whatever the model sent
 * beyond that is dropped rather than shown.
 */
export function selectQuestionSet(prompts: OnboardingPrompt[], brandName: string, website: string): OnboardingPrompt[] {
	const branded = prompts.filter((p) => isPromptBranded(p.prompt, brandName, website)).slice(0, BRANDED_COUNT);
	const unbranded = prompts.filter((p) => !isPromptBranded(p.prompt, brandName, website));
	const byIntent = PROMPT_INTENTS.flatMap((intent: PromptIntent) =>
		unbranded.filter((p) => p.intent === intent).slice(0, UNBRANDED_PER_INTENT),
	);
	return [...byIntent, ...branded.map((p) => ({ ...p, intent: null }))];
}
```

`normalizePrompts` keeps lowercasing/dedupe; `maxPrompts` is no longer the cap for the wizard set, so pass a large number as above and leave `DEFAULT_MAX_PROMPTS` for other callers (reports). Unbranded prompts with `intent === null` are dropped by `selectQuestionSet` by construction.

- [ ] **Step 4: Run the onboarding tests, the lib suite, type-check**

Run: `cd packages/lib && pnpm exec vitest run src/onboarding && pnpm exec vitest run && cd ../.. && pnpm --filter @workspace/lib check-types`
Expected: PASS. Fix any existing analyze fixtures that now need `sector/location/marketKey` keys (add `sector: null, location: null, marketKey: null`).

- [ ] **Step 5: Commit**

```bash
git add packages/lib/src/onboarding
git commit -m "extract sector, location and market and a fixed question set in brand analysis"
```

---

### Task 4: Worker runs first-scan jobs once per engine and stamps the scan id

**Files:**
- Modify: `apps/worker/src/jobs/process-prompt.ts` (`ProcessPromptData` ~42; `recordUsageEvent` ~296; `savePromptRun` ~206; `runModelIteration` ~318; `processPrompt` ~476–560)
- Modify: `apps/worker/src/jobs/process-prompt.test.ts`

**Interfaces:**
- Consumes: `firstScans` table (Task 1).
- Produces: `ProcessPromptData.firstScanId?: string`; `runModelIteration` takes `firstScanId: string | null`; runs and `prompt_run_failed` events carry `firstScanId`. A first-scan cycle: targets filtered to the scan's expected models for this prompt, replication 1, no due-check, then `scheduleNextRun` as usual.

- [ ] **Step 1: Write the failing tests** (append; the file already mocks the db insert for `promptRuns`, `classifyMention`, and has `makeBrand`, `makeProvider`, `MENTIONING_RESULT`)

```ts
describe("first scan runs", () => {
	beforeEach(() => {
		insertedPromptRuns.length = 0;
		classifyMention.mockReset();
		classifyMention.mockResolvedValue({ sentiment: "neutral", brandRank: 2 });
	});

	it("stamps the scan id on the saved run", async () => {
		await runModelIteration({
			promptId: "prompt_1",
			promptValue: "best widget makers",
			brand: makeBrand(),
			competitorsList,
			config: { model: "chatgpt", provider: "openai-api", webSearch: true },
			providerImpl: makeProvider(async () => MENTIONING_RESULT),
			runIndex: 1,
			effectiveMarket: resolveEffectiveMarket({ defaultMarketKey: null }),
			branded: false,
			firstScanId: "scan-1",
		});
		expect(insertedPromptRuns[0]?.firstScanId).toBe("scan-1");
	});

	it("stamps the scan id on a failure event when the run fails", async () => {
		const failing = makeProvider(async () => {
			throw new Error("boom");
		});
		await expect(
			runModelIteration({
				promptId: "prompt_1",
				promptValue: "best widget makers",
				brand: makeBrand(),
				competitorsList,
				config: { model: "chatgpt", provider: "openai-api", webSearch: true },
				providerImpl: failing,
				runIndex: 1,
				effectiveMarket: resolveEffectiveMarket({ defaultMarketKey: null }),
				branded: false,
				firstScanId: "scan-1",
			}),
		).rejects.toThrow("boom");
		expect(insertedUsageEvents.at(-1)).toMatchObject({ eventType: "prompt_run_failed", firstScanId: "scan-1" });
	});
});

describe("firstScanTargets", () => {
	it("keeps only the scan's engines for this prompt and runs each once", () => {
		const targets = [
			{ config: { model: "chatgpt", provider: "openai-api", webSearch: true }, replication: 5 },
			{ config: { model: "gemini", provider: "dataforseo", webSearch: true }, replication: 5 },
			{ config: { model: "claude", provider: "anthropic-api", webSearch: true }, replication: 5 },
		];
		const expected = [
			{ promptId: "p1", model: "chatgpt" },
			{ promptId: "p1", model: "gemini" },
			{ promptId: "p2", model: "claude" },
		];
		const out = firstScanTargets(targets as never, expected, "p1");
		expect(out.map((t) => [t.config.model, t.replication])).toEqual([
			["chatgpt", 1],
			["gemini", 1],
		]);
	});
});
```

The db mock must capture usage-event inserts: extend the existing `vi.mock("@workspace/lib/db/db")` so that when `table === schema.usageEvents` it pushes `vals` into a new `insertedUsageEvents` array and returns `Promise.resolve(undefined)`. Import `firstScanTargets` from `./process-prompt`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/worker && pnpm exec vitest run src/jobs/process-prompt.test.ts`
Expected: FAIL (`firstScanId` unknown, `firstScanTargets` not exported).

- [ ] **Step 3: Implement**

1. `ProcessPromptData` gains `/** Set on jobs enqueued by a first scan: run once per scan engine and tag the rows. */ firstScanId?: string;`.
2. `savePromptRun` gains a trailing parameter `firstScanId: string | null` written as `firstScanId` in `.values()`.
3. `recordUsageEvent` input gains `firstScanId?: string | null` written as `firstScanId: input.firstScanId ?? null`.
4. `runModelIteration` params gain `firstScanId: string | null`; pass it to `savePromptRun` and to the failure `recordUsageEvent` (and to the success `recordUsageEvent` call after the save, if the success event is recorded there).
5. Add, exported:

```ts
/**
 * A first scan answers every chosen engine exactly once: the scan row lists
 * which engines this prompt owes, and replication is forced to 1 whatever the
 * plan or RUNS_PER_PROMPT would run on a normal day.
 */
export function firstScanTargets<T extends { config: { model: string }; replication: number }>(
	targets: T[],
	expected: FirstScanExpectedPair[],
	promptId: string,
): T[] {
	const models = new Set(expected.filter((p) => p.promptId === promptId).map((p) => p.model));
	return targets.filter((t) => models.has(t.config.model)).map((t) => ({ ...t, replication: 1 }));
}
```

6. In `processPrompt(promptId, scrapeConfigs, consecutiveFailures, firstScanId: string | null)` (add the parameter; `processPromptJob` passes `job.data.firstScanId ?? null`): after `plan` is resolved, when `firstScanId` is set, load the scan (`db.query.firstScans.findFirst({ where: eq(firstScans.id, firstScanId) })`); if missing, log and fall through to the normal path. Otherwise `dueTargets = firstScanTargets(plan.targets, scan.expected, promptId)` and skip the `selectDueTargets` call and the "no targets due" early return (keep the ceiling check). Pass `firstScanId` into every `runModelIteration` call. The trailing `scheduleNextRun(...)` stays as is.
7. Mark the scan `running` the first time a job for it starts: `await db.update(firstScans).set({ status: "running" }).where(and(eq(firstScans.id, firstScanId), eq(firstScans.status, "queued")))`.

Update the four market-stamping tests and the earlier claims tests to pass `firstScanId: null`.

- [ ] **Step 4: Run the worker tests and type-check**

Run: `cd apps/worker && pnpm exec vitest run src/jobs/process-prompt.test.ts && cd ../.. && pnpm --filter @workspace/worker check-types`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/jobs/process-prompt.ts apps/worker/src/jobs/process-prompt.test.ts
git commit -m "run first-scan jobs once per engine and tag their runs"
```

---

### Task 5: Pure wizard rules

**Files:**
- Create: `apps/web/src/lib/setup-wizard.ts`
- Create: `apps/web/src/lib/setup-wizard.test.ts`

**Interfaces:**
- Produces:

```ts
export type SetupStep = 1 | 2 | 3 | 4 | 5;
export interface DraftQuestion { text: string; intent: PromptIntent | null; selected: boolean; custom: boolean }
export interface DraftRival { name: string; site: string; selected: boolean; custom: boolean }
export interface SetupDraft {
  step: SetupStep;
  profile: { name: string; sector: string; location: string; marketKey: string | null; aliases: string[]; additionalDomains: string[] };
  questions: DraftQuestion[];       // unbranded first, then the branded ones (intent null)
  rivals: DraftRival[];
  engines: string[];                 // selected model ids
}
export const MIN_BUYER = 10; export const MAX_BUYER = 16; export const PRESELECT_PER_INTENT = 3; export const MAX_RIVALS = 5;
export const DEFAULT_ENGINES = ["chatgpt", "gemini", "google-ai-overview", "perplexity"];
export function draftFromSuggestion(s: OnboardingSuggestion, availableModels: string[]): SetupDraft
export function selectedBuyerCount(d: SetupDraft): number
export function canContinueFromQuestions(d: SetupDraft): boolean      // 10 ≤ selected buyer ≤ 16
export function toggleQuestion(d: SetupDraft, index: number): SetupDraft  // refuses to exceed MAX_BUYER
export function addCustomQuestion(d: SetupDraft, text: string, intent: PromptIntent): SetupDraft // refuses beyond MAX_BUYER or empty text
export function toggleRival(d: SetupDraft, index: number): SetupDraft    // refuses to exceed MAX_RIVALS
export function addCustomRival(d: SetupDraft, name: string, site: string): SetupDraft
export function defaultEngines(available: string[]): string[]
export function monthlyAnswerEstimate(d: SetupDraft, runsPerDay: number): number // (buyer selected + branded) × engines × 30 × runsPerDay
export function expectedPairs(promptIds: { id: string }[], engines: string[]): FirstScanExpectedPair[]
```

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/setup-wizard.test.ts
import { describe, expect, it } from "vitest";
import {
	addCustomQuestion,
	canContinueFromQuestions,
	defaultEngines,
	draftFromSuggestion,
	expectedPairs,
	MAX_BUYER,
	monthlyAnswerEstimate,
	selectedBuyerCount,
	toggleQuestion,
	toggleRival,
} from "./setup-wizard";

const q = (intent: "discovery" | "comparison" | "local" | "price" | null, i: number) => ({
	prompt: `${intent ?? "brand"} ${i}`,
	tags: [],
	intent,
});
const suggestion = {
	brandName: "Atlas Fizyo",
	website: "atlasfizyo.com",
	additionalDomains: ["atlasfizyo.com.tr"],
	aliases: ["Atlas Fizyoterapi"],
	sector: "fizyoterapi merkezi",
	location: "Kadıköy, İstanbul",
	marketKey: "tr-TR",
	competitors: Array.from({ length: 7 }, (_, i) => ({ name: `Marka ${i}`, domains: [`marka${i}.com`], aliases: [] })),
	suggestedPrompts: [
		...[0, 1, 2, 3].map((i) => q("discovery", i)),
		...[0, 1, 2, 3].map((i) => q("comparison", i)),
		...[0, 1, 2, 3].map((i) => q("local", i)),
		...[0, 1, 2, 3].map((i) => q("price", i)),
		...[0, 1, 2].map((i) => q(null, i)),
	],
};

describe("draftFromSuggestion", () => {
	it("preselects 3 per intent (12), keeps branded questions unselectable, picks the first 5 rivals and the default engines", () => {
		const d = draftFromSuggestion(suggestion as never, ["chatgpt", "gemini", "google-ai-overview", "perplexity", "claude"]);
		expect(selectedBuyerCount(d)).toBe(12);
		expect(d.questions.filter((x) => x.intent === null)).toHaveLength(3);
		expect(d.rivals.filter((r) => r.selected)).toHaveLength(5);
		expect(d.engines).toEqual(["chatgpt", "gemini", "google-ai-overview", "perplexity"]);
		expect(d.profile).toMatchObject({ name: "Atlas Fizyo", sector: "fizyoterapi merkezi", marketKey: "tr-TR" });
		expect(d.step).toBe(1);
	});
});

describe("question rules", () => {
	const d = draftFromSuggestion(suggestion as never, ["chatgpt"]);
	it("needs at least 10 selected buyer questions to continue", () => {
		let x = d;
		for (let i = 0; i < 3; i++) x = toggleQuestion(x, i); // deselect three → 9
		expect(selectedBuyerCount(x)).toBe(9);
		expect(canContinueFromQuestions(x)).toBe(false);
	});
	it("never selects more than 16", () => {
		let x = d;
		for (let i = 0; i < 16; i++) if (!x.questions[i].selected) x = toggleQuestion(x, i);
		expect(selectedBuyerCount(x)).toBe(16);
		x = addCustomQuestion(x, "yeni soru", "local");
		expect(selectedBuyerCount(x)).toBe(16);
		expect(x.questions.some((y) => y.text === "yeni soru")).toBe(false);
	});
	it("adds a custom question selected, with its intent, up to the limit", () => {
		let x = d;
		x = toggleQuestion(x, 0); // 11
		x = addCustomQuestion(x, "  evde fizyoterapi  ", "local");
		expect(x.questions.find((y) => y.text === "evde fizyoterapi")).toMatchObject({ intent: "local", selected: true, custom: true });
		expect(selectedBuyerCount(x)).toBe(12);
	});
	it("ignores empty custom text", () => {
		expect(addCustomQuestion(d, "   ", "price")).toBe(d);
	});
});

describe("rivals and engines", () => {
	it("refuses a sixth rival", () => {
		const d = draftFromSuggestion(suggestion as never, ["chatgpt"]);
		const x = toggleRival(d, 5);
		expect(x.rivals.filter((r) => r.selected)).toHaveLength(5);
	});
	it("tops the preferred engines up to four from whatever else is available", () => {
		expect(defaultEngines(["claude", "copilot", "qwen", "mistral", "grok"])).toEqual(["claude", "copilot", "qwen", "mistral"]);
		expect(defaultEngines(["gemini", "claude"])).toEqual(["gemini", "claude"]);
	});
});

describe("estimates and pairs", () => {
	it("counts branded questions and the real cadence", () => {
		const d = draftFromSuggestion(suggestion as never, ["chatgpt", "gemini"]);
		expect(monthlyAnswerEstimate(d, 1)).toBe((12 + 3) * 2 * 30);
		expect(monthlyAnswerEstimate(d, 4)).toBe((12 + 3) * 2 * 30 * 4);
	});
	it("builds one pair per prompt per engine", () => {
		expect(expectedPairs([{ id: "a" }, { id: "b" }], ["chatgpt", "gemini"])).toEqual([
			{ promptId: "a", model: "chatgpt" },
			{ promptId: "a", model: "gemini" },
			{ promptId: "b", model: "chatgpt" },
			{ promptId: "b", model: "gemini" },
		]);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm exec vitest run --project=unit src/lib/setup-wizard.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/setup-wizard.ts
import type { FirstScanExpectedPair, PromptIntent } from "@workspace/lib/db/schema";
import type { OnboardingSuggestion } from "@workspace/lib/onboarding";

export type SetupStep = 1 | 2 | 3 | 4 | 5;

export interface DraftQuestion {
	text: string;
	intent: PromptIntent | null;
	selected: boolean;
	custom: boolean;
}
export interface DraftRival {
	name: string;
	site: string;
	selected: boolean;
	custom: boolean;
}
export interface SetupDraft {
	step: SetupStep;
	profile: {
		name: string;
		sector: string;
		location: string;
		marketKey: string | null;
		aliases: string[];
		additionalDomains: string[];
	};
	questions: DraftQuestion[];
	rivals: DraftRival[];
	engines: string[];
}

export const MIN_BUYER = 10;
export const MAX_BUYER = 16;
export const PRESELECT_PER_INTENT = 3;
export const MAX_RIVALS = 5;
export const DEFAULT_ENGINES = ["chatgpt", "gemini", "google-ai-overview", "perplexity"];
export const INTENT_ORDER: PromptIntent[] = ["discovery", "comparison", "local", "price"];

export function draftFromSuggestion(s: OnboardingSuggestion, availableModels: string[]): SetupDraft {
	const perIntent = new Map<PromptIntent, number>();
	const questions: DraftQuestion[] = s.suggestedPrompts.map((p) => {
		if (p.intent === null) return { text: p.prompt, intent: null, selected: true, custom: false };
		const n = perIntent.get(p.intent) ?? 0;
		perIntent.set(p.intent, n + 1);
		return { text: p.prompt, intent: p.intent, selected: n < PRESELECT_PER_INTENT, custom: false };
	});
	return {
		step: 1,
		profile: {
			name: s.brandName,
			sector: s.sector ?? "",
			location: s.location ?? "",
			marketKey: s.marketKey,
			aliases: s.aliases,
			additionalDomains: s.additionalDomains,
		},
		questions,
		rivals: s.competitors.map((c, i) => ({ name: c.name, site: c.domains[0] ?? "", selected: i < MAX_RIVALS, custom: false })),
		engines: defaultEngines(availableModels),
	};
}

export const isBuyer = (q: DraftQuestion) => q.intent !== null;

export function selectedBuyerCount(d: SetupDraft): number {
	return d.questions.filter((q) => isBuyer(q) && q.selected).length;
}

export function canContinueFromQuestions(d: SetupDraft): boolean {
	const n = selectedBuyerCount(d);
	return n >= MIN_BUYER && n <= MAX_BUYER;
}

export function toggleQuestion(d: SetupDraft, index: number): SetupDraft {
	const q = d.questions[index];
	if (!q || !isBuyer(q)) return d;
	if (!q.selected && selectedBuyerCount(d) >= MAX_BUYER) return d;
	const questions = d.questions.map((x, i) => (i === index ? { ...x, selected: !x.selected } : x));
	return { ...d, questions };
}

export function addCustomQuestion(d: SetupDraft, text: string, intent: PromptIntent): SetupDraft {
	const clean = text.trim();
	if (!clean || selectedBuyerCount(d) >= MAX_BUYER) return d;
	if (d.questions.some((q) => q.text.toLowerCase() === clean.toLowerCase())) return d;
	// Keep buyer questions ahead of the branded tail.
	const firstBranded = d.questions.findIndex((q) => !isBuyer(q));
	const at = firstBranded === -1 ? d.questions.length : firstBranded;
	const questions = [...d.questions];
	questions.splice(at, 0, { text: clean, intent, selected: true, custom: true });
	return { ...d, questions };
}

export function toggleRival(d: SetupDraft, index: number): SetupDraft {
	const r = d.rivals[index];
	if (!r) return d;
	if (!r.selected && d.rivals.filter((x) => x.selected).length >= MAX_RIVALS) return d;
	return { ...d, rivals: d.rivals.map((x, i) => (i === index ? { ...x, selected: !x.selected } : x)) };
}

export function addCustomRival(d: SetupDraft, name: string, site: string): SetupDraft {
	const n = name.trim();
	if (!n || d.rivals.filter((x) => x.selected).length >= MAX_RIVALS) return d;
	return { ...d, rivals: [...d.rivals, { name: n, site: site.trim(), selected: true, custom: true }] };
}

/** The board's four engines when offered, topped up from the rest so the scan is never one engine wide. */
export function defaultEngines(available: string[]): string[] {
	const preferred = DEFAULT_ENGINES.filter((m) => available.includes(m));
	const rest = available.filter((m) => !preferred.includes(m));
	return [...preferred, ...rest].slice(0, DEFAULT_ENGINES.length);
}

export function monthlyAnswerEstimate(d: SetupDraft, runsPerDay: number): number {
	const prompts = selectedBuyerCount(d) + d.questions.filter((q) => !isBuyer(q)).length;
	return prompts * d.engines.length * 30 * runsPerDay;
}

export function expectedPairs(promptIds: { id: string }[], engines: string[]): FirstScanExpectedPair[] {
	return promptIds.flatMap((p) => engines.map((model) => ({ promptId: p.id, model })));
}

```

- [ ] **Step 4: Run the test**

Run: `cd apps/web && pnpm exec vitest run --project=unit src/lib/setup-wizard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/setup-wizard.ts apps/web/src/lib/setup-wizard.test.ts
git commit -m "add the setup wizard rules"
```

---

### Task 6: First-scan core: start, enqueue, status, retry, open partial

**Files:**
- Create: `apps/web/src/server/first-scan-core.ts`
- Create: `apps/web/src/server/first-scan-core.test.ts`
- Modify: `apps/web/src/lib/postgres-read.ts` (append `getFirstScanFinishedPairs`)
- Modify: `apps/web/src/server/onboarding-core.ts:192` (export `insertCompetitors`)

**Interfaces:**
- Consumes: `firstScans`, `starterReports`, `brands`, `prompts`, `competitors`, `promptRuns`, `usageEvents` (Task 1); `insertPrompts`, `insertCompetitors` from `./onboarding-core` (`insertCompetitors({brandId, websiteHost, source: {name, domains, aliases}[], conn?})`); `getBoss` from `@/lib/boss-client`; `expectedPairs`, `SetupDraft` (Task 5); `createMultiplePromptJobSchedulers` from `@/lib/job-scheduler`.
- Produces:

```ts
export interface StartFirstScanInput { brandId: string; draft: SetupDraft }
export async function startFirstScan(input: StartFirstScanInput): Promise<{ firstScanId: string }>  // throws AlreadyStartedError on a second call
export async function enqueueFirstScanJobs(firstScanId: string): Promise<void>   // idempotent; sets enqueuedAt
export interface FirstScanLatest { promptValue: string; model: string; mentioned: boolean; brandRank: number | null; competitorsMentioned: string[]; createdAt: string }
export interface FirstScanStatus {
  firstScanId: string; status: "queued" | "running" | "complete" | "partial";
  expected: number; done: number; failed: number; mentioned: number; missing: number;
  topRival: { name: string; count: number } | null; latest: FirstScanLatest[];
  etaSeconds: number | null; canOpenPartial: boolean; reportReady: boolean;
}
export async function getFirstScanStatus(firstScanId: string): Promise<FirstScanStatus>   // also retries enqueue + flips complete
export async function retryFirstScan(firstScanId: string): Promise<void>                  // re-sends jobs for prompts with any pair not yet succeeded; no-op once complete/partial
export async function openPartialFirstScan(firstScanId: string): Promise<void>            // done ≥ 50% of expected → status partial (final)
export function computeStatus(args: { expected: FirstScanExpectedPair[]; finished: { promptId: string; model: string; failed: boolean }[]; startedAt: Date; now: Date }): Pick<FirstScanStatus, "done" | "failed" | "missing" | "etaSeconds" | "canOpenPartial" | "settled">
```

Status words, used consistently from here to the UI:
- **done** = pairs with a saved run; **failed** = pairs whose last outcome is a `prompt_run_failed` event; **missing** = pairs with no outcome yet.
- **settled** (`missing === 0`) means the worker has nothing left to do, not that the data is complete.
- `status` becomes `complete` only when settled **and** `failed === 0`. Settled with failures stays `running`: the UI offers "retry the failed ones" and "open the report now"; the report is never auto-opened over failures.
- `coverage` and `canOpenPartial` use **done ÷ expected** (successes only).
- `partial` is final: a frozen snapshot, no polling, no retry. The user chose it.

`postgres-read.ts` gains:

```ts
export interface FirstScanFinishedPair { prompt_id: string; model: string; failed: boolean; }
/** A pair is finished when a run was saved for it or a prompt_run_failed usage event was recorded for it. */
export async function getFirstScanFinishedPairs(firstScanId: string): Promise<FirstScanFinishedPair[]> {
	return queryPg<FirstScanFinishedPair>(sql`
		SELECT prompt_id, model, false AS failed FROM prompt_runs WHERE first_scan_id = ${firstScanId}
		UNION
		SELECT prompt_id, model, true AS failed
		FROM usage_events WHERE first_scan_id = ${firstScanId} AND event_type = 'prompt_run_failed'
	`);
}
```

`usage_events.model` is already written by `recordUsageEvent` (`apps/worker/src/jobs/process-prompt.ts:296`).

- [ ] **Step 1: Write the failing tests for the pure parts**

```ts
// apps/web/src/server/first-scan-core.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/lib/db/db", () => ({ db: {} }));
vi.mock("@/lib/boss-client", () => ({ getBoss: vi.fn() }));
vi.mock("@/lib/postgres-read", () => ({ getFirstScanFinishedPairs: vi.fn() }));

const { computeStatus } = await import("./first-scan-core");

const expected = [
	{ promptId: "a", model: "chatgpt" },
	{ promptId: "a", model: "gemini" },
	{ promptId: "b", model: "chatgpt" },
	{ promptId: "b", model: "gemini" },
];

describe("computeStatus", () => {
	it("is settled but not complete when every pair finished and some failed", () => {
		const s = computeStatus({
			expected,
			finished: [
				{ promptId: "a", model: "chatgpt", failed: false },
				{ promptId: "a", model: "gemini", failed: true },
				{ promptId: "b", model: "chatgpt", failed: true },
				{ promptId: "b", model: "gemini", failed: true },
			],
			startedAt: new Date(),
			now: new Date(),
		});
		expect(s).toMatchObject({ done: 1, failed: 3, missing: 0, settled: true, canOpenPartial: false });
	});

	it("counts done, failed and missing pairs and never counts a pair twice", () => {
		const s = computeStatus({
			expected,
			finished: [
				{ promptId: "a", model: "chatgpt", failed: false },
				{ promptId: "a", model: "chatgpt", failed: false }, // a retried duplicate
				{ promptId: "a", model: "gemini", failed: true },
				{ promptId: "zzz", model: "chatgpt", failed: false }, // not expected, ignored
			],
			startedAt: new Date("2026-11-03T10:00:00Z"),
			now: new Date("2026-11-03T10:01:00Z"),
		});
		expect(s).toMatchObject({ done: 1, failed: 1, missing: 2 });
	});

	it("gives no ETA until five pairs have finished, then extrapolates from the average", () => {
		const start = new Date("2026-11-03T10:00:00Z");
		const four = Array.from({ length: 4 }, (_, i) => ({ promptId: "a", model: `m${i}`, failed: false }));
		const big = Array.from({ length: 10 }, (_, i) => ({ promptId: "a", model: `m${i}` }));
		expect(computeStatus({ expected: big, finished: four, startedAt: start, now: new Date(start.getTime() + 40_000) }).etaSeconds).toBeNull();
		const five = [...four, { promptId: "a", model: "m4", failed: false }];
		// 5 finished in 50 s → 10 s each → 5 remaining → 50 s
		expect(computeStatus({ expected: big, finished: five, startedAt: start, now: new Date(start.getTime() + 50_000) }).etaSeconds).toBe(50);
	});

	it("allows opening a partial report once half the pairs succeeded; failures do not count", () => {
		const start = new Date();
		const one = [{ promptId: "a", model: "chatgpt", failed: false }];
		const oneAndFail = [...one, { promptId: "a", model: "gemini", failed: true }];
		const two = [...one, { promptId: "a", model: "gemini", failed: false }];
		expect(computeStatus({ expected, finished: one, startedAt: start, now: start }).canOpenPartial).toBe(false);
		expect(computeStatus({ expected, finished: oneAndFail, startedAt: start, now: start }).canOpenPartial).toBe(false);
		expect(computeStatus({ expected, finished: two, startedAt: start, now: start }).canOpenPartial).toBe(true);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm exec vitest run --project=unit src/server/first-scan-core.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/server/first-scan-core.ts
/** Plain functions with db access; server functions live in ./first-scan.ts. */
import { db } from "@workspace/lib/db/db";
import {
	brands,
	type FirstScanExpectedPair,
	firstScans,
	prompts,
	promptRuns,
	starterReports,
} from "@workspace/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getBoss } from "@/lib/boss-client";
import { createMultiplePromptJobSchedulers } from "@/lib/job-scheduler";
import { getFirstScanFinishedPairs } from "@/lib/postgres-read";
import { expectedPairs, isBuyer, type SetupDraft } from "@/lib/setup-wizard";
import { insertCompetitors, insertPrompts } from "@/server/onboarding-core";

const ETA_MIN_SAMPLES = 5;
const PARTIAL_MIN_COVERAGE = 0.5;
const LATEST_LIMIT = 6;

export interface StartFirstScanInput {
	brandId: string;
	draft: SetupDraft;
}

export class AlreadyStartedError extends Error {
	constructor() {
		super("First scan already started");
		this.name = "AlreadyStartedError";
	}
}

export async function startFirstScan(input: StartFirstScanInput): Promise<{ firstScanId: string }> {
	const { brandId, draft } = input;
	const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
	if (!brand) throw new Error("Brand not found");
	if (brand.onboarded) throw new AlreadyStartedError();
	const websiteHost = new URL(brand.website).hostname.replace(/^www\./, "");

	const firstScanId = await db.transaction(async (tx) => {
		// The guarded update takes the brand's row lock: a concurrent start
		// blocks here, then sees onboarded = true and gets zero rows. Doing it
		// first costs nothing — the transaction is atomic either way — and the
		// unique first_scans.brand_id index is the second line of defence.
		const claimed = await tx
			.update(brands)
			.set({ onboarded: true, updatedAt: new Date() })
			.where(and(eq(brands.id, brandId), eq(brands.onboarded, false)))
			.returning({ id: brands.id });
		if (claimed.length === 0) throw new AlreadyStartedError();

		await insertCompetitors({
			brandId,
			websiteHost,
			source: draft.rivals.filter((r) => r.selected).map((r) => ({ name: r.name, domains: r.site ? [r.site] : [], aliases: [] })),
			conn: tx,
		});
		const promptIds = await insertPrompts({
			brandId,
			brandName: draft.profile.name,
			website: brand.website,
			source: draft.questions
				.filter((q) => q.selected || !isBuyer(q))
				.map((q) => ({ value: q.text, tags: [], enabled: true, intent: q.intent })),
			dedupeAgainstExisting: true,
			conn: tx,
			organizationId: brand.organizationId,
		});
		const [scan] = await tx
			.insert(firstScans)
			.values({ brandId, expected: expectedPairs(promptIds.map((id) => ({ id })), draft.engines) })
			.returning({ id: firstScans.id });
		await tx
			.update(brands)
			.set({
				name: draft.profile.name,
				sector: draft.profile.sector || null,
				location: draft.profile.location || null,
				defaultMarketKey: draft.profile.marketKey ?? brand.defaultMarketKey,
				aliases: draft.profile.aliases,
				additionalDomains: draft.profile.additionalDomains,
				enabledModels: draft.engines,
				setupDraft: null,
			})
			.where(eq(brands.id, brandId));
		return scan!.id;
	});

	// After commit, so a failed enqueue never leaves a half-written brand; the
	// status poll retries while enqueuedAt is null.
	await enqueueFirstScanJobs(firstScanId).catch((err) => console.error("first scan enqueue failed", err));
	return { firstScanId };
}

export async function enqueueFirstScanJobs(firstScanId: string): Promise<void> {
	const scan = await db.query.firstScans.findFirst({ where: eq(firstScans.id, firstScanId) });
	if (!scan || scan.enqueuedAt) return;
	const boss = await getBoss();
	const promptIds = [...new Set(scan.expected.map((p) => p.promptId))];
	for (const promptId of promptIds) {
		await boss.send(
			"process-prompt",
			{ promptId, firstScanId },
			{ singletonKey: `first-scan-${promptId}`, singletonSeconds: 60 * 60, retryLimit: 0, expireInSeconds: 60 * 90 },
		);
	}
	await db.update(firstScans).set({ enqueuedAt: new Date() }).where(eq(firstScans.id, firstScanId));
}

export interface FirstScanLatest {
	promptValue: string;
	model: string;
	mentioned: boolean;
	brandRank: number | null;
	competitorsMentioned: string[];
	createdAt: string;
}

export interface FirstScanStatus {
	firstScanId: string;
	status: "queued" | "running" | "complete" | "partial";
	expected: number;
	done: number;
	failed: number;
	mentioned: number;
	missing: number;
	topRival: { name: string; count: number } | null;
	latest: FirstScanLatest[];
	etaSeconds: number | null;
	/** Every expected pair has an outcome (success or failure). */
	settled: boolean;
	canOpenPartial: boolean;
	reportReady: boolean;
}

const pairKey = (p: { promptId: string; model: string }) => `${p.promptId}:${p.model}`;

export function computeStatus(args: {
	expected: FirstScanExpectedPair[];
	finished: { promptId: string; model: string; failed: boolean }[];
	startedAt: Date;
	now: Date;
}): Pick<FirstScanStatus, "done" | "failed" | "missing" | "etaSeconds" | "canOpenPartial" | "settled"> {
	const wanted = new Set(args.expected.map(pairKey));
	const seen = new Map<string, boolean>();
	for (const f of args.finished) {
		const k = pairKey(f);
		if (!wanted.has(k)) continue;
		// A success beats an earlier failure for the same pair (retry).
		seen.set(k, (seen.get(k) ?? true) && f.failed);
	}
	const finishedCount = seen.size;
	const failed = [...seen.values()].filter(Boolean).length;
	const done = finishedCount - failed;
	const missing = wanted.size - finishedCount;
	const elapsed = (args.now.getTime() - args.startedAt.getTime()) / 1000;
	const etaSeconds = finishedCount >= ETA_MIN_SAMPLES ? Math.round((elapsed / finishedCount) * missing) : null;
	return {
		done,
		failed,
		missing,
		etaSeconds,
		settled: missing === 0,
		canOpenPartial: wanted.size > 0 && done / wanted.size >= PARTIAL_MIN_COVERAGE,
	};
}

export async function getFirstScanStatus(firstScanId: string): Promise<FirstScanStatus> {
	const scan = await db.query.firstScans.findFirst({ where: eq(firstScans.id, firstScanId) });
	if (!scan) throw new Error("First scan not found");
	if (!scan.enqueuedAt) await enqueueFirstScanJobs(firstScanId).catch(() => {});

	const finished = await getFirstScanFinishedPairs(firstScanId);
	const counts = computeStatus({
		expected: scan.expected,
		finished: finished.map((f) => ({ promptId: f.prompt_id, model: f.model, failed: f.failed })),
		startedAt: scan.startedAt,
		now: new Date(),
	});

	let status = scan.status;
	if (counts.settled && counts.failed === 0 && (status === "queued" || status === "running")) {
		status = "complete";
		await db.update(firstScans).set({ status, completedAt: new Date() }).where(eq(firstScans.id, firstScanId));
	}

	const runs = await db
		.select({
			promptValue: prompts.value,
			model: promptRuns.model,
			mentioned: promptRuns.brandMentioned,
			brandRank: promptRuns.brandRank,
			competitorsMentioned: promptRuns.competitorsMentioned,
			createdAt: promptRuns.createdAt,
		})
		.from(promptRuns)
		.innerJoin(prompts, eq(prompts.id, promptRuns.promptId))
		.where(eq(promptRuns.firstScanId, firstScanId))
		.orderBy(desc(promptRuns.createdAt));

	const rivalCounts = new Map<string, number>();
	for (const r of runs) for (const c of r.competitorsMentioned) rivalCounts.set(c, (rivalCounts.get(c) ?? 0) + 1);
	const top = [...rivalCounts.entries()].sort((a, b) => b[1] - a[1])[0];
	const report = await db.query.starterReports.findFirst({ where: eq(starterReports.firstScanId, firstScanId) });

	return {
		firstScanId,
		status,
		expected: scan.expected.length,
		...counts,
		mentioned: runs.filter((r) => r.mentioned).length,
		topRival: top ? { name: top[0], count: top[1] } : null,
		latest: runs.slice(0, LATEST_LIMIT).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
		reportReady: status === "complete" || status === "partial" || !!report,
	};
}

/** Re-sends every prompt that still has a failed or missing pair. A finished scan (complete or partial) is frozen. */
export async function retryFirstScan(firstScanId: string): Promise<void> {
	const scan = await db.query.firstScans.findFirst({ where: eq(firstScans.id, firstScanId) });
	if (!scan) throw new Error("First scan not found");
	if (scan.status === "complete" || scan.status === "partial") return;
	const succeeded = new Set((await getFirstScanFinishedPairs(firstScanId)).filter((f) => !f.failed).map((f) => `${f.prompt_id}:${f.model}`));
	const promptIds = [...new Set(scan.expected.filter((p) => !succeeded.has(pairKey(p))).map((p) => p.promptId))];
	if (promptIds.length === 0) return;
	const boss = await getBoss();
	for (const promptId of promptIds) {
		await boss.send(
			"process-prompt",
			{ promptId, firstScanId },
			{ singletonKey: `first-scan-${promptId}`, singletonSeconds: 60 * 5, retryLimit: 0, expireInSeconds: 60 * 90 },
		);
	}
	await db.update(firstScans).set({ status: "running" }).where(and(eq(firstScans.id, firstScanId), inArray(firstScans.status, ["queued", "running"])));
}

export async function openPartialFirstScan(firstScanId: string): Promise<void> {
	const status = await getFirstScanStatus(firstScanId);
	if (status.status === "complete" || status.status === "partial") return;
	if (!status.canOpenPartial) throw new Error("Not enough answers yet");
	await db.update(firstScans).set({ status: "partial", completedAt: new Date() }).where(eq(firstScans.id, firstScanId));
}
```

Notes for the implementer: `insertCompetitors` (`apps/web/src/server/onboarding-core.ts:192`) already accepts `conn` but is not exported; add `export` to it. A retried prompt re-runs all of that prompt's engines; the worker's `firstScanTargets` runs the whole engine list for the prompt, so an already-succeeded engine may produce a second run for the same pair. That is accepted (the report builder reads runs, duplicates only add a sample) and `computeStatus` keys by pair, so counts stay right. Prompt rows for first-scan prompts also need their regular schedule after the scan; the worker's `scheduleNextRun` handles that once a job runs, so no `createMultiplePromptJobSchedulers` call is needed here (remove that import if unused). `defaultMarketKey` is the existing `brands` column.

- [ ] **Step 4: Run the test and type-check**

Run: `cd apps/web && pnpm exec vitest run --project=unit src/server/first-scan-core.test.ts && cd ../.. && pnpm --filter @workspace/web check-types`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/first-scan-core.ts apps/web/src/server/first-scan-core.test.ts apps/web/src/lib/postgres-read.ts apps/web/src/server/onboarding-core.ts
git commit -m "add the first scan lifecycle"
```

---

### Task 7: Starter report builder

**Files:**
- Create: `apps/web/src/server/starter-report-core.ts`
- Create: `apps/web/src/server/starter-report-core.test.ts`
- Modify: `apps/web/src/lib/postgres-read.ts` (append `getFirstScanRivalCitations`)

**Interfaces:**
- Consumes: `starterReports`, `firstScans`, `promptRuns`, `prompts`, `competitors` (Task 1); `extractTextContent(rawOutput, providerOrModel)` from `@workspace/lib/text-extraction`; `resolveOpportunities(brandId, timezone = "UTC")` (`apps/web/src/server/opportunities.ts:668`; pass `"UTC"` explicitly as `opportunities-core.ts` does) → `{ report: { summary, opportunities: [{title, why, ...}] } | null }`; `getFirstScanStatus` (Task 6).
- Produces:

```ts
export interface StarterReport {
  brand: { name: string; website: string; sector: string | null; location: string | null };
  engines: string[];
  headline: { mentionedRuns: number; totalRuns: number; mentionPercent: number; rivalsAhead: number };
  score: { mentionPercent: number; byIntent: { intent: PromptIntent; mentionPercent: number; runs: number }[]; accuracy: { assessed: number; accurate: number; unsupported: number } | null };
  whoIsThere: { name: string; count: number; isYou: boolean }[];   // top 6 by run count, brand included
  whyThem: { domain: string; count: number; isYours: boolean }[];  // top 4 domains cited in buyer answers that named a rival but not the brand
  nextSteps: { title: string; why: string }[];                     // ≤ 3
  answers: { promptValue: string; model: string; mentioned: boolean; excerpt: string }[]; // 4
}
export function buildStarterReport(input: BuildInput): { report: StarterReport; missingSections: string[] }   // pure
export async function getOrBuildStarterReport(brandId: string): Promise<{ report: StarterReport; coverage: number; partial: boolean; missingSections: string[]; createdAt: string } | null>
export async function retryStarterReportSection(brandId: string, section: "nextSteps"): Promise<void>
```

`postgres-read.ts` gains:

```ts
export interface FirstScanCitation { domain: string; count: number; }
/**
 * "Why them": the sources behind buyer answers that recommended a rival and
 * not the brand. Branded prompts and answers that already name the brand are
 * excluded, so the list is what the brand is losing to.
 */
export async function getFirstScanRivalCitations(firstScanId: string): Promise<FirstScanCitation[]> {
	return queryPg<FirstScanCitation>(sql`
		SELECT c.domain, count(*)::int AS count
		FROM citations c
		JOIN prompt_runs r ON r.id = c.prompt_run_id
		JOIN prompts p ON p.id = r.prompt_id
		WHERE r.first_scan_id = ${firstScanId}
			AND r.brand_mentioned = false
			AND cardinality(r.competitors_mentioned) > 0
			AND p.intent IS NOT NULL
		GROUP BY c.domain ORDER BY count DESC LIMIT 4
	`);
}
```

- [ ] **Step 1: Write the failing test for the pure builder**

```ts
// apps/web/src/server/starter-report-core.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/lib/db/db", () => ({ db: {} }));
vi.mock("@/lib/postgres-read", () => ({ getFirstScanRivalCitations: vi.fn() }));
vi.mock("@/server/opportunities", () => ({ resolveOpportunities: vi.fn() }));
vi.mock("@/server/first-scan-core", () => ({ getFirstScanStatus: vi.fn() }));

const { buildStarterReport } = await import("./starter-report-core");

const run = (o: Partial<Parameters<typeof buildStarterReport>[0]["runs"][number]>) => ({
	promptValue: "best physio in kadıköy",
	intent: "local" as const,
	model: "chatgpt",
	mentioned: false,
	brandRank: null,
	competitorsMentioned: [],
	accuracyClaims: null,
	text: "An answer that lists several clinics in the area and explains how to choose one.",
	...o,
});

const base = {
	brand: { name: "Atlas Fizyo", website: "https://atlasfizyo.com", sector: null, location: null, domains: ["atlasfizyo.com"] },
	engines: ["chatgpt", "gemini"],
	citations: [
		{ domain: "doktortakvimi.com", count: 5 },
		{ domain: "atlasfizyo.com", count: 1 },
	],
	nextSteps: [{ title: "Add a pricing page", why: "Price questions never name you." }],
};

describe("buildStarterReport", () => {
	it("computes the headline, intent sub-scores, who's there and why them", () => {
		const { report, missingSections } = buildStarterReport({
			...base,
			runs: [
				run({ mentioned: true, brandRank: 2, competitorsMentioned: ["Fizyo Plus"] }),
				run({ model: "gemini", competitorsMentioned: ["Fizyo Plus", "Kadıköy Fizik"] }),
				run({ intent: "price", competitorsMentioned: ["Fizyo Plus"] }),
				run({ intent: "price", model: "gemini", mentioned: true, brandRank: 1 }),
			],
		});
		expect(report.headline).toMatchObject({ mentionedRuns: 2, totalRuns: 4, mentionPercent: 50, rivalsAhead: 1 });
		expect(report.score.byIntent.find((i) => i.intent === "local")).toMatchObject({ mentionPercent: 50, runs: 2 });
		expect(report.whoIsThere[0]).toMatchObject({ name: "Fizyo Plus", count: 3, isYou: false });
		expect(report.whoIsThere.find((w) => w.isYou)).toMatchObject({ name: "Atlas Fizyo", count: 2 });
		expect(report.whyThem[0]).toMatchObject({ domain: "doktortakvimi.com", isYours: false });
		expect(report.whyThem[1]).toMatchObject({ domain: "atlasfizyo.com", isYours: true });
		expect(report.answers).toHaveLength(4);
		expect(missingSections).toEqual([]);
	});

	it("prefers a mix of mentioned and unmentioned answers across engines and truncates excerpts", () => {
		const long = "x".repeat(900);
		const { report } = buildStarterReport({
			...base,
			runs: [
				run({ mentioned: true, text: long }),
				run({ model: "gemini", mentioned: true }),
				run({ intent: "price" }),
				run({ intent: "price", model: "gemini" }),
				run({ intent: "comparison" }),
			],
		});
		expect(report.answers.filter((a) => a.mentioned)).toHaveLength(2);
		expect(new Set(report.answers.map((a) => a.model)).size).toBe(2);
		expect(report.answers[0]!.excerpt.length).toBeLessThanOrEqual(600);
	});

	it("reports accuracy only when something was assessed and lists missing sections", () => {
		const { report, missingSections } = buildStarterReport({ ...base, citations: [], nextSteps: null, runs: [run({})] });
		expect(report.score.accuracy).toBeNull();
		expect(missingSections).toEqual(["whyThem", "nextSteps"]);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm exec vitest run --project=unit src/server/starter-report-core.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/server/starter-report-core.ts
import { db } from "@workspace/lib/db/db";
import {
	type AccuracyClaim,
	brands,
	firstScans,
	PROMPT_INTENTS,
	type PromptIntent,
	prompts,
	promptRuns,
	starterReports,
} from "@workspace/lib/db/schema";
import { extractTextContent } from "@workspace/lib/text-extraction";
import { eq } from "drizzle-orm";
import { getFirstScanRivalCitations } from "@/lib/postgres-read";
import { getFirstScanStatus } from "@/server/first-scan-core";
import { resolveOpportunities } from "@/server/opportunities";

const EXCERPT_CHARS = 600;
const ANSWER_COUNT = 4;
const WHO_LIMIT = 6;
const STEPS_LIMIT = 3;

export interface StarterReport {
	brand: { name: string; website: string; sector: string | null; location: string | null };
	engines: string[];
	headline: { mentionedRuns: number; totalRuns: number; mentionPercent: number; rivalsAhead: number };
	score: {
		mentionPercent: number;
		byIntent: { intent: PromptIntent; mentionPercent: number; runs: number }[];
		accuracy: { assessed: number; accurate: number; unsupported: number } | null;
	};
	whoIsThere: { name: string; count: number; isYou: boolean }[];
	whyThem: { domain: string; count: number; isYours: boolean }[];
	nextSteps: { title: string; why: string }[];
	answers: { promptValue: string; model: string; mentioned: boolean; excerpt: string }[];
}

export interface BuildInput {
	brand: { name: string; website: string; sector: string | null; location: string | null; domains: string[] };
	engines: string[];
	runs: {
		promptValue: string;
		intent: PromptIntent | null;
		model: string;
		mentioned: boolean;
		brandRank: number | null;
		competitorsMentioned: string[];
		accuracyClaims: AccuracyClaim[] | null;
		text: string;
	}[];
	citations: { domain: string; count: number }[];
	nextSteps: { title: string; why: string }[] | null;
}

const pct = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part * 100) / whole));

export function buildStarterReport(input: BuildInput): { report: StarterReport; missingSections: string[] } {
	const { runs } = input;
	const mentionedRuns = runs.filter((r) => r.mentioned).length;

	const rivalCounts = new Map<string, number>();
	for (const r of runs) for (const c of r.competitorsMentioned) rivalCounts.set(c, (rivalCounts.get(c) ?? 0) + 1);
	const who = [...rivalCounts.entries()]
		.map(([name, count]) => ({ name, count, isYou: false }))
		.concat([{ name: input.brand.name, count: mentionedRuns, isYou: true }])
		.sort((a, b) => b.count - a.count)
		.slice(0, WHO_LIMIT);
	const rivalsAhead = who.filter((w) => !w.isYou && w.count > mentionedRuns).length;

	const byIntent = PROMPT_INTENTS.map((intent) => {
		const rs = runs.filter((r) => r.intent === intent);
		return { intent, runs: rs.length, mentionPercent: pct(rs.filter((r) => r.mentioned).length, rs.length) };
	});

	const assessed = runs.filter((r) => r.accuracyClaims !== null);
	const accuracy =
		assessed.length === 0
			? null
			: {
					assessed: assessed.length,
					accurate: assessed.filter((r) => (r.accuracyClaims ?? []).every((c) => c.status !== "contradicted")).length,
					unsupported: assessed.filter((r) => (r.accuracyClaims ?? []).some((c) => c.status === "unsupported")).length,
				};

	const yours = new Set(input.brand.domains.map((d) => d.toLowerCase().replace(/^www\./, "")));
	const whyThem = input.citations.map((c) => ({ ...c, isYours: yours.has(c.domain.toLowerCase().replace(/^www\./, "")) }));

	const answers = pickAnswers(runs).map((r) => ({
		promptValue: r.promptValue,
		model: r.model,
		mentioned: r.mentioned,
		excerpt: r.text.length > EXCERPT_CHARS ? `${r.text.slice(0, EXCERPT_CHARS - 1).trimEnd()}…` : r.text,
	}));

	const missingSections: string[] = [];
	if (whyThem.length === 0) missingSections.push("whyThem");
	if (input.nextSteps === null) missingSections.push("nextSteps");

	return {
		report: {
			brand: { name: input.brand.name, website: input.brand.website, sector: input.brand.sector, location: input.brand.location },
			engines: input.engines,
			headline: { mentionedRuns, totalRuns: runs.length, mentionPercent: pct(mentionedRuns, runs.length), rivalsAhead },
			score: { mentionPercent: pct(mentionedRuns, runs.length), byIntent, accuracy },
			whoIsThere: who,
			whyThem,
			nextSteps: (input.nextSteps ?? []).slice(0, STEPS_LIMIT),
			answers,
		},
		missingSections,
	};
}

/**
 * Four answers the reader can learn from: alternate mentioned/unmentioned and
 * rotate engines so the page is not four ChatGPT answers in a row.
 */
function pickAnswers<T extends { mentioned: boolean; model: string; text: string }>(runs: T[]): T[] {
	const usable = runs.filter((r) => r.text.trim().length > 0);
	const picked: T[] = [];
	const buckets = [usable.filter((r) => r.mentioned), usable.filter((r) => !r.mentioned)];
	let turn = 0;
	while (picked.length < ANSWER_COUNT && buckets.some((b) => b.length > 0)) {
		const bucket = buckets[turn % 2]!;
		turn++;
		if (bucket.length === 0) continue;
		const usedModels = new Set(picked.map((p) => p.model));
		const idx = Math.max(0, bucket.findIndex((r) => !usedModels.has(r.model)));
		picked.push(bucket.splice(idx, 1)[0]!);
	}
	return picked;
}

export async function getOrBuildStarterReport(brandId: string) {
	const existing = await db.query.starterReports.findFirst({ where: eq(starterReports.brandId, brandId) });
	if (existing) {
		return {
			report: existing.report as StarterReport,
			coverage: existing.coverage,
			partial: existing.partial,
			missingSections: existing.missingSections,
			createdAt: existing.createdAt.toISOString(),
		};
	}
	const scan = await db.query.firstScans.findFirst({ where: eq(firstScans.brandId, brandId) });
	if (!scan) return null;
	const status = await getFirstScanStatus(scan.id);
	if (status.status !== "complete" && status.status !== "partial") return null;

	const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
	if (!brand) return null;
	const rows = await db
		.select({
			promptValue: prompts.value,
			intent: prompts.intent,
			model: promptRuns.model,
			provider: promptRuns.provider,
			mentioned: promptRuns.brandMentioned,
			brandRank: promptRuns.brandRank,
			competitorsMentioned: promptRuns.competitorsMentioned,
			accuracyClaims: promptRuns.accuracyClaims,
			rawOutput: promptRuns.rawOutput,
		})
		.from(promptRuns)
		.innerJoin(prompts, eq(prompts.id, promptRuns.promptId))
		.where(eq(promptRuns.firstScanId, scan.id));

	const [citations, opportunities] = await Promise.all([
		getFirstScanRivalCitations(scan.id),
		resolveOpportunities(brandId, "UTC").catch(() => null),
	]);
	const nextSteps = opportunities?.report?.opportunities.map((o) => ({ title: o.title, why: o.why })) ?? null;

	const websiteHost = new URL(brand.website).hostname.replace(/^www\./, "");
	const { report, missingSections } = buildStarterReport({
		brand: { name: brand.name, website: brand.website, sector: brand.sector, location: brand.location, domains: [websiteHost, ...brand.additionalDomains] },
		engines: [...new Set(scan.expected.map((p) => p.model))],
		runs: rows.map((r) => ({ ...r, text: extractTextContent(r.rawOutput, r.provider ?? r.model) })),
		citations,
		nextSteps,
	});
	// Successes only: a failed pair contributed no answer.
	const coverage = scan.expected.length === 0 ? 0 : status.done / scan.expected.length;
	const partial = status.status === "partial";
	const [saved] = await db
		.insert(starterReports)
		.values({ brandId, firstScanId: scan.id, report, coverage, partial, missingSections, finalizedAt: partial ? null : new Date() })
		.onConflictDoNothing({ target: starterReports.brandId })
		.returning();
	// A concurrent request may have won the insert; the stored row is the truth.
	if (!saved) return getOrBuildStarterReport(brandId);
	return { report, coverage, partial, missingSections, createdAt: saved.createdAt.toISOString() };
}

/** Only "next steps" can be retried: it is the single LLM-generated section. */
export async function retryStarterReportSection(brandId: string, section: "nextSteps"): Promise<void> {
	const existing = await db.query.starterReports.findFirst({ where: eq(starterReports.brandId, brandId) });
	if (!existing || !existing.missingSections.includes(section)) return;
	const opportunities = await resolveOpportunities(brandId, "UTC").catch(() => null);
	const steps = opportunities?.report?.opportunities.map((o) => ({ title: o.title, why: o.why }));
	if (!steps) return;
	const report = { ...(existing.report as StarterReport), nextSteps: steps.slice(0, STEPS_LIMIT) };
	await db
		.update(starterReports)
		.set({ report, missingSections: existing.missingSections.filter((s) => s !== section) })
		.where(eq(starterReports.id, existing.id));
}
```

`AccuracyClaim` is `{ claim, status: "contradicted" | "unsupported" }` (`packages/lib/src/db/schema.ts:38`). `extractTextContent(rawOutput, providerOrEngine)` returns a string, possibly empty (`packages/lib/src/text-extraction.ts:351`).

- [ ] **Step 4: Run the test and type-check**

Run: `cd apps/web && pnpm exec vitest run --project=unit src/server/starter-report-core.test.ts && cd ../.. && pnpm --filter @workspace/web check-types`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/starter-report-core.ts apps/web/src/server/starter-report-core.test.ts apps/web/src/lib/postgres-read.ts
git commit -m "build the starter report from the first scan"
```

---

### Task 8: Server functions for the wizard, scan and report

**Files:**
- Create: `apps/web/src/server/first-scan.ts`
- Create: `apps/web/src/server/starter-report.ts`

**Interfaces:**
- Consumes: Tasks 6 and 7; `requireBrandSession(brandId)` from `@/lib/auth/helpers`; `db`, `brands`, `firstScans`.
- Produces (all `createServerFn`, all access-checked through the brand):

```ts
saveSetupDraftFn({ brandId, draft: SetupDraft }) → { ok: true }
startFirstScanFn({ brandId, draft: SetupDraft }) → { firstScanId }
getFirstScanStatusFn({ brandId, firstScanId }) → FirstScanStatus
retryFirstScanFn({ brandId, firstScanId }) → { ok: true }
openPartialFirstScanFn({ brandId, firstScanId }) → { ok: true }
getLatestFirstScanFn({ brandId }) → { firstScanId, status } | null
getStarterReportFn({ brandId }) → Awaited<ReturnType<typeof getOrBuildStarterReport>>
retryStarterReportSectionFn({ brandId, section: "nextSteps" }) → { ok: true }
```

- [ ] **Step 1: Write the files**

```ts
// apps/web/src/server/first-scan.ts
/** Server functions only; logic lives in ./first-scan-core.ts (see onboarding.ts for why). */
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { brands, firstScans, PROMPT_INTENTS } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { MAX_BUYER, MAX_RIVALS } from "@/lib/setup-wizard";
import {
	AlreadyStartedError,
	getFirstScanStatus,
	openPartialFirstScan,
	retryFirstScan,
	startFirstScan,
} from "@/server/first-scan-core";

export type { FirstScanLatest, FirstScanStatus } from "@/server/first-scan-core";

const draftSchema = z.object({
	step: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
	profile: z.object({
		name: z.string().trim().min(1).max(120),
		sector: z.string().trim().max(120),
		location: z.string().trim().max(120),
		marketKey: z.string().nullable(),
		aliases: z.array(z.string().trim().max(120)).max(20),
		additionalDomains: z.array(z.string().trim().max(253)).max(20),
	}),
	questions: z
		.array(
			z.object({
				text: z.string().trim().min(1).max(300),
				intent: z.enum(PROMPT_INTENTS).nullable(),
				selected: z.boolean(),
				custom: z.boolean(),
			}),
		)
		.max(MAX_BUYER + 20),
	rivals: z
		.array(z.object({ name: z.string().trim().min(1).max(120), site: z.string().trim().max(253), selected: z.boolean(), custom: z.boolean() }))
		.max(MAX_RIVALS + 20),
	engines: z.array(z.string()).min(1).max(8),
});

const scanRef = z.object({ brandId: z.string(), firstScanId: z.string().uuid() });

async function requireScan(brandId: string, firstScanId: string) {
	await requireBrandSession(brandId);
	const scan = await db.query.firstScans.findFirst({ where: eq(firstScans.id, firstScanId) });
	if (!scan || scan.brandId !== brandId) throw new Error("First scan not found");
}

export const saveSetupDraftFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), draft: draftSchema }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		await db.update(brands).set({ setupDraft: data.draft }).where(eq(brands.id, data.brandId));
		return { ok: true as const };
	});

export const startFirstScanFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), draft: draftSchema }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		try {
			return await startFirstScan({ brandId: data.brandId, draft: data.draft });
		} catch (err) {
			// A double click or a second tab: hand back the scan that exists.
			if (err instanceof AlreadyStartedError) {
				const scan = await db.query.firstScans.findFirst({ where: eq(firstScans.brandId, data.brandId) });
				if (scan) return { firstScanId: scan.id };
			}
			throw err;
		}
	});

export const getFirstScanStatusFn = createServerFn({ method: "POST" })
	.validator(scanRef)
	.handler(async ({ data }) => {
		await requireScan(data.brandId, data.firstScanId);
		return getFirstScanStatus(data.firstScanId);
	});

export const retryFirstScanFn = createServerFn({ method: "POST" })
	.validator(scanRef)
	.handler(async ({ data }) => {
		await requireScan(data.brandId, data.firstScanId);
		await retryFirstScan(data.firstScanId);
		return { ok: true as const };
	});

export const openPartialFirstScanFn = createServerFn({ method: "POST" })
	.validator(scanRef)
	.handler(async ({ data }) => {
		await requireScan(data.brandId, data.firstScanId);
		await openPartialFirstScan(data.firstScanId);
		return { ok: true as const };
	});

export const getLatestFirstScanFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const scan = await db.query.firstScans.findFirst({ where: eq(firstScans.brandId, data.brandId) });
		return scan ? { firstScanId: scan.id, status: scan.status } : null;
	});
```

```ts
// apps/web/src/server/starter-report.ts
/** Server functions only; the builder lives in ./starter-report-core.ts. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { getOrBuildStarterReport, retryStarterReportSection } from "@/server/starter-report-core";

export type { StarterReport } from "@/server/starter-report-core";

export const getStarterReportFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return getOrBuildStarterReport(data.brandId);
	});

export const retryStarterReportSectionFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), section: z.literal("nextSteps") }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		await retryStarterReportSection(data.brandId, data.section);
		return { ok: true as const };
	});
```

The `draftSchema` zod shape must stay assignable to `SetupDraft` (Task 5); if `z.infer` and the interface diverge, the `startFirstScan` call will not type-check, which is the signal to fix the schema, not to cast.

- [ ] **Step 2: Type-check and lint the two files**

Run: `pnpm --filter @workspace/web check-types && pnpm exec biome check apps/web/src/server/first-scan.ts apps/web/src/server/starter-report.ts`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/server/first-scan.ts apps/web/src/server/starter-report.ts
git commit -m "expose the first scan and starter report to the client"
```

---

### Task 9: Locale strings for the wizard and report

**Files:**
- Modify: `apps/web/src/locales/en.json`, `apps/web/src/locales/tr.json`

**Interfaces:**
- Produces the keys below, used verbatim by Tasks 10–13. Keys are flat dotted strings like the existing `"new_brand.crumb"`. Variables use the existing `{name}` syntax of `t(key, vars)` (check one example in `en.json`, e.g. a key containing `{`).

- [ ] **Step 1: Add the keys to both files** (Turkish is the product copy from the board; English is its equivalent)

| key | tr | en |
|---|---|---|
| `setup.crumb` | Kurulum | Setup |
| `setup.head_description` | Markanızı birkaç adımda kurun ve ilk taramayı başlatın. | Set up your brand in a few steps and start the first scan. |
| `setup.new.title` | Sitenizi girin | Enter your site |
| `setup.new.subtitle` | Gerisini biz çıkaralım: marka adı, sektör, rakipler ve müşterilerin sorduğu sorular. | We will work out the rest: brand name, sector, rivals and the questions buyers ask. |
| `setup.new.website_label` | Web sitesi | Website |
| `setup.new.website_placeholder` | ornek.com | example.com |
| `setup.new.submit` | Başla | Start |
| `setup.new.error` | Marka oluşturulamadı. | Could not create the brand. |
| `setup.steps.site` | Site ve marka | Site and brand |
| `setup.steps.questions` | Sorular | Questions |
| `setup.steps.rivals` | Rakipler | Rivals |
| `setup.steps.engines` | Motorlar | Engines |
| `setup.steps.scan` | İlk tarama | First scan |
| `setup.step_of` | Adım {current} / {total} | Step {current} of {total} |
| `setup.back` | Geri | Back |
| `setup.continue` | Devam | Continue |
| `setup.continue_later` | Sonra devam et | Continue later |
| `setup.saved` | Taslak kaydedildi. | Draft saved. |
| `setup.analyzing.title` | Sitenizi okuyoruz | Reading your site |
| `setup.analyzing.body` | Marka adı, sektör, rakipler ve sorular çıkarılıyor. Bu genellikle bir dakikadan kısa sürer. | Extracting the brand name, sector, rivals and questions. This usually takes under a minute. |
| `setup.analyzing.failed` | Siteyi okuyamadık. Bilgileri elle girebilir veya tekrar deneyebilirsiniz. | We could not read the site. Enter the details by hand or try again. |
| `setup.analyzing.retry` | Tekrar dene | Try again |
| `setup.analyzing.manual` | Elle devam et | Continue by hand |
| `setup.site.title` | Bunları doğru bulduk mu? | Did we get these right? |
| `setup.site.name_label` | Marka adı | Brand name |
| `setup.site.sector_label` | Sektör | Sector |
| `setup.site.location_label` | Konum | Location |
| `setup.site.market_label` | Pazar | Market |
| `setup.site.aliases_label` | Diğer adlar | Other names |
| `setup.site.domains_label` | Diğer alan adları | Other domains |
| `setup.questions.title` | Müşterileriniz yapay zekaya bunları soruyor | Your buyers ask AI these questions |
| `setup.questions.subtitle` | 10 ile 16 soru seçin. Markanızı adıyla soran 3 soru her zaman dahildir. | Pick 10 to 16 questions. The 3 questions that name your brand are always included. |
| `setup.questions.selected` | {count} seçili (en az {min}, en çok {max}) | {count} selected (min {min}, max {max}) |
| `setup.questions.branded_title` | Markanızı soran sorular | Questions that name your brand |
| `setup.questions.branded_hint` | Her zaman dahil | Always included |
| `setup.questions.add_label` | Kendi sorunuzu ekleyin | Add your own question |
| `setup.questions.add_placeholder` | Örn. evde fizyoterapi hizmeti veren yerler | e.g. clinics that offer physiotherapy at home |
| `setup.questions.add` | Ekle | Add |
| `setup.questions.too_few` | Devam etmek için en az {min} soru seçin. | Select at least {min} questions to continue. |
| `setup.questions.at_max` | En fazla {max} soru seçebilirsiniz. | You can select at most {max} questions. |
| `setup.intent.discovery` | Keşif | Discovery |
| `setup.intent.comparison` | Karşılaştırma | Comparison |
| `setup.intent.local` | Yerel | Local |
| `setup.intent.price` | Fiyat | Price |
| `setup.rivals.title` | Bu sorularda kimlerle yarışıyorsunuz? | Who do you compete with on these questions? |
| `setup.rivals.subtitle` | En fazla 5 rakip seçin. İlk taramadan sonra yapay zekanın kimi önerdiğini göreceksiniz. | Pick up to 5 rivals. After the first scan you will see who the AI actually recommends. |
| `setup.rivals.selected` | {count} / {max} seçili | {count} of {max} selected |
| `setup.rivals.add_name` | Rakip adı | Rival name |
| `setup.rivals.add_site` | Web sitesi (isteğe bağlı) | Website (optional) |
| `setup.rivals.add` | Ekle | Add |
| `setup.engines.title` | Hangi motorları izleyelim? | Which engines should we watch? |
| `setup.engines.subtitle` | İlk tarama seçtiğiniz her motorda her soruyu bir kez sorar. | The first scan asks every question once on each engine you pick. |
| `setup.engines.estimate` | İlk tarama: {answers} cevap. Günlük takip: ayda yaklaşık {monthly} cevap. | First scan: {answers} answers. Daily tracking: about {monthly} answers a month. |
| `setup.engines.none` | En az bir motor seçin. | Pick at least one engine. |
| `setup.engines.start` | İlk taramayı başlat | Start the first scan |
| `setup.engines.starting` | Başlatılıyor… | Starting… |
| `setup.engines.start_error` | Tarama başlatılamadı. | Could not start the scan. |
| `setup.scan.title` | İlk tarama çalışıyor | First scan running |
| `setup.scan.subtitle` | Cevaplar geldikçe burada görünür. Bu sayfayı kapatabilirsiniz; geri geldiğinizde kaldığı yerden devam eder. | Answers appear here as they arrive. You can close this page; it picks up where it left off. |
| `setup.scan.progress` | {done} / {expected} cevap | {done} of {expected} answers |
| `setup.scan.eta` | Tahmini kalan süre: {minutes} dk | About {minutes} min left |
| `setup.scan.eta_unknown` | Süre tahmini için birkaç cevap bekleniyor | Waiting for a few answers to estimate the time |
| `setup.scan.mentioned` | Sizi anan cevap: {count} | Answers naming you: {count} |
| `setup.scan.top_rival` | En çok anılan rakip: {name} ({count}) | Most mentioned rival: {name} ({count}) |
| `setup.scan.failed` | Başarısız: {count} | Failed: {count} |
| `setup.scan.latest` | Son cevaplar | Latest answers |
| `setup.scan.mentioned_badge` | Sizi andı | Named you |
| `setup.scan.not_mentioned_badge` | Sizi anmadı | Did not name you |
| `setup.scan.stalled` | Tarama beklenenden uzun sürüyor. | The scan is taking longer than expected. |
| `setup.scan.settled_with_failures` | Bazı cevaplar alınamadı. Eksikleri yeniden deneyin veya raporu mevcut sonuçlarla açın. | Some answers could not be fetched. Retry them, or open the report with what is there. |
| `setup.scan.retry_failed` | Başarısızları yeniden dene | Retry the failed ones |
| `setup.scan.retry` | Eksikleri yeniden dene | Retry the missing ones |
| `setup.scan.open_partial` | Raporu şimdi aç ({percent}%) | Open the report now ({percent}%) |
| `setup.scan.open_report` | Raporu aç | Open the report |
| `setup.scan.complete` | Tarama tamamlandı | Scan complete |
| `starter_report.crumb` | Başlangıç raporu | Starter report |
| `starter_report.head_description` | İlk taramanın sonuçları. | Results of the first scan. |
| `starter_report.not_ready` | Rapor henüz hazır değil. | The report is not ready yet. |
| `starter_report.back_to_scan` | Taramaya dön | Back to the scan |
| `starter_report.partial_banner` | Bu rapor taramanın %{percent} kısmıyla oluşturuldu. | This report was built from {percent}% of the scan. |
| `starter_report.snapshot` | {date} tarihindeki ilk taramanın anlık görüntüsü. Günlük takip panoda güncellenir. | A snapshot of the first scan on {date}. Daily tracking updates on the dashboard. |
| `starter_report.headline.title` | Yapay zeka sizi {mentioned} / {total} cevapta andı | AI named you in {mentioned} of {total} answers |
| `starter_report.headline.rivals_ahead` | {count} rakip sizden daha sık anılıyor. | {count} rivals are mentioned more often than you. |
| `starter_report.headline.rivals_none` | Hiçbir rakip sizden daha sık anılmıyor. | No rival is mentioned more often than you. |
| `starter_report.score.title` | Görünürlük puanı | Visibility score |
| `starter_report.score.by_intent` | Soru türüne göre | By question type |
| `starter_report.score.accuracy` | Doğruluk: {assessed} cevap incelendi, {accurate} tutarlı, {unsupported} doğrulanamayan iddia içeriyor | Accuracy: {assessed} answers checked, {accurate} consistent, {unsupported} contain unsupported claims |
| `starter_report.score.accuracy_none` | Doğruluk değerlendirmesi için sizi anan cevap yok. | No answer named you, so accuracy was not assessed. |
| `starter_report.who.title` | Sorularınızda kimler var | Who shows up for your questions |
| `starter_report.who.you` | Siz | You |
| `starter_report.who.runs` | {count} cevap | {count} answers |
| `starter_report.why.title` | Neden onlar: yapay zekanın kaynak gösterdiği siteler | Why them: the sites AI cites |
| `starter_report.why.yours` | Sizin siteniz | Your site |
| `starter_report.why.empty` | Bu taramada kaynak gösterilmedi. | No sources were cited in this scan. |
| `starter_report.next.title` | Sıradaki adımlar | Next steps |
| `starter_report.next.missing` | Öneriler oluşturulamadı. | Recommendations could not be generated. |
| `starter_report.next.retry` | Tekrar dene | Try again |
| `starter_report.answers.title` | Gerçek cevaplar | Real answers |
| `starter_report.dashboard` | Panoya git | Go to the dashboard |

- [ ] **Step 2: Verify both files parse and have the same key set**

```bash
cd apps/web && node -e '
const en=require("./src/locales/en.json"), tr=require("./src/locales/tr.json");
const miss=[...Object.keys(en).filter(k=>!(k in tr)), ...Object.keys(tr).filter(k=>!(k in en))];
if (miss.length) { console.error("missing", miss); process.exit(1) } console.log("ok", Object.keys(en).length)'
```

Expected: `ok <n>`. If the project already has a locale consistency test (grep `locales` in `apps/web/src/**/*.test.ts`), run that instead.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/locales
git commit -m "add setup wizard and starter report copy"
```

---

### Task 10: URL-only brand creation that starts the analysis

**Files:**
- Modify: `apps/web/src/routes/_authed/app/org/$org/new.tsx` (replace the two-step form)
- Modify: `apps/web/src/server/brands.ts` (`createBrandInOrgFn` ~279: make `brandName` optional, default to the host)

**Interfaces:**
- Consumes: `createBrandInOrgFn({ brandName?, website, organizationId })` → `{ brandSlug, brandId }` (check it returns `brandId`; if it returns only the slug, add `brandId` to its return object); `startAnalyzeBrandFn({ brandId, website })` from `@/server/onboarding`; `validateWebsiteUrl(website)` → `{ isValid, error, formatted? }` from `@/lib/brand-website`.

- [ ] **Step 1: Make the brand name optional on the server**

In `createBrandInOrgFn`'s validator (`apps/web/src/server/brands.ts:~282`), change `brandName: z.string().min(1).max(100)` to `brandName: z.string().trim().min(1).max(100).optional()` and replace the `const trimmedName = data.brandName.trim();` line with:

```ts
		// The wizard asks for a URL only; the analysis proposes the real name next.
		const trimmedName = data.brandName?.trim() || new URL(formattedWebsite).hostname.replace(/^www\./, "");
```

(`formattedWebsite` is whatever local holds the validated website in that handler; if it is computed after this line, move this line below it). The handler already returns `{ brandId, brandSlug }`.

- [ ] **Step 2: Replace the page**

```tsx
// apps/web/src/routes/_authed/app/org/$org/new.tsx
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import FullPageCard from "@/components/full-page-card";
import { useOrganizationsChanged } from "@/hooks/use-organizations";
import { useOrganizationParams } from "@/hooks/use-route-params";
import { validateWebsiteUrl } from "@/lib/brand-website";
import { t } from "@/lib/i18n";
import { trackEvent } from "@/lib/posthog";
import { pageHead } from "@/lib/route-head";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { createBrandInOrgFn } from "@/server/brands";
import { startAnalyzeBrandFn } from "@/server/onboarding";

export const Route = createFileRoute("/_authed/app/org/$org/new")({
	staticData: { crumb: t("setup.crumb") },
	loader: ({ context }) => {
		const { brandCreation, id } = context.organization;
		if (brandCreation.kind === "not-offered") {
			throw redirect({ to: "/app/org/$org", params: { org: context.organization.slug } });
		}
		return { organizationId: id, blocked: brandCreation.kind === "denied" ? brandCreation : null };
	},
	head: pageHead({ description: t("setup.head_description") }),
	component: NewBrandPage,
});

function NewBrandPage() {
	const { organizationId, blocked } = Route.useLoaderData();
	const organizationParams = useOrganizationParams();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const organizationsChanged = useOrganizationsChanged();
	const navigate = useNavigate();
	const writeError = useWriteErrorMessage();

	const submit = async (formData: FormData) => {
		const website = ((formData.get("website") as string) ?? "").trim();
		const validation = validateWebsiteUrl(website);
		if (!validation.isValid) {
			setError(validation.error);
			return;
		}
		setIsLoading(true);
		setError("");
		try {
			const { brandSlug, brandId } = await createBrandInOrgFn({ data: { website, organizationId } });
			trackEvent("brand_created", { has_website: true });
			// Fire-and-forget: the wizard polls the status and offers a retry.
			startAnalyzeBrandFn({ data: { brandId, website } }).catch(() => {});
			await organizationsChanged(() =>
				navigate({ to: "/app/org/$org/brand/$brand", params: { ...organizationParams, brand: brandSlug } }),
			);
		} catch (err) {
			setError(writeError(err, t("setup.new.error")));
		} finally {
			setIsLoading(false);
		}
	};

	if (blocked) {
		// Keep the existing "blocked" rendering from the current file verbatim here.
	}

	return (
		<FullPageCard title={t("setup.new.title")} description={t("setup.new.subtitle")}>
			<form action={submit} className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="website">{t("setup.new.website_label")}</Label>
					<Input id="website" name="website" placeholder={t("setup.new.website_placeholder")} autoFocus required />
				</div>
				{error && <p className="text-sm text-destructive">{error}</p>}
				<div className="flex gap-2">
					<Button type="submit" disabled={isLoading}>
						{t("setup.new.submit")}
					</Button>
					<Link to="/app/org/$org" params={organizationParams} className={buttonVariants({ variant: "ghost" })}>
						{t("setup.back")}
					</Link>
				</div>
			</form>
		</FullPageCard>
	);
}
```

Copy the current file's `blocked` branch (the "no plan" card with its two locale keys) into the marked spot unchanged; look at how `FullPageCard` and `form action={…}` are used in the current file and match them. Remove `PlatformSelectionStep` only from this file (it stays in the codebase for settings).

- [ ] **Step 3: Type-check and run the web unit tests touching brands**

Run: `pnpm --filter @workspace/web check-types && cd apps/web && pnpm exec vitest run --project=unit src/server`
Expected: clean, PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/_authed/app/org/\$org/new.tsx apps/web/src/server/brands.ts
git commit -m "create a brand from its URL and start the analysis"
```

---

### Task 11: Setup wizard component, steps 1–4

**Files:**
- Create: `apps/web/src/components/setup-wizard/setup-wizard.tsx`
- Create: `apps/web/src/components/setup-wizard/stepper.tsx`
- Create: `apps/web/src/components/setup-wizard/step-site.tsx`
- Create: `apps/web/src/components/setup-wizard/step-questions.tsx`
- Create: `apps/web/src/components/setup-wizard/step-rivals.tsx`
- Create: `apps/web/src/components/setup-wizard/step-engines.tsx`
- Create: `apps/web/src/lib/setup-wizard-labels.ts` (`INTENT_LABEL: Record<PromptIntent, string>` built from the four `setup.intent.*` keys)
- Modify: `apps/web/src/routes/_authed/app/org/$org/brand/$brand/index.tsx`

**Interfaces:**
- Consumes: Task 5 rules; `saveSetupDraftFn`, `startFirstScanFn`, `getLatestFirstScanFn` (Task 8); `getAnalyzeBrandStatusFn`, `startAnalyzeBrandFn` (existing, `{ brandId, website }`); `getModelPickerStateFn({ brandId })` → `{ available: { model, access, ... }[] }` from `@/server/platform-picks`; `MARKET_CATALOG` from `@workspace/config/markets` (`readonly { key, countryCode, languageCode }[]`; show `key` as the option label); UI from `@workspace/ui/components/{button,card,checkbox,input,label,badge,select,progress,spinner,tags-input,alert}`; `t` from `@/lib/i18n`; `useMatch` + `BRAND_ROUTE_ID` as `index.tsx` already does. `brand` from the loader has `id, name, website, onboarded, setupDraft, enabledModels`.
- Produces: `<SetupWizard brand={brand} organizationSlug={org} brandSlug={brand} />` and `<StepFirstScan>` slot (Task 12 fills it; this task renders a placeholder that Task 12 replaces).

Props and state contract:

```ts
// setup-wizard.tsx
interface Props { brand: { id: string; name: string; website: string; setupDraft: unknown }; onReport: () => void }
// Internal phases: "analyzing" (no draft yet, poll analysis) | "editing" (draft in state) | "scanning" (firstScanId set)
// On mount: if brand.setupDraft is a SetupDraft → editing at draft.step; else if a first scan exists (getLatestFirstScanFn) → scanning; else analyzing.
// Analysis "done" → draftFromSuggestion(suggestion, availableModels) → editing, step 1.
// Analysis "failed" → show setup.analyzing.failed with retry (startAnalyzeBrandFn) and "continue by hand" (empty draft: profile.name = brand.name, no questions/rivals, default engines).
// "Continue later" and every step change call saveSetupDraftFn (debounced 800 ms via a ref + setTimeout; flush on step change).
// Step 4's start button → startFirstScanFn → phase scanning with the returned firstScanId → <StepFirstScan>.
```

Each step component is `({ draft, onChange, onNext, onBack }: { draft: SetupDraft; onChange: (d: SetupDraft) => void; onNext: () => void; onBack?: () => void })`; `StepEngines` additionally takes `available: { model: string; label: string }[]`, `runsPerDay: number` and `onStart: () => Promise<void>`.

- [ ] **Step 1: Write the stepper and the four steps**

`stepper.tsx`: renders the five `setup.steps.*` labels in a row with the current one bold and the completed ones in muted text, plus `t("setup.step_of", { current, total: 5 })`. No logic.

`step-site.tsx`: a form with `Input`s bound to `draft.profile.name/sector/location`, a `Select` over `MARKET_CATALOG` for `marketKey` (first option is an "unset" entry mapped to `null`), `TagsInput` for `aliases` and `additionalDomains`. `onNext` disabled while `name` is blank.

`step-questions.tsx`: groups `draft.questions.filter(isBuyer)` by intent in `INTENT_ORDER`, each as a `Checkbox` row with the text; the branded tail is listed under `setup.questions.branded_title` with a `Badge` `setup.questions.branded_hint` and no checkbox. Header shows `setup.questions.selected` with `{count: selectedBuyerCount(draft), min: MIN_BUYER, max: MAX_BUYER}`. Add-row: `Input` + intent `Select` + `Button` calling `addCustomQuestion`; disabled at `MAX_BUYER` with `setup.questions.at_max`. `onNext` disabled unless `canContinueFromQuestions(draft)`; show `setup.questions.too_few` when below the minimum. Checkbox `onCheckedChange` calls `onChange(toggleQuestion(draft, index))` using the question's index in `draft.questions`, not in the grouped list.

`step-rivals.tsx`: `Checkbox` rows for `draft.rivals` (name + muted site), header `setup.rivals.selected` with `{count, max: MAX_RIVALS}`, add-row with name + site `Input`s calling `addCustomRival`. Zero rivals is allowed.

`step-engines.tsx`: one `Checkbox` per `available` engine (label from `available[].label`, falling back to the model id), bound to `draft.engines`. Below: `setup.engines.estimate` with `{ answers: (selectedBuyerCount(draft) + branded count) * draft.engines.length, monthly: monthlyAnswerEstimate(draft, runsPerDay) }`. Start button `setup.engines.start` (`setup.engines.starting` while pending), disabled when `draft.engines.length === 0` with `setup.engines.none`; errors shown with `setup.engines.start_error`.

- [ ] **Step 2: Write the wizard shell**

```tsx
// apps/web/src/components/setup-wizard/setup-wizard.tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MARKET_CATALOG } from "@workspace/config/markets";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { DEFAULT_ENGINES, defaultEngines, draftFromSuggestion, type SetupDraft, type SetupStep } from "@/lib/setup-wizard";
import { getLatestFirstScanFn, saveSetupDraftFn, startFirstScanFn } from "@/server/first-scan";
import { getAnalyzeBrandStatusFn, startAnalyzeBrandFn } from "@/server/onboarding";
import { getModelPickerStateFn } from "@/server/platform-picks";
import { StepEngines } from "./step-engines";
import { StepFirstScan } from "./step-first-scan";
import { StepQuestions } from "./step-questions";
import { StepRivals } from "./step-rivals";
import { StepSite } from "./step-site";
import { Stepper } from "./stepper";

const ANALYSIS_POLL_MS = 2000;
const ANALYSIS_TIMEOUT_MS = 6 * 60 * 1000;
const DRAFT_SAVE_DEBOUNCE_MS = 800;
// Matches the worker's RUNS_PER_PROMPT fallback; the estimate is informational.
const RUNS_PER_DAY = 1;

interface Props {
	brand: { id: string; name: string; website: string; setupDraft: unknown };
	onReport: () => void;
}

type Phase = { kind: "booting" } | { kind: "analyzing"; failed: boolean } | { kind: "editing"; draft: SetupDraft } | { kind: "scanning"; firstScanId: string };

const isDraft = (v: unknown): v is SetupDraft => !!v && typeof v === "object" && "questions" in v && "engines" in v;

export function SetupWizard({ brand, onReport }: Props) {
	const queryClient = useQueryClient();
	const [phase, setPhase] = useState<Phase>({ kind: "booting" });
	const [saved, setSaved] = useState(false);
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const startedAt = useRef(Date.now());

	const picker = useQuery({ queryKey: ["model-picker", brand.id], queryFn: () => getModelPickerStateFn({ data: { brandId: brand.id } }) });
	const available = (picker.data?.available ?? []).map((o) => ({ model: o.model, label: o.model }));
	const availableIds = available.map((a) => a.model);

	// Boot: resume a draft, a running scan, or start the analysis.
	useEffect(() => {
		if (phase.kind !== "booting" || picker.isPending) return;
		if (isDraft(brand.setupDraft)) {
			setPhase({ kind: "editing", draft: brand.setupDraft });
			return;
		}
		getLatestFirstScanFn({ data: { brandId: brand.id } }).then((scan) => {
			if (scan) setPhase({ kind: "scanning", firstScanId: scan.firstScanId });
			else setPhase({ kind: "analyzing", failed: false });
		});
	}, [phase.kind, picker.isPending, brand.id, brand.setupDraft]);

	const analysis = useQuery({
		queryKey: ["analyze-brand", brand.id],
		queryFn: () => getAnalyzeBrandStatusFn({ data: { brandId: brand.id } }),
		enabled: phase.kind === "analyzing" && !phase.failed,
		refetchInterval: (q) => (q.state.data?.status === "pending" && Date.now() - startedAt.current < ANALYSIS_TIMEOUT_MS ? ANALYSIS_POLL_MS : false),
	});

	useEffect(() => {
		if (phase.kind !== "analyzing" || !analysis.data) return;
		if (analysis.data.status === "done") {
			setPhase({ kind: "editing", draft: draftFromSuggestion(analysis.data.suggestion, availableIds.length ? availableIds : DEFAULT_ENGINES) });
		} else if (analysis.data.status === "failed") {
			setPhase({ kind: "analyzing", failed: true });
		}
	}, [phase.kind, analysis.data, availableIds.length]);

	const retryAnalysis = () => {
		startedAt.current = Date.now();
		queryClient.removeQueries({ queryKey: ["analyze-brand", brand.id] });
		startAnalyzeBrandFn({ data: { brandId: brand.id, website: brand.website } }).catch(() => {});
		setPhase({ kind: "analyzing", failed: false });
	};

	const manualDraft = (): SetupDraft => ({
		step: 1,
		profile: { name: brand.name, sector: "", location: "", marketKey: null, aliases: [], additionalDomains: [] },
		questions: [],
		rivals: [],
		engines: defaultEngines(availableIds.length ? availableIds : DEFAULT_ENGINES),
	});

	const persist = useCallback(
		(draft: SetupDraft, immediate = false) => {
			if (saveTimer.current) clearTimeout(saveTimer.current);
			const run = () => saveSetupDraftFn({ data: { brandId: brand.id, draft } }).then(() => setSaved(true)).catch(() => {});
			if (immediate) void run();
			else saveTimer.current = setTimeout(run, DRAFT_SAVE_DEBOUNCE_MS);
		},
		[brand.id],
	);

	const update = (draft: SetupDraft) => {
		setSaved(false);
		setPhase({ kind: "editing", draft });
		persist(draft);
	};
	const goto = (draft: SetupDraft, step: SetupStep) => {
		const next = { ...draft, step };
		setPhase({ kind: "editing", draft: next });
		persist(next, true);
	};

	const start = useMutation({
		mutationFn: (draft: SetupDraft) => startFirstScanFn({ data: { brandId: brand.id, draft } }),
		onSuccess: ({ firstScanId }) => setPhase({ kind: "scanning", firstScanId }),
	});

	if (phase.kind === "booting") return <Spinner />;

	if (phase.kind === "analyzing") {
		return (
			<div className="max-w-2xl space-y-4 p-4">
				<Stepper current={1} />
				<h2 className="text-2xl font-bold">{t("setup.analyzing.title")}</h2>
				{phase.failed ? (
					<Alert variant="destructive">
						<AlertDescription>{t("setup.analyzing.failed")}</AlertDescription>
					</Alert>
				) : (
					<p className="text-muted-foreground">{t("setup.analyzing.body")}</p>
				)}
				{phase.failed ? (
					<div className="flex gap-2">
						<Button onClick={retryAnalysis}>{t("setup.analyzing.retry")}</Button>
						<Button variant="outline" onClick={() => setPhase({ kind: "editing", draft: manualDraft() })}>
							{t("setup.analyzing.manual")}
						</Button>
					</div>
				) : (
					<Spinner />
				)}
			</div>
		);
	}

	if (phase.kind === "scanning") {
		return <StepFirstScan brandId={brand.id} firstScanId={phase.firstScanId} onReport={onReport} />;
	}

	const { draft } = phase;
	const stepProps = { draft, onChange: update };
	return (
		<div className="max-w-3xl space-y-6 p-4">
			<Stepper current={draft.step} />
			{draft.step === 1 && <StepSite {...stepProps} onNext={() => goto(draft, 2)} />}
			{draft.step === 2 && <StepQuestions {...stepProps} onBack={() => goto(draft, 1)} onNext={() => goto(draft, 3)} />}
			{draft.step === 3 && <StepRivals {...stepProps} onBack={() => goto(draft, 2)} onNext={() => goto(draft, 4)} />}
			{draft.step === 4 && (
				<StepEngines
					{...stepProps}
					available={available}
					runsPerDay={RUNS_PER_DAY}
					onBack={() => goto(draft, 3)}
					onStart={() => start.mutateAsync(draft).then(() => undefined)}
					startError={start.isError ? t("setup.engines.start_error") : null}
				/>
			)}
			<p className="text-xs text-muted-foreground">{saved ? t("setup.saved") : t("setup.continue_later")}</p>
		</div>
	);
}
```

For this task, `step-first-scan.tsx` is a placeholder exporting `StepFirstScan({ brandId, firstScanId, onReport })` that renders `t("setup.scan.title")`; Task 12 replaces it. `MARKET_CATALOG` is imported in `step-site.tsx`, remove it here if unused.

- [ ] **Step 3: Mount it on the brand route**

In `index.tsx`, replace `ResearchBrandData` and its usage with:

```tsx
import { useNavigate } from "@tanstack/react-router";
import { SetupWizard } from "@/components/setup-wizard/setup-wizard";
import { useBrandParams } from "@/hooks/use-route-params";
// ...
	const navigate = useNavigate();
	const brandParams = useBrandParams();
	if (!brand) return null;
	if (!brand.onboarded) {
		return <SetupWizard key={brand.id} brand={brand} onReport={() => navigate({ to: "/app/org/$org/brand/$brand/report", params: brandParams })} />;
	}
```

Remove the `PromptWizard` import and the `ClientConfig` handling (the `onboardingRedirectUrlTemplate` hook moves to the report page's dashboard button in Task 13 only if `clientConfig.branding.onboardingRedirectUrlTemplate` is still referenced anywhere else; grep and keep behaviour where it is used). The brand route loader must include `setupDraft`: it spreads the whole `brand` row, so nothing to do, but confirm `BrandWithPrompts` exposes it.

Also: a brand that is `onboarded` but whose latest first scan is `queued`/`running` should land on the scan screen, not the dashboard. In `DashboardPage`, when `brand.onboarded`, query `getLatestFirstScanFn` once (`useQuery`, `staleTime: Infinity`); if the status is `queued` or `running`, render `<StepFirstScan brandId firstScanId onReport>` instead of `BrandHome`.

- [ ] **Step 4: Type-check, lint, and look at it**

Run: `pnpm --filter @workspace/web check-types && pnpm lint`
Then with `pnpm dev` running: create a brand at `/app/org/default/new`, watch the analysis finish, walk steps 1–4, reload mid-way and confirm the draft resumes at the same step, press start and confirm the placeholder scan screen appears and `first_scans` has one row. Note anything that does not match in the report.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/setup-wizard apps/web/src/lib/setup-wizard-labels.ts apps/web/src/routes/_authed/app/org/\$org/brand/\$brand/index.tsx
git commit -m "add the setup wizard"
```

---

### Task 12: First-scan screen

**Files:**
- Replace: `apps/web/src/components/setup-wizard/step-first-scan.tsx`

**Interfaces:**
- Consumes: `getFirstScanStatusFn`, `retryFirstScanFn`, `openPartialFirstScanFn` (Task 8), `FirstScanStatus` (with `settled`).
- Produces: `StepFirstScan({ brandId, firstScanId, onReport })`. Behaviour: polls until `complete` or `partial`; auto-opens the report only on `complete`; when every pair has an outcome but some failed, shows the failure notice with "retry the failed ones" and, from 50 % successes, "open the report now"; `partial` is final and opens the report.

- [ ] **Step 1: Implement**

```tsx
// apps/web/src/components/setup-wizard/step-first-scan.tsx
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Progress } from "@workspace/ui/components/progress";
import { useEffect } from "react";
import { t } from "@/lib/i18n";
import { getFirstScanStatusFn, openPartialFirstScanFn, retryFirstScanFn } from "@/server/first-scan";
import { Stepper } from "./stepper";

const POLL_MS = 3000;
// No answer for this long with pairs still missing: offer retry / partial.
const STALL_MS = 3 * 60 * 1000;

export function StepFirstScan({ brandId, firstScanId, onReport }: { brandId: string; firstScanId: string; onReport: () => void }) {
	const status = useQuery({
		queryKey: ["first-scan", firstScanId],
		queryFn: () => getFirstScanStatusFn({ data: { brandId, firstScanId } }),
		refetchInterval: (q) => (q.state.data?.status === "complete" || q.state.data?.status === "partial" ? false : POLL_MS),
	});
	const retry = useMutation({ mutationFn: () => retryFirstScanFn({ data: { brandId, firstScanId } }), onSuccess: () => status.refetch() });
	const openPartial = useMutation({ mutationFn: () => openPartialFirstScanFn({ data: { brandId, firstScanId } }), onSuccess: onReport });

	const s = status.data;
	useEffect(() => {
		if (s?.status === "complete") onReport();
	}, [s?.status, onReport]);

	if (!s) return null;
	const finished = s.done + s.failed;
	const lastAt = s.latest[0] ? new Date(s.latest[0].createdAt).getTime() : null;
	const stalled = s.missing > 0 && lastAt !== null && Date.now() - lastAt > STALL_MS;
	const needsAttention = s.status !== "complete" && s.status !== "partial" && (stalled || (s.settled && s.failed > 0));
	const donePercent = s.expected === 0 ? 0 : Math.round((s.done * 100) / s.expected);

	return (
		<div className="max-w-3xl space-y-6 p-4">
			<Stepper current={5} />
			<div className="space-y-1">
				<h2 className="text-2xl font-bold">{s.status === "complete" ? t("setup.scan.complete") : t("setup.scan.title")}</h2>
				<p className="text-muted-foreground">{t("setup.scan.subtitle")}</p>
			</div>
			<Progress value={s.expected === 0 ? 0 : (finished * 100) / s.expected} />
			<div className="flex flex-wrap gap-4 text-sm">
				<span>{t("setup.scan.progress", { done: finished, expected: s.expected })}</span>
				<span>{s.etaSeconds === null ? t("setup.scan.eta_unknown") : t("setup.scan.eta", { minutes: Math.max(1, Math.ceil(s.etaSeconds / 60)) })}</span>
				<span>{t("setup.scan.mentioned", { count: s.mentioned })}</span>
				{s.topRival && <span>{t("setup.scan.top_rival", s.topRival)}</span>}
				{s.failed > 0 && <span className="text-destructive">{t("setup.scan.failed", { count: s.failed })}</span>}
			</div>
			<div className="space-y-2">
				<h3 className="font-semibold">{t("setup.scan.latest")}</h3>
				<ul className="space-y-2">
					{s.latest.map((r) => (
						<li key={`${r.promptValue}-${r.model}-${r.createdAt}`} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
							<span className="truncate">{r.promptValue}</span>
							<span className="flex shrink-0 items-center gap-2">
								<Badge variant="outline">{r.model}</Badge>
								<Badge variant={r.mentioned ? "default" : "secondary"}>{r.mentioned ? t("setup.scan.mentioned_badge") : t("setup.scan.not_mentioned_badge")}</Badge>
							</span>
						</li>
					))}
				</ul>
			</div>
			{needsAttention && (
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-sm text-muted-foreground">
						{s.settled ? t("setup.scan.settled_with_failures") : t("setup.scan.stalled")}
					</span>
					<Button variant="outline" onClick={() => retry.mutate()} disabled={retry.isPending}>
						{s.settled ? t("setup.scan.retry_failed") : t("setup.scan.retry")}
					</Button>
					{s.canOpenPartial && (
						<Button onClick={() => openPartial.mutate()} disabled={openPartial.isPending}>
							{t("setup.scan.open_partial", { percent: donePercent })}
						</Button>
					)}
				</div>
			)}
			{s.reportReady && <Button onClick={onReport}>{t("setup.scan.open_report")}</Button>}
		</div>
	);
}
```

- [ ] **Step 2: Type-check and lint**

Run: `pnpm --filter @workspace/web check-types && pnpm lint`
Expected: clean. With the dev worker running, start a scan and watch answers arrive and the page hand off to `/report` when the last pair finishes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/setup-wizard/step-first-scan.tsx
git commit -m "show the first scan live"
```

---

### Task 13: Starter report page

**Files:**
- Create: `apps/web/src/routes/_authed/app/org/$org/brand/$brand/report.tsx`
- Create: `apps/web/src/components/starter-report/starter-report-view.tsx`

**Interfaces:**
- Consumes: `getStarterReportFn`, `retryStarterReportSectionFn`, `StarterReport` (Task 8); `t`; UI `card`, `badge`, `button`, `progress`, `separator`, `alert`; route pattern from `opportunities.tsx` in the same folder (copy its `createFileRoute` shape, `staticData`, `head`, and how it reads `brandId` from the route context).

- [ ] **Step 1: Write the route**

```tsx
// apps/web/src/routes/_authed/app/org/$org/brand/$brand/report.tsx
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { StarterReportView } from "@/components/starter-report/starter-report-view";
import { useBrandParams } from "@/hooks/use-route-params";
import { t } from "@/lib/i18n";
import { pageHead } from "@/lib/route-head";
import { getStarterReportFn } from "@/server/starter-report";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/report")({
	staticData: { crumb: t("starter_report.crumb"), bareHeader: true },
	head: pageHead({ description: t("starter_report.head_description") }),
	component: ReportPage,
});

function ReportPage() {
	const { brandId } = Route.useRouteContext();
	const brandParams = useBrandParams();
	const report = useQuery({ queryKey: ["starter-report", brandId], queryFn: () => getStarterReportFn({ data: { brandId } }) });

	if (report.isPending) return <Spinner />;
	if (!report.data) {
		return (
			<div className="space-y-4 p-4">
				<p>{t("starter_report.not_ready")}</p>
				<Link to="/app/org/$org/brand/$brand" params={brandParams} className={buttonVariants({ variant: "outline" })}>
					{t("starter_report.back_to_scan")}
				</Link>
			</div>
		);
	}
	return <StarterReportView brandId={brandId} data={report.data} onChanged={() => report.refetch()} />;
}
```

- [ ] **Step 2: Write the view**

```tsx
// apps/web/src/components/starter-report/starter-report-view.tsx
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Progress } from "@workspace/ui/components/progress";
import { useBrandParams } from "@/hooks/use-route-params";
import { t } from "@/lib/i18n";
import { INTENT_LABEL } from "@/lib/setup-wizard-labels";
import { retryStarterReportSectionFn, type StarterReport } from "@/server/starter-report";

interface Props {
	brandId: string;
	data: { report: StarterReport; coverage: number; partial: boolean; missingSections: string[]; createdAt: string };
	onChanged: () => void;
}

export function StarterReportView({ brandId, data, onChanged }: Props) {
	const { report } = data;
	const brandParams = useBrandParams();
	const retrySteps = useMutation({
		mutationFn: () => retryStarterReportSectionFn({ data: { brandId, section: "nextSteps" } }),
		onSuccess: onChanged,
	});
	const date = new Date(data.createdAt).toLocaleDateString();

	return (
		<div className="mx-auto max-w-3xl space-y-6 p-4">
			{data.partial && (
				<Alert>
					<AlertDescription>{t("starter_report.partial_banner", { percent: Math.round(data.coverage * 100) })}</AlertDescription>
				</Alert>
			)}
			<section className="space-y-2">
				<h1 className="text-3xl font-bold">
					{t("starter_report.headline.title", { mentioned: report.headline.mentionedRuns, total: report.headline.totalRuns })}
				</h1>
				<p className="text-muted-foreground">
					{report.headline.rivalsAhead > 0 ? t("starter_report.headline.rivals_ahead", { count: report.headline.rivalsAhead }) : t("starter_report.headline.rivals_none")}
				</p>
				<p className="text-xs text-muted-foreground">{t("starter_report.snapshot", { date })}</p>
			</section>

			<Card>
				<CardHeader>
					<CardTitle>{t("starter_report.score.title")}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="text-4xl font-bold">{report.score.mentionPercent}%</div>
					<Progress value={report.score.mentionPercent} />
					<h3 className="text-sm font-semibold">{t("starter_report.score.by_intent")}</h3>
					<ul className="space-y-2">
						{report.score.byIntent.map((i) => (
							<li key={i.intent} className="flex items-center gap-3 text-sm">
								<span className="w-32">{INTENT_LABEL[i.intent]}</span>
								<Progress value={i.mentionPercent} className="flex-1" />
								<span className="w-24 text-right text-muted-foreground">
									{i.mentionPercent}% · {i.runs}
								</span>
							</li>
						))}
					</ul>
					<p className="text-sm text-muted-foreground">
						{report.score.accuracy ? t("starter_report.score.accuracy", report.score.accuracy) : t("starter_report.score.accuracy_none")}
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("starter_report.who.title")}</CardTitle>
				</CardHeader>
				<CardContent>
					<ul className="space-y-2">
						{report.whoIsThere.map((w) => (
							<li key={w.name} className="flex items-center justify-between text-sm">
								<span className={w.isYou ? "font-semibold" : undefined}>
									{w.name} {w.isYou && <Badge variant="secondary">{t("starter_report.who.you")}</Badge>}
								</span>
								<span className="text-muted-foreground">{t("starter_report.who.runs", { count: w.count })}</span>
							</li>
						))}
					</ul>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("starter_report.why.title")}</CardTitle>
				</CardHeader>
				<CardContent>
					{report.whyThem.length === 0 ? (
						<p className="text-sm text-muted-foreground">{t("starter_report.why.empty")}</p>
					) : (
						<ul className="space-y-2">
							{report.whyThem.map((d) => (
								<li key={d.domain} className="flex items-center justify-between text-sm">
									<span>
										{d.domain} {d.isYours && <Badge variant="secondary">{t("starter_report.why.yours")}</Badge>}
									</span>
									<span className="text-muted-foreground">{d.count}</span>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("starter_report.next.title")}</CardTitle>
				</CardHeader>
				<CardContent>
					{data.missingSections.includes("nextSteps") ? (
						<div className="flex items-center gap-3">
							<span className="text-sm text-muted-foreground">{t("starter_report.next.missing")}</span>
							<Button variant="outline" size="sm" onClick={() => retrySteps.mutate()} disabled={retrySteps.isPending}>
								{t("starter_report.next.retry")}
							</Button>
						</div>
					) : (
						<ol className="list-decimal space-y-3 pl-5">
							{report.nextSteps.map((s) => (
								<li key={s.title}>
									<div className="font-medium">{s.title}</div>
									<p className="text-sm text-muted-foreground">{s.why}</p>
								</li>
							))}
						</ol>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("starter_report.answers.title")}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{report.answers.map((a) => (
						<div key={`${a.promptValue}-${a.model}`} className="space-y-1 rounded-md border p-3">
							<div className="flex items-center justify-between gap-2 text-sm">
								<span className="font-medium">{a.promptValue}</span>
								<span className="flex shrink-0 gap-2">
									<Badge variant="outline">{a.model}</Badge>
									<Badge variant={a.mentioned ? "default" : "secondary"}>{a.mentioned ? t("setup.scan.mentioned_badge") : t("setup.scan.not_mentioned_badge")}</Badge>
								</span>
							</div>
							<p className="whitespace-pre-wrap text-sm text-muted-foreground">{a.excerpt}</p>
						</div>
					))}
				</CardContent>
			</Card>

			<Link to="/app/org/$org/brand/$brand" params={brandParams} className={buttonVariants()}>
				{t("starter_report.dashboard")}
			</Link>
		</div>
	);
}
```

`t` takes a `TranslationKey` literal union, so the template key will not type-check: use `INTENT_LABEL[i.intent]` with `const INTENT_LABEL: Record<PromptIntent, string> = { discovery: t("setup.intent.discovery"), comparison: t("setup.intent.comparison"), local: t("setup.intent.local"), price: t("setup.intent.price") }` (import `type PromptIntent` from `@workspace/lib/db/schema`). The same object serves `step-questions.tsx` in Task 11; put it in `apps/web/src/lib/setup-wizard-labels.ts` and import it from both.

- [ ] **Step 3: Type-check, lint, view**

Run: `pnpm --filter @workspace/web check-types && pnpm lint`
Open `/app/org/default/brand/<slug>/report` for a brand whose scan completed; every section renders, the partial banner only on partial reports, the "next steps" retry only when that section is missing.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/_authed/app/org/\$org/brand/\$brand/report.tsx apps/web/src/components/starter-report
git commit -m "add the starter report page"
```

---

### Task 14: Sector and location in brand settings

**Files:**
- Modify: `apps/web/src/server/brands.ts` (`updateBrandFn` validator ~340 and `normalizeBrandUpdate` input)
- Modify: `apps/web/src/routes/_authed/app/org/$org/brand/$brand/settings/brand.tsx`
- Modify: `apps/web/src/locales/en.json`, `tr.json`

- [ ] **Step 1: Server**

Add to the `updateBrandFn` validator: `sector: z.string().trim().max(120).nullable().optional(), location: z.string().trim().max(120).nullable().optional(),` and include them in the `.set({...})` as `...(data.sector !== undefined && { sector: data.sector || null }), ...(data.location !== undefined && { location: data.location || null })` next to the slug spread (they bypass `normalizeBrandUpdate`, which only knows name/website/domains/aliases).

- [ ] **Step 2: Form**

In `settings/brand.tsx`, after the website field, add two `Input`s named `sector` and `location`, defaulting to `brand.sector ?? ""` / `brand.location ?? ""`, and pass `sector: formData.get("sector") as string, location: formData.get("location") as string` in the `updateBrandFn` call. Labels: add keys `settings.brand.sector_label` (tr "Sektör" / en "Sector") and `settings.brand.location_label` (tr "Konum" / en "Location") to both locale files.

- [ ] **Step 3: Type-check and lint, then save a value in the UI and reload**

Run: `pnpm --filter @workspace/web check-types && pnpm lint`
Expected: clean; the saved sector survives a reload.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/server/brands.ts apps/web/src/routes/_authed/app/org/\$org/brand/\$brand/settings/brand.tsx apps/web/src/locales
git commit -m "let users edit sector and location in brand settings"
```

---

### Task 15: Whole-feature check and changeset

**Files:**
- Create: `.changeset/setup-wizard-starter-report.md`

- [ ] **Step 1: Full verification**

```bash
pnpm lint && pnpm test && pnpm build
```

Expected: lint clean, all tests pass, build succeeds. Fix what fails in the task that owns the file (new commit, plain subject).

- [ ] **Step 2: End-to-end on a dev database with the worker running**

`pnpm dev`, then: `/app/org/default/new` → enter a real small business URL → analysis → steps 1–4 (reload once in step 2 and confirm resume) → start → scan screen shows answers arriving → auto-opens `/report` → all sections → "Go to the dashboard" shows the brand home with the scan's prompts. Then open brand settings and confirm sector/location are filled from the analysis. Record what you saw, including timings, in the report.

- [ ] **Step 3: Changeset**

```md
---
"@workspace/web": patch
"@workspace/worker": patch
"@workspace/lib": patch
---

Add a guided brand setup with a live first scan and a starter report.
```

- [ ] **Step 4: Commit**

```bash
git add .changeset/setup-wizard-starter-report.md
git commit -m "add a changeset for the setup wizard"
```
