# AnswerEcho vs. Maya — gap analysis and build plan

`withmaya_ai.md` began as a review of [withmaya.ai](https://withmaya.ai) plus the
MVP plan that became AnswerEcho. This document is the follow-up: **Maya's
product, measured against what AnswerEcho ships today**, the real gaps, and a
plan to close them.

Every claim below was checked against source (file references included). The
short version: we are past the MVP on most of Maya's feature set and ahead of it
in places. Only a handful of genuine gaps remain.

---

## What Maya is (recap)

An AI-visibility / LLM-search analytics platform — "SEO for AI answers." It
tracks and improves how brands appear in ChatGPT, Claude, Gemini, and Perplexity
answers, organized around four pillars:

| Pillar | Meaning |
|---|---|
| **GEO** | Generative Engine Optimization — mention/recommendation monitoring, competitive positioning |
| **AEO** | Answer Engine Optimization — track customer prompts and whether the brand shows up |
| **AXO** | Agent Experience Optimization — audit how AI-ready a website is (crawlability, structure, metadata) |
| **AAO** | AI Ads Optimization — connect paid AI-channel advertising to outcomes |

Plus extras: a **Visibility Score** and **Share of Voice** over time, LLM-generated
buyer-prompt sets, content/structural recommendations, an **MCP server**, brand
**traffic analytics** (AI referral visits), agency multi-client support, and a
stated security posture (TLS/AES-256, GDPR/KVKK).

---

## Feature-by-feature: Maya vs. AnswerEcho

| Maya capability | AnswerEcho status | Evidence |
|---|---|---|
| **GEO** — mention/recommendation monitoring, competitive positioning | ✅ **Have** | `packages/lib/src/mentions.ts`; Share of Voice in `packages/lib/src/report-metrics.ts` |
| **AEO** — track customer prompts, brand-in-answers | ✅ **Have** | prompt bank editor; `apps/web/src/lib/postgres-read.ts` visibility |
| Multi-platform (ChatGPT, Claude, Gemini, Perplexity, AI Overviews) | ✅ **Ahead** — 13 engines incl. Google AI Mode + AI Overviews, Copilot, Grok, DeepSeek | `packages/config/src/models.ts`; `packages/lib/src/providers/registry/dataforseo.ts` |
| Prompt auto-generation (hundreds of buyer prompts) | ✅ **Have** — majority-unbranded, auto-tagged, at onboarding | `packages/lib/src/onboarding/analyze.ts`, `onboarding/llm.ts` |
| Visibility Score + Share of Voice + time-series | ✅ **Have** — LVCF-smoothed, per-model | `report-metrics.ts`, `postgres-read.ts` |
| Answer parsing: mentions, competitors, citations, query fan-out | ✅ **Have** (deterministic) | `packages/lib/src/text-extraction.ts`, `mentions.ts`, `apps/web/src/lib/fanout-analysis.ts` |
| Content/structural recommendations | ✅ **Have** — 4 categories (creation / existing / outreach / social) | `apps/web/src/server/opportunities.ts`, `components/opportunities-report.tsx` |
| **MCP server** (query visibility in natural language) | ✅ **Have** — OAuth-protected, 16 tools | `apps/web/src/lib/mcp/server.ts`, `routes/api/mcp/$.ts` |
| Multi-client / agency | ✅ **Have** — org tenancy, RLS, per-org billing, invitations | `packages/lib/src/db/schema-auth.ts`, `entitlements/`, `packages/config/src/plans.ts` |
| Scheduling | ✅ **Have** — pg-boss cron, cadence, expedite, backoff | `apps/worker/src/jobs/schedule-maintenance.ts`, `packages/lib/src/run-policy/` |
| Competitor tracking | ✅ **Have** — manual + LLM auto-discovery, SoV comparison | `packages/lib/src/competitor-discovery.ts`, `report-metrics.ts` |
| Security (TLS/AES-256/GDPR/KVKK) | ✅ **Have** | `ANSWERECHO_ENCRYPTION_KEY`, deployment modes |
| Answer **sentiment** (positive/neutral/negative) | ❌ **GAP** — detection is presence-only | `mentions.ts` is deterministic substring matching; no sentiment field |
| **In-answer ranking position** (recommended 1st vs. 4th) | ❌ **GAP** — "position" here = citation index, not brand rank in prose | `prompt_runs` stores `citationIndex`, not brand rank |
| **AXO** — website AI-readiness audit (crawlability, schema, metadata) | ❌ **GAP** — no crawler | only single-page onboarding fetch (`packages/lib/src/website-excerpt.ts`) |
| Multi-country consolidated report | ⚠️ **GAP** — country is deployment-wide, not per-evaluation | see `docs/CUSTOMER-FEEDBACK-REVIEW.md`; scraper-only |
| **Traffic analytics** — AI *referral* visits → visibility | ❌ **GAP** — only first-party product analytics | `apps/web/src/routes/api/plausible/...` measures AnswerEcho itself, not the brand's AI referrals |
| **AAO** — paid AI-ad optimization | ⛔ **Decline** — no ad inventory exists to sell | nothing in the codebase; can't guarantee placement |

**Net:** of Maya's headline features, AnswerEcho matches or beats all of GEO,
AEO, metrics, recommendations, MCP, multi-platform, agency/multi-tenant,
scheduling, and competitor tracking. Five real gaps remain, plus one to
deliberately decline.

---

## The gaps worth building

**1. Sentiment + in-answer ranking position** (parsing pillar, cheapest).
Maya reports *how* a brand is spoken about and *where* it ranks against
competitors in the answer. We record only *whether* it appears. Both are one
extra structured-LLM field per run (`sentiment`, `brandRank`) stored on
`prompt_runs` — no new pipeline. Highest value per line; turns "we detect
mentions" into "we tell you how you're described and ranked," which is Maya's
actual pitch. *Skip* re-scoring historical runs until asked.

**2. Presentation quick wins.** Data already exists:
- **Question-coverage metric** — "visible in 9 of 15 questions" beside the
  evaluation-weighted %.
- **Opportunities as an improvement plan** — add priority / expected impact /
  status / owner / progress to the existing 4-category report.
- **Per-LLM side-by-side** — make the model comparison more prominent.

**3. AXO — website AI-readiness audit** (the one missing pillar). Lazy version,
no new heavy infra:
- Fetch the site's `sitemap.xml` + top-N pages as a pg-boss job.
- Score each against a checklist: `robots.txt`/`llms.txt` posture toward AI bots
  (GPTBot, ClaudeBot, PerplexityBot, Google-Extended), schema.org/JSON-LD
  presence, `<title>`/meta, heading structure, answer-shaped content.
- One LLM pass per page scoring "how directly does this answer a buyer
  question," feeding the **existing** opportunities report — don't build a new
  surface.
- *Skip* a JS-rendering crawler until a customer needs SPA auditing.

**4. Multi-country per-evaluation comparison.** Already fully scoped in
`docs/CUSTOMER-FEEDBACK-REVIEW.md` — scraper-only, with "not localizable" labels
on the direct-API engines (Claude/GPT have no country concept). Per-evaluation
country/language columns + equal-weighted consolidated formula + UI filters.

**5. AI-referral traffic analytics.** Tie visits arriving *from* AI engines back
to visibility. Lazy version: a small JS snippet writing `{referrer, path, ts}`
rows, classified against a known-AI-referrer list (`chatgpt.com`,
`perplexity.ai`, `gemini.google.com`, `copilot.microsoft.com`, …) —
`packages/lib/src/domain-categories.ts` already exists to lean on. Report
AI-referred sessions alongside the visibility trend. *Skip* full GA-style
analytics — we only need the AI-channel slice.

**Decline: AAO / paid placement.** No ad inventory exists to sell inside LLM
answers and none should be promised. Position AnswerEcho as organic measurement.
Only report *sponsored* visibility separately *if* a platform ever exposes formal
inventory.

---

## Proposed plan (ordered by value / effort)

| Phase | Work | Why here | Size |
|---|---|---|---|
| **0** | Sentiment + in-answer rank fields; question-coverage metric; opportunities-as-plan; per-LLM side-by-side | Extends code that exists; clears most customer feedback | S |
| **1** | AXO site audit → readiness checklist + LLM score → feed opportunities | The only missing Maya *pillar*; highest differentiation | M |
| **2** | Multi-country comparison (per-evaluation country/language, "not localizable" labels, equal-weighted formula, UI filters) | Real customer ask; already scoped; scraper-only | M |
| **3** | AI-referral analytics (referrer pixel + AI-domain classification + trend panel) | Closes the last Maya extra | S–M |
| **—** | AAO paid ads | Can't sell placement; organic positioning | skip |

**Recommended first move: Phase 0.** It's an afternoon, ships visibly, and turns
mention detection into described-and-ranked reporting before we touch the one
net-new pillar (AXO) in Phase 1.

---

## Evidence

- Architecture & calculations: `docs/ARCHITECTURE.md`
- Customer feedback & country scoping: `docs/CUSTOMER-FEEDBACK-REVIEW.md`
- Providers/engines: `packages/lib/src/providers/index.ts`, `packages/config/src/models.ts`
- Mentions & metrics: `packages/lib/src/mentions.ts`, `report-metrics.ts`, `apps/web/src/lib/postgres-read.ts`
- Recommendations: `apps/web/src/server/opportunities.ts`
- MCP server: `apps/web/src/lib/mcp/server.ts`
- Onboarding prompt generation: `packages/lib/src/onboarding/analyze.ts`
