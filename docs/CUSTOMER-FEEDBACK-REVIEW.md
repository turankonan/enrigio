# Customer feedback review — capabilities, gaps, and next steps

Review of five customer comments against the actual AnswerEcho codebase, with a
verified assessment of an earlier ChatGPT analysis. Every claim below was
checked against source (file references included) rather than taken on faith.

**Bottom line:** the ChatGPT analysis is accurate and well-reasoned — every
load-bearing claim checks out — but it misses one important subtlety about what
"country" means here, and it presents demo-specific numbers as product
constants. The only genuine build item is per-evaluation country comparison,
and it is smaller than it looks because it only applies to the scraper-backed
half of the engines.

## The five customer comments

1. It should outline the steps required to achieve higher visibility in LLM outputs.
2. Does it generate a consolidated result by testing across different locations, countries, and LLMs?
3. Is there a model available — such as paid advertising — to boost visibility within LLMs?
4. Results from different LLMs could also be reported separately.
5. Mechanisms are needed to input the client's question sets; e.g. how is the total visibility rate calculated for a set of 15 questions?

## Verification against the code

| Claim | Verdict | Evidence |
|---|---|---|
| Visibility is evaluation-weighted `mentions / total` | Confirmed | `apps/web/src/lib/postgres-read.ts:194` — `count(*) FILTER (WHERE brand_mentioned) * 100 / count(*)` |
| Opportunities span creation / existing-content / outreach / social | Confirmed | `apps/web/src/components/opportunities-report.tsx` — exactly those 4 categories |
| Per-model breakdown & filters exist | Confirmed | `apps/web/src/server/visibility.ts` — `model` filter param throughout |
| No paid-placement mechanism | Confirmed | nothing in the codebase sells or guarantees LLM placement |
| Branded vs non-branded reported | Confirmed | `non_branded_visibility` computed; `system_tags` auto-classifies |
| Country is deployment-wide, not per-evaluation | Confirmed | `prompt_runs` schema has no location/country/language column |
| BrightData AI Overview hardcodes US/English | Confirmed | `packages/lib/src/providers/registry/brightdata.ts:47` — `&gl=us&hl=en` |
| Question sets: bulk/individual/tag/enable, ~100 limit | Mostly | UI cap is `MAX_PROMPTS`=100 (local); cloud plans cap at 50/50/150/350, so "100" is the local number, not universal |

## Comment-by-comment assessment

| Comment | Current state | Response |
|---|---|---|
| 1 — Steps to improve visibility | Opportunities already generates prioritized recommendations across content creation, existing content, outreach, and social, linked to questions and citation evidence. | Capability exists; present it more explicitly as an actionable plan (priority, expected impact, status, owner, progress). |
| 2 — Consolidated across locations/countries/LLMs | Consolidated across configured LLMs, filterable/separable. Geography is deployment-wide (`DATAFORSEO_LOCATION_CODE`), not a reportable per-evaluation dimension. | Multi-LLM: supported. Multi-country: **not** a comparative feature yet; requires development. See gap below. |
| 3 — Paid advertising to boost LLM visibility | No such mechanism exists. | Position as an organic measurement/optimization platform. Cannot sell or guarantee placement inside LLM answers. If platforms expose formal ad inventory later, report sponsored visibility separately from organic. |
| 4 — Report different LLM results separately | Per-model breakdowns and model filters already exist. | Supported. Make the side-by-side comparison more prominent in UI and customer decks. |
| 5 — Client question sets & 15-question rate | Questions entered individually or bulk-pasted, tagged, enabled/disabled. UI limit 100. | Supported; expose the scoring methodology clearly (see formula + coverage below). |

## How the visibility rate is calculated

Headline formula (evaluation-weighted):

```
AI Visibility = completed evaluations mentioning the brand
                / total completed evaluations  × 100
```

Worked example **with the demo's configuration** (15 questions × 7 targets ×
5 runs = 525 evaluations; brand appears in 210):

```
210 / 525 = 40%
```

The system can then show: overall 40%, per-question, per-LLM, branded vs
non-branded, share of voice vs competitors, citation sources, and recommended
actions.

**Caveat — these are demo numbers, not product constants.** The "7" is the demo
`SCRAPE_TARGETS` (7 targets); the "5" is the local-mode runs-per-target default.
Cloud plans use `standardRunsPerDay` of 1–4 and vary platform counts. Present
the example as "with your configured platforms and cadence," not "the system
runs 525."

**Recommended clarity fix (quick win):** the headline is evaluation-weighted, so
questions/LLMs with more completed runs carry more weight. Expose both
denominators:
- **Question coverage** — "Mentioned in 9 of 15 questions"
- **Evaluation visibility** — "Mentioned in 210 of 525 answers — 40%"

Per-prompt visibility already exists in the code, so coverage is a trivial
aggregation — a few lines, not a feature.

## Main product gap: country comparison

`prompt_runs` stores no country/location/language per evaluation; the DataForSEO
location is a single deployment-wide env (`DATAFORSEO_LOCATION_CODE`, set to
Turkey/2792 on the demo), and BrightData's Google AI Overview path is hardcoded
to US/English. So the system cannot today produce Turkey-vs-Germany-vs-UK
comparisons or one consolidated cross-country score.

**Important subtlety the ChatGPT analysis missed:** "country" is only coherent
for the **scraped** engines (DataForSEO / BrightData surfaces run through a
geolocated search). The **direct-API targets — Claude via Anthropic, GPT via
OpenAI — have no location concept at all**; they answer from model weights, not
a country-specific index. A multi-country comparison is therefore meaningful for
the scraped surfaces and meaningless for the direct-API ones. The feature is a
scraper-only dimension, and those engines must be labeled "not localizable"
rather than silently treated as localized.

### Proper implementation (scoped)

1. Country + language selection per brand or per question set.
2. Country/language columns on every `prompt_runs` evaluation.
3. Provider capability validation — mark direct-API engines "not localizable."
4. Country filters and side-by-side comparison in the UI.
5. Transparent consolidated formula across question × LLM × country, using an
   **equal-weighted** average across combinations so a country/provider with
   more successful runs doesn't dominate.
6. Clear "unsupported" labels instead of treating every engine as localized.

Partial building block already in place: location is configurable
deployment-wide as of the `DATAFORSEO_LOCATION_CODE` env. What's missing is
per-evaluation storage and in-report comparison.

## Recommended next steps (priority order)

1. **Question-coverage metric** (quick win) — "visible in N of M questions"
   next to the evaluation-weighted %. Answers comment #5's transparency ask.
   Small aggregation on existing per-prompt data.
2. **Opportunities as an improvement plan** (comment #1) — data and 4 categories
   exist; add priority / expected impact / status / owner / progress. UI + schema.
3. **Per-evaluation country comparison** (comment #2) — the one real build item;
   scraper-only, with explicit "not localizable" labels for direct-API engines.
4. **Presentation** (comment #4) — make per-LLM side-by-side comparison more
   prominent; nothing new to build.
5. **Paid placement** (comment #3) — none exists and none should be promised;
   only report sponsored inventory separately *if* a platform ever exposes it.

## Draft customer response

> AnswerEcho lets you enter customer-specific question sets individually or in
> bulk and evaluates them repeatedly across the configured AI platforms. It
> produces both a consolidated AI Visibility score and separate results per
> question and per LLM.
>
> For example, with your configured platforms and cadence — 15 questions,
> 7 platforms, 5 evaluations each — the system runs 525 evaluations. If the
> brand appears in 210 responses, overall visibility is 40%. We also report by
> question, by LLM, and as coverage — e.g. "visible in 9 of 15 questions."
>
> AnswerEcho analyzes citations and competing brands and turns the findings into
> prioritized recommendations spanning content creation, existing-content
> improvement, third-party outreach, and relevant community channels.
>
> Country-specific testing is currently configured at the deployment level
> rather than compared within a single report, and it applies to the
> search-scraped engines (ChatGPT scrape, Google AI Overviews/Mode, Gemini,
> Perplexity); the direct model APIs answer without a country context.
> Consolidated and separate multi-country results would be an enhancement.
>
> AnswerEcho measures and improves organic visibility. It does not provide paid
> placement inside LLM answers or guarantee inclusion. If AI platforms expose
> formal advertising inventory, sponsored visibility would be measured
> separately from organic.

## Evidence

- Usage guide: `docs/how-to/HOW-TO.md`
- Architecture & calculations: `docs/ARCHITECTURE.md`
- Visibility calculation: `apps/web/src/lib/postgres-read.ts`, `packages/lib/src/report-metrics.ts`
- Question-set editor: `apps/web/src/components/prompts-list-editor.tsx`
- Per-model filtering: `apps/web/src/server/visibility.ts`
- Opportunity categories: `apps/web/src/components/opportunities-report.tsx`
- Location configuration: `packages/lib/src/providers/registry/dataforseo-shared.ts`, `packages/lib/src/providers/registry/brightdata.ts`
