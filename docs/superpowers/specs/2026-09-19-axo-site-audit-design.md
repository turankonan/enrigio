# AXO — Website AI-Readiness Audit (Phase 1) — Design (v3)

> Status: revised after two review rounds; pending final approval before the implementation plan.
> Phase 0 (sentiment, in-answer rank, coverage, opportunities-as-plan) is shipped. This is
> Phase 1 — the Maya website-audit pillar Enrigio does not yet have.
>
> **v3 changelog (round 2):** explicit lib/worker/web ownership split + full queue options;
> connection-pinned SSRF (not just pre-resolution); dropped the non-existent Opportunities
> regen job (MVP uses the sync path + `siteAuditId` staleness); capped related-prompts and
> bounded LLM concurrency; AXO LLM calls recorded as usage events; `resolveSiteAudit` returns
> queue-derived refresh status; explicit 30-day selection window + failed-report contract;
> sitemap XXE/size/bounds rules.

## Goal

For a brand, audit **its own pages that AI answer engines already cite**, score each page for
AI-readiness, and surface findings as **prioritized `axo`-category recommendations inside the
existing Opportunities report**. The audit runs as a background job and is cached; the web
path only reads the latest completed audit.

Non-goals: new dashboard page, headline "AXO score", whole-site crawl, JS/headless crawling.

## Resolved decisions

Cited-pages-first (with homepage→sitemap fallback) · `audit-site` worker job · staleness-gated
caching (gate decides *enqueue*, never inline crawl) · advisory in Opportunities (`axo`
category) · findings feed the Opportunities LLM so they inherit Phase 0 `priority`/`expectedImpact`.

## Component ownership (round 2 — critical)

`packages/lib` must not import `apps/web`/`apps/worker`. The split:

| Layer | File | Responsibility |
|---|---|---|
| lib | `packages/lib/src/axo/` | selection, safe fetch, robots eval, HTML parse, clean-text, scoring, `runSiteAudit()` (orchestration), `site_audits` reads/writes — **no queue code** |
| lib | `packages/lib/src/net/safe-fetch.ts` | shared SSRF-safe fetch (platform-owned, not AXO-specific) |
| worker | `apps/worker/src/jobs/audit-site.ts` | pg-boss handler → calls `runSiteAudit(brandId)` |
| worker | `apps/worker/src/handlers.ts` | register the `audit-site` handler |
| web | `apps/web/src/server/site-audit.ts` | authz, freshness check, **enqueue** via `getBoss()`, expose read model to Opportunities |
| web | `apps/web/src/lib/boss-client.ts` | `createQueue("audit-site", …)` (idempotent, pg-boss v12) |

Enqueue options (mirroring the `process-prompt` guard, with a longer ceiling for a crawl):

```ts
{ singletonKey: `audit-${brandId}`,
  singletonSeconds: /* > max audit duration, e.g. 20*60 */,
  retryLimit: 2, retryDelay: 60, retryBackoff: true,
  expireInSeconds: /* crawl+LLM ceiling, e.g. 15*60 */ }
```

## Execution & read model

- **`enqueueSiteAuditIfStale(brandId)`** (web): authorize, look up latest `completed` audit;
  if missing or older than `AUDIT_REFRESH_AFTER_DAYS` (7), enqueue one `audit-site` job
  (singleton dedups concurrent requests). Never blocks on the crawl.
- **`getSiteAuditView(brandId)`** (web read model):
  ```ts
  { latestCompleted: SiteAudit | null;
    refreshStatus: "idle" | "queued" | "running"; }   // queue-derived, from pgboss.job
  ```
  This distinguishes never-requested / queued / running / refreshing — the append-only table
  stays completed/failed only.
- **`runSiteAudit(brandId)`** (lib, invoked by the worker): select → safe-fetch → checklist +
  robots + clean-text + score → assemble → insert one `completed` row (or `failed`).

## SSRF-safe fetch (round 2 — critical: connection pinning)

Shared `safe-fetch` for all AXO network access. Pre-resolution alone is **insufficient** — the
HTTP client would re-resolve at connect time (rebinding/TOCTOU). Therefore:

- Resolve the host, reject loopback/private/link-local/multicast/metadata (`169.254.169.254`),
  then **pin the connection to the validated IP** via an Undici dispatcher / custom `lookup`
  that returns only that IP, while preserving the original hostname for `Host` header + TLS SNI.
- Re-validate host against the brand's approved domains **and** re-pin **on every redirect**.
- Scheme `http`/`https` only; max redirects, max response bytes, timeout; HTML content-type for
  pages / text for robots; never forward credentials or cookies; dedicated UA
  (`BROWSER_UA` in `website-excerpt.ts` is private — not reused); bounded concurrency + per-host
  rate limit.
- Returns a discriminated result (`ok`/`blocked`/`timeout`/`non-html`/`failed`), never throws for
  expected conditions.

## Page selection & prompt capping (round 2)

**`selectAuditPages(brandId, limit = 10): Promise<AuditTarget[]>`**,
`AuditTarget = { url; relatedPrompts: string[] }` (**capped at ≤ N related prompts**, propose 8):

1. **Cited-first:** distinct cited URLs on the brand's own domains over a **30-day window**
   (same window as Opportunities), ranked by citation frequency; each carries its **top-N
   related prompts by citation count**.
2. **Fallback when empty:** homepage, then `sitemap.xml` URLs, capped by remaining allowance;
   `relatedPrompts` = the brand's **top-N enabled prompts by visibility gap**, not all ~70.

Selected prompt texts/ids are persisted in the report for explainability. LLM scoring runs with
**bounded concurrency** (not just HTTP).

## Sitemap parsing (round 2)

XML parse with: response-size limit, **DTD/external-entity processing disabled (XXE)**, bounded
handling of sitemap-index files (no unbounded recursion), `http`/`https` URLs only, every URL
revalidated through `safe-fetch`, dedup + hard URL cap before any page fetch.

## Data model

`site_audits` (append-only):

```
id uuid pk · brand_id text→brands.id (idx w/ created_at) · status text ('completed'|'failed')
report jsonb not null · schema_version smallint not null · started_at timestamptz · created_at timestamptz default now()
```

Consumers **must filter `status = 'completed'`**. `report` (`SiteAuditReport`):

```ts
type ResourceStatus = "present" | "absent" | "unavailable";
type BotPosture     = "allowed" | "blocked" | "unspecified";
type FetchStatus    = "ok" | "blocked" | "timeout" | "non-html" | "failed";

interface SiteAuditReport {
  window: { fromIso; toIso; citationCount: number };
  failureSummary?: string;                 // e.g. "all-targets-unavailable" (failed audits)
  origins: { origin; llmsTxt: ResourceStatus; sitemap: ResourceStatus }[];
  pages: {
    requestedUrl; finalUrl: string | null; fetchStatus: FetchStatus;
    relatedPrompts: string[];              // the (capped) prompts scored against
    title: string | null;
    hasSchema: boolean | null; hasMetaDescription: boolean | null;
    headingStructure: "ok" | "no-h1" | "weak" | null;
    robotsPosture: { GPTBot; ClaudeBot; PerplexityBot; GoogleExtended: BotPosture };  // for THIS url's path
    relevanceScore: number | null; relevanceNote: string | null; scoreModel: string | null;
  }[];
}
```

A **failed** audit still writes a `status='failed'` row with the diagnostic `report` above
(no sensitive network internals) — never a blank fresh success.

## Components (`packages/lib/src/axo/`)

`selectAuditPages` · `fetchRobots(origin)` (once per origin) · `evaluateRobots(text,url,bot)`
(pure: per-URL path, UA specificity, longest-match, preserve `unspecified`; `llms.txt`
informational) · `checklistForPage(html)` (pure) · `extractCleanText(html)` (strip
scripts/styles/comments/hidden; bounded; scorer sees only this) · `scorePageRelevance({pageText,
brandName, relatedPrompts})` (one `runStructuredCompletionPrompt({webSearch:false})`; prompt
treats page text as untrusted, ignores embedded instructions; returns `null` on failure) ·
`runSiteAudit(brandId)`. Add `"./axo"` + `"./net/safe-fetch"` to the lib `package.json` exports.

## Usage recording (round 2)

Each scoring attempt records a `usage_events` row (the table already has org/brand/provider/
model/units/`estimated_cost_usd`): `site_audit_score` on success, `site_audit_score_failed` on
failure. Cost via `estimateRunCostUsd`. **Recording failure never fails the audit.**

## Opportunities integration & cache coherence (round 2)

- Add `"axo"` to `CATEGORIES` + label/description (en+tr) + renderer `CATEGORY_META`.
- `buildDigest` reads the latest **completed** audit (via the web read model) and appends a
  compact summary to the generation prompt; `GUIDANCE`/`TASK` allow `axo` opportunities. They
  render through the existing Task 6 UI (priority + impact), no new components.
- **Cache coherence (MVP, no new job):** persist the `siteAuditId` each Opportunities report was
  built from; treat the report as stale when a newer completed audit exists (in addition to the
  time gate); regenerate on the **next Opportunities request** via the existing synchronous path.
  (Moving Opportunities generation to a worker is a separate future improvement — **not** in this
  plan; there is no Opportunities regen job today.)

## Testing (behavior / security / concurrency — no SQL-text fallback)

`selectAuditPages` (own-domain, dedup, rank, cap, empty→fallback, prompt cap) · `safe-fetch`
(redirect SSRF, private/loopback/metadata reject, **rebinding via pinned IP**, max-redirect/size/
timeout, non-HTML) · `evaluateRobots` (path rules, UA specificity, longest-match, `unspecified`)
· `checklistForPage` (fixtures) · sitemap (XXE disabled, size cap, index bounds, dedup/cap) ·
`scorePageRelevance` (stubbed provider, prompt-conditioned, `null` on failure) · `runSiteAudit`
(partial + complete failure → `failed`) · concurrency (singleton dedups) · cache (Opportunities
stale when newer completed audit) · usage events recorded on score success/failure.

## Explicitly out of scope (MVP)

JS/headless crawling; whole-site crawl; headline AXO score; per-opportunity workflow state;
auto-fixing the site; moving Opportunities generation into a worker.

## Open items for the implementation plan

`AUDIT_REFRESH_AFTER_DAYS`=7 · related-prompt cap N=8 (confirm) · robots parser: vetted dep vs
minimal matcher (decide against supply-chain cooldown) · exact `singletonSeconds`/`expireInSeconds`
· digest summary format (compact).
