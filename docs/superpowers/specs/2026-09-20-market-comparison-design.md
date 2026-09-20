# Phase 2 — Country/Market Support — Design (v4)

> Status: v4, split into **Phase 2a (build now)** and **Phase 2b (deferred design)** after
> the product signal that *most customers have only one location*. Three external review
> rounds folded in. Phase 2a is ready for an implementation plan; Phase 2b is captured design,
> not in this plan.
>
> **v4 changelog:** three data-model corrections to 2a — (1) localizable runs resolve and
> persist an **effective market** (brand market, else the deployment env's market), so they
> are never mis-stamped `global`; (2) a distinct **`legacy`** sentinel for historical rows of
> unknown scope, separate from `global` (known non-localizable), so 2b never blends legacy
> localized data into a selected market; (3) the 2a brand column is named **`default_market_key`**
> up front so 2b adds only the `markets` list. Plus: `localizableFor` explicitly covers
> DataForSEO's unpinned chatbot scrapers; the picker is "Evaluation market" with an explicit
> no-translation note; the backfill command is config-only.
>
> **v3:** Multi-market is **opt-in and additive** — a brand with no configured markets behaves
> exactly like today. v1 ships **per-brand location** (2a); multi-market comparison with
> translated variants (2b) is deferred, with review findings resolved in its design.

## Storage semantics for `market_key` (both phases)

| Stored value           | Meaning                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `tr-TR`, `de-DE`, …    | Known **localized** evaluation (a real catalog market)      |
| `global`              | Known **non-localizable** evaluation (direct-API, BrightData, DataForSEO LLM-Responses) |
| `legacy`              | **Historical** evaluation whose localization cannot be proven from stored columns |

New code writes only a real market key or `global` (never `legacy`); `legacy` is written once,
by the migration, onto pre-existing rows.

## Context & guiding insight

The Maya gap (customer-feedback comment #2) is cross-country comparison. But **most customers
have only one location**, and today location is a single **deployment-wide** env
(`DATAFORSEO_LOCATION_CODE`/`_LANGUAGE_CODE`) — so a brand can't even be correctly configured
for *its* country without changing the whole deployment. The highest-value, lowest-risk first
step is therefore **per-brand location** (2a). Comparison across multiple markets (2b) is a
minority feature and a larger build; it layers cleanly on top of 2a and stays opt-in so the
majority is never burdened by it.

## Verified reality (from source)

- No location/market column anywhere (`prompt_runs`, `brands`, `prompts`, `citations`,
  `usage_events`, `ModelConfig`, `ProviderOptions`); migrations 0000–0023.
- Location is deployment-wide env, read only in `dataforseo-shared.ts`, injected per request
  in `dataforseo.ts`. **Only DataForSEO honors location**; BrightData AI Overview hardcodes
  `&gl=us&hl=en` (`brightdata.ts:47`); its chatbot collectors and all direct-API providers
  have no locale.
- `Provider` capability is `access: "scraped"|"api"` + per-target `accessFor(config)`;
  **DataForSEO is hybrid** (SERP/AIO localize; LLM-Responses don't). No localizability field.
- Prompt text is a single `prompts.value`, sent verbatim to every provider
  (`process-prompt.ts:307,444`). `language_code` does not translate it.
- Scheduler: `getLastRunsByTargetKey` → `selectDueTargets` → ceiling gate → fan-out
  (`process-prompt.ts:411-454`); `targetKey = (model, provider, webSearchEnabled)`.
- Ceiling `dailyRunCeiling(entitlements)` is plan-derived, market-blind; enforced by counting
  `usage_events`/24h (`isOrgOverDailyCeiling`). Unlimited when `mode !== "cloud"`.
- `usage_events` has provider/model/web_search/cost but no market_key.
- Coverage = `count(DISTINCT prompt_id)` over `prompt_runs` (`postgres-read.ts:197`).
- `runStructuredCompletionPrompt<T>` (`onboarding/llm.ts:108`, web-search off, returns
  `modelVersion`) is the ready pattern for translation (used only in 2b).

---

# PHASE 2a — Per-Brand Location (BUILD NOW)

## Goal

Each brand is configured with **its own single market** (country + language); its localizable
evaluations run in that market instead of the deployment-wide env. No comparison, no variants,
no fan-out multiplication. Backward-compatible: a brand with no market falls back to the
deployment env, exactly as today.

## Decisions (2a)

- A brand has **one** optional `default_market_key` (its evaluation market). Absent → resolve
  from the deployment env at runtime (current behavior, correctly attributed). Named
  `default_market_key` now so 2b adds only the ordered `markets` list, seeded from it.
- **Curated catalog** of markets in `packages/config`, keyed by stable **BCP-47-style keys**
  (`tr-TR`, `de-DE`, `en-GB`), storing `{key, countryCode, languageCode, locationCode}` — no
  English labels (render via `Intl.DisplayNames`).
- **Per-target localizability** via `localizableFor(config)`. For DataForSEO it tracks the
  resolved **route**: the scraped routes localize (Google AI Mode, Google AI Overview, and the
  **unpinned** ChatGPT/Gemini LLM Scrapers — all of which send `location_code`/`language_code`),
  while the LLM-Responses routes (pinned ChatGPT/Gemini, Perplexity) do not. For every other
  provider it is `false` (direct-API have no locale; BrightData is hardcoded US). Non-localizable
  runs are stamped `global`.
- **Effective-market resolution (review #1):** for a localizable run, the persisted market is
  `brand.defaultMarketKey ?? getMarketForCodes(dfsLocationCode(), dfsLanguageCode())`. Localized
  runs are therefore **never stamped `global`**. If the env code pair maps to no catalog entry,
  fail clearly (startup validation and/or on brand save) rather than silently mislabeling.

## Data model (2a)

One committed Drizzle migration (generated, never run locally):
- `brands`: add `default_market_key text` (nullable; null = resolve from env at runtime).
- `prompt_runs`: add `market_key text NOT NULL`; **existing rows set to `legacy`** by the
  migration (their scope can't be proven — review #2); index `(brand_id, market_key,
  created_at)` (for 2b, cheap now). New rows always get an explicit value from the app.

No `usage_events.market_key`, no variants table, no `brands.markets` list in 2a — those are 2b.

## Run pipeline (2a)

At run time resolve the run's market: if `isLocalizable(target)`, use the **effective market**
(`brand.defaultMarketKey ?? env-codes→catalog`) and pass its `location_code`/`language_code`
to the DataForSEO request; else `global`. `savePromptRun` stamps the resolved `market_key`
(a real key or `global`, never `legacy`). **No fan-out change** — one run per target per
replica; the only change is *which* location DataForSEO uses and that we now record it.
Therefore no scheduler, dedup, ceiling, or read-layer changes are needed in 2a.

## UI (2a)

- **Brand settings** (near `enabledModels`): a single-select **"Evaluation market"** picker
  from the catalog, defaulting to the deployment's configured market. **Read-only in demo mode.**
- A note by the picker (review #5): *"This sets where and in which interface language
  evaluations run. Your questions must already be written in the selected market's language;
  automatic translation arrives later."*
- Optionally surface the brand's market as a small label on the dashboard header (not a
  selector — there's only one). No comparison surfaces in 2a.
- i18n: en + tr keys for the picker label + note; market names via `Intl.DisplayNames`.

## Backfill (2a) — config only

Deterministic migration (existing `prompt_runs` → `legacy`). A small, **idempotent app
command** sets each existing brand's `default_market_key` from the deployment env. It does
**not** reclassify historical runs (they stay `legacy` — review #2/#6). Skipping it is
behaviorally safe: brands without an explicit value resolve the same effective market from env
at runtime; the command just makes the config explicit.

## Testing (2a — behavior)

- **Effective market (review #1):** a localizable run for a brand *without* an explicit market
  is stamped with the env's catalog market key — **not** `global`; with an explicit market, it
  is stamped that market and DataForSEO gets its location/language.
- **`localizableFor` matrix (review #4)**, tested independently from `accessFor`:
  Google AI Mode ✔ · Google AI Overview ✔ · ChatGPT scraper (no pinned version) ✔ ·
  Gemini scraper (no pinned version) ✔ · ChatGPT LLM-Responses (pinned) ✗ · Gemini
  LLM-Responses (pinned) ✗ · Perplexity ✗ · any direct-API ✗ · BrightData ✗.
- Non-localizable targets are stamped `global` and ignore the brand market.
- Migration stamps pre-existing `prompt_runs` as `legacy`; new runs never write `legacy`.
- Missing env→catalog mapping fails clearly rather than mislabeling as `global`.
- Catalog entries have valid `(locationCode, languageCode)`; unknown keys rejected on brand
  save; demo mode read-only; i18n en/tr parity.

## Out of scope for 2a (→ 2b)

Multiple markets per brand; comparison view; translated prompt variants; market-scaled
ceiling; `usage_events.market_key`; read-layer market scoping; the top-of-brand market
selector/strip.

## Suggested 2a plan stages

1. Catalog + `Market` types + `localizableFor` (config + providers).
2. Migration (`brands.market_key`, `prompt_runs.market_key`).
3. Pipeline: resolve + apply per-brand market in DataForSEO; stamp `savePromptRun`.
4. Brand-settings location picker + i18n; demo read-only.
5. Idempotent brand-location backfill command.

## Open items (2a)

Initial catalog entries (demo's Türkiye + a couple more); whether the backfill command runs as
part of the normal deploy or is invoked manually; whether to show the location label on the
dashboard header in 2a or wait for 2b.

---

# PHASE 2b — Multi-Market Comparison (DEFERRED DESIGN)

> Not in the 2a plan. Captured so the 2a foundations are laid correctly and the design is
> ready when demand justifies it. All external-review findings (#3–#8) are resolved here.

## Shape

Opt-in and additive: a brand may add **1..`MAX_BRAND_MARKETS` (3)** markets — 2b adds only the
ordered `brands.markets` jsonb list, **seeded from the 2a `default_market_key`** — each with
reviewed translated question variants. Single-location brands (the majority) never see any of
this. Comparison is forward-looking; `legacy` history is shown separately or excluded, never
folded into a selected market.

## Translated prompt variants (resolves #3, #4)

- New table `prompt_market_variants(id, prompt_id→prompts.id, market_key, text, status
  'draft'|'approved', source_text_hash, source_language, source_model, timestamps, unique
  (prompt_id, market_key))`. Runs keep the parent `prompt_id`; coverage `count(DISTINCT
  prompt_id)` collapses variants to parent automatically; the `maxPrompts` ceiling is
  unaffected (variants aren't prompts).
- `prompts` gains `source_language` so "same-language market" auto-approval is well-defined.
- **Staleness (#3):** a variant is runnable only when `status === 'approved' &&
  source_text_hash === hash(prompt.value)`. Editing the parent prompt immediately invalidates
  its approved variants (before regeneration).
- **Generation is a pg-boss job (#4)**, never inline in settings save: idempotent by
  `(promptId, marketKey, sourceTextHash)`, bounded concurrency + retries, records
  `usage_events` (`translation` / `translation_failed`) with model attribution, exposes a
  failure state + manual retry in the review UI, and cancels/ignores queued jobs for a removed
  market. Uses `runStructuredCompletionPrompt`.

## Pipeline, cost, reads

- Market becomes a target dimension **before** due-selection; `targetKey`/last-run keyed by
  market; fan-out expands localizable targets per brand market (approved variant only).
- `dailyRunCeiling` + `projectMonthlyTargetCostUsd` scale the localizable term by market
  count; `usage_events.market_key` added for per-market spend.
- **Existing aggregates market-scoped** (`market_key = :selected OR 'global'`), `:selected`
  from the top-of-brand selector defaulting to `default_market_key`.

## Comparison output & score (resolves #5, #6, #8)

- `getMarketComparison` returns per-market visibility + a **precise completeness model**:
  eligible cells = approved variants × entitled localizable targets; report translation
  readiness, target coverage, expected-vs-observed evaluations, and provider failures
  **separately** (a missing translation ≠ a provider failure). Zero-run configured markets
  still appear (merge query with configured list).
- **Consolidated (#5):** `null` unless **all** configured localizable markets meet the
  completeness threshold — with `consolidatedReason` and `includedMarkets`/`excludedMarkets`
  membership so the denominator never silently changes over time. When present, equal-weighted
  mean; `global` shown but excluded.
- **Keep a dedicated comparison route (#8)**; the top-of-brand strip is the summary + selector
  and entry point, not the full surface.

## Safe rollout order (resolves #7)

1. (2a done) catalog/schema/per-brand location.
2. Existing-read market scoping (defaults to `global`/selected) — **before** any multi-market
   rows exist.
3. Variants + review workflow.
4. Market-aware scheduler, ceiling, usage — behind a feature flag.
5. Comparison UI + selector.
6. Enable multi-market fan-out only after 2 and brand initialization are deployed.

## 2b open items

Same-language auto-approval policy; exact ceiling formula; completeness threshold value;
per-market entitlement if the "included" cost proves too high in practice.
