# Setup wizard and starter report (phase 1a) — design

Date: 2026-11-03. Parent: `docs/ux-designer/PROPOSAL-web-app-board.md` (phase 1, split on 2026-11-03 into 1a
and 1b). Board screens 1–5 of `docs/Enrigio Web App.html`. Builds on the phase 0 spec
(`2026-11-03-score-v2-foundations-design.md`): intent, accuracy claims and the read queries exist.

## 1. Goal

A logged-in user adds a brand by pasting a URL, confirms what the site says about the business, picks the questions,
rivals and engines, watches the first scan arrive, and opens a frozen starter report. Everything a user sees on the
board's first five screens, on the current deployment (`local` mode, Turkish UI), without public sign-up, plans or
share links. Those are phase 1b.

## 2. Flow

```
/app/org/$org/new ──(URL)──▶ brand row created, onboarded=false, analysis enqueued
        │
        ▼
/app/org/$org/brand/$brand   while !onboarded renders <SetupWizard> instead of the Home
   step 1  Site ve marka      extracted fields, editable
   step 2  Sorular            16 buyer questions in 4 intent groups, 12 preselected, min 10 max 16; 3 brand questions
   step 3  Rakipler           analysis competitors, pick up to 5
   step 4  Motorlar           engines available on this deployment, defaults = ChatGPT, Gemini, Google AI Overview, Perplexity
   step 5  İlk tarama         save, enqueue first scan, live progress; "Raporu aç" when done
        │
        ▼
/app/org/$org/brand/$brand/report   starter report, frozen snapshot; Home link
```

"Sonra devam et" needs no persistence: the brand already exists with `onboarded = false`, so reopening the brand
reopens the wizard at the step inferred from state (no analysis yet → step 1; analysis done → step 1 review; saved
but first scan running → step 5; first scan done → report).

## 3. Screens and behaviour

### Step 1 — Site ve marka

- `/app/org/$org/new` is reduced to one field (website) and one button ("Siteyi oku"). Submit: validate URL, create
  the brand through the existing `createBrandInOrgFn` with the hostname as the provisional name, enqueue
  `analyze-brand` immediately (today the user has to press "Analyze" on the Home), navigate to the brand route.
- The wizard polls the existing analysis status every 2 s (reuse `getAnalyzeBrandStatusFn` and the timeout/cancel
  pattern from `prompt-wizard.tsx`). While pending: the board's "Site okunuyor: ana sayfa, hizmet sayfaları, iletişim…
  (yaklaşık 20 saniye)" copy with a spinner.
- When done, show the extracted fields, each editable: brand name, **sector**, **market** (select from
  `MARKET_CATALOG`), **location**, aliases (tags), additional domains (tags). "Bunları sonra Ayarlar › Marka'dan
  değiştirebilirsin." Button: "Devam: müşteriler ne soruyor?".
- Analysis changes (`packages/lib/src/onboarding/analyze.ts`): the suggestion schema gains `sector` (short free
  text, e.g. "fizyoterapi merkezi"), `location` (city or region, nullable), `marketKey` (one of the catalog keys,
  chosen from the site's language and country; nullable), and the prompt request becomes **exactly 16 unbranded
  prompts, 4 per intent, plus 3 branded**, written in the market's language. `OnboardingSuggestion` carries the
  three new fields; the worker job is unchanged.
- Schema: `brands.sector text`, `brands.location text` (both nullable). Market lands in the existing
  `defaultMarketKey`.

### Step 2 — Sorular

- Two lists. **Alıcı soruları** grouped by intent (Keşif, Karşılaştırma, Yerel, Fiyat ve hizmet), each item a
  toggle; the first 3 of each group start on (12 selected), counter "N / 16 seçili · en az 10", the Continue button
  disabled below 10. **Marka soruları**: the 3 branded prompts, shown as "Otomatik eklendi", not toggleable.
- A free-text "Ekle" adds a custom buyer question to a chosen group (intent set from the group). Max 16 buyer
  questions in total.
- The board's per-question volume hint ("~2.400/ay") is **not shown** in 1a: there is no volume source wired (the
  DataForSEO keyword-volume API is the candidate, and that account is currently failing).
- Footer: "{count} alıcı sorusu × {engines} motor × günlük = ayda yaklaşık {runs} cevap", computed from the current
  selections at 1 run per engine per day.

### Step 3 — Rakipler

- The analysis's competitors (up to 10), each a toggle with name and site; "{count} seçili · en fazla 5"; the first
  5 start on. Free-text add (name + site).
- The board's "N cevapta geçti" pre-scan counts are **not shown** in 1a: there is no scan yet. Mention counts appear
  on the report and the Home after the first scan.

### Step 4 — Motorlar

- One toggle per engine the deployment can run, from the same source the settings page uses (`getModelPickerStateFn`
  → `available`), with the board's one-line descriptions keyed by engine id. Defaults on: chatgpt, gemini,
  google-ai-overview, perplexity when available; otherwise the first four available. Engines the plan does not
  include are shown disabled with the plan label (cloud only; a no-op in local mode).
- Copy: "Kurulum bitince ilk tarama hemen başlar; yaklaşık {minutes} dakika sürer." with minutes =
  `ceil(prompts × engines / 20)`, floor 1.
- Button: "İlk taramayı başlat".

### Step 5 — İlk tarama

- On start, one server function `startFirstScanFn` does, in one transaction where possible: save name, sector,
  location, market, aliases, domains; insert competitors; insert the selected buyer prompts with their intent and the
  3 branded prompts (intent null); set `enabledModels`; set `onboarded = true` and `first_scan_started_at = now()`;
  then enqueue one `process-prompt` job per prompt with `data: { promptId, firstScan: true }`.
- Worker: a job with `firstScan: true` runs each due target **once** (replication 1) regardless of
  `RUNS_PER_PROMPT` or the plan's replication, and then schedules the next regular run as today. Nothing else about
  the run changes, so first-scan runs land in `prompt_runs` like any other.
- Progress: `getFirstScanStatusFn(brandId)` returns `{ expected, done, failed, mentioned, missing, topRival,
  latest: [...up to 5 of { model, prompt, excerpt, mentioned, rank }], complete }`. `expected` = enabled prompts ×
  enabled engines at start; `done`/`failed` from `prompt_runs` and `usage_events` (type `prompt_run_failed`) created
  after `first_scan_started_at`; `complete` = no `process-prompt` job for this brand's prompts with
  `data.firstScan = true` in state created/active/retry. On `complete` the server function sets
  `first_scan_completed_at` if null. The page polls every 3 s.
- Screen copy per the board: "{done} / {expected} cevap alındı", "kalan ~{remaining}" (linear estimate from elapsed
  per answer), the three counters (cevap alındı / cevapta yoksun / cevapta varsın), "en çok anılan rakip", the
  "Son gelen cevaplar" list with "Sen yoksun" or "{rank}. sırada" badges. "Sayfayı kapatabilirsin" stays; the
  "e-posta alırsın" promise is **dropped** in 1a (local mode cannot send email).
- When complete: "Raporu aç" → `/app/org/$org/brand/$brand/report`. "Şimdiye kadarki sonuçları gör" → the Home.

### Starter report

- Route `/app/org/$org/brand/$brand/report` (authed). Loader calls `getStarterReportFn(brandId)`, which returns the
  stored snapshot or, when none exists and the first scan is complete, builds and stores it once. Before the first
  scan completes it redirects to the brand route (the wizard's step 5).
- Snapshot table `starter_reports`: `id`, `brand_id` (unique), `report jsonb`, `created_at`. Frozen on purpose: the
  report never changes after creation. Phase 1b adds the share token and the domain claim to this table.
- Snapshot content, computed from first-scan runs only (`created_at` between `first_scan_started_at` and
  `first_scan_completed_at`), all numbers taken at build time:
  1. **Headline**: "Müşterilerin sorduğu {buyer} sorunun {missing}'inde adın geçmiyor." + "{answers} cevap tarandı
     ({engine list}). Senin yerine en çok {topRival} öneriliyor." + the good-news line naming up to two buyer
     questions where the brand ranked 1–3.
  2. **Skor**: mention % over buyer-question answers (v1, the score users see everywhere), the band, "{answers}
     cevabın {mentioned}'ünde geçtin (%), geçtiğinde çoğunlukla {typicalRank}. sırada", the four intent sub-scores
     (mention % per intent; "—" when an intent has no questions), and brand accuracy from the branded answers
     ("Marka doğruluğu {pct}" using phase 0's no-contradiction ratio; "—" when nothing was assessed).
  3. **Kim var**: mention counts per selected rival and the brand, sorted, plus the one-line observation naming the
     rival that appears in the most questions.
  4. **Neden onlar**: the top 4 cited domains across buyer answers that cite a rival but not the brand, each with
     the brand's own status (yoksun / varsın / kısmen) from citations; from `citations` joined to competitor and
     brand domains. In 1a this section is **open**; 1b locks it behind the plan.
  5. **Ne yapmalı**: the brand's opportunities (existing `resolveOpportunities`, generated inline at snapshot time so
     the report is complete), split high/medium/low impact, counts in the header. In 1a all are open; 1b locks the
     high-impact ones.
  6. **Gerçek cevaplar**: 4 answers chosen for spread (one per engine where possible; prefer one "yoksun", one
     ranked 1–3), each with engine, question, a ≤ 300-char excerpt with the brand and rival names highlighted, and
     the badge.
- Header: brand name, "Başlangıç raporu · {date}", a "Genel bakışa git" button. "Paylaşım linki", "PDF indir" and
  "Planı seç" are 1b.

## 4. Data and code changes

| Area | Change |
|---|---|
| `packages/lib/src/db/schema.ts` + migration | `brands.sector`, `brands.location`, `brands.first_scan_started_at`, `brands.first_scan_completed_at`; new `starter_reports` (`brand_id` unique). |
| `packages/lib/src/onboarding/analyze.ts` | Schema fields `sector`, `location`, `marketKey`; prompts: 16 unbranded (4 per intent) + 3 branded, in the market language; `OnboardingSuggestion` gains the three fields. |
| `apps/web/src/server/onboarding-core.ts` | `saveWizardOnboarding` → superseded by `startFirstScan` (same inserts, plus sector/location/market/enabledModels, `first_scan_started_at`, first-scan job enqueue). `createBrand` unchanged. |
| `apps/web/src/server/onboarding.ts` | `startFirstScanFn`, `getFirstScanStatusFn`; `startAnalyzeBrandFn` also called from `/new`. |
| `apps/web/src/server/starter-report.ts` + `-core.ts` | `getStarterReportFn`; snapshot builder over `prompt_runs`, `citations`, competitors, opportunities, phase 0 accuracy query. |
| `apps/web/src/lib/job-scheduler.ts`, `apps/worker/src/jobs/process-prompt.ts` | `firstScan` job flag → replication 1. |
| `apps/web/src/routes/_authed/app/org/$org/new.tsx` | URL-only entry. |
| `apps/web/src/components/setup-wizard/*` | `SetupWizard` (stepper shell), `StepSite`, `StepQuestions`, `StepRivals`, `StepEngines`, `StepFirstScan`; replaces `PromptWizard` on the brand route. `prompt-wizard.tsx` is deleted once nothing imports it. |
| `apps/web/src/routes/_authed/app/org/$org/brand/$brand/report.tsx` + `components/starter-report/*` | The report page. |
| `apps/web/src/locales/{en,tr}.json` | Every new string; Turkish copy from the board, English equivalents. |

Untouched: Home, Prompts, Citations, settings, API v1, MCP, plans.

## 5. Error handling

- Analysis fails or times out (6 min): step 1 shows the error and a "Tekrar dene" that re-enqueues; the user can
  also fill the fields by hand and continue (the analysis is a convenience, not a gate).
- Analysis returns fewer than 16 unbranded or 3 branded prompts: show what came back; the min-10 rule still applies
  and the user can add their own.
- `startFirstScanFn` fails after `onboarded = true` is written: it is written **last**, after prompts and
  competitors, so a failed insert leaves the brand un-onboarded and the wizard reopens at step 5 with the error.
- First scan: a run failure counts toward `done` as `failed` so the bar completes; `complete` never depends on
  every run succeeding. If no job finishes within 20 minutes, the screen offers "Raporu şimdiye kadarki
  sonuçlarla aç", which marks completion and builds the snapshot from what exists.
- Report snapshot: built once; a failure to build (e.g. opportunities generation throws) returns the report without
  section 5 and a "Öneriler hazırlanamadı" note, and the snapshot is still stored so the page is stable.

## 6. Testing

- Pure: question selection rules (preselect 12, min 10, max 16, custom add → intent), engine defaults, expected
  count and the monthly estimate, snapshot builder on fixture runs (headline numbers, sub-scores, who's-there order,
  why-them selection, 4-answer spread), wizard step inference from brand state.
- Server functions with the stubbed db pattern: `startFirstScanFn` writes order (onboarded last) and enqueues one
  job per prompt with `firstScan: true`; `getFirstScanStatusFn` counts and completion; `getStarterReportFn` builds
  once then serves stored.
- Worker: `firstScan` job runs replication 1 and still schedules the next run.
- Analysis normaliser: new fields, unknown `marketKey` → null, exactly-16/3 handling.
- End to end on production after deploy: add a brand through the wizard with the Playwright session, watch step 5
  complete, open the report.

## 7. Out of scope (phase 1b)

Public sign-up and cloud mode, free entitlement tier, one-report-per-domain claim, share link and PDF, "report ready"
email, locked sections and plan CTAs, the return-visit paywall page, question volume hints, rival pre-scan counts.
