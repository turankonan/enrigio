# AXO — Website AI-Readiness Audit (Phase 1) — Design (v2)

> Status: revised after external review; pending final approval before the implementation plan.
> Part of the AnswerEcho ↔ Maya gap-closing effort. Phase 0 (sentiment, in-answer
> rank, coverage, opportunities-as-plan) is shipped. This is Phase 1 — the one whole
> Maya pillar AnswerEcho does not yet have.
>
> **v2 changelog (from review):** execution moved to a background worker job (was
> inline); added a shared SSRF-safe fetch boundary; added an empty-audit fallback;
> made relevance scoring prompt-conditioned; made the report types represent failure
> states; tied the Opportunities cache to the audit; made robots evaluation per-URL;
> added HTML→clean-text + prompt-injection handling; expanded provenance and tests.

## Goal

For a brand, audit **its own pages that AI answer engines already cite**, score each page
for AI-readiness, and turn the findings into **prioritized recommendations in a new `axo`
category inside the existing Opportunities report**. The audit runs as a background job
and is cached; the web path only ever reads the latest completed audit.

Non-goal: a new dashboard page, a headline "AXO score", a whole-site crawl, or
JS-rendered/headless crawling.

## Resolved decisions

| Decision | Choice |
|---|---|
| Which pages | **Cited-pages-first**, with a bounded fallback (homepage → sitemap URLs) when the brand has no owned citations |
| Execution | **`audit-site` pg-boss worker job**; the web request checks freshness and *enqueues* (never crawls inline) |
| Freshness | **Staleness-gated + cached** — the gate decides whether to enqueue a job, preserving the "no manual button" intent |
| Result placement | **Advisory** — a new `axo` category in the Opportunities report (no headline score, no new page) |
| Findings → recommendations | **LLM-integrated** — audit findings feed the Opportunities prompt, which emits `axo`-category opportunities carrying the Phase 0 `priority` + `expectedImpact` fields (zero new UI) |

## Execution model (revised — critical)

The audit crawls up to ten pages and makes up to ten LLM calls. That must **not** happen
in an HTTP request (timeout risk, duplicate audits from concurrent loads). Instead:

1. **`audit-site` worker job** (pg-boss, registered in `apps/worker/src/handlers.ts`
   alongside `process-prompt`/`generate-report`). Payload: `{ brandId }`.
   Enqueued with `singletonKey: audit-${brandId}` so concurrent requests cannot start
   duplicate audits (same guard `process-prompt` uses).
2. **`resolveSiteAudit(brandId)`** (read path, used by the web/opportunities layer):
   returns the **latest completed** `site_audits` row and its status. If none exists or
   the latest is older than `AUDIT_REFRESH_AFTER_DAYS` (propose 7), it enqueues one
   `audit-site` job and returns the stale-or-empty result immediately (never blocks).
3. The worker performs selection → fetch → checklist → scoring → assembly → insert.
4. Opportunities generation consumes **only the latest completed audit** (see cache
   dependency below).

## SSRF-safe fetch boundary (new — critical)

Citation URLs are externally derived and untrusted. All AXO network access goes through a
**shared** `packages/lib/src/net/safe-fetch.ts` (not AXO-specific — the platform should
own this boundary):

- Scheme allowlist: `http:`/`https:` only.
- Host allowlist: must exactly match one of the brand's approved domains
  (`brand.website` + `additionalDomains`), re-checked **after every redirect**.
- DNS resolution with rejection of loopback, private, link-local, multicast, and
  cloud-metadata (`169.254.169.254`) addresses; re-resolved per redirect (DNS-rebinding
  guard).
- Limits: max redirects, max response bytes, request timeout.
- Content-type must be HTML for page fetches; text for robots/llms.
- Never forward credentials or cookies. Own dedicated User-Agent constant
  (`BROWSER_UA` in `website-excerpt.ts` is private and not reused).
- Bounded concurrency and a per-host rate limit.

`safe-fetch` returns a discriminated result (`ok` | `blocked` | `timeout` | `non-html` |
`failed`) rather than throwing for expected conditions.

## Page selection (revised)

**`selectAuditPages(brandId, limit = 10): Promise<AuditTarget[]>`** where
`AuditTarget = { url: string; relatedPrompts: string[] }`:

1. Distinct cited URLs whose host is one of the brand's own domains, over a recent window,
   ranked by citation frequency, each carrying the **tracked prompts responsible for the
   citation** (citations already join URL→prompt) — used to give the relevance score its
   question context.
2. **Fallback when step 1 is empty** (so brands most needing an audit still get one):
   the homepage first, then URLs declared in `sitemap.xml`, capped by the remaining
   allowance. Still a top-`limit` audit — not a whole-site crawl. Fallback targets carry
   the brand's enabled prompts as `relatedPrompts`.

## Data model (revised)

`site_audits` (append-only; mirrors `brand_opportunities`):

```
site_audits
  id           uuid pk
  brand_id     text → brands.id   (indexed with created_at)
  status       text               'completed' | 'failed'   (never store all-failed as a fresh success)
  report       jsonb not null
  schema_version smallint not null            -- report shape version (provenance)
  started_at   timestamptz not null
  created_at   timestamptz default now()      -- completion time
```

`report` shape (`SiteAuditReport`):

```ts
type ResourceStatus = "present" | "absent" | "unavailable";
type BotPosture     = "allowed" | "blocked" | "unspecified";
type FetchStatus    = "ok" | "blocked" | "timeout" | "non-html" | "failed";

interface SiteAuditReport {
  window: { fromIso: string; toIso: string; citationCount: number };   // provenance
  origins: {
    origin: string;                        // scheme+host (robots is per-origin)
    llmsTxt: ResourceStatus;
    sitemap: ResourceStatus;
  }[];
  pages: {
    requestedUrl: string;
    finalUrl: string | null;               // after redirects (provenance)
    fetchStatus: FetchStatus;
    title: string | null;
    hasSchema: boolean | null;             // null when not fetched
    hasMetaDescription: boolean | null;
    headingStructure: "ok" | "no-h1" | "weak" | null;
    robotsPosture: { GPTBot: BotPosture; ClaudeBot: BotPosture; PerplexityBot: BotPosture; GoogleExtended: BotPosture }; // evaluated for THIS url's path
    relevanceScore: number | null;         // 1–5, null on scorer failure
    relevanceNote: string | null;
    scoreModel: string | null;             // per-page model id (provenance)
  }[];
}
```

One generated migration, committed, **not run**.

## Components (`packages/lib/src/axo/`)

1. **`selectAuditPages`** — cited-first + fallback, returns `AuditTarget[]` with related
   prompts. Pure query.
2. **`fetchRobots(origin)`** — via `safe-fetch`; returns raw robots.txt text +
   `llms.txt`/`sitemap.xml` `ResourceStatus`, **once per origin**.
3. **`evaluateRobots(robotsText, url, bot)`** — pure: per-URL path evaluation with
   user-agent specificity and longest-match precedence; returns `BotPosture`, preserving
   `unspecified`. (Prefer a small vetted robots parser if it clears the supply-chain
   cooldown; otherwise a minimal matcher. `llms.txt` is treated as informational, never as
   proof of readiness.)
4. **`checklistForPage(html)`** — **pure, no LLM, no network**: JSON-LD/schema.org, title,
   meta description, heading hierarchy. Core correctness unit.
5. **`extractCleanText(html)`** — strips scripts/styles/comments/hidden boilerplate, returns
   bounded visible text (strict char/token cap) for the LLM. Structural checklist uses raw
   HTML; the scorer only ever sees cleaned, bounded text.
6. **`scorePageRelevance({ pageText, brandName, relatedPrompts })`** — one
   `runStructuredCompletionPrompt({ webSearch:false })` scoring the page against its
   related tracked prompts (the Phase 0 `mention-classify` pattern). Prompt explicitly
   treats page content as untrusted data and ignores any instructions embedded in it.
   Returns `null` on failure.
7. **`runSiteAudit(brandId)`** — orchestrator invoked **by the worker job**: select →
   fetch (safe) → checklist + robots + score → assemble `SiteAuditReport` → insert a
   `completed` row (or `failed` if every page failed; never a blank fresh success).

Add `"./axo"` and `"./net/safe-fetch"` to `packages/lib` `package.json` exports (explicit
exports map — a missing entry won't resolve).

## Integration into Opportunities (revised — cache dependency)

- Add `"axo"` to `CATEGORIES` + label/description (en + tr) + `CATEGORY_META` in the renderer.
- `buildDigest` calls `resolveSiteAudit(brandId)` (read path — never crawls) and appends a
  compact summary of the latest completed audit to the generation prompt; extend
  `GUIDANCE`/`TASK` so the model may emit `axo` opportunities describing concrete fixes.
  These are ordinary `OpportunitySchema` items → inherit `priority`/`expectedImpact` →
  render via the existing Task 6 UI.
- **Cache coherence:** persist the `siteAuditId` each Opportunities report was built from.
  Opportunities is treated as stale when a **newer completed audit** exists than the one it
  referenced (in addition to the existing time gate). Preferred: the `audit-site` job, on
  completion, enqueues an Opportunities regeneration so new AXO findings surface promptly
  rather than waiting out the 6-day Opportunities gate.

## Cost & limits

- Bounded by top-10 pages × one `webSearch:false` completion; staleness-gated; robots/llms/
  sitemap fetched once per origin. All LLM via the completion path (Phase 0 discipline).

## Testing (behavior / security / concurrency — no SQL-text fallback)

- `selectAuditPages`: own-domain filter, dedup, frequency rank, cap, and the empty→fallback path.
- `safe-fetch`: redirect-based SSRF, private/loopback/metadata rejection, DNS-rebinding,
  max-redirect / max-size / timeout enforcement, non-HTML rejection.
- `evaluateRobots`: path-specific rules, UA specificity, longest-match precedence, `unspecified`.
- `checklistForPage`: schema present/absent, missing h1, missing meta (fixture HTML).
- `scorePageRelevance`: stubbed provider (as `mention-classify.test.ts`); prompt-conditioned
  score; `null` on failure.
- `runSiteAudit`: partial fetch failure, complete failure → `failed` not blank-success.
- Concurrency: duplicate refresh requests enqueue only one job (singleton).
- Cache: Opportunities invalidates when a newer completed audit exists.

Where a DB harness is unavailable, assert on observable behavior with seeded rows — do
**not** fall back to asserting SQL text (repo guidance favors behavior).

## Explicitly out of scope (MVP)

JS-rendered/headless crawling; whole-site crawl (fallback is homepage + sitemap top-N only);
headline AXO score; per-opportunity workflow state; auto-fixing the customer's site.

## Open items for the implementation plan

- `AUDIT_REFRESH_AFTER_DAYS` value (propose 7).
- Robots parser: vetted dependency vs minimal in-house matcher (decide at plan time against
  the supply-chain cooldown).
- Whether `safe-fetch` grows a small allowlist-of-resolvers cache; the digest summary format
  (kept compact to bound tokens).
