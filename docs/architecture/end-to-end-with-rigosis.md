# AnswerEcho — end-to-end mechanics (worked with the Rigosis brand)

How the platform turns a single URL (`rigosis.com`) into a daily measurement of
how AI answer engines mention, rank, and cite a brand — every stage, the code
that runs it, and the endpoints it calls.

Companion diagrams (open in a browser):
- `docs/architecture/system-architecture.html` — component topology
- `docs/architecture/prompt-evaluation.html` — the per-prompt evaluation trace

> **About the Rigosis example.** "Rigosis" is two things in this repo: the
> product's own whitelabel brand ("AnswerEcho by Rigosis", green `#39b54a`,
> docs at rigosis.com) **and** the canonical *tracked brand* used in the demo.
> The concrete numbers below come from a real demo run captured in
> `docs/how-to/HOW-TO.md` (2026-09-17, `answerecho-demo.onrender.com`). There is
> **no seed script** that inserts a Rigosis brand — the E2E seeder
> (`e2e/seed.ts`) uses generic "Test Organization"/Nike data. Rigosis is created
> by hand through the onboarding flow described here.

---

## 0. The mental model

Everything hangs off one relationship spine (Drizzle schema in
`packages/lib/src/db/schema.ts`, every app table `.enableRLS()`):

```
organization → brands → prompts → prompt_runs → citations
                   └── competitors
organization → member ← user            (access control)
organization → subscription / organizationSettings / usage_events   (billing)
```

Key facts that shape the whole design:

- **There is no `models`/`engines` table.** A "model" is just two string columns
  on `prompt_runs` (`model`, `provider`); the catalogue lives in code under
  `packages/lib/src/providers/`.
- **A "mention" is not a table either.** It's a boolean + array on each run:
  `prompt_runs.brand_mentioned` and `prompt_runs.competitors_mentioned[]`.
- **Web and worker never talk over HTTP.** They share one PostgreSQL. The web
  app *enqueues* pg-boss jobs (schema `pgboss` in the same database); the worker
  *consumes* them. (`apps/web/src/lib/boss-client.ts` runs `supervise: false`.)

---

## 1. Create the account and the brand

- First visit → sign-up. In `local` mode there is exactly one open registration
  (the owner); after that, sign-up closes. Auth is **better-auth**
  (`packages/lib/src/auth/server.ts`) with `organization`, `admin`, `apiKey`,
  `jwt`, and `mcp`/OAuth plugins.
- A **brand** is just name + website. For the demo: name `Rigosis`, website
  `rigosis.com`. The UI (`apps/web/src/components/brand-onboarding.tsx`) calls
  the server function `createBrandFn` (`apps/web/src/server/brands.ts:210`),
  which inserts a `brands` row scoped to the org. Everything else is derived.

---

## 2. Preparing the "questions" — brand analysis

This is the heart of the question ("how did it prepare the questions?"). Clicking
**Analyze brand** kicks off a ~1-minute LLM + web-search research pass. Because
that exceeds proxy timeouts, it runs as a **background job**, not inline
(`apps/web/src/server/onboarding.ts:27-32`).

### 2.1 The request path (web → queue → worker → LLM)

```
prompt-wizard.tsx  handleAnalyze()
  → startAnalyzeBrandFn        (server/onboarding.ts:37, POST)
    → enqueueAnalyzeBrand      (lib/analyze-brand-job.ts:90)
      → boss.send("analyze-brand", { brandId, website, brandName })
        deduped by analysisKey = brand + analysis URL  (in-flight run reused)

worker  jobs/analyze-brand.ts:23  (batchSize 1)
  → analyzeBrand(...)          (packages/lib/src/onboarding/analyze.ts:195)
  → returns OnboardingSuggestion as the pg-boss job.output

prompt-wizard.tsx  useQuery polls getAnalyzeBrandStatusFn every 2s
  (POLL_INTERVAL_MS=2000, gives up after ANALYZE_TIMEOUT_MS=6min)
  → getAnalyzeBrandStatus reads pgboss.job BY BRAND (brandId == orgId is the
    access boundary) → { status: pending | done(suggestion) | failed }
```

### 2.2 Inside `analyzeBrand()` — three phases

Engine: `packages/lib/src/onboarding/analyze.ts:195`. Three phases: build context
→ one structured LLM call → normalize.

**Phase 1 — read the website.** `getWebsiteExcerpt()`
(`packages/lib/src/website-excerpt.ts:33`) tries two sources, best-effort
(returns `""` on total failure, non-fatal):
1. **Jina Reader** — `GET https://r.jina.ai/<url>` (LLM-friendly markdown, runs
   JS; sends `Authorization: Bearer $JINA_API_KEY` when set). 30s timeout.
2. Fallback: **direct fetch + Mozilla Readability + linkedom** on raw HTML. 15s.

The excerpt is capped to 200 lines. The input URL is normalized two ways
(`onboarding/utils.ts`): `cleanDomain` (host only, for matching) and `cleanUrl`
(full URL, path preserved — so `nike.com/golf` is analyzed as the sub-brand).

**Phase 2 — one structured LLM call, with web search.**
`runStructuredResearchPrompt()` (`onboarding/llm.ts:90`) picks the first
configured provider in this order:

```
RESEARCH_PROVIDER_PREFERENCE = ["openai-api", "openrouter", "anthropic-api", "mistral-api"]
```

(overridable by env `ONBOARDING_LLM_TARGET`). Each provider hard-codes its own
research model — **the model is not env-configurable**:

| Provider | Research model | Web search |
|---|---|---|
| OpenAI (default) | `gpt-5-mini` | `openai.tools.webSearch`, contextSize `medium`, max 5 tool calls |
| Anthropic (fallback) | `claude-sonnet-5` | `web_search_20250305`, `maxUses: 5` |
| OpenRouter | `openai/gpt-5-mini` | `plugins:[{id:"web"}]` or `:online` slug |
| Mistral | `mistral-large-latest` | (none) |

> ⚠️ Those model IDs (`gpt-5-mini`, `claude-sonnet-5`) read as forward-dated —
> verify them against your live deployment before quoting them externally.

The actual call is Vercel AI SDK `generateText` with a native web-search tool and
`Output.object(schema)` — one agentic call (`providers/registry/ai-sdk.ts:13`).
The Zod schema is converted to JSON schema so the model must return valid JSON.

**The verbatim user prompt** (`analyze.ts:247`; there is *no* separate system
prompt — all field rules live in the schema `.describe()` strings):

```
Analyze the brand at ${analysisUrl}.

${nameLine}
${scopeNote}${excerptBlock}
Use web search to verify facts. Never invent information — return empty arrays when uncertain.

You MUST return the structured JSON object — even if you can find nothing about
this brand. In that case set brandName to the likely name above and return empty
arrays for every other field. Refusing to produce JSON, or replying with prose
explaining what you don't know, is a failure mode; an object with mostly-empty
arrays is the correct answer when information is genuinely unavailable.
```

**The structured output schema** (`analyze.ts:57`):

```ts
z.object({
  brandName:         z.string(),        // canonical, searchable, no "Inc./Ltd."
  additionalDomains: z.array(z.string()),
  aliases:           z.array(z.string()),
  competitors:       z.array({ name, domains[], aliases[] }),   // up to 10
  suggestedPrompts:  z.array({ prompt, tags[] }),               // up to 30
})
```

The prompt-count and competitor-count caps for the **onboarding wizard** are
`DEFAULT_MAX_PROMPTS = 30` and `DEFAULT_MAX_COMPETITORS = 10` (`analyze.ts:124`).

**How the branded/unbranded mix is steered.** The schema instruction on
`suggestedPrompts` forces the mix:

> *"IMPORTANT: the MAJORITY must be UNBRANDED — generic category/persona queries
> that do NOT contain the brand name … Only 3-5 should be branded … The goal is
> to test whether AI models mention the brand organically in response to
> unbranded queries."*

Each prompt is required to be a *"short search-style fragment, lowercase, under
~12 words. NOT a full sentence — the kind of thing people actually type into
ChatGPT."*

**Phase 3 — normalize** (`analyze.ts:284`): the user-supplied brand name always
wins over the model's (prevents "Nike Golf" widening to "Nike"); domains are
regex-validated and deduped; aliases that merely contain the canonical name are
dropped (redundant under substring matching, see §4.3).

### 2.3 What Rigosis got back

For `rigosis.com`, analysis returned **20 prompt suggestions** matched to the
real business — ITSM consulting in Turkey, OpenText SMAX partnerships — plus
brand prompts. Examples that survived to tracking:

| Prompt | Branded? |
|---|---|
| `rigosis itsm services` | branded |
| `rigosis opentext partner` | branded |
| `rigosis alternative` | branded |
| `opentext smax implementation partners turkey` | unbranded |
| `best it service management consultants in turkey` | unbranded |

Branded/unbranded is **not** tagged by the LLM — it's computed deterministically
by `computeSystemTags()` (`packages/lib/src/tag-utils.ts:74`), which marks a
prompt `branded` iff its lowercased text contains the brand name, the domain, or
the domain-without-TLD ("rigosis"). Stored in `prompts.system_tags[]`.

### 2.4 Confirm → tracked prompts

The wizard (`apps/web/src/components/prompt-wizard.tsx`) loads the suggestion
into an editable form. **The human is the selector** — untick what you don't
want. The demo kept **5** of the 20 (each enabled prompt costs one evaluation
per engine per day, so start small).

`handleSubmit` → `updateOnboardedBrandFn` → `saveWizardOnboarding`
(`apps/web/src/server/onboarding-core.ts:371`):
1. update brand fields, set `onboarded: true`;
2. `insertCompetitors` (dedupe domains, drop the brand's own host, enforce cap);
3. `insertPrompts` (trim/dedupe case-insensitively, sanitize user tags, compute
   `systemTags`, enforce entitlement cap `MAX_PROMPTS = 100`);
4. `createMultiplePromptJobSchedulers(newPromptIds)` — **this starts ongoing
   tracking**: one self-rescheduling `process-prompt` job per prompt.

> **Two prompt-generation paths, don't confuse them.** The onboarding wizard
> above uses **30 candidates + human selection** (no scoring). The separate
> *report-generation* flow (`apps/worker/src/report-worker.ts`) asks for **84
> candidates** (`TARGET_PROMPTS_COUNT=70 × 1.2`), actually *runs* all of them,
> then `selectOptimalPrompts()` scores by observed brand/competitor mention rate
> and keeps **70** (non-branded first, branded as fallback). That's where the
> "84/70" numbers come from — not onboarding.

---

## 3. The daily evaluation loop (`process-prompt`)

This is the recurring engine that produces the data. See
`prompt-evaluation.html` for the visual trace. Driver:
`apps/worker/src/jobs/process-prompt.ts` (`processPrompt()`), concurrency 10,
`retryLimit: 0` (a paid fan-out must never be re-run wholesale), 90-min expiry.

### 3.1 Trigger — self-rescheduling, not cron

`process-prompt` is **not** a cron job. Each run queues its own next run at the
brand's cadence via `scheduleNextRun` (`singletonKey: prompt-<id>` dedupes).
The only cron is a safety net: **`schedule-maintenance`** runs every 5 minutes
(`apps/worker/src/index.ts`), finds enabled prompts with no pending job (or
overdue — after a crash, resubscribe, or new model pick) and (re)queues them.
"Start tracking" also expedites the first run immediately
(`apps/web/src/lib/expedite-prompts.ts` bumps `start_after`).

### 3.2 Per-run steps

For one prompt, e.g. `opentext smax implementation partners turkey`:

1. **Load context** — `getPromptContext`: the prompt, its brand, the brand's
   competitors (Drizzle).
2. **Resolve the run plan** — `resolvePlanForPrompt` (`packages/lib/src/run-policy`)
   combines org entitlements, the brand's `enabledModels`, per-prompt
   `premiumModels`, and the deployment's `SCRAPE_TARGETS` env
   (`model:provider[:version][:online]`, parsed in
   `packages/config/src/scrape-targets.ts`) into concrete targets, each with a
   cadence.
3. **Due selection + guards** — `getLastRunsByTargetKey` (last success per
   target from `prompt_runs`) → `selectDueTargets` filters to what's actually
   due; `isOrgOverDailyCeiling` (counts `usage_events` in the last 24h) is the
   runaway-spend guard.
4. **Fan-out** — for each due target × replication, call
   `getProvider(provider).run(model, prompt, { webSearch, version })`. All calls
   are gathered with `Promise.allSettled` — **one provider failure does not kill
   the run**. In the Rigosis demo one prompt fanned out to **7 engines**
   (ChatGPT, Google AI Overviews, Google AI Mode, Gemini, Perplexity via
   DataForSEO; Claude + GPT direct), at 5 runs each ≈ 35 evaluations/prompt.
5. **Provider returns** `ScrapeResult { textContent, rawOutput, webQueries,
   citations, modelVersion }` (`packages/lib/src/providers/types.ts`).
6. **Extract mentions** — `analyzeMentions(textContent, brand, competitors)`
   (see §4.3).
7. **Store** three writes:
   - `savePromptRun` → `prompt_runs` (raw output, `web_queries[]`,
     `brand_mentioned`, `competitors_mentioned[]`, model/provider/version/webSearch)
   - `saveCitations` → `citations` (one row per source: url, domain, title, index)
   - `recordUsageEvent` → `usage_events` (one per provider call, success or fail,
     with `estimatedCostUsd` from `estimateRunCostUsd`) — billing-grade
8. **Reschedule** — `scheduleNextRun` at `plan.rescheduleHours`, or a backoff if
   the whole cycle failed (`packages/lib/src/run-backoff.ts`). Results refresh
   every 24 h by default.

### 3.3 Which external endpoint each engine hits

The **Provider Registry** (`packages/lib/src/providers/index.ts`,
`getProvider`) dispatches by provider. Two access modes: `scraped` (drives the
real consumer surface users see) and `api` (direct model call). Credentials for
every provider come through `getCredential(name)`
(`packages/lib/src/secrets/store.ts:21`) = **encrypted `secrets` table override
⇒ falls back to `process.env`**.

**DataForSEO** (`providers/registry/dataforseo.ts`) — base
`https://api.dataforseo.com`, HTTP Basic (`DATAFORSEO_LOGIN` /
`DATAFORSEO_PASSWORD`), via the `dataforseo-client` SDK. Location/language from
`DATAFORSEO_LOCATION_CODE` (Rigosis demo = **2792, Turkey**) /
`DATAFORSEO_LANGUAGE_CODE`. Four surfaces on one credential:

| Target model | DataForSEO endpoint | Notable body fields |
|---|---|---|
| `google-ai-mode` | `/v3/serp/google/ai_mode/live/advanced` | `keyword, location_code, language_code, depth:10` |
| `google-ai-overview` | `/v3/serp/google/organic/live/advanced` | `…, load_async_ai_overview:true` (AIO is an `ai_overview` item) |
| `chatgpt`, `gemini` (default) | LLM Scraper: `chatGptLlmScraperLiveAdvanced` / `geminiLlmScraperLiveAdvanced` | `keyword, location_code, language_code, force_web_search:true` |
| `chatgpt`/`perplexity`/`gemini` (version pinned; perplexity always) | LLM Responses: `chatGptLlmResponsesLive` / `perplexityLlmResponsesLive` / `geminiLlmResponsesLive` | `user_prompt, model_name, web_search` (defaults gpt-5.5 / sonar / gemini-2.5-flash) |

It also does a live `GET` (redirect: manual) to resolve Gemini's
`vertexaisearch.cloud.google.com/grounding-api-redirect/…` citation links to
real URLs.

**Direct model APIs:**

| Provider | Endpoint | Web search |
|---|---|---|
| OpenAI (`openai-api.ts`) | Responses API `POST /v1/responses` | `openai.tools.webSearch` |
| Anthropic (`anthropic-api.ts`) | Messages API `POST /v1/messages` | tool `web_search_20250305` |
| Mistral (`mistral-api.ts`) | `POST /v1/conversations` (search) or `/v1/chat/completions` | `tools:[{type:"web_search"}]` |
| OpenRouter (`openrouter.ts`) | `POST https://openrouter.ai/api/v1/chat/completions` | `plugins:[{id:"web"}]` / `:online` slug |

**Alternative scraping vendors** (interchangeable with DataForSEO for the
scraped surfaces, selected via `SCRAPE_TARGETS`):

| Vendor | Base | Pattern |
|---|---|---|
| Olostep (`olostep.ts`) | Olostep SDK batch API | per-model parser + real UI URL (chatgpt.com, gemini.google.com, perplexity.ai, copilot, google aimode/AIO) |
| Bright Data (`brightdata.ts`) | `api.brightdata.com/datasets/v3/trigger` + `/progress/{id}`; SERP via `/request` | hardcoded dataset IDs; AIO via `google.com/search?…&brd_ai_overview=2` |
| Oxylabs (`oxylabs.ts`) | `data.oxylabs.io/v1/queries` (Basic auth) | async submit/poll/results; sources `chatgpt`, `perplexity`, `google_ai_mode`, `google_search` |
| Cloro (`cloro.ts`) | `api.cloro.dev/v1/async/task` | async task per surface (`CHATGPT`, `PERPLEXITY`, `GEMINI`, `AIMODE`, `GOOGLE`…) |

---

## 4. Reading the results

The dashboard reads through **server functions** (`createServerFn` in
`apps/web/src/server/*.ts`) called by React-Query hooks — **not** the public REST
API. Each guards with `requireBrandSession`.

### 4.1 The pages and their server functions

| Page | Server function (file) | Produces |
|---|---|---|
| Overview | `getDashboardSummaryFn` (`dashboard.ts:45`) | AI Visibility %, run counts, visibility & citation time series |
| Visibility | `getFilteredVisibilityFn` (`visibility.ts:122`), `getBatchChartDataFn` (`:45`) | per-prompt / per-model visibility |
| Share of Voice | `getShareOfVoiceFn` (`analysis.ts:39`) | brand's slice of all brand mentions, over time |
| Query Fan-Out | `getQueryFanoutFn` (`query-fanout.ts:46`) | the exact search phrasings engines used internally (`prompt_runs.web_queries`) |
| Citations | `getCitationsFn` (`citations.ts:336`) | which domains/pages engines relied on |
| Opportunities | `getOpportunitiesFn` (`opportunities-fn.ts:11`) | LLM-generated prioritized action list (cached in `brand_opportunities`, refreshed after N days) |
| Prompts (settings) | `getPromptsSummaryFn`, `getPromptStatsFn`, `updatePromptsFn` (`prompts.ts`) | manage/tag/disable prompts |
| Competitors (settings) | `getCompetitors`, `updateCompetitors`, `discoverCompetitors` (`brands.ts`, `competitor-discovery.ts:23`) | manage + discover-from-answers |
| LLMs (settings) | `getModelPickerStateFn`, `updateEnabledModelsFn` (`platform-picks.ts`) | which engines to track |
| API keys / Billing / Team / MCP / Admin | `api-keys.ts`, `billing.ts`, `team.ts`, `mcp.ts`, `admin.ts` | account management |

### 4.2 The two headline metrics (Rigosis first run)

- **AI Visibility** = how often AI answers mention the brand. Rigosis: **73%**
  from **170 evaluations** (`docs/how-to/HOW-TO.md`; `ARCHITECTURE.md` records
  124 of 170 runs → 73%).
- **Share of Voice** = the brand's slice of all brand mentions. Rigosis: **100%**
  — an artifact of having **zero competitors configured** at first (a field of
  one). It only becomes meaningful once competitors are added.

Per-prompt, the story that justifies the product:

| Prompt | Visibility | Meaning |
|---|---|---|
| brand prompts (`rigosis …`) | 91–100% | AI knows Rigosis when asked by name |
| `rigosis alternative` | 91% | AI answers comparison questions — naming *someone* as the alternative |
| `opentext smax implementation partners turkey` | 65% | highest commercial intent, Rigosis missing from ⅓ of answers |
| `best it service management consultants in turkey` | **no brands found** | nobody owns this answer yet — the AEO opportunity |

Citations collected in that run: **1,221**.

### 4.3 Mention detection (`packages/lib/src/mentions.ts`)

Deliberately blunt — **case-insensitive substring matching** over each subject's
names, aliases, and bare domains, because engines write prose, not markup:

```ts
export function analyzeMentions(content, brand, competitors) {
  const contentLower = content.toLowerCase();
  return {
    brandMentioned: mentionsSubject(contentLower, brand),
    competitorsMentioned: competitors
      .filter((c) => mentionsSubject(contentLower, c))
      .map((c) => c.name),
  };
}
```

`mentionsSubject` returns true if any name/alias (lowercased) is a substring of
the answer, or any `normalizeDomain(domain)` (protocol/`www.` stripped) is. This
is why the analysis schema insists `brandName` "must be searchable" and why
redundant aliases (containing the canonical name) are pruned — they'd match
anyway.

---

## 5. Acting on the results — the loop

The first run isn't a report card, it's a work list. Two product features close
the loop:

- **Discover competitors from answers**
  (`packages/lib/src/competitor-discovery.ts`, server fn
  `competitor-discovery.ts:23`). Onboarding often returns *no* competitors (the
  schema tells the model to stay empty when uncertain), so this mines up to 40
  stored answers (each truncated to 1,200 chars) with a **web-search-off**
  structured completion, returning up to 15 candidates each with an evidence
  quote. It folds diacritics (handles Turkish dotted `İ`) to dedupe against
  existing competitors. On the Rigosis dataset it surfaced **15 candidates** —
  including Kafein (9 runs) and Konsalt (28 runs), which a manual read had
  missed, plus Basistek, NTT DATA Turkey, Duosis. Five were configured
  (Kafein, Konsalt, İnnova, KoçSistem, Netaş).
- **Opportunities** (`getOpportunitiesFn`) — a single structured LLM completion
  over a deterministic digest of the results, persisted and refreshed, that
  keeps a prioritized version of that work list automatically.

Then: act → daily runs re-measure → watch the per-prompt trend lines move.

---

## 6. The public REST API (external integrations)

Separate from the dashboard's server functions. Base `/api/v1`, **Bearer token**
auth (`apps/web/src/lib/auth/api-auth.ts`): either an **instance admin key**
(`ADMIN_API_KEYS` env, unrestricted) or an **organization key**
(`answerecho_…`, verified by better-auth, scoped `read`/`write`, org/brand
restricted, rate-limited via `X-RateLimit-*`). OpenAPI 3.1.1 spec in
`packages/api-spec/src/openapi.json`; docs UI at `/api/v1/docs`.

Highlights (24 documented paths):

| Method | Path | Scope |
|---|---|---|
| GET | `/me`, `/models`, `/organizations[/{id}]` | any key |
| GET/POST | `/brands`, `/competitors`, `/prompts` | read / write |
| GET/PATCH | `/brands/{id}`, `/competitors/{id}`, `/prompts/{id}` | read / write (prompt DELETE admin-only) |
| GET | `/brands/{id}/analytics` | read (visibility + SoV + per-model + citations in one) |
| GET | `/brands/{id}/{opportunities,query-fanout,prompt-performance,tags}` | read |
| GET | `/brands/{id}/citations/{domains,urls}` | read (window vs prior window) |
| GET | `/prompts/{id}/runs[/{runId}]`, `/prompts/{id}/snapshot` | read |
| POST/GET | `/reports`, `/reports/{id}` | admin-only |
| POST | `/tools/analyze` | admin-only (runs `analyzeBrand` without persisting) |

Other routes: `/api/auth/*` (better-auth catch-all), `/api/mcp` (JSON-RPC MCP
transport, OAuth bearer, tools in `apps/web/src/lib/mcp/tools/*`),
`/.well-known/oauth-*` (MCP OAuth discovery), `/api/setup-status` (health),
`/api/og`, `/api/manifest`, `/api/plausible/*` (proxies plausible.io).

---

## 7. Deployment modes & cost

**Modes** (`packages/deployment/src/deployment.ts`, `FEATURES_BY_MODE`):

| Mode | Signup | Billing | Reports | Notes |
|---|---|---|---|---|
| `local` | one owner | off | on | self-hosted; `READ_ONLY=true` degrades to `demo` |
| `demo` | — | off | — | read-only showcase (the Rigosis demo) |
| `whitelabel` | — | off | — | partner-embedded; Auth0 membership sync every 15 min |
| `cloud` | self-serve | Stripe | **off** | the SaaS; team invites, org creation |

Feature flags gate both worker queue creation and web UI. Branding is env-built
and Node-safe so the worker can build a `Deployment` without React.

**Cost, measured from the Rigosis run** (5 prompts, one daily cycle, 175
evaluations across 7 engines):

| Item | Cost |
|---|---|
| DataForSEO (125 scrape calls) | $0.58 actual |
| Claude via Anthropic (25 runs) | ~$0.50 (estimate) |
| GPT via OpenAI (25 runs) | ~$0.25 (estimate) |
| One-off brand analysis | a few cents |
| **Total per daily cycle** | **≈ $1.40** |

Rule of thumb: **≈ $0.28/prompt/day** with all 7 engines → ≈ $8.50/prompt/month
at daily cadence; scales linearly with prompts × engines. `usage_events` records
every call for exact attribution.

---

## 8. End-to-end, in one breath

```
rigosis.com
  → createBrandFn                              (brands row)
  → analyze-brand job → analyzeBrand()         (Jina/Readability + gpt-5-mini + web search)
      → 20 candidate prompts + competitors     (structured JSON)
  → wizard: keep 5 → saveWizardOnboarding      (prompts rows, systemTags branded/unbranded)
      → createMultiplePromptJobSchedulers      (one self-rescheduling job per prompt)

  per prompt, daily:
    schedule-maintenance / self-reschedule → process-prompt
      → resolvePlanForPrompt → selectDueTargets → daily-ceiling guard
      → fan out to 7 engines (DataForSEO scrape + Anthropic/OpenAI direct)  [Promise.allSettled]
      → analyzeMentions() (substring match brand + competitors in answer text)
      → prompt_runs + citations + usage_events
      → scheduleNextRun (+24h)

  dashboard server fns read prompt_runs/citations:
    visibility 73% · share-of-voice 100% (until competitors added) · 1,221 citations
  → discover competitors from stored answers → configure 5 → next run gives honest SoV
  → opportunities keeps the work list refreshed
```

---

### Caveats for maintainers

- Model IDs `gpt-5-mini` / `claude-sonnet-5` / `gpt-5.5` in the provider code
  read as forward-dated — confirm against the running deployment.
- The **84/70** candidate/selection numbers and `selectOptimalPrompts()` are the
  **report-generation** path (`report-worker.ts`), not the onboarding wizard
  (30 candidates, human selection).
- No seed inserts a Rigosis brand; the numbers here are from the captured demo
  (`docs/how-to/HOW-TO.md`), not a reproducible fixture.
