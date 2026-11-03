# Enrigio Web App board — proposal for review

Date: 2026-11-03 (rev 3, after second review) · Author: Rigosis product · Status: proposal, nothing implemented
Source: `docs/Enrigio Web App.html` (13-screen Claude Design board, Turkish copy, 1440 px frames)

## 1. Summary

The board describes a different product from the one shipped on 21 Oct (`2026-10-21-home-redesign-design.md`):
a self-serve setup wizard, a one-shot free starter report that converts into a paid plan, and a paid app
organised around an action plan whose effect is measured 21 days later. Much of it is new backend and data
model, not restyling, though more of the wizard already exists than the board suggests (section 3).

**Recommendation:** adopt the board's product concepts, phase them, and keep the shipped top-bar shell for now.

1. A validation milestone first: settle scan counts, score definition, pricing, domain-claim rules and report
   privacy (section 6). No implementation estimates until these are decided.
2. Setup wizard + free starter report (acquisition lever; reuses the existing brand-analysis job).
3. Action plan with verification + Sources gap page (retention lever).
4. Monthly report, Monday digests, plan packaging and the Brands portfolio.
5. Decide sidebar vs top bar only after step 3, when the page count justifies it.

## 2. What the board proposes

Three flows, in the order a new user meets them.

### 2.1 Setup wizard (screens 1–4)

| Step | What the user does | What the system must do |
|---|---|---|
| 1 Site & brand | Pastes a URL, reviews extracted fields | Read the site; extract brand name, sector, market/language, location, aliases, extra domains |
| 2 Questions | Picks ≥10 of 16 suggested questions | Suggest buyer questions by sector + location with a volume hint; auto-add 3 brand questions |
| 3 Rivals | Picks 3–5 of the rivals found | Run a quick pre-scan and count which competitors appear in answers |
| 4 Engines | Toggles engines | Default 4 engines (ChatGPT, Gemini, Google AI Overview, Perplexity); Claude and Copilot shown as plan-gated |
| 5 First scan | Watches answers stream in | Run the first evaluations live, show progress and a running "you're missing" count, email when done |

Concepts introduced: **buyer questions** (drive the score) vs **brand questions** (accuracy and sentiment only,
never scored); "continue later"; the wizard is the same for the first brand and for every added brand.

**Inconsistency in the board:** step 2 requires at least 10 buyer questions and adds 3 brand questions, but
step 5 and the report say "12 questions × 4 engines = 48 answers". Proposed rule (D1): 12 buyer questions
pre-selected, user may go down to 10 or up to 16; the 3 brand questions always run; every selected question runs
on all 4 default engines. First scan is therefore (10–16 + 3) × 4 = 52–76 evaluations, 60 at the default. The
board's "12 × 4 = 48" copy changes to "15 questions × 4 engines = 60 answers".

### 2.2 Free funnel (screens 5–6)

- **Starter report** — one per domain, ever. Score with intent sub-scores (Discovery / Comparison / Local / Price),
  brand-accuracy score, "who's there" mention counts, 4 real answers, and a prioritised action list where
  high-impact actions are locked. "Why them" (the sources rivals are cited from) is locked. Shareable link and PDF.
- **Return visit** — the report is frozen at its date; re-scan is locked; a Free vs Growth comparison with
  "your report and questions carry over, no second setup".
- Plan as drawn: "Growth" at 199 $/mo, 3 sites, daily scans on 4 engines, all actions, sources, monthly report.
  This does not match the current catalog (section 3, item 7).

### 2.3 Paid app (screens 7–13)

| Page | Purpose | New vs shipped |
|---|---|---|
| Overview | Score + delta, intent sub-scores, brand accuracy with warnings, who's there, top-3 sources, this week's actions | Sub-scores, brand accuracy, source-gap summary are new |
| Questions | Buyer/brand tabs, per-question score, mention rate, avg rank, best rival, 30-day sparkline, drill-down with real answers and "why you're missing" | Prompts page has rate and weighted-mention stats; intent, rank column and "why missing" are new |
| Sources | Citation share by owner type, **gap table** (rival cited, you aren't), your pages with citation count and status | Citations page and source-mix exist; gap framing and page status are new |
| Brands | Portfolio cards per brand, site quota, "who runs setup: me or invite the client" | Brands settings page exists; invite-client setup is new |
| Action plan | Max 5 active, each tied to a question and a source, owner + due date, checklist, how-to with a pre-filled email template, 7-day early signal, 21-day verification with before→after | Opportunities exist (LLM-generated, dismiss, mark done) but have no lifecycle, owner, or measurement |
| Reports | Monthly report (score, who's there, why, what to do, what changed, action impact table), Monday digests, new question suggestions from query fan-out | Query fan-out exists; monthly generation, digests and the impact table are new |
| Sidebar | Brand switcher, 7 items, plan badge with site quota, user | Replaces the top bar + brand strip + Advanced menu |

## 3. Where it diverges from what is shipped

Checked against `main` on 2026-11-03.

1. **Navigation.** The 20 Oct brief said the new UI should "share nothing visually with a sidebar-driven dashboard".
   The board brings the sidebar back. Either the brief's rule is dropped or the board's sidebar is treated as a
   component sketch, not the shell.
2. **Score definition.** Shipped: mentions ÷ answers as a percentage (`dashboard.ts`), already split into branded
   and non-branded visibility, plus an `averageWeightedMentions` figure on the Prompts page. Board: a rank-weighted
   score over buyer questions only, four intent sub-scores, and a separate brand-accuracy score. The board does not
   define the weights, how rank is read from an answer, or how missing and inconsistent answers count. Runs already
   store `brandRank` and `sentiment`, so rank weighting has data to work from; nothing records factual accuracy,
   so the brand-accuracy score needs a new evaluator output. Changing the headline number changes the worker's
   aggregation, every shipped card, and the shared report.
3. **Questions model.** Prompts are already auto-tagged branded/unbranded (`SYSTEM_TAGS`) and carry LLM-chosen
   topical tags, so the buyer/brand split largely exists. What is new: a fixed intent taxonomy (Discovery,
   Comparison, Local, Price), suggestion by sector + location, and the "volume" hint per question.
4. **Site extraction.** The brand-analysis job (`packages/lib/src/onboarding/analyze.ts`, run by the worker) already
   extracts aliases, competitors and suggested prompts from the site via LLM + web search. New: sector, market,
   location and extra-domain extraction; the pre-scan rival counts; the streaming first-scan screen.
5. **Action lifecycle.** Board actions have status (To do / Doing / Awaiting verification / Verified), owner, due
   date, linked question and source, a re-scan on "Done", and before/after measurement. Shipped opportunities are
   an append-only LLM digest with dismiss and "mark done". No table for actions exists.
6. **Free tier and report snapshots.** No free tier exists; `choose-plan` is cloud billing. The `reports` table is
   the legacy standalone brand report (name, website, raw output), not an immutable snapshot of a brand's
   evaluations. Brands are not domain-verified today; any org can track any site. One-shot-per-domain enforcement
   needs: domain normalisation (www, subdomains, aliases), a claim record independent of account and email, what a
   second account sees, and what the public share link exposes (D4).
7. **Pricing.** `packages/config/src/plans.ts` is the source of truth: Starter 29 $ (1 brand, 1 platform pick),
   Basic 99 $ (1 brand, 4 picks), Pro 299 $ (2 brands, 4 picks, 20 premium slots), Business 649 $ (5 brands,
   30 premium slots). Claude is sold as a premium grounded call; Copilot is an ordinary scraped pick on any
   4-pick plan. The board's "Growth 199 $ / 3 sites" and "Claude + Copilot need Pro" conflict with both. Stripe
   lookup keys and entitlements are derived from this file, so the board's tiers either replace the catalog or
   are dropped.
8. **Action measurement.** A 7-day signal and a 21-day verified delta on one question are noisy: engines change
   answers daily, picks and markets can change mid-window, and the scan sample is small. The board shows "+14"
   as if caused by the action.
9. **Language.** Board copy is Turkish. App is English; `docs/i18n/TRANSLATION.md` describes an approach not yet
   wired in.

## 4. Options

| Option | What it means | Pros | Cons |
|---|---|---|---|
| **A. Board is the target** | Sidebar replaces the top bar; re-plan every page to the board | One coherent vision; matches the designer's intent | Throws away two weeks of shipped Home work; largest scope; nav decision taken before the pages exist |
| **B. New flows only** | Keep shipped Home; add wizard + starter report + paywall in front of it | Conversion lever lands first; reuses brand analysis; shell untouched | Paid app stays thin; the report's score must be the Home's score or users see two numbers |
| **C. Feature extraction** | Cherry-pick action plan, sources gap, monthly report into the current IA | Retention value for existing users; no free tier or billing work | No acquisition improvement; still needs the score and intent-model changes |
| **D. Pitch board only** | Treat the board as a sales/feasibility artefact; build nothing yet | Zero cost | The board already encodes product decisions that should be made explicitly |

**Recommended: B, then C, nav decision deferred**, preceded by the validation milestone in section 5. The
dependency that forces the order is the score definition (item 2): both the starter report and the action plan
show it, so it is decided first and built once.

## 5. Proposed phasing

Sizes are deliberately absent until phase V closes; the review was right that they were premature.

| Phase | Ships | Depends on | Acceptance |
|---|---|---|---|
| **V Validation** | Written decisions D1–D9 (section 6); score v2 and the accuracy rubric defined and back-tested offline against existing evaluation data; domain-claim rules; report privacy rules | Nothing | Each decision recorded in this file with an owner. Back-test set: every brand on the cloud instance with ≥ 30 days of runs on ≥ 4 platforms. Pass: per-brand Spearman correlation between v1 and v2 across prompts ≥ 0.7 for at least 80 % of brands, and no brand's 30-day direction (up/down/flat, ±3 points) flips between v1 and v2 |
| **0 Foundations** | Intent tag on prompts; score v2 and the accuracy score computed by the worker beside v1; backfill of intent on existing prompts (branded flag already exists) | V | v2 visible in an admin view for every brand; every user-facing surface still shows v1 |
| **1 Wizard + starter report** | 5-step wizard replacing `new.tsx`, extending the brand-analysis job with sector/market/location; question suggestions with intent; rival pre-scan; live first-scan with progress and recovery; immutable starter-report snapshot; domain claim; locked states; return-visit page | 0 | Setup completion ≥ 60 %: wizards reaching the first-scan screen ÷ wizards that submitted a URL, measured over the first 30 days after launch. First scan (60 evaluations) completes in ≤ 5 min for 95 % of runs and never leaves a wizard stuck: a scan older than 20 min is marked failed and offered a retry. A second account on a claimed domain sees exactly the frozen report |
| **2 Action plan + Sources** | Action table (status, owner, due, question, source); "Done" enqueues a re-scan; 7-day and 21-day measurement job with comparability rules; how-to + email template content; Sources gap and your-pages tables | 0 | Every action links to one prompt and one source; measurement only compares scans with the same prompt, platform picks and market; UI wording never claims causation |
| **3 Reports + plans** | Monthly report job + Monday digest emails; action impact table; plan packaging decided in D3 wired into `plans.ts` and Stripe; Brands portfolio with client-invite setup | 1, 2 | Report generated on the 1st for every active brand; ≥ 3 % of starter reports convert to a paid plan within 30 days of the report date, measured over the first 90 days after launch |

**Score versions as users see them.** Until the back-test in phase V passes, every surface (Home, Prompts, shared
report, starter report) shows v1. When it passes, v2 replaces v1 on every surface in one release at the end of
phase 0, with the Home delta recomputed from v2 history so no user sees a jump caused by the switch. The starter
report never shows both. Intent sub-scores before the switch are v1 computed per intent group.
| **4 Shell + language** | Sidebar vs top bar decision; Turkish via i18n or Turkish-first | 3 | — |

## 6. Decisions required before dependent work starts

These are product decisions and need an explicit answer, not a default. The suggested answer is marked.

| # | Decision | Suggested | Blocks |
|---|---|---|---|
| D1 | First-scan composition | 12 buyer questions pre-selected (min 10, max 16) plus the 3 brand questions, all on the 4 default engines: 60 evaluations at the default. Brand questions feed the accuracy score only and never the visibility score | 1 |
| D2 | Score v2 definition: rank weights, how rank is read, treatment of missing/inconsistent answers | Starting formula for the back-test: per answer, rank 1 = 1.0, rank 2 = 0.7, rank 3 = 0.5, rank ≥ 4 = 0.3, not mentioned = 0, from the existing `brandRank`; score = mean × 100 over buyer-question answers in the window; an answer with no rank but a mention counts 0.3. Replaces v1 only after the phase V back-test passes | 0, 1, 2 |
| D3 | Pricing and packaging: keep the four-plan catalog, or replace with the board's Growth/Pro; which engines are gated | Keep the catalog; map "Growth" to Basic or Pro; drop the Copilot gate; keep Claude as premium | 1 (locked states), 3 |
| D4 | Free starter report: claim scope, ownership, disputes, and who sees what | Claim = one report per normalised registrable domain (www and subdomains collapse to it; aliases do not), created by whoever runs the wizard first. No ownership verification: the report contains only public AI answers and the suggested (not custom) question set, so it is domain-level data, not account data. A second account that enters the same domain sees the same frozen report in full and the same upgrade path. Claims are permanent and never released; a paid plan re-scans regardless. No dispute process. Share link shows the report with answer quotes removed | 1 |
| D5 | Action measurement rules: what counts as improvement, which scans are comparable, how it is worded | Same prompt + picks + market; ≥ 3 scans each side; report "score moved from X to Y" with no causal claim | 2 |
| D6 | Language: English-first then translate, or Turkish-first | English-first | 1 |
| D7 | Site extraction: extend the existing brand-analysis LLM job vs a third-party enrichment API | Extend the existing job | 1 |
| D8 | Shell: keep the top bar until phase 4 (defer) or adopt the sidebar now | Defer | 4 |
| D9 | Brand-accuracy rubric | Per brand-question answer the evaluator records: factual claims about the brand (address, services, hours, pricing, ownership) and whether each matches the brand profile from setup; sentiment already exists. Accuracy = answers with zero contradicted claims ÷ all brand-question answers in the window × 100. Each contradicted claim surfaces as a warning (as the board's "Gemini gives the old address"). Needs its own back-test: 50 hand-labelled answers, evaluator agreement ≥ 90 % | 0, 1 |

Low-risk details not listed here (card layouts, copy, the 5-active-action cap) take the board as drawn.

## 7. Appendix — screen inventory

Titles are the board's.

| # | Board title | Frame | Notes |
|---|---|---|---|
| 1 | 0 · Sıfırdan başlangıç — Adım 1: Site ve marka | 1440×1000 | URL in, extracted brand/sector/market/location/aliases/domains out |
| 2 | Adım 2: Müşterileriniz ne soruyor? | 1440×1180 | 16 suggested buyer questions, min 10; 3 auto brand questions; monthly answer count |
| 3 | Adım 3–4: Rakipler ve motorlar | 1440×1100 | Rivals from pre-scan (max 5); engines with Pro gating |
| 4 | Adım 5: İlk tarama canlı | 1440×1000 | 30/48 progress, missing/present counts, streaming answers |
| 5 | Başlangıç raporu (ücretsiz plan, paywall) | 1440×2500 | Score 14, sub-scores, who's there, locked sources, locked high-impact actions, 4 answers, plan CTA |
| 6 | Ertesi gün geri dönüş | 1440×1700 | Frozen report, re-scan locked, Free vs Growth table |
| 7 | Genel bakış | 1440×1420 | Score 38 (+6), accuracy 98 with 1 warning, who's there, top-3 sources, this week's actions |
| 8 | Sorular | 1440×1240 | Buyer/brand tabs, per-question table, drill-down with answers, why-missing sources, linked actions |
| 9 | Kaynaklar | 1440×1240 | 970 citations · 101 domains; share by owner type; gap table; your-pages table |
| 10 | Markalar (portföy) + yeni marka ekle | 1440×1000 | 3 brand cards incl. one mid-setup; add-brand dialog with "invite client" |
| 11 | Aksiyon planı | 1440×1360 | 5 actions across 4 statuses; how-to panel with email template |
| 12 | Aylık rapor | 1440×1420 | Monthly list, Monday digests, 4-section report, what changed, action impact table |
| 13 | Bileşen · Sol menü | 240×900 | Sidebar component: brand, 7 nav items, plan badge, user |
