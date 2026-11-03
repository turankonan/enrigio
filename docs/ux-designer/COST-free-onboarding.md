# Free onboarding scenario — real cost model

Date: 2026-11-03 · Source data: production Neon `answerecho-elmo` (`prompt_runs`, `usage_events`), Render `enrigio` logs, provider list prices fetched the same day. Companion to `PROPOSAL-web-app-board.md` (decisions D1, D3, D4).

## 1. What the free scenario spends money on

Per the proposal's D1: 12 buyer questions (min 10, max 16) + 3 brand questions, each run once on 4 engines
(ChatGPT, Gemini, Google AI Overview, Perplexity) = **60 evaluations**, plus one mention/accuracy classifier call per
answer that mentions the brand, plus one brand-analysis call in wizard step 1. The rival pre-scan (step 3) reuses the
first scan's answers and costs nothing extra.

## 2. Unit prices (list, 2026-11-03)

| Call | Provider / route in code | Price | Source |
|---|---|---|---|
| ChatGPT answer, grounded | OpenAI Responses API, `gpt-5-mini`, web search context `low` | $0.25 / M input, $2.00 / M output, $0.025 / M cached; **$10 per 1,000 web-search calls**, search content billed at input rate | [OpenAI pricing](https://developers.openai.com/api/docs/pricing) |
| ChatGPT or Gemini answer, consumer UI | DataForSEO LLM Scraper (default route for both) | **$0.004 / result live**, $0.0024 priority (≤5 min), $0.0012 standard (≤45 min) | [DataForSEO LLM Scraper](https://dataforseo.com/pricing/ai-optimization/llm-scraper) |
| Perplexity answer (no scraper exists) | DataForSEO LLM Responses, `sonar` | $0.0006 / task live + the LLM's own charge (standard: $0.0002 + $0.01 prepaid, unused refunded) | [DataForSEO LLM Responses](https://dataforseo.com/pricing/ai-optimization/llm-responses) |
| Google AI Mode | DataForSEO AI Mode SERP live | $0.004 / results page ($0.0012 standard) | [DataForSEO AI Mode SERP](https://dataforseo.com/pricing/serp/google-ai-mode-serp-api) |
| Google AI Overview | DataForSEO Google Organic SERP live (AI Overview is parsed from the organic page) | ≈ $0.002 / SERP live (third-party quote; DataForSEO's own page lists "from $0.0006") | [DataForSEO SERP](https://dataforseo.com/pricing/serp) |
| Claude answer, grounded (Pro engine) | Anthropic API, Claude Sonnet 5 + web search | $2 / M input, $10 / M output, **$10 per 1,000 searches** | [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) |
| Mention + accuracy classifier | OpenAI `gpt-5-mini`, no web search | token prices as above | same |
| Brand analysis (wizard step 1) | OpenAI `gpt-5-mini`, web search context `medium` | token prices + $0.01 per search call | same |

Perplexity `sonar`'s own charge was **not** verified in this session; the planning figure below uses ≈ $0.006 per
request (its published per-request fee plus ~1k tokens). Confirm before relying on it.

## 3. Measured sizes from production

| Measurement | Value | Where from |
|---|---|---|
| ChatGPT (gpt-5-mini) answer length | 1,988 chars ≈ 500 output tokens; prompt 35 chars | 1,221 runs, last 30 days |
| Claude Sonnet 5 grounded run | 12,417 input + 1,294 output tokens | 87 runs, last 30 days (`raw_output.usage`) |
| Answer fed to the classifier | ≈ 3.2 KB ≈ 800 input tokens | 95 runs today |
| Accuracy claims returned per branded answer | 10 claims, ≈ 1.4 KB ≈ 350 output tokens; 0 of 20 contradicted, all "unsupported" | 20 assessed runs today |
| Mention rate (ChatGPT, buyer prompts) | 72 of 95 answers (76 %) | today |
| Runs per prompt per day in production | 5 per engine (`runIndex` 1–5) | today's logs |

OpenAI runs store no `usage` block (the provider extractor keeps only `output`), so ChatGPT input and reasoning
tokens are estimated, not measured. Whether the model actually invoked web search on each run is also not recorded.

## 4. Cost per call (planning figures)

| Call | Calculation | Cost |
|---|---|---|
| ChatGPT via OpenAI, grounded | $0.010 search + ≈3k search-content tokens $0.0008 + 500 output $0.001 + ≈1k reasoning $0.002 | **≈ $0.012** (≈ $0.003 if the model skips the search) |
| ChatGPT or Gemini via DataForSEO scraper, live | flat | **$0.004** |
| Perplexity via DataForSEO LLM Responses, live | $0.0006 + ≈ $0.006 | **≈ $0.007** |
| Google AI Overview via organic SERP, live | flat | **≈ $0.002** |
| Google AI Mode, live | flat | **$0.004** |
| Claude Sonnet 5 grounded (Pro) | 12.7k × $2/M + 1.2k × $10/M + $0.01 (measured again 2026-11-03 12:45 after the key fix) | **≈ $0.047** |
| Classifier on Claude Haiku 5.5 (production since 12:42) | ≈1k input $0.0001 + ≈100–200 output $0.0001 | **≈ $0.0002**; returns 1–4 claims per branded answer instead of gpt-5-mini's 10, and found the first real contradiction |
| Classifier, unbranded answer | ≈1k input $0.00025 + ≈50 output $0.0001 | **≈ $0.0004** |
| Classifier, branded answer (claims) | ≈1k input + ≈350 output + reasoning | **≈ $0.0015** |
| Brand analysis | 1–3 searches + ≈10k input + ≈3k output | **≈ $0.02–0.05** |

The flat $0.005 / $0.01 / $0.02 figures stamped into `usage_events.estimated_cost_usd` by `packages/lib/src/usage/cost.ts`
are placeholders and are also stamped on **failed** runs; do not read spend off that column.

## 5. The free starter report

60 evaluations with the production-style routing (ChatGPT via OpenAI, the rest via DataForSEO live):

| Item | Count × unit | Cost |
|---|---|---|
| ChatGPT | 15 × $0.012 | $0.18 |
| Gemini (scraper live) | 15 × $0.004 | $0.06 |
| Google AI Overview | 15 × $0.002 | $0.03 |
| Perplexity | 15 × $0.007 | $0.10 |
| Classifier | ≈34 unbranded mentions × $0.0004 + 12 branded × $0.0015 | $0.03 |
| Brand analysis | 1 | $0.03 |
| **Total per free report** | | **≈ $0.43** |

Variants:
- ChatGPT through the DataForSEO scraper instead of OpenAI: **≈ $0.31**.
- Everything on DataForSEO's standard queue ($0.0012 per result, up to 45 min): **≈ $0.21**, but that breaks the
  board's "about 3 minutes" promise on the first-scan screen.
- Adding Google AI Mode as a fifth engine: + $0.06.

So the free tier costs roughly **$0.30–0.45 per domain**, once, under the D4 one-report-per-domain rule. 1,000 free
reports ≈ $430.

## 6. Paid tracking (Growth as drawn: 15 questions × 4 engines, daily)

| Runs per engine per day | Evaluations / day | Cost / day | Cost / brand / month | 3 brands / month | Share of 199 $ |
|---|---|---|---|---|---|
| 1 (catalog Starter) | 60 | $0.40 | **$12** | $36 | 18 % |
| 4 (catalog Basic / Pro / Business) | 240 | $1.60 | **$48** | $144 | 72 % |
| 5 (production today) | 300 | $2.00 | $60 | $180 | 90 % |

Daily sampling depth is the single biggest cost lever. The board's "daily scan" at 1 run per engine per day is
cheap; the catalog's 4 runs per day is not viable at 199 $ for 3 sites. Decide the sampling rate in D3 together
with the price.

Premium Claude (Pro engine) adds ≈ $0.048 per prompt per day per the metered slot, ≈ $1.45 per prompt per month.

## 7. What production actually spent (successful calls only)

| Provider | Successful runs (all time) | Unit | Spend |
|---|---|---|---|
| OpenAI gpt-5-mini grounded | 1,371 | ≈ $0.012 | ≈ $16 |
| Anthropic Sonnet 5 grounded | 237 | ≈ $0.048 | ≈ $11 |
| DataForSEO (all endpoints) | 230 | ≈ $0.004 | ≈ $1 |

`usage_events` sums to $276 of *estimated* cost, almost all of it stamped on failed runs; the real spend is of the
order of $30.

## 8. Operational findings that change the numbers

Fixed on 2026-11-03 (after the first version of this note):
- New Anthropic key set on Render with `ONBOARDING_LLM_TARGET=claude:anthropic-api`; Claude runs and the Haiku
  classifier succeed in production. The $200 credit now carries brand analysis, the classifier and the backfill.
- The Anthropic provider re-ran every request whose single allowed search was exhausted (`max_uses_exceeded`), paying
  the search fee and ~12k tokens twice; 7 of the first 10 Claude runs did this. Removed in `7ac09642`.
- 10 pg-boss jobs had sat in state `active` since 2 Nov after the free-plan worker went to sleep mid-run; the
  maintenance job counts them as pending, so those prompts (all of Rigosis) never ran again. Reset by hand; the
  worker needs a stale-active sweep (pg-boss `expire_seconds` is 5400 s but nothing expires them while the service
  sleeps).


- **DataForSEO has returned "An unexpected server error occurred" on every call since 18 Sep 2026** (5,400+
  failures per endpoint in 30 days, zero successes). Until that is fixed, none of the DataForSEO prices above can be
  validated and Gemini / Perplexity / Google AI are not being tracked at all.
- **The Anthropic key has been invalid (401) since 12 Oct 2026.** Every Claude run fails.
- Production therefore runs **ChatGPT only, 5 times a day per prompt**, and 30 of every 35 scheduled runs fail.
- The accuracy classifier produced **10 "unsupported" claims per branded answer and zero "contradicted"** on today's
  20 assessed runs: with the phase-0 identity-only profile it cannot contradict much, and the output tokens it spends
  listing unsupported claims (~350 per answer) are the larger part of its cost. Worth capping the claims list.
- Today's `/admin/scores` page crashed in production (`Buffer is not defined`) because the client bundle pulled in
  the Drizzle schema; fixed in `1ca7ffe0`.
