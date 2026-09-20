# Phase 2 — Per-Market (Country/Language) Comparison — Design

> Status: drafted after brainstorming; pending user review before the implementation plan.
> Phase 0 (sentiment, in-answer rank, coverage, opportunities-as-plan) and Phase 1
> (AXO website audit) are shipped. This is Phase 2 — the last real gap from the
> customer-feedback review (`docs/CUSTOMER-FEEDBACK-REVIEW.md`, comment #2): compare AI
> visibility across countries in one report.

## Goal

Let a brand be evaluated in **multiple markets** (country + language) and compare AI
visibility across them in one report — Türkiye vs Germany vs UK — for the engines that can
actually localize. Engines with no country concept (direct-API Claude/GPT, and scraped
engines that don't honor location) are evaluated once and shown as **Global — not
localizable**, never silently treated as localized.

Non-goals (v1): threading a country filter through every existing chart; making
BrightData/olostep/oxylabs/cloro localizable; per-question or per-tag markets; free-form
market codes; a headline cross-country rank beyond the equal-weighted mean.

## Key facts about today's system (verified against source)

- **No location/country/language column exists** anywhere — not in `prompt_runs`,
  `brands`, `prompts`, `citations`, `ModelConfig`, or `ProviderOptions`. Confirmed across
  `packages/lib/src/db/schema.ts` and all migrations 0000–0023.
- Location is a **single deployment-wide env pair** — `DATAFORSEO_LOCATION_CODE` /
  `DATAFORSEO_LANGUAGE_CODE` — read only inside the DataForSEO provider
  (`packages/lib/src/providers/registry/dataforseo-shared.ts`, defaults US/2840/en) and
  injected per request in `dataforseo.ts`.
- **BrightData's Google AI Overview is hardcoded `&gl=us&hl=en`** (`brightdata.ts:47`); its
  chatbot dataset collectors send no locale at all. So today **only DataForSEO can honor a
  location.**
- The `Provider` interface (`packages/lib/src/providers/types.ts:50-88`) carries one
  capability bit, `access: "scraped" | "api"` (plus per-target `accessFor`). There is no
  location-capability field. `ProviderOptions` (`types.ts:18-21`) has `{ webSearch?,
  version? }` — no place for a locale.
- Run fan-out is a single clean chokepoint: `apps/worker/src/jobs/process-prompt.ts`
  expands `dueTargets × replication` (lines ~439-452), calls
  `providerImpl.run(model, prompt, { webSearch, version })` (~312-315), then `savePromptRun`
  (~345-358). Scheduler due-ness dedups by `targetKey` grouping `model, provider,
  webSearchEnabled` (`getLastRunsByTargetKey`, ~167-181).
- Read layer has one reusable filter, `modelFilter(model?, opts)`
  (`apps/web/src/lib/postgres-read.ts:151-176`), and a uniform `(brandId, from, to, tz,
  promptIds, model?)` arg convention across ~12 aggregates. Visibility is
  evaluation-weighted `count(*) FILTER (WHERE brand_mentioned) / count(*)`.
- UI filters are URL-driven and centralized: `filter-bar.tsx` + `packages/config/model-filter.ts`
  + `validateBrandFilterSearch` (`use-list-filters.ts`). All current filters are
  single-select narrowing; **a side-by-side comparison surface is net-new.**
- `citations` rows carry `model` but not `provider` — grounded-vs-scraped filtering already
  EXISTS-joins back to `prompt_runs` (`postgres-read.ts:166-173`).

## Resolved decisions

- **Config granularity:** markets are attached **per brand** (an ordered list), not
  per-question or per-tag. Every enabled question is evaluated in each of the brand's
  markets (for localizable engines).
- **Volume:** capped small — `MAX_BRAND_MARKETS = 3` (configurable constant) for v1.
- **Market definition:** a **curated preset catalog** of `(key, label, locationCode,
  languageCode)`, shared via `packages/config`. No free-form codes (DataForSEO needs valid
  location/language pairs).
- **Direct-API + non-localizable engines:** run **once**, stamped `global`, shown in a
  separate "Not localizable" row — never duplicated per market, never excluded.
- **Legacy data:** backfill existing localizable runs to the deployment's configured
  location; everything else → `global`. History preserved and correctly labeled; comparison
  has data on day one.
- **Consolidated score:** **equal-weighted** mean across localizable markets (each market
  counts equally regardless of run count). The `global` bucket is reported alongside but
  excluded from the cross-market mean.
- **v1 UI:** one **dedicated comparison view** + a per-brand market config UI. Existing
  single-market charts are unchanged (they use the brand's default market).

## The market model

A **market** is a curated triple:

```ts
interface Market {
  key: string;          // stable id, e.g. "tr" or "tr-tr"
  label: string;        // "Türkiye / Turkish"
  locationCode: number; // DataForSEO location_code, e.g. 2792
  languageCode: string; // DataForSEO language_code, e.g. "tr"
}
```

The catalog lives in `packages/config` (shared by UI + lib). The sentinel `global` (a
reserved key, not in the catalog) marks evaluations with no country context.

**Provider capability** gains one derived predicate, `isLocalizable(provider, config)`:
`true` only when the provider is scraped **and** actually honors location. DataForSEO →
`true`; BrightData/olostep/oxylabs/cloro → `false` (until provider work lands); all
direct-API → `false`. Prefer deriving from an explicit `localizable?: boolean` flag on the
`Provider` entry over hard-coding ids in the read layer, so adding a localizable provider
later is a one-line change.

## Data model

One committed Drizzle migration (generated, **never run locally**):

- **`prompt_runs`**: add `market_key text` (nullable). `null` or `global` = not localized.
  Add index `(brand_id, market_key, created_at)` for the comparison query.
- **`brands`**: add `markets jsonb not null default '[]'` (ordered array of market keys) and
  `default_market_key text` (nullable).
- **`citations`**: **no new column** — the comparison joins to `prompt_runs` for market
  (same EXISTS pattern already used for grounded-vs-scraped).

Backfill, as data-only SQL in the migration:
1. `prompt_runs.market_key`: rows from a **localizable** provider → the market key matching
   the deployment's configured `DATAFORSEO_LOCATION_CODE` (fall back to `global` if it
   matches no catalog entry); all other rows → `global`.
2. `brands.default_market_key` → that same market key; `brands.markets` → `[that key]`.

## Run pipeline

In `process-prompt.ts` fan-out, per due target:
- If `isLocalizable(target)`, expand to **one run per brand market** (`brand.markets`);
- else a single **`global`** run.

Thread `marketKey` through: `ModelConfig`/target → `ProviderOptions` → `providerImpl.run()`
→ `savePromptRun()` → the new `prompt_runs.market_key`. DataForSEO reads `location_code` /
`language_code` from the run's market instead of global env (keep the env as the default
when a run has no explicit market, for backward-compatibility).

**Scheduler dedup:** add `marketKey` to `targetKey` / `getLastRunsByTargetKey` grouping
(currently `model, provider, webSearchEnabled`) so two markets of the same engine are
treated as distinct targets — otherwise one market's runs get skipped as "already ran."

`SCRAPE_TARGETS` stays market-agnostic (it is the engine catalog); markets are brand config
and enter only at fan-out. `formatScrapeTarget`/`targetKey`/`STATUS_TARGETS` need no format
change beyond the dedup key.

## Read layer & consolidated formula

Add `marketFilter(marketKey?)` in `postgres-read.ts` mirroring `modelFilter`, and a `market?`
field on `AnalyticsFilters` — but **do not** thread it through all ~12 aggregates in v1.
Instead add one comparison read:

```ts
getMarketComparison(brandId, from, to, timezone, promptIds): Promise<{
  markets: Array<{
    marketKey: string;          // catalog key or "global"
    localizable: boolean;
    visibility: number;         // evaluation-weighted: mentions / total
    questionsCovered: number;   // distinct prompts with ≥1 mention
    questionsTotal: number;
    sentiment: { positive: number; neutral: number; negative: number };
    evaluations: number;
  }>;
  consolidated: number;         // equal-weighted mean of localizable markets' visibility
}>
```

One grouped query (`GROUP BY market_key`), not N round-trips.

**Consolidated visibility** = arithmetic mean over **localizable** markets of each market's
evaluation-weighted visibility. Each market contributes equally regardless of run count. The
`global` bucket is returned in `markets` (so it renders) but **excluded** from the
`consolidated` mean and labeled "Not localizable." Both the consolidated number and the
per-market rows are shown — nothing hides behind the average. If there are zero localizable
markets with runs, `consolidated` is `null` (UI shows "—").

## UI

- **New "Markets" comparison surface** — a route under the brand
  (`.../brand/$brand/markets`). A table: rows = the brand's markets plus a "Global — not
  localizable" row; columns = visibility, question-coverage (`N of M`), sentiment split; the
  consolidated number shown up top. Uses the existing lookback/tags/search filters; no model
  narrowing needed (the comparison is across markets, all engines).
- **Market config** — on the brand settings page (near `enabledModels`): choose up to
  `MAX_BRAND_MARKETS` markets from the catalog and set the default. **Read-only in demo
  mode** (respects `packages/deployment` auth model). Saving validates against the catalog
  and the cap.
- **i18n** — en + tr keys for all new labels (the app is bilingual; parity is enforced by
  the existing i18n test).
- Existing charts are untouched and implicitly scope to the brand's default market.

## Error handling & edge cases

- A market removed from a brand: historical runs keep their `market_key` and still appear in
  comparison (labeled by catalog key); config just stops producing new runs for it.
- A `market_key` not in the current catalog (e.g. catalog edited later): render the raw key
  with a muted "unknown market" label rather than dropping the row.
- Direct-API run under a brand with markets: still one `global` run — fan-out must not
  multiply it.
- Backward-compat: a run with no explicit market falls back to the deployment env location
  in the DataForSEO provider, so nothing breaks if fan-out passes no market.

## Testing (behavior, not SQL text)

- Fan-out expands localizable targets to one run per brand market; non-localizable/direct-API
  targets produce exactly one `global` run (no per-market multiplication).
- `targetKey` dedup treats two markets of the same engine as distinct (regression guard: the
  second market is not skipped as "already ran").
- `getMarketComparison`: per-market evaluation-weighted visibility; equal-weighted
  consolidated mean; `global` excluded from the mean but present in rows; `null` consolidated
  when no localizable markets have runs.
- `isLocalizable`: DataForSEO → true, BrightData → false, direct-API → false.
- Market catalog: every entry has a valid `(locationCode, languageCode)`; `MAX_BRAND_MARKETS`
  cap enforced on save; unknown/duplicate keys rejected.
- Migration backfill: localizable history → deployment market; other history → `global`;
  brand default + markets set.
- i18n en/tr parity for new keys.

## Out of scope (v1)

Threading country through the existing single-market charts; localizing
BrightData/olostep/oxylabs/cloro (provider-level work — they remain Global); per-question or
per-tag markets; free-form market codes; a cross-country headline rank beyond the
equal-weighted mean; localizing citations storage (comparison joins to `prompt_runs`).

## Open items for the implementation plan

Exact initial market catalog entries (which countries ship in v1 — at least the demo's
Türkiye plus 2 others); the stable market-key scheme (`tr` vs `tr-tr`); whether `localizable`
is an explicit `Provider` field or derived; confirm `DATAFORSEO_LOCATION_CODE` →
catalog-key mapping for the backfill.
