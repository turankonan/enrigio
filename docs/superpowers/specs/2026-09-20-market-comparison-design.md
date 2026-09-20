# Phase 2 — Country/Market Support — Design (v5)

> Status: v5, split into **Phase 2a (build now)** and **Phase 2b (deferred design)** after
> the product signal that *most customers have only one location*. Four external review rounds
> folded in. Phase 2a is ready for an implementation plan; Phase 2b is captured design, not in
> this plan.
>
> **v5 changelog (review round 4):** corrected the overclaim that 2a needs "no scheduler or
> read-layer changes" — because a brand can *change* its market, 2a now makes (1) **scheduler
> freshness market-aware** (effective market in `targetKey`/last-run) so a new market isn't
> suppressed by the old market's recency, and (2) **dashboards market-correct** via a fixed
> `marketScope` predicate (effective market + `global`, excluding `legacy`/other markets).
> Also: `ProviderOptions.market` is defined and resolved in the worker (no silent env reads in
> low-level helpers); the migration is staged (nullable → `legacy` → NOT NULL, no default); the
> env fallback is validated at evaluation time (layered rule), not a hard startup failure; and
> the stage list is corrected to `default_market_key`. 2a still has no fan-out, variants,
> ceiling scaling, comparison surface, or market selector.
>
> **v4:** effective-market stamping; distinct `legacy` vs `global` sentinels;
> `default_market_key` named up front; DataForSEO scraper localizability; "Evaluation market"
> picker with no-translation note; config-only backfill.
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
evaluations run in that market instead of the deployment-wide env, are **attributed** to it,
and its dashboards show **only that market's** data (plus non-localizable `global` engines).
No comparison, no variants, no fan-out multiplication. Backward-compatible: a brand with no
explicit market resolves the deployment env's market at runtime, exactly as today.

> **Scope honesty:** 2a is small but NOT zero-touch on the scheduler or read layer. Because a
> brand can *change* its market, scheduling freshness and displayed aggregates must both be
> market-aware, or a change silently mixes markets (review round 4, #1/#2). 2a still has **no
> fan-out, no variants, no ceiling scaling, no comparison surface, no market selector** — those
> remain 2b.

## Decisions (2a)

- A brand has **one** optional `default_market_key` (its evaluation market). Absent → resolve
  from the deployment env at runtime. Named `default_market_key` now so 2b adds only the ordered
  `markets` list, seeded from it.
- **Curated catalog** of markets in `packages/config`, keyed by stable **BCP-47-style keys**
  (`tr-TR`, `de-DE`, `en-GB`), storing `{key, countryCode, languageCode, locationCode}` — no
  English labels (render via `Intl.DisplayNames`).
- **Per-target localizability** via `localizableFor(config)`. For DataForSEO it tracks the
  resolved **route**: the scraped routes localize (Google AI Mode, Google AI Overview, and the
  **unpinned** ChatGPT/Gemini LLM Scrapers — all of which send `location_code`/`language_code`),
  while the LLM-Responses routes (pinned ChatGPT/Gemini, Perplexity) do not. For every other
  provider it is `false` (direct-API have no locale; BrightData is hardcoded US). Non-localizable
  runs are stamped `global`.
- **Effective-market resolution in the worker (review #1, #5, #6):** the worker resolves the
  effective market once per prompt — `brand.defaultMarketKey ?? getMarketForCodes(dfsLocationCode(),
  dfsLanguageCode())` — and passes it explicitly down (see `ProviderOptions.market`) rather than
  letting low-level DataForSEO helpers read `process.env`. Localized runs are therefore **never
  stamped `global`**. Validation rule (single, layered): explicit `default_market_key` is
  validated on brand save; the env fallback is resolved+validated **at evaluation time** for a
  brand whose default is null (a clear run error + optional health/config check if the env pair
  isn't in the catalog) — **not** a hard startup failure, so a deployment where every brand has
  an explicit market is unaffected.

## Provider interface change

Add an optional market to `ProviderOptions`:
```ts
interface ProviderOptions { webSearch?: boolean; version?: string;
  market?: { locationCode: number; languageCode: string }; }
```
The worker sets `market` only for **localizable** targets; DataForSEO uses `options.market` when
present and falls back to env only when absent (backward-compat). Non-localizable providers
ignore it.

## Data model (2a)

One committed Drizzle migration (generated, then **inspected/edited** to the staged sequence —
review #3):
- `brands`: add `default_market_key text` (nullable; null = resolve from env at runtime).
- `prompt_runs`: add `market_key`, staged so it succeeds on a populated table:
  1. add `market_key text` **nullable**;
  2. `UPDATE prompt_runs SET market_key = 'legacy'` (scope of history can't be proven — #2);
  3. `ALTER … SET NOT NULL` with **no DB default** (new code must write an intentional value);
  4. index `(brand_id, market_key, created_at)`.

No `usage_events.market_key`, no variants table, no `brands.markets` list in 2a — those are 2b.

## Run pipeline & scheduler (2a)

- The worker resolves the effective market per prompt (above). For each **localizable** target
  it passes `ProviderOptions.market = { locationCode, languageCode }`; DataForSEO applies it.
  `savePromptRun` stamps the resolved `market_key` (a real key, or `global` for non-localizable;
  never `legacy`). No fan-out change — one run per target per replica.
- **Scheduler freshness is market-aware (review #1):** include the effective market in
  `targetKey` and the `getLastRunsByTargetKey` grouping. With one market per brand this is inert
  day-to-day, but when a brand's market changes it correctly makes the new market's runs due
  immediately instead of inheriting the old market's freshness.

## Read semantics (2a) — market-correct dashboards (review #2)

Introduce a single fixed `marketScope` predicate on the brand's analytics (the same mechanism
2b generalizes, but hardwired to the brand's one effective market — no selector):
```sql
(market_key = :effectiveMarket OR market_key = 'global')   -- excludes other markets AND 'legacy'
```
- Localizable engines contribute only the brand's effective market; non-localizable contribute
  `global`; `legacy` history is excluded from market-specific metrics.
- Applied centrally in the shared read helpers (alongside `modelFilter`); it is a fixed
  single-market scope, not a user-facing filter, so it is far smaller than 2b's selector work.
- UI note: after a market change, the new market's history starts accumulating from the change
  (older-market and `legacy` data are excluded), so metrics may be sparse briefly.

## UI (2a)

- **Brand settings** (near `enabledModels`): a single-select **"Evaluation market"** picker
  from the catalog, defaulting to the deployment's configured market. **Read-only in demo mode.**
- A note by the picker (review #5): *"This sets where and in which interface language
  evaluations run. Your questions must already be written in the selected market's language;
  automatic translation arrives later."*
- Surface the brand's market as a small label on the dashboard header (not a selector — there's
  only one). No comparison surfaces in 2a.
- i18n: en + tr keys for the picker label + note; market names via `Intl.DisplayNames`.

## Backfill (2a) — config only

Deterministic migration (existing `prompt_runs` → `legacy`). A small, **idempotent app command**
sets each existing brand's `default_market_key` from the deployment env. It does **not**
reclassify historical runs (they stay `legacy` — review #2/#6). Skipping it is behaviorally
safe: brands without an explicit value resolve the same effective market from env at runtime.

## Testing (2a — behavior)

- **Effective market (#1):** a localizable run for a brand *without* an explicit market is
  stamped the env's catalog market key — **not** `global`; with an explicit market, it is
  stamped that market and DataForSEO receives its location/language via `ProviderOptions.market`.
- **`localizableFor` matrix (#4)**, tested independently from `accessFor`:
  Google AI Mode ✔ · Google AI Overview ✔ · ChatGPT scraper (unpinned) ✔ · Gemini scraper
  (unpinned) ✔ · ChatGPT LLM-Responses (pinned) ✗ · Gemini LLM-Responses (pinned) ✗ ·
  Perplexity ✗ · any direct-API ✗ · BrightData ✗.
- Non-localizable targets are stamped `global` and ignore the brand market.
- **Scheduler freshness (#1):** after a brand's market changes, the new market's target is due
  immediately (not suppressed by the prior market's recent run).
- **Read scope (#2):** dashboards for a brand include only its effective market + `global`, and
  **exclude** `legacy` and any other market's rows (regression: a market change does not blend
  old-market data into the new market's metrics).
- Migration stamps pre-existing `prompt_runs` as `legacy`; new runs never write `legacy`; the
  staged migration succeeds on a populated table.
- Env→catalog fallback: a null-default brand resolves the env market at evaluation time; a
  missing mapping surfaces a clear run/config error, not a startup crash and not a `global`
  mislabel.
- Catalog entries have valid `(locationCode, languageCode)`; unknown keys rejected on brand
  save; demo mode read-only; i18n en/tr parity.

## Out of scope for 2a (→ 2b)

Multiple markets per brand; comparison view; translated prompt variants; market-scaled ceiling;
`usage_events.market_key`; the multi-market read *selector* (2a has only a fixed single-market
scope); the top-of-brand market strip.

## Suggested 2a plan stages

1. Catalog + `Market` types + `getMarketForCodes` + `localizableFor` (config + providers).
2. Staged migration (`brands.default_market_key`; `prompt_runs.market_key` nullable→`legacy`→NOT NULL).
3. `ProviderOptions.market`; worker effective-market resolution; DataForSEO applies it;
   `savePromptRun` stamps `market_key`.
4. Market-aware `targetKey`/last-run grouping (scheduler freshness).
5. Fixed `marketScope` read predicate in the shared analytics helpers.
6. Brand-settings "Evaluation market" picker + note + header label + i18n; demo read-only.
7. Idempotent brand-market backfill command.

## Open items (2a)

Initial catalog entries (demo's Türkiye + a couple more, e.g. `de-DE`, `en-GB`); whether the
backfill command runs on deploy or is invoked manually; whether the null-default env-fallback
also surfaces via a startup health/config check (non-fatal) in addition to the evaluation-time
validation.

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
