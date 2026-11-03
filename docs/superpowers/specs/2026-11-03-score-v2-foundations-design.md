# Score v2 foundations (phase V + phase 0) — design

Date: 2026-11-03. Parent: `docs/ux-designer/PROPOSAL-web-app-board.md` (decisions D1, D2, D9 accepted
2026-11-03). Scope: the offline back-test that gates score v2, and the data-model and read-layer work every
later phase depends on. No user-facing surface changes in this unit.

## 1. Goal

Make the three numbers the board is built on computable from existing data, prove the headline one against the
shipped score before anyone sees it, and give admins a place to watch both side by side.

- **Score v2**: rank-weighted visibility over buyer (unbranded) prompts.
- **Intent sub-scores**: v2 restricted to prompts tagged Discovery / Comparison / Local / Price.
- **Brand accuracy**: share of brand-question answers with no contradicted factual claim.

## 2. Definitions

### 2.1 Score v2

Per run, from the existing `prompt_runs.brand_rank` and `brand_mentioned`:

| Condition | Weight |
|---|---|
| not mentioned | 0 |
| mentioned, rank 1 | 1.0 |
| mentioned, rank 2 | 0.7 |
| mentioned, rank 3 | 0.5 |
| mentioned, rank ≥ 4 | 0.3 |
| mentioned, rank null | 0.3 |

Score = mean weight × 100, rounded, over runs of **enabled unbranded prompts** in the window and market scope.
Null when there are no such runs. Branded status uses `getEffectiveBrandedStatus` (user override respected),
exactly as v1 does today. The weights live in one constant in `packages/lib/src/score/v2.ts` so the back-test
and the read layer cannot drift.

v1 stays what `getDashboardSummary` returns: mentioned ÷ runs over all enabled prompts.

### 2.2 Intent

New nullable column `prompts.intent` with pgEnum `prompt_intent` = `discovery | comparison | local | price`.
Null = unclassified; such prompts count in v2 but in no sub-score. A sub-score is v2 over the prompts with that
intent; null when the group has no runs.

Intent is set three ways:
- the brand-analysis job returns it for each suggested prompt (new field on the suggestion schema);
- a backfill script classifies existing prompts once (section 4);
- the prompt editor exposes it as a select (phase 1 UI, not here; phase 0 only adds the column and the API field).

### 2.3 Brand accuracy

For runs of **branded** prompts where the brand is mentioned, `classifyMention` additionally returns
`contradictedClaims: string[]`: factual statements about the brand in the answer that contradict the brand
profile. Profile handed to the classifier: name, website, additional domains, aliases, keywords. (Sector,
location and hours arrive with phase 1 and extend the profile without changing the schema.)

Stored as `prompt_runs.accuracy_issues text[] NOT NULL DEFAULT '{}'`.

Accuracy = runs with an empty array ÷ branded mentioned runs in the window, × 100, rounded. Null when there are
none. Branded runs that do not mention the brand are excluded from the ratio (the AI did not describe the brand,
so it could not misdescribe it); they are counted separately as `unrecognised` for the later Overview warning.

## 3. Phase V — back-test

A script, not product code: `packages/lib/scripts/backtest-score-v2.ts`, following `backfill-brand-markets.ts`
(requires `DATABASE_URL`, refuses non-local without `ALLOW_REMOTE_DB=1`, read-only).

Per brand that has runs on ≥ 4 distinct models over ≥ 30 days:

1. Current window = last 30 days, previous window = the 30 before.
2. Per enabled unbranded prompt: v1 (mention rate) and v2, current window.
3. Brand-level v1 (all prompts, as the Home shows) and v2 (unbranded), both windows.
4. Spearman rank correlation of per-prompt v1 vs v2 (prompts with ≥ 4 runs).
5. Direction per version: `up` if current − previous ≥ 3, `down` if ≤ −3, else `flat`.

Output: one row per brand (id, prompts, runs, v1, v2, Spearman, v1 direction, v2 direction), then a verdict:
**pass** when ≥ 80 % of brands have Spearman ≥ 0.7 and no brand's direction differs between v1 and v2. A
`--json` flag writes the rows for the proposal's record. A `--labels <n>` flag instead exports `n` random
branded, mentioned answers with the classifier's `contradictedClaims` to CSV for hand labelling (the D9 bar:
≥ 90 % agreement on 50).

The pure parts (`weightFor(run)`, `scoreV2(runs)`, `spearman(a, b)`, `direction(now, before)`) live in
`packages/lib/src/score/` with unit tests. The script only does SQL and printing.

## 4. Phase 0 — foundations

### 4.1 Schema

One migration, generated with drizzle-kit (never applied by the agent):

- `CREATE TYPE prompt_intent`, `ALTER TABLE prompts ADD COLUMN intent prompt_intent`.
- `ALTER TABLE prompt_runs ADD COLUMN accuracy_issues text[] NOT NULL DEFAULT '{}'`.

No index: both columns are read alongside existing brand/prompt-scoped queries.

### 4.2 Worker

`classifyMention` gains an optional `profile` input and returns `contradictedClaims` (empty array when the
profile is absent). `process-prompt.ts` passes the profile only for branded prompts and writes
`accuracy_issues`. Unbranded prompts keep today's call shape, so cost is unchanged for them.

The brand-analysis suggestion schema (`packages/lib/src/onboarding/analyze.ts`) adds `intent` with the four
values; the prompt insert in `saveWizardOnboarding` (`onboarding-core.ts`) persists it. The existing
tag guidance already forbids goal-style tags, so intent does not collide with the LLM's topical tags.

### 4.3 Read layer

`apps/web/src/lib/postgres-read.ts` gains:

- `getScoreV2Summary(brandId, from, to, timezone, promptIds, marketKey)` → `{ total_runs, score_v2 }` using a
  `CASE` over `brand_rank`, same filters as `getDashboardSummary`.
- `getIntentScoreSummary(...)` → one row per intent, joining `prompts.intent`.
- `getAccuracySummary(...)` → `{ branded_mentioned_runs, accurate_runs, unrecognised_runs }`.

`apps/web/src/server/scores.ts` exposes one server function `getBrandScoreBreakdownFn({ brandId })` that
returns v1, v2, sub-scores and accuracy for the current 30-day window. Admin-only in phase 0.

### 4.4 Backfill of intent

`packages/lib/scripts/backfill-prompt-intent.ts`: for prompts with `intent IS NULL`, batches of 25 through
`runStructuredCompletionPrompt` with the four-value schema plus `null` for "none of these", writes the result,
idempotent (second run finds 0). Operator-run, same guards as the other scripts. Branded prompts are skipped:
they are brand questions and never carry a buyer intent.

### 4.5 Admin view

Route `_authed/admin/scores.tsx`: a table of every onboarded brand with v1, v2, the four sub-scores, accuracy,
unrecognised count, and prompts classified ÷ total. Plain shadcn table, no charts. Link from the admin index.

### 4.6 What does not change

Home, Prompts, shared reports, API v1, MCP: every number they show is v1 and stays v1. The v2 switch is a
separate, later change gated on the phase V verdict (proposal section 5).

## 5. Error handling

- Classifier failure already yields `null`; `accuracy_issues` then stays `[]` and the run is **not** counted as
  accurate: the accuracy SQL counts a run as accurate only when `sentiment IS NOT NULL AND accuracy_issues = '{}'`,
  since a null sentiment means the classifier did not run.
- Back-test and backfill scripts exit non-zero on any SQL or model error; partial backfill is safe to rerun.
- The admin server function returns nulls, never throws, for brands without data.

## 6. Testing

- Unit: `weightFor`, `scoreV2`, `spearman` (known pairs, ties), `direction` at the ±3 boundaries, accuracy
  ratio with classifier-null runs, intent grouping with null intent.
- Worker: `process-prompt.test.ts` gains a branded-prompt case asserting the profile is passed and
  `accuracy_issues` is written, and an unbranded case asserting it is not.
- Read layer: existing SQL tests pattern (if any) for the three new queries against a seeded brand; otherwise
  covered by the server-function test with a stubbed read layer.
- Back-test script: smoke-run against the local database; the verdict logic is unit-tested, the SQL is not.

## 7. Out of scope

Wizard UI, starter report, any v2 display to users, the intent select in the prompt editor, sector/location on
the brand profile, Turkish copy.
