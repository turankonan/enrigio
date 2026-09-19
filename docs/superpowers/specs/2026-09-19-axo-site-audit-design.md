# AXO — Website AI-Readiness Audit (Phase 1) — Design

> Status: approved design, pending implementation plan.
> Part of the AnswerEcho ↔ Maya gap-closing effort. Phase 0 (sentiment, in-answer
> rank, coverage, opportunities-as-plan) is shipped. This is Phase 1 — the one
> whole Maya pillar AnswerEcho does not yet have.

## Goal

For a brand, audit **its own pages that AI answer engines already cite**, score each
page for AI-readiness, and turn the findings into **prioritized recommendations in a
new `axo` category inside the existing Opportunities report**. The audit is
staleness-gated and cached, like the Opportunities report itself.

Non-goal: a new dashboard page, a headline "AXO score", a whole-site crawl, or
JS-rendered/headless crawling. These are explicitly out of scope for the MVP (see
below).

## Resolved decisions

| Decision | Choice | Why |
|---|---|---|
| Which pages to audit | **Cited-pages-first** — the brand's own pages already present in `citations` | Highest signal (pages already influencing AI answers), bounded/cheap, reuses existing data, feeds the "existing-content" story directly. |
| Trigger & freshness | **Staleness-gated + cached**, mirroring `resolveOpportunities` | No new scheduler, bounded cost, consistent with the codebase's proven pattern. |
| Result placement | **Advisory** — a new `axo` category in the Opportunities report | Minimal UI surface, ships actionable value fast, avoids a site-wide score that can mislead. |
| Findings → recommendations | **LLM-integrated**: audit findings feed the Opportunities generation prompt, which emits `axo`-category opportunities | Reuses the Phase 0 priority/expected-impact/sorting machinery and renders with zero new UI. Alternative (deterministic mapping of each checklist failure to a fixed item) rejected — rigid wording, needs its own rendering. |

## Architecture & flow

```
selectAuditPages(brandId)            // top-N cited own-domain URLs
  → for each domain: fetchRobots()   // robots.txt / llms.txt / sitemap presence
  → for each page:   fetchPageRaw()  // raw HTML
                     checklistForPage(html, robots)   // pure, deterministic
                     scorePageRelevance(text, brand)  // one webSearch:false completion
  → assemble SiteAuditReport → store in site_audits (append-only)

resolveSiteAudit(brandId)            // staleness-gated: serve cached-if-fresh, else run+store

resolveOpportunities(brandId)        // (existing) now also reads latest site audit,
                                     // includes its findings in the digest, and the
                                     // generation LLM emits axo-category opportunities
```

Two independent staleness-gated resolves. Opportunities depends on the audit's stored
output; it does not run the audit inline.

## Data model

New table `site_audits` (append-only; mirrors `brand_opportunities`):

```
site_audits
  id          uuid pk default random
  brand_id    text  → brands.id   (indexed with created_at)
  report      json  not null
  model       text                (the LLM id that scored relevance)
  created_at  timestamptz default now()
```

`report` shape (`SiteAuditReport`):

```ts
interface SiteAuditReport {
  domains: {
    domain: string;
    robotsAiBots: { GPTBot: BotPosture; ClaudeBot: BotPosture; PerplexityBot: BotPosture; GoogleExtended: BotPosture };
    llmsTxt: boolean;      // llms.txt present
    sitemap: boolean;      // sitemap.xml present
  }[];
  pages: {
    url: string;
    title: string | null;
    hasSchema: boolean;        // JSON-LD / schema.org present
    hasMetaDescription: boolean;
    headingStructure: "ok" | "no-h1" | "weak";
    relevanceScore: number;    // 1–5, how directly the page answers a buyer question
    note: string;              // one-line LLM rationale
  }[];
}
type BotPosture = "allowed" | "blocked" | "unspecified";
```

One generated migration (`drizzle-kit generate`), committed, **not run** (the user runs
`migrate`). `PromptRun`-style types flow from the schema.

## Components (`packages/lib/src/axo/`)

Each unit has one purpose, a clear interface, and is testable in isolation.

1. **`selectAuditPages(brandId, limit = 10): Promise<CitedPage[]>`**
   Distinct cited URLs whose domain is one of the brand's own domains
   (`brand.website` + `additionalDomains`), over a recent window, ranked by citation
   frequency, capped at `limit`. Reuses the brand-domain matching used by
   `resolveOpportunities`. Pure query → unit-testable against a seeded set or the SQL builder.

2. **`fetchRobots(domain): Promise<RobotsInfo>`** and **`fetchPageRaw(url): Promise<string>`**
   `fetchRobots` gets `robots.txt`, checks `llms.txt` and `sitemap.xml` presence.
   `fetchPageRaw` returns raw HTML (needed for structural checks — `getWebsiteExcerpt`
   returns extracted *text* only). Reuses the existing fetch user-agent. Network unit;
   failures are non-fatal (a page that won't fetch is recorded as unavailable, never
   throws the audit).

3. **`checklistForPage(html, robots): PageChecklist`** — **pure, no LLM, no network.**
   Parses AI-bot posture (from `robots`), JSON-LD/schema.org presence, `<title>` + meta
   description, heading hierarchy. **This is the highest-value unit test target.**

4. **`scorePageRelevance(input): Promise<{ score: number; note: string } | null>`**
   One `runStructuredCompletionPrompt({ webSearch: false })` per page — the exact pattern
   from Phase 0's `mention-classify.ts`. Returns `null` on failure (a failed score never
   fails the audit). Zod schema bounds `score` to 1–5.

5. **`resolveSiteAudit(brandId, timezone?): Promise<SiteAuditResponse>`**
   Staleness-gated orchestrator mirroring `resolveOpportunities`: if the latest
   `site_audits` row is fresher than `AUDIT_REFRESH_AFTER_DAYS`, serve it; otherwise
   select pages → fetch → checklist → score → assemble → insert → serve. If generation
   fails and a prior audit exists, serve the prior one.

Add `"./axo"` to `packages/lib` `package.json` exports (the exports map is explicit — a
missing entry won't resolve, same gotcha hit in Phase 0).

## Integration into Opportunities

- Add `"axo"` to the `CATEGORIES` const in `apps/web/src/server/opportunities.ts` and a
  category label + description (en + tr locales) and to the report renderer's
  `CATEGORY_META`.
- In the opportunities generation path (`buildDigest`), call `resolveSiteAudit(brandId)`
  and append a compact, human-readable summary of the audit findings to the digest text
  handed to the generation LLM. Extend `GUIDANCE`/`TASK` so the model knows it may emit
  `axo`-category opportunities describing concrete AI-readiness fixes (e.g. "GPTBot is
  blocked in robots.txt", "the cited pricing page has no schema.org markup").
- Because those opportunities are ordinary `OpportunitySchema` items, they inherit the
  Phase 0 `priority` + `expectedImpact` fields and render through the **existing Task 6
  UI with no new components**.

## Cost & limits

- Bounded by **top-10 pages × one `webSearch:false` completion** per audit, and the audit
  is **staleness-gated** (`AUDIT_REFRESH_AFTER_DAYS`), so a normal page load triggers no
  LLM calls.
- All LLM calls use the completion path (no web search), matching Phase 0's cost discipline.
- Robots/llms/sitemap are fetched **once per domain**, not per page.

## Testing

- **`checklistForPage`** — real unit tests over fixture HTML + robots strings (schema
  present/absent, each bot posture, missing h1, missing meta). This is pure logic and the
  core correctness surface.
- **`selectAuditPages`** — assert own-domain filtering, dedup, frequency ranking, and the
  cap (seeded rows if a DB harness exists; otherwise assert on the SQL builder, consistent
  with the existing read-layer test convention).
- **`scorePageRelevance`** — stub `runStructuredCompletionPrompt` (as
  `mention-classify.test.ts` does): returns the model's score; returns `null` on failure.
- **`resolveSiteAudit`** — freshness gate: serves cached when fresh, regenerates when
  stale, falls back to prior on generation failure.

## Explicitly out of scope (MVP)

- JS-rendered / headless-browser crawling (SPA content).
- Whole-site crawl or sitemap-driven page discovery (cited-pages-first only).
- A headline "AXO score" on the overview.
- Per-opportunity status/owner/progress workflow (its own deferred follow-up).
- Auto-fixing or writing to the customer's site — findings are advisory only.

## Open items for the implementation plan

- Exact value of `AUDIT_REFRESH_AFTER_DAYS` (propose 7).
- The digest summary format fed to the opportunities LLM (kept compact to bound tokens).
- Whether `selectAuditPages` needs a DB test harness or asserts on the SQL builder
  (match whatever the read-layer tests do at implementation time).
