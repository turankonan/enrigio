# Score v2 foundations (phase V + phase 0) — design

Date: 2026-11-03 (rev 2, after review). Parent: `docs/ux-designer/PROPOSAL-web-app-board.md` (decisions D1, D2, D9 accepted
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

**Run-level averaging is deliberate.** Both v1 and v2 average over runs, so a platform sampled four times a day
weighs four times one sampled once a day, and a change of platform picks or cadence moves the score. v2 keeps
this on purpose: the back-test must isolate one change (rank weighting). Normalising by prompt × model first is
a candidate v3 applied to both versions together, recorded in the proposal's phase 2 backlog, not here.

### 2.2 Intent

New nullable column `prompts.intent` with pgEnum `prompt_intent` = `discovery | comparison | local | price`.
Null = unclassified; such prompts count in v2 but in no sub-score. A sub-score is v2 over the prompts with that
intent; null when the group has no runs.

Intent is set three ways:
- the brand-analysis job returns it for each suggested prompt (new field on the suggestion schema);
- a backfill script classifies existing prompts once (section 4);
- the prompt editor exposes it as a select (phase 1 UI, not here).

Phase 0 adds the column only. API v1 and MCP do not read or accept `intent` until a later phase adds it as an
optional field; nothing existing changes shape.

### 2.3 Brand accuracy

For runs of **branded** prompts where the brand is mentioned, `classifyMention` additionally returns
`claims: { claim: string; status: "contradicted" | "unsupported" }[]`: factual statements the answer makes about
the brand, each checked against the **authoritative profile**. Only `contradicted` counts against accuracy;
`unsupported` (the profile says nothing either way) is stored for the admin view and never scored.

Authoritative facts in phase 0 are identity facts only: canonical name, website and additional domains, aliases,
and the keywords the owner wrote (treated as "what the business does"). Phase 1 adds address, location, hours
and services from the wizard without changing the schema. Until then the score mostly catches wrong website,
wrong name or parent company, and wrong line of business, and the spec says so in the admin view's column help.

Stored as `prompt_runs.accuracy_claims jsonb NULL`. **Null means not assessed.** Every historical row is null; a
run is non-null only when the new classifier ran with a profile and returned, so an empty array `[]` is a
positive "assessed, nothing contradicted". A classifier failure or a call without a profile leaves null.

Accuracy = assessed runs with no `contradicted` claim ÷ assessed runs in the window, × 100, rounded. Null when
there are none. Branded runs that do not mention the brand are excluded (the AI did not describe the brand, so
it could not misdescribe it); they are counted separately as `unrecognised` for the later Overview warning.

## 3. Phase V — back-test

A script, not product code: `packages/lib/scripts/backtest-score-v2.ts`, following `backfill-brand-markets.ts`
(requires `DATABASE_URL`, refuses non-local without `ALLOW_REMOTE_DB=1`, read-only).

Per brand that has runs on ≥ 4 distinct models over ≥ 30 days:

1. Current window = last 30 days, previous window = the 30 before. Both windows are restricted to the brand's
   effective market and to the models present in **both** windows, so a pick or cadence change between windows
   cannot masquerade as a score change.
2. Cohort = enabled unbranded prompts with ≥ 4 runs in the current window. Everything below uses this cohort for
   both versions; "v1-buyer" is mention rate on the cohort, not the Home's all-prompt v1.
3. Per prompt: v1-buyer and v2, current window.
4. Brand-level v1-buyer and v2, both windows. The Home's all-prompt v1 is printed beside them for reference only.
5. Spearman rank correlation of per-prompt v1-buyer vs v2.
6. Trend per version = current − previous. Direction: `up` if ≥ 3, `down` if ≤ −3, else `flat`.
7. Level gap = v1-buyer − v2 (expected positive, since every weight ≤ 1); trend gap = |trend v1 − trend v2|.

Output: one row per brand (id, cohort size, runs, models, v1 all-prompt, v1-buyer, v2, Spearman, trends,
directions, level gap, trend gap), then a verdict:

- **pass** when ≥ 5 brands qualify, ≥ 80 % of them have Spearman ≥ 0.7, no brand's direction differs, and the
  median trend gap ≤ 5 points;
- **inconclusive** when fewer than 5 brands qualify: the rows are printed, and the proposal's owner decides
  whether to wait for data or lower the bar in writing;
- **fail** otherwise.

A `--json` flag writes the rows for the proposal's record.

`--labels <n>` instead exports `n` random branded, mentioned answers for hand labelling. Columns: run id, brand
id, model, prompt text, answer text, the profile shown to the classifier. The classifier's own claims are
written to a **second** file keyed by run id so labellers do not see them. Two labellers mark each answer
`contradicted: yes/no` against the profile; agreement = share of answers where the classifier's yes/no matches
the labellers' consensus, bar ≥ 90 % on 50. Answer text is public AI output with no customer data; the files
stay in the operator's working directory and are not committed.

The pure parts (`weightFor(run)`, `scoreV2(runs)`, `spearman(a, b)`, `direction(now, before)`) live in
`packages/lib/src/score/` with unit tests. The script only does SQL and printing.

## 4. Phase 0 — foundations

### 4.1 Schema

One migration, generated with drizzle-kit (never applied by the agent):

- `CREATE TYPE prompt_intent`, `ALTER TABLE prompts ADD COLUMN intent prompt_intent`.
- `ALTER TABLE prompt_runs ADD COLUMN accuracy_claims jsonb` (nullable, no default: null = not assessed).

No index: both columns are read alongside existing brand/prompt-scoped queries.

### 4.2 Worker

`classifyMention` gains an optional `profile` input and returns `claims` only when a profile was given
(`undefined` otherwise). `process-prompt.ts` passes the profile only for branded prompts and writes
`accuracy_claims` from it; unbranded prompts keep today's call shape and write null, so cost is unchanged for
them.

The brand-analysis suggestion schema (`packages/lib/src/onboarding/analyze.ts`) adds `intent` with the four
values; the prompt insert in `saveWizardOnboarding` (`onboarding-core.ts`) persists it. The existing
tag guidance already forbids goal-style tags, so intent does not collide with the LLM's topical tags.

### 4.3 Read layer

`apps/web/src/lib/postgres-read.ts` gains:

- `getScoreV2Summary(brandId, from, to, timezone, promptIds, marketKey)` → `{ total_runs, score_v2 }` using a
  `CASE` over `brand_rank`, same filters as `getDashboardSummary`.
- `getIntentScoreSummary(...)` → one row per intent, joining `prompts.intent`.
- `getAccuracySummary(...)` → `{ branded_mentioned_runs, assessed_runs, accurate_runs, unrecognised_runs }`,
  where `assessed_runs` counts `accuracy_claims IS NOT NULL` and `accurate_runs` counts assessed runs with no
  element whose `status = 'contradicted'`.

`apps/web/src/server/scores.ts` exposes one server function `getBrandScoreBreakdownFn({ brandId })` that
returns v1, v2, sub-scores and accuracy for the current 30-day window. Admin-only in phase 0.

### 4.4 Backfill of intent

`packages/lib/scripts/backfill-prompt-intent.ts`: for enabled unbranded prompts with `intent IS NULL`, batches
of 25 prompt texts per `runStructuredCompletionPrompt` call with the four-value schema plus `null` for "none of
these", writes the result, idempotent (second run finds 0). Branded prompts are skipped: they are brand questions
and never carry a buyer intent. Only prompt text is sent, never answers.

Cost: one model call per 25 prompts. The script first prints the count of prompts it will classify and the
resulting number of calls, and exits unless `--yes` is passed, so the operator sees the bill before it runs.
Same database guards as the other scripts.

### 4.5 Admin view

Route `_authed/admin/scores.tsx`: a table of every onboarded brand, 30-day window, with coverage beside every
score so sparse data reads as sparse:

| Column | Shows |
|---|---|
| Brand | name, market |
| Runs · models | run count in the window and distinct models |
| v1 | all-prompt mention % |
| v2 | rank-weighted, with the cohort size (unbranded prompts with runs) |
| Discovery / Comparison / Local / Price | sub-score with its prompt count, "—" when 0 prompts |
| Classified | intent-tagged ÷ unbranded prompts |
| Accuracy | % with `accurate ÷ assessed` beside it; "—" when assessed = 0 |
| Unrecognised | branded runs without a mention |

Plain shadcn table, no charts, column help text on Accuracy stating the phase-0 profile is identity-only. Link
from the admin index.

### 4.6 What does not change

Home, Prompts, shared reports, API v1, MCP: every number they show is v1 and stays v1. The v2 switch is a
separate, later change gated on the phase V verdict (proposal section 5).

## 5. Error handling

- Classifier failure already yields `null`; `accuracy_claims` is then written null and the run is neither
  assessed nor accurate. Historical rows are null for the same reason, so no pre-existing run can ever count as
  accurate.
- Back-test and backfill scripts exit non-zero on any SQL or model error; partial backfill is safe to rerun.
- The admin server function returns nulls, never throws, for brands without data.

## 6. Testing

- Unit: `weightFor`, `scoreV2`, `spearman` (known pairs, ties), `direction` at the ±3 boundaries, verdict
  (pass / inconclusive / fail incl. the 5-brand floor and the median trend gap), accuracy ratio treating null
  claims as not assessed and `unsupported` as not contradicted, intent grouping with null intent.
- Worker: `process-prompt.test.ts` gains a branded-prompt case asserting the profile is passed and
  `accuracy_claims` is written, an unbranded case asserting null is written, and a classifier-failure case
  asserting null.
- Read layer: existing SQL tests pattern (if any) for the three new queries against a seeded brand; otherwise
  covered by the server-function test with a stubbed read layer.
- Back-test script: smoke-run against the local database; the verdict logic is unit-tested, the SQL is not.

## 7. Out of scope

Wizard UI, starter report, any v2 display to users, the intent select in the prompt editor, sector/location on
the brand profile, Turkish copy.
