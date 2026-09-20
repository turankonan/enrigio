# Per-Brand Evaluation Market (Phase 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each brand its own evaluation market (country + language) so its localizable AI evaluations run in that market, are attributed to it, and its dashboards show only that market's data — replacing the single deployment-wide DataForSEO location.

**Architecture:** A curated market catalog in `packages/config`. A per-target `localizableFor` predicate (DataForSEO scraped routes localize; direct-API/BrightData/DataForSEO-LLM-Responses do not). The worker resolves each brand's effective market (`brand.defaultMarketKey ?? env market`), passes it to DataForSEO via `ProviderOptions.market`, stamps `prompt_runs.market_key` with `runMarketKey`, and keys scheduler freshness by market. A fixed `marketScope` predicate scopes every brand read to its effective market plus the non-localizable `global` bucket. No fan-out, no multi-market, no translation — those are Phase 2b.

**Tech Stack:** pnpm + Turborepo monorepo, Node 24, TypeScript, Drizzle ORM + PostgreSQL, pg-boss (worker), TanStack Start (web), Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-09-20-market-comparison-design.md` (the "PHASE 2a — Per-Brand Location (BUILD NOW)" section; Phase 2b is out of scope).

## Global Constraints

- **pnpm only** — never npm/yarn/npx.
- **Never run Drizzle migrations.** Generate with `pnpm --filter @workspace/lib exec drizzle-kit generate` and **commit** the SQL + `meta/` snapshot + `_journal.json`. Do not run `drizzle-kit migrate`.
- `packages/config` is source-only: a new module needs an entry in its `package.json` `exports` map; import as `@workspace/config/<name>`.
- `packages/lib` must not import from `apps/*`.
- Market keys are stable **BCP-47-style** (`tr-TR`, `de-DE`, `en-GB`); the catalog stores codes, not English labels (render via `Intl.DisplayNames`). Sentinels: `global` = **proven** non-localizable (written only explicitly by the new worker); `legacy` = historical/cutover scope unknown — and it is the **migration's temporary DB default**, so `global` never collides with an unclassified default.
- `runMarketKey = localizableFor(config) ? effectiveMarket.key : "global"` is the single identity used for the DataForSEO location, the scheduler key, and stored `market_key`.
- A localizable DataForSEO route invoked without `options.market` must **throw** — no silent `process.env` read below the worker resolver.
- Tests assert externally observable behavior, not SQL text or internal shape.
- Commit subjects are plain imperative (`add market catalog`, not `feat: ...`). One **patch** changeset for the user-facing market picker (`@workspace/web`), added in Task 6.
- Before handing back: `pnpm lint` passes; run `pnpm lint:fix` for autofixes; never `biome-ignore`.
- Demo/read-only is a deployment feature flag (`getDeployment().features.platformPicksEditable`), enforced server-side and surfaced to the UI.

## File structure

- `packages/config/src/markets.ts` (new) — `Market` type, `MARKET_CATALOG`, `getMarket`, `getMarketForCodes`, `GLOBAL_MARKET_KEY`, `LEGACY_MARKET_KEY`. One responsibility: the market vocabulary.
- `packages/config/package.json` — add `"./markets"` export.
- `packages/lib/src/providers/types.ts` — `Provider.localizable?`/`localizableFor?`; `ProviderOptions.market?`.
- `packages/lib/src/providers/index.ts` — `resolveLocalizable(config)`.
- `packages/lib/src/providers/registry/dataforseo.ts` — `localizableFor`; 4 sites use `options.market`.
- `packages/lib/src/db/schema.ts` + generated migration `0024_*.sql` — `brands.default_market_key`, `prompt_runs.market_key`.
- `packages/lib/src/run-policy/policy.ts` — market in `targetKey`/`lastRunsByTargetKey`/`selectDueTargets`.
- `packages/lib/src/markets/effective.ts` (new) — `resolveEffectiveMarket(brand)` (lib-owned, no app import).
- `apps/worker/src/jobs/process-prompt.ts` — resolve effective market, thread `runMarketKey`, stamp `savePromptRun`.
- `apps/web/src/lib/postgres-read.ts` — `marketScope` helper + `effectiveMarketKey` param on aggregates.
- `apps/web/src/server/analytics-core.ts` — resolve effective market key, thread to reads.
- `apps/web/src/server/brand-market.ts` (new) — `updateBrandMarketFn`, `getBrandMarketStateFn`.
- `apps/web/src/routes/_authed/app/org/$org/brand/$brand/settings/brand.tsx` — the picker.
- `apps/web/src/locales/en.json` + `tr.json` — new keys.
- `packages/lib/scripts/backfill-brand-markets.ts` (new) — idempotent config backfill.

---

### Task 1: Market catalog + localizability predicate

**Files:**
- Create: `packages/config/src/markets.ts`
- Modify: `packages/config/package.json` (exports map)
- Modify: `packages/lib/src/providers/types.ts` (`Provider`, `ProviderOptions`)
- Modify: `packages/lib/src/providers/index.ts` (`resolveLocalizable`)
- Modify: `packages/lib/src/providers/registry/dataforseo.ts` (`localizableFor` on the provider object)
- Test: `packages/config/src/markets.test.ts`, `packages/lib/src/providers/localizable.test.ts`

**Interfaces:**
- Produces: `Market = { key: string; countryCode: string; languageCode: string; locationCode: number }`; `MARKET_CATALOG: Market[]`; `getMarket(key: string): Market | undefined`; `getMarketForCodes(locationCode: number, languageCode: string): Market | undefined`; `GLOBAL_MARKET_KEY = "global"`; `LEGACY_MARKET_KEY = "legacy"`. `resolveLocalizable(config: ModelConfig): boolean`.
- Consumes: `ModelConfig` from `@workspace/config/scrape-targets`; `dataforseoAccess` (already in dataforseo.ts).

- [ ] **Step 1: Write the failing test for the catalog**

`packages/config/src/markets.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { getMarket, getMarketForCodes, MARKET_CATALOG, GLOBAL_MARKET_KEY, LEGACY_MARKET_KEY } from "./markets";

describe("market catalog", () => {
    it("has unique BCP-47-style keys with valid codes", () => {
        const keys = MARKET_CATALOG.map((m) => m.key);
        expect(new Set(keys).size).toBe(keys.length);
        for (const m of MARKET_CATALOG) {
            expect(m.key).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
            expect(m.locationCode).toBeGreaterThan(0);
            expect(m.languageCode).toMatch(/^[a-z]{2}$/);
        }
    });
    it("includes Türkiye (2792/tr) as tr-TR", () => {
        expect(getMarketForCodes(2792, "tr")?.key).toBe("tr-TR");
    });
    it("looks up by key and returns undefined for unknown", () => {
        expect(getMarket("de-DE")?.countryCode).toBe("DE");
        expect(getMarket("zz-ZZ")).toBeUndefined();
    });
    it("reserves global and legacy sentinels distinct from catalog keys", () => {
        expect(GLOBAL_MARKET_KEY).toBe("global");
        expect(LEGACY_MARKET_KEY).toBe("legacy");
        expect(MARKET_CATALOG.map((m) => m.key)).not.toContain(GLOBAL_MARKET_KEY);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @workspace/config exec vitest run src/markets.test.ts`
Expected: FAIL — cannot resolve `./markets`.

- [ ] **Step 3: Implement the catalog**

`packages/config/src/markets.ts`:
```ts
export interface Market {
    /** Stable BCP-47-style key, persisted forever, never reused. */
    key: string;
    /** ISO-3166 alpha-2, e.g. "TR". */
    countryCode: string;
    /** ISO-639-1, e.g. "tr" — DataForSEO language_code. */
    languageCode: string;
    /** DataForSEO location_code, e.g. 2792. */
    locationCode: number;
}

/** Reserved sentinels — NOT catalog entries. */
export const GLOBAL_MARKET_KEY = "global";
export const LEGACY_MARKET_KEY = "legacy";

/** Curated v1 markets. Labels are rendered from codes via Intl.DisplayNames, not stored. */
export const MARKET_CATALOG: readonly Market[] = [
    { key: "tr-TR", countryCode: "TR", languageCode: "tr", locationCode: 2792 },
    { key: "de-DE", countryCode: "DE", languageCode: "de", locationCode: 2276 },
    { key: "en-GB", countryCode: "GB", languageCode: "en", locationCode: 2826 },
    { key: "en-US", countryCode: "US", languageCode: "en", locationCode: 2840 },
];

export function getMarket(key: string): Market | undefined {
    return MARKET_CATALOG.find((m) => m.key === key);
}

export function getMarketForCodes(locationCode: number, languageCode: string): Market | undefined {
    return MARKET_CATALOG.find((m) => m.locationCode === locationCode && m.languageCode === languageCode);
}
```

- [ ] **Step 4: Add the config export and verify the test passes**

Add to `packages/config/package.json` `exports` (alphabetical, before `"./model-filter"`):
```json
"./markets": "./src/markets.ts",
```
Run: `pnpm --filter @workspace/config exec vitest run src/markets.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing localizability test**

`packages/lib/src/providers/localizable.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { resolveLocalizable } from "./index";

const cfg = (model: string, provider: string, version?: string) => ({ model, provider, version, webSearch: false });

describe("resolveLocalizable", () => {
    it("is true for DataForSEO scraped routes", () => {
        expect(resolveLocalizable(cfg("google-ai-mode", "dataforseo"))).toBe(true);
        expect(resolveLocalizable(cfg("google-ai-overview", "dataforseo"))).toBe(true);
        expect(resolveLocalizable(cfg("chatgpt", "dataforseo"))).toBe(true); // unpinned scraper
        expect(resolveLocalizable(cfg("gemini", "dataforseo"))).toBe(true); // unpinned scraper
    });
    it("is false for DataForSEO LLM-Responses (pinned) and Perplexity", () => {
        expect(resolveLocalizable(cfg("chatgpt", "dataforseo", "gpt-4o"))).toBe(false);
        expect(resolveLocalizable(cfg("gemini", "dataforseo", "gemini-2.0"))).toBe(false);
        expect(resolveLocalizable(cfg("perplexity", "dataforseo"))).toBe(false);
    });
    it("is false for direct-API and BrightData", () => {
        expect(resolveLocalizable(cfg("chatgpt", "openai-api"))).toBe(false);
        expect(resolveLocalizable(cfg("claude", "anthropic-api"))).toBe(false);
        expect(resolveLocalizable(cfg("google-ai-overview", "brightdata"))).toBe(false);
    });
});
```
> Note: use the exact `SERP_MODELS`/`AI_OVERVIEW_MODEL`/`SCRAPER_CALLS` model ids from `dataforseo.ts` when picking test strings; `perplexity` must be a real Perplexity model id there.

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @workspace/lib exec vitest run src/providers/localizable.test.ts`
Expected: FAIL — `resolveLocalizable` is not exported.

- [ ] **Step 7: Extend the Provider interface**

In `packages/lib/src/providers/types.ts`, extend `ProviderOptions` (currently lines 18-21):
```ts
export interface ProviderOptions {
    webSearch?: boolean;
    version?: string;
    /** Localized market for scraped routes; set by the worker for localizable targets only. */
    market?: { locationCode: number; languageCode: string };
}
```
Add to the `Provider` interface (after `accessFor?`):
```ts
    /** Whether this provider localizes for targets that don't refine it. Defaults false. */
    localizable?: boolean;
    /** Per-target localizability; wins over `localizable`. */
    localizableFor?(config: ModelConfig): boolean;
```

- [ ] **Step 8: Implement `resolveLocalizable` and DataForSEO's predicate**

In `packages/lib/src/providers/index.ts` (next to `resolveProviderAccess`):
```ts
export function resolveLocalizable(config: ModelConfig): boolean {
    const provider = getProvider(config.provider);
    return provider.localizableFor?.(config) ?? provider.localizable ?? false;
}
```
In `packages/lib/src/providers/registry/dataforseo.ts`, add to the provider object (next to `accessFor: dataforseoAccess`):
```ts
    localizableFor: (config) => dataforseoAccess(config) === "scraped",
```

- [ ] **Step 9: Run both test files to verify they pass**

Run: `pnpm --filter @workspace/config exec vitest run src/markets.test.ts && pnpm --filter @workspace/lib exec vitest run src/providers/localizable.test.ts`
Expected: PASS. Then `pnpm --filter @workspace/lib exec tsc --noEmit` and `pnpm lint`.

- [ ] **Step 10: Commit**

```bash
git add packages/config/src/markets.ts packages/config/src/markets.test.ts packages/config/package.json \
  packages/lib/src/providers/types.ts packages/lib/src/providers/index.ts \
  packages/lib/src/providers/registry/dataforseo.ts packages/lib/src/providers/localizable.test.ts
git commit -m "add market catalog and per-target localizability predicate"
```

---

### Task 2: Schema columns + migration

**Files:**
- Modify: `packages/lib/src/db/schema.ts` (`brands`, `promptRuns`)
- Create (generated): `packages/lib/src/db/migrations/0024_*.sql` + `meta/0024_snapshot.json` + updated `meta/_journal.json`
- Test: `packages/lib/src/db/schema.market.test.ts`

**Interfaces:**
- Produces: `Brand.defaultMarketKey: string | null`; `PromptRun.marketKey: string`; `NewPromptRun.marketKey?: string` (defaulted `'global'`).

- [ ] **Step 1: Write the failing schema test**

`packages/lib/src/db/schema.market.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { brands, promptRuns } from "./schema";

describe("market schema columns", () => {
    it("brands has a nullable default_market_key", () => {
        const col = (brands as any).default_market_key ?? (brands as any).defaultMarketKey;
        expect(col).toBeDefined();
        expect(col.name).toBe("default_market_key");
        expect(col.notNull).toBe(false);
    });
    it("prompt_runs has market_key NOT NULL with temporary 'legacy' default", () => {
        const col = (promptRuns as any).market_key ?? (promptRuns as any).marketKey;
        expect(col).toBeDefined();
        expect(col.name).toBe("market_key");
        expect(col.notNull).toBe(true);
        expect(col.default).toBe("legacy");
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @workspace/lib exec vitest run src/db/schema.market.test.ts`
Expected: FAIL — columns undefined.

- [ ] **Step 3: Add the columns to schema.ts**

In `brands` (after `enabledModels`):
```ts
        defaultMarketKey: text("default_market_key"),
```
In `promptRuns` (after `brandRank`) — the default is **`legacy`** (temporary cutover marker), never `global`:
```ts
        marketKey: text("market_key").notNull().default("legacy"),
```
Add an index in the `promptRuns` index object:
```ts
        brandMarketCreatedAtIdx: index("prompt_runs_brand_id_market_key_created_at_idx").on(
            table.brandId,
            table.marketKey,
            table.createdAt,
        ),
```

- [ ] **Step 4: Verify the schema test passes**

Run: `pnpm --filter @workspace/lib exec vitest run src/db/schema.market.test.ts`
Expected: PASS.

- [ ] **Step 5: Generate the migration (do NOT run it)**

Run: `pnpm --filter @workspace/lib exec drizzle-kit generate`
This writes `src/db/migrations/0024_<name>.sql`, `meta/0024_snapshot.json`, and appends idx 24 to `meta/_journal.json`. **Open the generated `.sql` and confirm** it contains exactly (order/quoting per prior migrations):
```sql
ALTER TABLE "brands" ADD COLUMN "default_market_key" text;--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "market_key" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
CREATE INDEX "prompt_runs_brand_id_market_key_created_at_idx" ON "prompt_runs" USING btree ("brand_id","market_key","created_at");
```
The `DEFAULT 'legacy' NOT NULL` on a populated table is intentional: rolling-deploy-safe (an old worker's insert can't fail) **and** it marks all pre-cutover rows as `legacy` (unknown scope) so the proven-non-localizable `global` value never collides with an unclassified default. New code always writes an explicit `runMarketKey`.

- [ ] **Step 6: Verify it applies against a scratch DB, then discard (do not touch prod)**

If a local Postgres is available, apply to a throwaway DB to confirm the SQL is valid on a populated table; otherwise inspect only. Never run against `DATABASE_URL` pointing at prod. `pnpm --filter @workspace/lib exec tsc --noEmit` must pass.

- [ ] **Step 7: Commit (schema + migration + meta together)**

```bash
git add packages/lib/src/db/schema.ts packages/lib/src/db/schema.market.test.ts \
  packages/lib/src/db/migrations/0024_*.sql packages/lib/src/db/migrations/meta/0024_snapshot.json \
  packages/lib/src/db/migrations/meta/_journal.json
git commit -m "add default_market_key and prompt_runs.market_key columns"
```
> The migration SQL, snapshot, and `_journal.json` MUST be committed together — a partial commit breaks migration lineage.

---

### Task 3: Effective-market resolution + stamping in the run pipeline

**Files:**
- Create: `packages/lib/src/markets/effective.ts`
- Modify: `packages/lib/src/providers/registry/dataforseo.ts` (4 injection sites + guard)
- Modify: `apps/worker/src/jobs/process-prompt.ts` (`runModelIteration`, fan-out, `savePromptRun`)
- Test: `packages/lib/src/markets/effective.test.ts`, `packages/lib/src/providers/registry/dataforseo.market.test.ts`

**Interfaces:**
- Consumes: `resolveLocalizable` (Task 1), `getMarket`/`getMarketForCodes` (Task 1), `dfsLocationCode`/`dfsLanguageCode`.
- Produces: `resolveEffectiveMarket(input: { defaultMarketKey: string | null }): Market` (throws if env fallback maps to no catalog entry); `runMarketKey` stamped on `prompt_runs.market_key`.

- [ ] **Step 1: Write the failing effective-market test**

`packages/lib/src/markets/effective.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveEffectiveMarket } from "./effective";

afterEach(() => vi.unstubAllEnvs());

describe("resolveEffectiveMarket", () => {
    it("uses the brand's explicit market", () => {
        expect(resolveEffectiveMarket({ defaultMarketKey: "de-DE" }).key).toBe("de-DE");
    });
    it("falls back to the deployment env market when unset", () => {
        vi.stubEnv("DATAFORSEO_LOCATION_CODE", "2792");
        vi.stubEnv("DATAFORSEO_LANGUAGE_CODE", "tr");
        expect(resolveEffectiveMarket({ defaultMarketKey: null }).key).toBe("tr-TR");
    });
    it("throws when the env pair maps to no catalog entry", () => {
        vi.stubEnv("DATAFORSEO_LOCATION_CODE", "9999");
        vi.stubEnv("DATAFORSEO_LANGUAGE_CODE", "zz");
        expect(() => resolveEffectiveMarket({ defaultMarketKey: null })).toThrow(/no catalog market/i);
    });
    it("throws when the explicit key is unknown", () => {
        expect(() => resolveEffectiveMarket({ defaultMarketKey: "zz-ZZ" })).toThrow(/unknown market/i);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @workspace/lib exec vitest run src/markets/effective.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `resolveEffectiveMarket`**

`packages/lib/src/markets/effective.ts`:
```ts
import { getMarket, getMarketForCodes, type Market } from "@workspace/config/markets";
import { dfsLanguageCode, dfsLocationCode } from "../providers/registry/dataforseo-shared";

/** Resolve the market a brand's localizable runs execute in. Throws on misconfiguration. */
export function resolveEffectiveMarket(input: { defaultMarketKey: string | null }): Market {
    if (input.defaultMarketKey) {
        const m = getMarket(input.defaultMarketKey);
        if (!m) throw new Error(`Unknown market key "${input.defaultMarketKey}"`);
        return m;
    }
    const loc = dfsLocationCode();
    const lang = dfsLanguageCode();
    const m = getMarketForCodes(loc, lang);
    if (!m) throw new Error(`Deployment env (location ${loc}, language ${lang}) maps to no catalog market`);
    return m;
}
```

- [ ] **Step 4: Verify the effective-market test passes**

Run: `pnpm --filter @workspace/lib exec vitest run src/markets/effective.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing DataForSEO market-guard test**

`packages/lib/src/providers/registry/dataforseo.market.test.ts` — assert that a localizable scraped route uses `options.market` codes and throws without them. Since `run` calls the DataForSEO SDK, test at the level of the request-builder: extract the guard into a tiny exported helper and test it directly.
```ts
import { describe, expect, it } from "vitest";
import { requireMarketCodes } from "./dataforseo";

describe("requireMarketCodes", () => {
    it("returns the market codes when present", () => {
        expect(requireMarketCodes({ market: { locationCode: 2792, languageCode: "tr" } })).toEqual({
            locationCode: 2792,
            languageCode: "tr",
        });
    });
    it("throws when a localizable route is called without a market", () => {
        expect(() => requireMarketCodes({})).toThrow(/requires options\.market/i);
        expect(() => requireMarketCodes(undefined)).toThrow(/requires options\.market/i);
    });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @workspace/lib exec vitest run src/providers/registry/dataforseo.market.test.ts`
Expected: FAIL — `requireMarketCodes` not exported.

- [ ] **Step 7: Add the guard and use `options.market` at the 4 sites**

In `dataforseo.ts`, add and export:
```ts
export function requireMarketCodes(options?: ProviderOptions): { locationCode: number; languageCode: string } {
    if (!options?.market) throw new Error("DataForSEO localizable route requires options.market");
    return { locationCode: options.market.locationCode, languageCode: options.market.languageCode };
}
```
Thread the resolved codes into the 4 injection sites instead of `dfsLocationCode()`/`dfsLanguageCode()`. In `run(...)`, before dispatching a scraped route, compute `const { locationCode, languageCode } = requireMarketCodes(options);` and pass `locationCode`/`languageCode` into `SCRAPER_CALLS.chatgpt`, `SCRAPER_CALLS.gemini`, `runGoogleAiMode`, and `runGoogleAiOverview` (extend those builders to accept the codes). The `runLlmResponse` path is unchanged (never localized). `dfsLocationCode`/`dfsLanguageCode` remain only as the source used by `resolveEffectiveMarket`.

- [ ] **Step 8: Verify the guard test passes**

Run: `pnpm --filter @workspace/lib exec vitest run src/providers/registry/dataforseo.market.test.ts`
Expected: PASS.

- [ ] **Step 9: Thread `runMarketKey` through the worker**

In `apps/worker/src/jobs/process-prompt.ts`:
- Import `resolveEffectiveMarket` and `resolveLocalizable`, plus `GLOBAL_MARKET_KEY`.
- In `processPrompt`, after loading `brand`, compute once:
```ts
const effectiveMarket = resolveEffectiveMarket({ defaultMarketKey: brand.defaultMarketKey });
```
- In the fan-out (currently 462-475), pass a per-target market key + provider options. In `runModelIteration`, compute:
```ts
const localizable = resolveLocalizable(config);
const runMarketKey = localizable ? effectiveMarket.key : GLOBAL_MARKET_KEY;
const result = await providerImpl.run(config.model, promptValue, {
    webSearch: config.webSearch,
    version: config.version,
    market: localizable ? { locationCode: effectiveMarket.locationCode, languageCode: effectiveMarket.languageCode } : undefined,
});
```
  (Pass `effectiveMarket` into `runModelIteration` via its params object.)
- Extend `savePromptRun` with a `marketKey: string` param and add `marketKey` to the `.values({...})` insert; pass `runMarketKey` at the call site (345-358).
- **Write-path inventory:** grep the whole repo for inserts into `promptRuns` (`rg "insert\(promptRuns\)" ` / `.values(` on `promptRuns`) — scheduled runs, any manual/re-run path, admin/import paths, and test seeders. Every production insert must supply `marketKey` (the `legacy` DB default only backstops the deploy overlap, not app code). List the sites you found in the task report; update each real insert to pass an explicit key (`global` where non-localizable). Seeders/tests may pass an explicit key or rely on the default, but note which.

- [ ] **Step 10: Write a worker stamping test**

Add to the worker's process-prompt tests (mirror the existing suite's provider/db mocks): assert that (a) a localizable target's run is saved with `market_key` = the brand's effective market and `run` receives `options.market`; (b) a non-localizable target is saved with `market_key = "global"` and `run` receives `market: undefined`; (c) with `brand.defaultMarketKey = null` and env `2792/tr`, the localizable run is stamped `tr-TR` (not `global`).
```ts
// shape (adapt to the file's existing mocks/fixtures):
it("stamps localizable runs with the brand's effective market", async () => {
    // brand.defaultMarketKey = "de-DE"; a dataforseo google-ai-overview target
    // → savePromptRun called with marketKey "de-DE"; providerImpl.run options.market = {2276,"de"}
});
it("stamps non-localizable runs as global", async () => {
    // an openai-api target → marketKey "global", options.market undefined
});
```

- [ ] **Step 11: Run worker + lib tests, tsc, lint**

Run: `pnpm --filter @workspace/lib test && pnpm --filter @workspace/worker exec vitest run && pnpm --filter @workspace/lib exec tsc --noEmit && pnpm --filter @workspace/worker exec tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add packages/lib/src/markets/ packages/lib/src/providers/registry/dataforseo.ts \
  packages/lib/src/providers/registry/dataforseo.market.test.ts apps/worker/src/jobs/process-prompt.ts \
  apps/worker/src/jobs/*.test.ts
git commit -m "resolve and stamp per-brand effective market on evaluation runs"
```

---

### Task 4: Market-aware scheduler freshness

**Files:**
- Modify: `packages/lib/src/run-policy/policy.ts` (`targetKey`, `LastRunRow`, `lastRunsByTargetKey`, `selectDueTargets`)
- Modify: `apps/worker/src/jobs/process-prompt.ts` (`getLastRunsByTargetKey` select/groupBy + `selectDueTargets` call)
- Test: `packages/lib/src/run-policy/policy.market.test.ts`

**Interfaces:**
- Produces: `targetKey(config, marketKey: string): string`; `lastRunsByTargetKey(rows)` where `LastRunRow` gains `marketKey: string`; `selectDueTargets(targets, lastRunAtByKey, now, marketKeyFor: (config: ModelConfig) => string): TargetPlan[]`.

- [ ] **Step 1: Write the failing scheduler test**

`packages/lib/src/run-policy/policy.market.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { lastRunsByTargetKey, selectDueTargets, targetKey, type TargetPlan } from "./policy";

const cfg = (model: string) => ({ model, provider: "dataforseo", webSearch: false });
const plan = (model: string): TargetPlan => ({ config: cfg(model), intervalHours: 24, replication: 1 });
const marketKeyFor = (c: { model: string }) => (c.model === "openai" ? "global" : "de-DE");

describe("market-aware freshness", () => {
    it("targetKey includes the market", () => {
        expect(targetKey(cfg("google-ai-overview"), "de-DE")).toContain("de-DE");
        expect(targetKey(cfg("google-ai-overview"), "de-DE")).not.toBe(targetKey(cfg("google-ai-overview"), "tr-TR"));
    });
    it("a recent tr-TR run does not mark the de-DE target fresh", () => {
        const now = new Date("2026-09-20T12:00:00Z");
        const recent = new Date("2026-09-20T11:00:00Z");
        const lastRuns = lastRunsByTargetKey([
            { model: "google-ai-overview", provider: "dataforseo", webSearchEnabled: false, marketKey: "tr-TR", lastRunAt: recent },
        ]);
        // brand now on de-DE → target is due despite the recent tr-TR run
        const due = selectDueTargets([plan("google-ai-overview")], lastRuns, now, marketKeyFor);
        expect(due).toHaveLength(1);
    });
    it("does not re-due global (non-localizable) targets on a market change", () => {
        const now = new Date("2026-09-20T12:00:00Z");
        const recent = new Date("2026-09-20T11:00:00Z");
        const lastRuns = lastRunsByTargetKey([
            { model: "openai", provider: "dataforseo", webSearchEnabled: false, marketKey: "global", lastRunAt: recent },
        ]);
        const due = selectDueTargets([plan("openai")], lastRuns, now, marketKeyFor);
        expect(due).toHaveLength(0); // global key unchanged by a market switch
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @workspace/lib exec vitest run src/run-policy/policy.market.test.ts`
Expected: FAIL — arity mismatch / market not in key.

- [ ] **Step 3: Add market to the scheduling identity**

In `policy.ts`:
```ts
export function targetKey(config: Pick<ModelConfig, "model" | "provider" | "webSearch">, marketKey: string): string {
    return `${config.model}::${config.provider}::${config.webSearch ? "web" : "base"}::${marketKey}`;
}

export interface LastRunRow {
    model: string;
    provider: string | null;
    webSearchEnabled: boolean;
    marketKey: string;
    lastRunAt: Date | string;
}

export function lastRunsByTargetKey(rows: readonly LastRunRow[]): Map<string, Date> {
    const byKey = new Map<string, Date>();
    for (const row of rows) {
        if (!row.provider) continue;
        byKey.set(
            targetKey({ model: row.model, provider: row.provider, webSearch: row.webSearchEnabled }, row.marketKey),
            new Date(row.lastRunAt),
        );
    }
    return byKey;
}

export function selectDueTargets(
    targets: TargetPlan[],
    lastRunAtByKey: Map<string, Date>,
    now: Date,
    marketKeyFor: (config: ModelConfig) => string,
): TargetPlan[] {
    return targets.filter((plan) =>
        isTargetDue(plan, lastRunAtByKey.get(targetKey(plan.config, marketKeyFor(plan.config))), now),
    );
}
```

- [ ] **Step 4: Verify the scheduler test passes**

Run: `pnpm --filter @workspace/lib exec vitest run src/run-policy/policy.market.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the worker's last-run query and due call**

In `process-prompt.ts` `getLastRunsByTargetKey`: add `marketKey: promptRuns.marketKey` to the `.select({...})` and `promptRuns.marketKey` to `.groupBy(...)`. At the `selectDueTargets` call (434-435), pass the market resolver:
```ts
const runMarketKeyFor = (config: ModelConfig) =>
    resolveLocalizable(config) ? effectiveMarket.key : GLOBAL_MARKET_KEY;
const dueTargets = selectDueTargets(plan.targets, lastRuns, new Date(), runMarketKeyFor);
```
(Reuse the same `runMarketKeyFor` in Task 3's fan-out so stamping and scheduling agree.)

- [ ] **Step 6: Run worker + lib tests, tsc, lint**

Run: `pnpm --filter @workspace/lib test && pnpm --filter @workspace/worker exec tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/lib/src/run-policy/policy.ts packages/lib/src/run-policy/policy.market.test.ts \
  apps/worker/src/jobs/process-prompt.ts
git commit -m "key scheduler freshness by run market"
```

---

### Task 5: Market-scoped brand analytics reads

**Files:**
- Modify: `apps/web/src/lib/postgres-read.ts` (`marketScope` helper + `effectiveMarketKey` param on brand-scoped aggregates)
- Modify: `apps/web/src/server/analytics-core.ts` (resolve effective market key; thread it)
- Modify: `apps/web/src/server/citations.ts`, `competitors-core.ts` as needed (pass the key through)
- Test: `apps/web/src/lib/__tests__/market-scope.test.ts`

**Interfaces:**
- Consumes: `resolveEffectiveMarket` (Task 3), `Brand.defaultMarketKey`.
- Produces: `marketScope(effectiveMarketKey: string, opts?: { alias?: string; source?: "prompt_runs" | "citations" }): SQL`; every brand-scoped read gains a trailing `effectiveMarketKey: string` argument.

> This is the largest task by surface but mechanically uniform: one predicate, threaded through the brand-scoped aggregates. It is a **fixed** single-market scope (no user selector — that's 2b). Do NOT add a UI filter.

- [ ] **Step 1: Write the failing scope-helper test**

`apps/web/src/lib/__tests__/market-scope.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { marketScope } from "../postgres-read";

// marketScope returns a drizzle SQL fragment; assert the params it binds and the shape.
describe("marketScope", () => {
    it("includes the effective market and global, excluding legacy/others", () => {
        const frag = marketScope("de-DE");
        const { sql, params } = frag.toQuery ? frag.toQuery() : (frag as any);
        // The predicate binds the effective key and matches 'global' literally.
        expect(params).toContain("de-DE");
    });
    it("scopes the citations source via a join to prompt_runs", () => {
        const frag = marketScope("de-DE", "citations");
        expect(String(frag)).toBeTruthy(); // present, non-empty
    });
});
```
> Adapt the assertion to how the repo already introspects `SQL` fragments in existing postgres-read tests; if none introspect SQL, assert behavior via a thin integration test against a seeded test DB instead (preferred — see Step 5).

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @workspace/web exec vitest run src/lib/__tests__/market-scope.test.ts`
Expected: FAIL — `marketScope` not exported.

- [ ] **Step 3: Implement `marketScope` with a closed source union (no arbitrary alias)**

In `postgres-read.ts`, next to `modelFilter`. Take a **closed** `source` union mapped to known SQL identifiers internally — do **not** accept an arbitrary alias string through `sql.raw` (review r6 medium):
```ts
type MarketScopeSource =
    | "prompt_runs"        // unaliased prompt_runs row
    | "pr"                 // prompt_runs aliased "pr" (fanout queries)
    | "citations";         // citations row → EXISTS-join back to prompt_runs

export function marketScope(effectiveMarketKey: string, source: MarketScopeSource = "prompt_runs"): SQL {
    if (source === "citations") {
        return sql`AND EXISTS (
            SELECT 1 FROM prompt_runs AS ms_run
            WHERE ms_run.id = prompt_run_id
                AND (ms_run.market_key = ${effectiveMarketKey} OR ms_run.market_key = 'global')
        )`;
    }
    const prefix = source === "pr" ? sql.raw("pr.") : sql``;
    return sql`AND (${prefix}market_key = ${effectiveMarketKey} OR ${prefix}market_key = 'global')`;
}
```
Add a `source` value here (and a matching branch) for any other alias a real query uses; keep the set closed. `legacy` and any non-effective real market are excluded automatically; `global` (proven non-localizable) is included.

- [ ] **Step 4: Thread `effectiveMarketKey` through the brand-scoped reads**

Add a trailing `effectiveMarketKey: string` parameter to each brand-scoped query in `postgres-read.ts` and interpolate `${marketScope(effectiveMarketKey, <source>)}` into its `WHERE` (`"citations"` for citation queries, `"pr"` for fanout/aliased queries, else `"prompt_runs"`).

**Scope by meaning, not signature (review r6 medium):** a query belongs in the inventory if its output appears in a market-scoped brand view — even if it takes `promptId`/a prompt-id list/citations rather than `brandId`. Example: `getPromptsFirstEvaluatedAt` has no `brandId` but drives chart date bounds; if it counts old-market runs the chart shows wrong start dates or long empty ranges, so it MUST scope too. Do **not** skip a function merely because it lacks a `brandId` parameter. The **read-path inventory** — every one of these must scope (per spec review r5 #5):
  - Visibility/summary: `getDashboardSummary`, `getVisibilityDailyAggregate`, `getPerPromptVisibilityTimeSeries`, `getVisibilityTimeSeries`, `getBatchChartData`, `getBrandEarliestRunDate`, `getBrandMentionTotals`, `getPerPromptDailyMentions`.
  - Coverage/summary: `getPromptsSummary`, `getPromptMentionSummary`, `getPerPromptRunStats`, `getPromptRuns`, `countPromptRuns`.
  - Per-model: `getBrandMentionRateByModel`.
  - Fanout: `getFanoutBreakdown`, `getFanoutModelTotals`, `getFanoutPromptTotals`, `getPromptWebQueryCounts`.
  - Citations/sources: `getCitationsTotalCount`, `getCitationDomainStats`, `getCitationUrlStats`, `getCitationDomainPromptCounts`, `getPromptCitationUrlStats`, `getDailyCitationStats`, `getPerPromptDailyCitationStats`, `getPerPromptCitationPages`, `getPerPromptDailyCitationPages`.
  - Competitors/SoV: `getPromptTopCompetitorMentions`, `getPerPromptDailyCompetitorMentions` (and `getBrandShareOfVoice` in analytics-core, which builds on these).
  - Chart-boundary / date helpers that feed a brand view: `getPromptsFirstEvaluatedAt`, `getBrandEarliestRunDate` (scope these — they set axis ranges).
  (No CSV/data export path exists — "export" is client-side chart images only, so nothing to scope there.)
> Only genuinely market-independent helpers stay untouched (e.g. `isCalendarDay`, a pure date util). The test of inclusion is "does its output appear in a market-scoped brand view?", not "does it take `brandId`?"

- [ ] **Step 5: Resolve and pass the effective market key from the server layer**

In `analytics-core.ts`, resolve the brand's effective market once per request and pass it to every read. Fetch `brand.defaultMarketKey` (already loaded where the brand is fetched; if not, add it to the select) and:
```ts
import { resolveEffectiveMarket } from "@workspace/lib/markets/effective";
const effectiveMarketKey = resolveEffectiveMarket({ defaultMarketKey: brand.defaultMarketKey }).key;
```
Thread `effectiveMarketKey` into every `postgres-read` call in `analytics-core.ts`, `citations.ts`, `competitors-core.ts`. Add the **behavioral test** against a seeded test DB (mirror existing postgres-read integration tests if present): insert runs for one brand across `tr-TR`, `de-DE`, `global`, and `legacy`; assert `getDashboardSummary(..., "tr-TR")` counts only `tr-TR` + `global`, excludes `de-DE` and `legacy`.

- [ ] **Step 6: Run web tests, tsc, lint**

Run: `pnpm --filter @workspace/web exec vitest run && pnpm --filter @workspace/web exec tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/postgres-read.ts apps/web/src/lib/__tests__/market-scope.test.ts \
  apps/web/src/server/analytics-core.ts apps/web/src/server/citations.ts apps/web/src/server/competitors-core.ts
git commit -m "scope brand analytics to the effective market"
```

---

### Task 6: Evaluation-market picker in brand settings

**Files:**
- Create: `apps/web/src/server/brand-market.ts` (`updateBrandMarketFn`, `getBrandMarketStateFn`)
- Modify: `apps/web/src/routes/_authed/app/org/$org/brand/$brand/settings/brand.tsx` (the picker + note)
- Modify: `apps/web/src/locales/en.json`, `apps/web/src/locales/tr.json` (new keys)
- Create: `apps/web/src/lib/market-label.ts` (`Intl.DisplayNames` rendering)
- Test: `apps/web/src/server/__tests__/brand-market.test.ts`, `apps/web/src/lib/__tests__/i18n-parity.test.ts`
- Changeset: `.changeset/per-brand-market.md`

**Interfaces:**
- Consumes: `MARKET_CATALOG`, `getMarket` (Task 1); `resolveEffectiveMarket` (Task 3); `requirePlatformPicksEditable`/`getDeployment().features.platformPicksEditable`.
- Produces: `updateBrandMarketFn({ brandId, marketKey })`; `getBrandMarketStateFn({ brandId }) → { marketKey: string; editable: boolean; options: Market[] }`.

- [ ] **Step 1: Write the failing server-fn test**

`apps/web/src/server/__tests__/brand-market.test.ts` (mirror `platform-picks` test mocks):
```ts
// Assertions (adapt to the repo's server-fn test harness / mocks):
// - updateBrandMarketFn rejects a key not in MARKET_CATALOG (throws / validation error)
// - updateBrandMarketFn writes brands.default_market_key when the deployment allows editing
// - updateBrandMarketFn throws when platform picks are not editable (demo/read-only)
// - getBrandMarketStateFn returns editable=false in a read-only deployment
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @workspace/web exec vitest run src/server/__tests__/brand-market.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the server fns (mirror `updateEnabledModelsFn`)**

`apps/web/src/server/brand-market.ts`:
```ts
import { getMarket, MARKET_CATALOG } from "@workspace/config/markets";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { requireBrandSession } from "@/lib/auth/session"; // match existing import path used by updateEnabledModelsFn
import { canEditPlatformPicks, requirePlatformPicksEditable } from "@/lib/auth/helpers";
// ...createServerFn wrapper matching the file's conventions

const marketKeys = MARKET_CATALOG.map((m) => m.key) as [string, ...string[]];

// updateBrandMarketFn: validate { brandId, marketKey: z.enum(marketKeys) }
//   → requireBrandSession(brandId) → requirePlatformPicksEditable()
//   → db.update(brands).set({ defaultMarketKey: marketKey, updatedAt: new Date() }).where(eq(brands.id, brandId))
// getBrandMarketStateFn: validate { brandId } → requireBrandSession
//   → read brands.defaultMarketKey → return { marketKey: defaultMarketKey ?? <env-effective key>, editable: canEditPlatformPicks(), options: [...MARKET_CATALOG] }
```
Use the exact server-fn/auth patterns from `platform-picks.ts` (validator style, `requireBrandSession`, the read-only gate). Reject unknown keys via the `z.enum` on catalog keys.

- [ ] **Step 4: Verify the server-fn test passes**

Run: `pnpm --filter @workspace/web exec vitest run src/server/__tests__/brand-market.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the market-label helper**

`apps/web/src/lib/market-label.ts`:
```ts
import { getMarket } from "@workspace/config/markets";
import { locale } from "@/lib/i18n";

/** Human label for a market key, localized to the UI locale, e.g. "Germany · German". */
export function marketLabel(key: string): string {
    const m = getMarket(key);
    if (!m) return key;
    const region = new Intl.DisplayNames([locale], { type: "region" }).of(m.countryCode) ?? m.countryCode;
    const language = new Intl.DisplayNames([locale], { type: "language" }).of(m.languageCode) ?? m.languageCode;
    return `${region} · ${language}`;
}
```

- [ ] **Step 6: Add i18n keys to BOTH locale files**

Add to `apps/web/src/locales/en.json` (flat dotted keys):
```json
"settings.market.label": "Evaluation market",
"settings.market.help": "Sets where and in which interface language evaluations run. Your questions must already be written in the selected market's language; automatic translation arrives later.",
"settings.market.readonly": "The evaluation market is set by whoever runs this deployment."
```
Add the same three keys to `apps/web/src/locales/tr.json` with Turkish translations, e.g.:
```json
"settings.market.label": "Değerlendirme pazarı",
"settings.market.help": "Değerlendirmelerin hangi ülkede ve arayüz dilinde çalışacağını belirler. Sorularınız seçilen pazarın dilinde yazılmış olmalıdır; otomatik çeviri daha sonra gelecek.",
"settings.market.readonly": "Değerlendirme pazarı, bu dağıtımı yöneten kişi tarafından belirlenir."
```

- [ ] **Step 7: Add a locale-parity test (none exists today)**

`apps/web/src/lib/__tests__/i18n-parity.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import en from "../../locales/en.json";
import tr from "../../locales/tr.json";

describe("i18n parity", () => {
    it("tr.json has every key en.json has", () => {
        const missing = Object.keys(en).filter((k) => !(k in tr));
        expect(missing).toEqual([]);
    });
});
```
Run it; if pre-existing gaps exist, fix only by adding the missing tr keys is out of scope — instead scope the assertion to the new `settings.market.*` keys if the repo has known prior gaps. Prefer full parity if the file is already clean.

- [ ] **Step 8: Add the picker + note to the brand settings page**

In `settings/brand.tsx`, load `getBrandMarketStateFn` and render a single-select of `options` (labels via `marketLabel(key)`), bound to the current `marketKey`, calling `updateBrandMarketFn` on change; disable it and show `t("settings.market.readonly")` when `!editable`; render `t("settings.market.help")` under the control. Also show the resolved market label on the dashboard header (small, non-interactive) where the brand header is rendered.

- [ ] **Step 9: Add the changeset**

`.changeset/per-brand-market.md`:
```md
---
"@workspace/web": patch
---

Each brand can now choose its own evaluation market (country + language); its localized AI evaluations and dashboards use that market.
```

- [ ] **Step 10: Run web tests, tsc, lint**

Run: `pnpm --filter @workspace/web exec vitest run && pnpm --filter @workspace/web exec tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/server/brand-market.ts apps/web/src/server/__tests__/brand-market.test.ts \
  apps/web/src/lib/market-label.ts apps/web/src/lib/__tests__/i18n-parity.test.ts \
  apps/web/src/routes/_authed/app/org/\$org/brand/\$brand/settings/brand.tsx \
  apps/web/src/locales/en.json apps/web/src/locales/tr.json .changeset/per-brand-market.md
git commit -m "add per-brand evaluation market picker"
```

---

### Task 7: Idempotent brand-market backfill command

**Files:**
- Create: `packages/lib/scripts/backfill-brand-markets.ts`
- Modify: `packages/lib/package.json` (script entry)
- Create: `packages/lib/src/markets/backfill-classify.ts` + test (the pure classifier)
- Test: `packages/lib/src/markets/backfill-classify.test.ts`

**Interfaces:**
- Produces: `historicalMarketKeyFor(row: { model: string; provider: string | null; version: string | null; webSearchEnabled: boolean }, envMarketKey: string): string` — returns the env market for **provably localizable** historical runs, `"global"` for **provably non-localizable**, and `"legacy"` for genuinely **ambiguous** rows (DataForSEO `chatgpt`/`gemini`, whose scraped-vs-LLM-Responses route can't be reconstructed from stored columns).

- [ ] **Step 1: Write the failing classifier test**

`packages/lib/src/markets/backfill-classify.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { historicalMarketKeyFor } from "./backfill-classify";

const row = (o: Partial<{ model: string; provider: string | null; version: string | null; webSearchEnabled: boolean }>) => ({
    model: "google-ai-overview", provider: "dataforseo", version: null, webSearchEnabled: false, ...o,
});

describe("historicalMarketKeyFor", () => {
    it("assigns provably localizable DataForSEO routes (SERP/AI Overview) to the env market", () => {
        expect(historicalMarketKeyFor(row({ model: "google-ai-overview" }), "tr-TR")).toBe("tr-TR");
        expect(historicalMarketKeyFor(row({ model: "google-ai-mode" }), "tr-TR")).toBe("tr-TR");
    });
    it("leaves ambiguous DataForSEO chatbot routes as legacy", () => {
        expect(historicalMarketKeyFor(row({ model: "chatgpt", provider: "dataforseo" }), "tr-TR")).toBe("legacy");
        expect(historicalMarketKeyFor(row({ model: "gemini", provider: "dataforseo" }), "tr-TR")).toBe("legacy");
    });
    it("marks provably non-localizable runs as global", () => {
        expect(historicalMarketKeyFor(row({ model: "perplexity", provider: "dataforseo" }), "tr-TR")).toBe("global");
        for (const p of ["openai-api", "anthropic-api", "mistral-api", "openrouter", "brightdata", "olostep", "oxylabs", "cloro"]) {
            expect(historicalMarketKeyFor(row({ model: "x", provider: p }), "tr-TR")).toBe("global");
        }
    });
    it("treats a null provider as global", () => {
        expect(historicalMarketKeyFor(row({ provider: null }), "tr-TR")).toBe("global");
    });
});
```
> Use the exact ambiguous model ids from `dataforseo.ts` `SCRAPER_CALLS` (the version-sensitive scraper models — `chatgpt`, `gemini`). Expose a predicate from `dataforseo.ts`, e.g. `isVersionSensitiveDfsModel(model: string): boolean`, rather than hardcoding the set in two places.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @workspace/lib exec vitest run src/markets/backfill-classify.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the classifier (reconstruct + resolveLocalizable, ambiguous → legacy)**

`packages/lib/src/markets/backfill-classify.ts`:
```ts
import type { ModelConfig } from "@workspace/config/scrape-targets";
import { resolveLocalizable } from "../providers";
import { isVersionSensitiveDfsModel } from "../providers/registry/dataforseo";

/**
 * Attribution for a pre-2a run, from what the stored columns can PROVE:
 *  - DataForSEO chatgpt/gemini: scraped-vs-LLM-Responses depends on the ORIGINAL configured
 *    version, but prompt_runs.version stores the RESOLVED version — unreliable — so we cannot
 *    prove the route → leave "legacy" (hidden from market views, never mis-attributed).
 *  - Everything else: reconstruct ModelConfig and use resolveLocalizable (version-independent
 *    for SERP/AI-Overview and for all non-DataForSEO providers). Localizable → env market;
 *    non-localizable → "global".
 */
export function historicalMarketKeyFor(
    row: { model: string; provider: string | null; version: string | null; webSearchEnabled: boolean },
    envMarketKey: string,
): string {
    if (!row.provider) return "global";
    if (row.provider === "dataforseo" && isVersionSensitiveDfsModel(row.model)) return "legacy";
    const config: ModelConfig = {
        model: row.model,
        provider: row.provider,
        version: row.version ?? undefined,
        webSearch: row.webSearchEnabled,
    };
    return resolveLocalizable(config) ? envMarketKey : "global";
}
```
In `dataforseo.ts` export `export function isVersionSensitiveDfsModel(model: string): boolean { return model in SCRAPER_CALLS; }` (SCRAPER_CALLS keys are the version-sensitive scraper models — `chatgpt`, `gemini`).

- [ ] **Step 4: Verify the classifier test passes**

Run: `pnpm --filter @workspace/lib exec vitest run src/markets/backfill-classify.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the backfill script (mirror `verify-membership-dedupe.ts`)**

`packages/lib/scripts/backfill-brand-markets.ts`: read `DATABASE_URL`; refuse a non-local DB unless `ALLOW_REMOTE_DB=1`; using a `pg` `Client`, resolve the env market key via `getMarketForCodes(dfsLocationCode(), dfsLanguageCode())` (abort with a clear message if none); then, idempotently:
- `UPDATE brands SET default_market_key = $1 WHERE default_market_key IS NULL` (env market key);
- reassign **only the cutover rows**: iterate `prompt_runs WHERE market_key = 'legacy'` (batched by id), compute `historicalMarketKeyFor(row, envKey)`, and `UPDATE ... SET market_key = $new WHERE id = $id AND market_key = 'legacy'`. **Never touch rows where `market_key <> 'legacy'`** — genuine `global` (proven non-localizable) and real-market rows written by the new worker must be left alone (this is what makes it safe and idempotent).
Log `✓`/counts (localized / global / left-legacy); `process.exit(1)` on error. Idempotent: a second run finds no `legacy` rows for already-classified provable routes (ambiguous rows that stay `legacy` are simply re-evaluated to `legacy` — a no-op write, or skip them).

- [ ] **Step 6: Add the package script and smoke-test against a scratch DB**

Add to `packages/lib/package.json` scripts:
```json
"backfill:brand-markets": "tsx scripts/backfill-brand-markets.ts"
```
Smoke-test against a throwaway seeded DB (never prod): run twice, assert the second run changes 0 rows (idempotent). `pnpm --filter @workspace/lib exec tsc --noEmit` and `pnpm lint`.

- [ ] **Step 7: Commit**

```bash
git add packages/lib/scripts/backfill-brand-markets.ts packages/lib/src/markets/backfill-classify.ts \
  packages/lib/src/markets/backfill-classify.test.ts packages/lib/package.json
git commit -m "add idempotent brand-market backfill command"
```

---

## Notes for the executor

- **Sentinels:** `legacy` = unknown/cutover scope (the migration's temporary DB default; excluded from market views); `global` = **proven** non-localizable, written only explicitly by the new worker (**included** in every market view); `tr-TR`… = proven localized. The backfill only ever reclassifies `legacy` rows, so it can never corrupt a genuine `global` run — that was the core fix over the first draft.
- **Safe rollout / run order** (single-service deploy; all tasks land in one release):
  1. Migration adds the compatibility columns (`market_key DEFAULT 'legacy'`).
  2. New worker stamps explicit market/`global`; scheduler is market-aware.
  3. Old worker drains (Render replaces the instance); its overlap inserts landed as `legacy` — safe.
  4. **Run the backfill command** (`pnpm -C packages/lib backfill:brand-markets`) to set brand defaults and classify provable `legacy` rows.
  5. Because Task 5's scoped reads ship in the same release, there is a brief window between deploy and the backfill where historical `legacy` data is **hidden** (not contaminating) from market views — dashboards may look sparse until the backfill runs and new stamped runs accumulate within the lookback window. Run the backfill promptly to shorten it. This is a temporary sparsity, never a wrong number.
- **Optional follow-up (contract migration):** once you're confident no code path inserts without an explicit `market_key`, a later migration may drop the `legacy` DB default so an omitted attribution fails loudly instead of silently becoming `legacy`. Not required for 2a; the Task 3 write-path inventory is the interim guard.
- **Never run migrations** against a real database. Generate + commit only.
- If a test needs a real Postgres (Task 5, Task 7 smoke), use a disposable local DB; if none is available, implement the pure logic + its unit test and note the DB-integration assertion as verified manually, rather than pointing tests at prod.
