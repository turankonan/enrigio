# Phase 2 — Per-Market (Country/Language) Comparison — Design (v2)

> Status: v2, revised after an external review round (9 findings, 4 blockers) and two
> product decisions. Pending user review before the implementation plan.
> Phase 0 (sentiment, rank, coverage, opportunities-as-plan) and Phase 1 (AXO website audit)
> are shipped. This is Phase 2 — the last real gap from `docs/CUSTOMER-FEEDBACK-REVIEW.md`
> (comment #2): compare AI visibility across countries in one report.
>
> **v2 changelog:** existing views must be explicitly market-scoped (not "implicitly"); a
> real market comparison requires **reviewed translated prompt variants** per market;
> migration cannot read env, so backfill is a separate app command; market must be a target
> dimension **before** scheduler due-selection; localizability is **per-target**
> (`localizableFor`), not a flat flag; the daily ceiling + cost projection + `usage_events`
> must gain a market factor; `market_key` is `NOT NULL default 'global'` (no null/global
> duality); comparison reports completeness; catalog stores codes (BCP-47 keys) not English
> labels; a **top-of-brand market selector + breakdown strip** is the UX backbone.

## Goal

Let a brand be evaluated in multiple **markets** (country + language) with
language-appropriate question variants, and compare AI visibility across them — Türkiye vs
Germany vs UK — in one report. Only engines that actually localize participate per market;
engines with no country concept (direct-API Claude/GPT, and scraped engines that don't honor
location) run once and are shown as **Global — not localizable**, never treated as localized.

Non-goals (v1): localizing BrightData/olostep/oxylabs/cloro (provider work — they stay
Global); per-question or per-tag market assignment (markets are per-brand); free-form market
codes; a cross-country headline rank beyond the equal-weighted mean; localizing `citations`
storage (join to `prompt_runs`).

## Verified reality (from source)

- **No location/market column anywhere** — `prompt_runs`, `brands`, `prompts`, `citations`,
  `usage_events`, `ModelConfig`, `ProviderOptions` all lack it (schema.ts; migrations 0000–0023).
- Location is a **deployment-wide env pair** (`DATAFORSEO_LOCATION_CODE`/`_LANGUAGE_CODE`),
  read only in `dataforseo-shared.ts` and injected per request in `dataforseo.ts`. **Only
  DataForSEO honors location today**; BrightData AI Overview is hardcoded `&gl=us&hl=en`
  (`brightdata.ts:47`); its chatbot collectors send no locale.
- `Provider` capability is `access: "scraped"|"api"` with a per-target `accessFor(config)`
  refinement (`types.ts`); **DataForSEO is hybrid** — SERP/AIO routes localize, LLM-Responses
  routes don't. No localizability field exists.
- **Prompt text** is a single `prompts.value`, read once and passed verbatim to every
  provider/replica (`process-prompt.ts:307,444`). No per-locale text variation. Setting
  `language_code` does **not** translate the prompt.
- **Scheduler order** (`processPrompt`): `getLastRunsByTargetKey` → `selectDueTargets` →
  `dailyRunCeiling` + `isOrgOverDailyCeiling` gate → **fan-out** (`process-prompt.ts:411-454`).
  Due-ness dedups by `targetKey` = `(model, provider, webSearchEnabled)`.
- **Ceiling** `dailyRunCeiling(entitlements)` = `1.5 × (maxPrompts × platformPicks ×
  standardRunsPerDay × replication + premiumPool × premiumRunsPerDay)`; `null` (unlimited)
  when `mode !== "cloud"` (`run-policy/policy.ts:283`). Enforced by counting `usage_events`
  in the last 24h (`isOrgOverDailyCeiling`, `process-prompt.ts:192`). Market-blind today.
- `usage_events` (schema.ts:287-305): `organization_id, brand_id, prompt_id, event_type,
  provider, model, web_search_enabled, units, estimated_cost_usd, created_at`. Written by
  `recordUsageEvent` on run success/failure; cost from `estimateRunCostUsd`. **No market_key.**
- Coverage = `count(DISTINCT prompt_id) [FILTER brand_mentioned]` over `prompt_runs`
  (`postgres-read.ts:197`). Reusable filter `modelFilter` + uniform `(…, model?)` arg
  convention across ~12 aggregates.
- Content translation: **none today**; but `runStructuredCompletionPrompt<T>(prompt, schema)`
  (`onboarding/llm.ts:108`, web-search off, returns `modelVersion`) is the ready-made pattern
  to generate a translated variant.

## Resolved decisions

- Markets are **per-brand** (ordered list), capped `MAX_BRAND_MARKETS = 3` (v1).
- **Curated catalog** of markets, keyed by stable **BCP-47-style keys** (`tr-TR`, `de-DE`,
  `en-GB`); entries store codes, not English labels.
- **Localizability is per-target** via `localizableFor(config)` (mirrors `accessFor`).
  DataForSEO SERP/AIO → localizable; DataForSEO LLM-Responses, all direct-API,
  BrightData/olostep/oxylabs/cloro → not (Global).
- **Translated prompt variants**: each market gets a reviewed variant of each enabled
  question, stored in a new `prompt_market_variants` table; runs keep the parent `promptId`.
- **Markets are included** (not a paid add-on); the daily ceiling + monthly projection scale
  by active market count, and `usage_events` gains `market_key` for attribution.
- **Legacy backfill**: everything → `global` via migration default; a **separate app-level
  backfill command** (env-aware) optionally re-stamps historical DataForSEO runs to the
  deployment's configured market. Migration itself stays deterministic.
- `market_key` is `NOT NULL default 'global'` — a single sentinel, no null/global duality.
- **v1 UI backbone**: a market selector + per-market breakdown strip at the **top of the
  brand dashboard**; it both drives the market scope of existing views and is the comparison
  entry point.

## Market model & capability

```ts
interface Market {                 // curated catalog entry (packages/config)
  key: string;         // BCP-47-style, e.g. "tr-TR" — persisted forever, never reused
  countryCode: string; // "TR"
  languageCode: string;// "tr"  (DataForSEO language_code)
  locationCode: number;// 2792  (DataForSEO location_code)
}
```
Labels are **not** stored; they render via `Intl.DisplayNames` (country + language) or locale
keys, so the bilingual UI stays clean. `global` is a reserved key, not a catalog entry.

`Provider` gains an optional per-target predicate, resolved like access:
```ts
interface Provider { localizable?: boolean; localizableFor?(config: ModelConfig): boolean; }
const isLocalizable = (p, config) => p.localizableFor?.(config) ?? p.localizable ?? false;
```

## Prompt-market variants & translation

New table `prompt_market_variants`:
```
id uuid pk
prompt_id uuid -> prompts.id NOT NULL      (the PARENT question)
market_key text NOT NULL                    (catalog key; never 'global')
text text NOT NULL                          (translated question)
status text NOT NULL default 'draft'        ('draft' | 'approved')
source_model text                           (attribution: which LLM produced the draft)
created_at / updated_at timestamptz
unique (prompt_id, market_key)
index (prompt_id)
```
- **Generation**: when a market is added to a brand (or a question is created/edited), draft
  variants are generated for that market's language via `runStructuredCompletionPrompt`
  (skipped when the market language equals the prompt's source language — then the variant is
  the original text, auto-approved). This is best-effort and never blocks config saves.
- **Review**: drafts are shown in the market-config UI for edit/approval. **Runs use only
  `approved` variants.** If a required market has no approved variant for a prompt, that
  prompt is simply not evaluated in that market yet (surfaced as "translation pending" in the
  comparison) — we never send source-language text under a different-language market.
- **Identity**: `prompt_runs.prompt_id` stays the parent id; the run's text is the variant
  text for its market (or `prompts.value` for `global`). Coverage `count(DISTINCT prompt_id)`
  therefore collapses variants to their parent automatically, and the `maxPrompts` entitlement
  count (which counts `prompts` rows) is unaffected — variants are not prompts.

## Data model

One committed Drizzle migration (generated, never run locally):
- `prompt_runs`: add `market_key text NOT NULL default 'global'`; index `(brand_id,
  market_key, created_at)`.
- `brands`: add `markets jsonb NOT NULL default '[]'` and `default_market_key text`.
- `usage_events`: add `market_key text NOT NULL default 'global'` (attribution + per-market
  cost `GROUP BY`).
- `prompt_market_variants`: new table (above).
- `citations`: no new column (join to `prompt_runs` for market).

**Brand invariants** (enforced in the save server-fn + a check where practical):
`markets` holds 1..`MAX_BRAND_MARKETS` unique catalog keys; `default_market_key ∈ markets`;
a new brand is seeded with a valid initial market (the deployment's configured market, else
the catalog's first entry) so it produces runs immediately; removing the default requires
choosing another; unknown catalog keys are rejected.

## Migration & backfill (deterministic)

1. **Migration**: add columns/table with `default 'global'` — no env reads, identical on
   every deployment.
2. **App backfill command** (env-aware, run intentionally like other ops tasks): map
   `DATAFORSEO_LOCATION_CODE` → a catalog key; re-stamp historical runs from a **localizable**
   provider to that market; set each brand's `default_market_key`/`markets` to `[that key]`.
   Idempotent; safe to skip (then all history stays `global`).

## Run pipeline

Restructure the fan-out so **market is a target dimension before due-selection** (blocker #4):
1. Resolve plans → for each plan target, if `isLocalizable(target)` expand to one
   `MarketTargetPlan` per brand market (with an **approved variant**); else one `global`
   target. `MarketTargetPlan = TargetPlan & { marketKey; market: Market | null }`.
2. `getLastRunsByTargetKey` and `targetKey` grouping gain `marketKey` (so each market's
   freshness is tracked independently — two markets of one engine are distinct targets).
3. `selectDueTargets` runs on the expanded targets.
4. Ceiling gate (below) on the expanded due set.
5. Fan-out: each due market-target runs with its variant text and, for DataForSEO, the
   market's `location_code`/`language_code` (falling back to env when `marketKey === 'global'`
   for backward-compat). `savePromptRun` writes `market_key`.

## Cost, ceiling & usage

- `recordUsageEvent` gains `marketKey`; `usage_events.market_key` enables per-market spend
  (`GROUP BY market_key`).
- `dailyRunCeiling` gains a market factor: the standard term multiplies by the brand's
  **localizable market count** (Global-only engines aren't multiplied). Concretely the ceiling
  must cover `enabledPrompts × localizableMarkets × platformPicks(localizable) ×
  standardRunsPerDay` plus the single-run Global engines — so a multi-market brand isn't
  throttled. Exact formula worked out in the plan; unlimited (self-hosted) stays `null`.
- `projectMonthlyTargetCostUsd` similarly multiplies localizable runs by market count.

## Read layer & existing-view scoping (blocker #1)

Every existing aggregate must be **explicitly market-scoped** — there is no implicit default.
Add a `marketScope` predicate applied centrally (alongside `modelFilter`):
```sql
(market_key = :selectedMarket OR market_key = 'global')
```
`:selectedMarket` comes from the top-of-brand selector (URL state), defaulting to
`brand.default_market_key`. This includes the chosen localized market plus not-localizable
engines, and — because legacy localizable rows were backfilled to a real market or `global` —
never double-counts. This predicate threads through the shared read helpers; it is a fixed
scope (single selected market), not a full multi-value filter, so it is far smaller than a
user-facing country filter on every view but still touches the aggregate signatures.

New comparison read:
```ts
getMarketComparison(brandId, from, to, tz, promptIds): Promise<{
  markets: Array<{
    marketKey: string; localizable: boolean;
    visibility: number | null;      // evaluation-weighted; null if no evaluations
    questionsTotal: number;         // all filtered prompts (denominator, not only prompts with runs)
    questionsEvaluated: number;     // prompts with ≥1 run in this market
    questionsCovered: number;       // prompts with ≥1 mention
    platformsExpected: number; platformsEvaluated: number;
    sentiment: { positive; neutral; negative }; evaluations: number;
    complete: boolean;              // met the completeness threshold
  }>;
  consolidated: number | null;      // equal-weighted mean of COMPLETE localizable markets
}>
```
Configured markets with zero runs still appear (server merges the grouped query with the
brand's configured market list). This prevents a market with many failed engines from looking
artificially better via a small denominator — completeness is reported, not hidden.

## Consolidated formula

`consolidated` = arithmetic mean over **localizable markets that meet the completeness
threshold** of each market's evaluation-weighted visibility. Equal-weighted, so a high-volume
market can't dominate. The `global` bucket is shown in `markets` but excluded from the mean
(labeled "Not localizable"). If no localizable market is complete, `consolidated` is `null`
and the UI shows an incomplete-data state rather than a misleading number.

## UI

- **Top-of-brand market breakdown + selector (backbone)**: at the top of the brand dashboard,
  immediately after brand selection, a compact strip (`🇹🇷 78% · 🇩🇪 41% · 🇬🇧 pending`) with a
  selector. Selecting a market sets the scope for all existing charts (via `marketScope`);
  the strip links to the full comparison. This replaces the need for a separate comparison
  page in v1.
- **Comparison detail**: the `getMarketComparison` table (markets + Global row, visibility /
  coverage / sentiment / completeness, consolidated up top).
- **Market config + variant review** (brand settings, near `enabledModels`): pick ≤
  `MAX_BRAND_MARKETS` markets and the default; review/edit/approve generated draft variants.
  **Read-only in demo mode.**
- **i18n**: en + tr keys for all new labels (parity enforced by the existing i18n test);
  market names via `Intl.DisplayNames`.
- URL state: add `market?` to `BrandFilterSearch` + `validateBrandFilterSearch`.

## Error handling & edge cases

- Market removed from a brand: historical runs keep `market_key` and still render (labeled by
  key); no new runs produced. Unknown catalog key → render raw key with "unknown market".
- Direct-API run under a multi-market brand: exactly one `global` run (fan-out must not
  multiply it).
- Required market lacks an approved variant for a prompt: that prompt is skipped for that
  market and shown "translation pending" — never sent in the wrong language.
- Ceiling reached: existing skip-cycle behavior, now with market-scaled ceiling so multi-
  market brands aren't starved.
- Backward-compat: a run with `market_key = 'global'` uses env location in DataForSEO, so
  nothing breaks pre-config.

## Testing (behavior, not SQL text)

- Fan-out: localizable target → one run per brand market with the market's variant text +
  location/language; non-localizable/direct-API → exactly one `global` run.
- Scheduler: `targetKey`/last-run keyed by market — second market not skipped as "already
  ran"; market expansion happens before due-selection.
- Ceiling: `dailyRunCeiling` scales with localizable market count; a multi-market brand at
  prior single-market volume is not throttled; unlimited stays null.
- Variants: runs use only `approved` variants; same-language market auto-approves the source
  text; missing approved variant → prompt skipped for that market; coverage collapses variants
  to parent `promptId`.
- `getMarketComparison`: per-market evaluation-weighted visibility; equal-weighted
  consolidated over complete localizable markets; `global` excluded from mean but present;
  zero-run configured markets still appear; completeness fields correct; `null` consolidated
  when none complete.
- `isLocalizable`/`localizableFor`: DataForSEO SERP/AIO true, DataForSEO LLM-Responses false,
  BrightData false, direct-API false.
- Existing aggregates scoped to selected-market + global (regression: adding a second market
  does not change the default-market view's numbers).
- Backfill command: localizable history → deployment market, else global; brand defaults set;
  idempotent.
- Catalog: valid `(locationCode, languageCode)` per entry; `MAX_BRAND_MARKETS` + uniqueness +
  `default ∈ markets` invariants; unknown keys rejected. i18n en/tr parity.

## Suggested implementation stages (for the plan)

This is a large feature; sequence it so each stage is independently reviewable/shippable:
- **A — Foundation**: catalog + `Market` types (config), `localizableFor`, schema migration
  (all columns/table, `default 'global'`), brand market config + invariants, backfill command.
- **B — Variants**: `prompt_market_variants`, translation generator, review UI, run-time
  variant lookup (approved-only).
- **C — Pipeline & cost**: pre-dedup market expansion, `targetKey`/last-run keying,
  market-scaled ceiling + projection, `usage_events.market_key`.
- **D — Read & UI**: `marketScope` on existing aggregates, `getMarketComparison`, top-of-brand
  breakdown + selector, comparison detail, i18n.

## Open items for the plan

Initial catalog entries (demo's Türkiye + at least Germany, UK); exact market-scaled ceiling
formula; the completeness threshold (e.g. ≥ X% of expected evaluations present); whether draft
variants auto-approve for same-language markets only or also on user opt-in; whether the
top-of-brand strip fully replaces a separate comparison route or links to one.
