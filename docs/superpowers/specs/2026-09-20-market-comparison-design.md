# Phase 2 — Country/Market Support — Design (v3)

> Status: v3, split into **Phase 2a (build now)** and **Phase 2b (deferred design)** after
> the product signal that *most customers have only one location*. Two external review rounds
> folded in. Phase 2a is ready for an implementation plan; Phase 2b is captured design, not
> in this plan.
>
> **v3 changelog:** Multi-market is **opt-in and additive** — a brand with no configured
> markets behaves exactly like today. That dissolves the two hardest blockers (no mandatory
> brand initialization; no risky classification of historical DataForSEO runs). v1 ships
> **per-brand location** (2a), which helps the single-location majority and is the foundation
> for comparison; the full **multi-market comparison with translated variants** (2b) is
> deferred, with review findings #3–#8 resolved in its design below.

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

- A brand has **one** optional `market_key` (its location). Absent → deployment env default
  (current behavior). This is *not* the `1..MAX` multi-market list — that arrives in 2b.
- **Curated catalog** of markets in `packages/config`, keyed by stable **BCP-47-style keys**
  (`tr-TR`, `de-DE`, `en-GB`), storing `{key, countryCode, languageCode, locationCode}` — no
  English labels (render via `Intl.DisplayNames`). `global` is the reserved not-localizable
  sentinel.
- **Per-target localizability** via `localizableFor(config)` (mirrors `accessFor`): DataForSEO
  SERP/AIO → localizable; DataForSEO LLM-Responses, direct-API, BrightData/olostep/oxylabs/
  cloro → not. Non-localizable runs are stamped `global` regardless of the brand's market.
- `prompt_runs.market_key` is added **now** (stamped per run) so history is correct and 2b
  needs no second migration/backfill — but in 2a it's pure attribution; nothing reads it yet.

## Data model (2a)

One committed Drizzle migration (generated, never run locally):
- `brands`: add `market_key text` (nullable; null = deployment-env default).
- `prompt_runs`: add `market_key text NOT NULL default 'global'`; index `(brand_id,
  market_key, created_at)` (for 2b, cheap now).

No `usage_events.market_key`, no variants table, no `brands.markets` list in 2a — those are 2b.

## Run pipeline (2a)

At run time, resolve the run's market: if `isLocalizable(target)` and the brand has a
`market_key`, use that market's `location_code`/`language_code` in the DataForSEO request;
else `global` (and DataForSEO falls back to the env default for a `global`/unset market, so
nothing regresses). `savePromptRun` stamps `market_key`. **No fan-out change** — still one run
per target per replica; the only change is *which* location DataForSEO uses. Therefore no
scheduler, dedup, ceiling, or read-layer changes are needed in 2a.

## UI (2a)

- **Brand settings** (near `enabledModels`): a single-select **Location** picker from the
  catalog, defaulting to the deployment's configured market. **Read-only in demo mode.**
- Optionally surface the brand's location as a small label on the dashboard header (not a
  selector — there's only one). No comparison surfaces in 2a.
- i18n: en + tr keys for the picker label; market names via `Intl.DisplayNames`.

## Backfill (2a)

Deterministic migration (columns default as above). A small, **idempotent app command**
(env-aware) sets each existing brand's `market_key` to the deployment's configured location so
their config reflects reality; historical `prompt_runs` stay `global` (we do **not** try to
classify historical DataForSEO routes — review finding #2). New runs carry the correct market
going forward. This command is safe to skip (brands then use the env default until configured).

## Testing (2a — behavior)

- A brand with a `market_key` sends that market's location/language to DataForSEO; a brand
  without one uses the env default (regression: current behavior unchanged).
- Non-localizable targets (direct-API, BrightData, DataForSEO LLM-Responses) are stamped
  `global` and ignore the brand market.
- `savePromptRun` writes the resolved `market_key`.
- `localizableFor`: DataForSEO SERP/AIO true; LLM-Responses false; BrightData/direct-API false.
- Catalog entries have valid `(locationCode, languageCode)`; unknown keys rejected on brand
  save; demo mode read-only. i18n en/tr parity.

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

Opt-in and additive: a brand may add **1..`MAX_BRAND_MARKETS` (3)** markets (`brands.markets`
jsonb + `default_market_key`), each with reviewed translated question variants. Single-location
brands (the majority) never see any of this. Comparison is forward-looking; legacy history
stays `global`.

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
