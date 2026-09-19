# AXO — Website AI-Readiness Audit (Phase 1) Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Audit a brand's own AI-cited pages for AI-readiness in a background job, and surface findings as prioritized `axo`-category recommendations inside the existing Opportunities report.

**Architecture:** Shared SSRF-safe fetch + pure parsing/scoring units live in `packages/lib`; an `audit-site` pg-boss job runs the crawl+scoring in the worker; the web layer authorizes, enqueues (staleness-gated), and exposes the latest completed audit; Opportunities reads that audit and lets the existing LLM emit `axo` opportunities that inherit Phase 0 `priority`/`expectedImpact`.

**Tech Stack:** pnpm + Turborepo, Node 24, TypeScript, TanStack Start, pg-boss v12, Drizzle + Postgres, Zod, Vitest, Biome, `linkedom` + `@mozilla/readability` (already deps), native `node:https`.

**Spec:** `docs/superpowers/specs/2026-09-19-axo-site-audit-design.md` (v3). Executors read both.

> **v2 changelog (plan review):** safe-fetch rewritten on `node:https` with pinned `lookup`, injectable resolver, rich status incl. HTTP code, credential/port/IPv4-mapped-IPv6 handling, resource cleanup, fail-on-too-large; new shared-domain-helper task; `siteAuditId` column decided + added to the Task 2 migration; robots test corrected + `*`/`$` + Allow-wins-on-tie; HTML via `linkedom`/Readability not regex; correct 3-state resource mapping from HTTP status; bounded sitemap-index traversal; `providerId` added to the LLM wrapper for usage attribution; `requireBrandSession` enforced in web entry points; audit-refresh moved before the Opportunities early-return; queue created in worker + web via `withSentry` with `teamConcurrency`; `refreshStatus` simplified; final verification+integration task added.

## Global Constraints

- **pnpm only**; respect supply-chain controls (a failed install is the system working).
- **Never run migrations** — `drizzle-kit generate`, commit, stop.
- **Explicit exports map** — every new lib subpath needs a `package.json` `exports` entry.
- **`packages/lib` must not import `apps/*`.**
- **Security is mandatory (Task 1):** scheme+port allowlist, brand-domain allowlist re-checked per redirect, reject embedded credentials, reject private/loopback/link-local/multicast/metadata/IPv4-mapped-IPv6, connection pinned to the validated IP (rebinding guard), redirect/size/timeout caps (fail — never truncate-as-ok), no credential forwarding. Page HTML + sitemap XML are untrusted (no entity expansion; ignore embedded instructions).
- **Cost discipline:** `runStructuredCompletionPrompt({webSearch:false})`; ≤10 pages; ≤8 related prompts/page; bounded LLM concurrency; every score records `usage_events`.
- **Tests assert observable behavior, never SQL text.** No `biome-ignore`. `pnpm lint` green before handoff.
- **Commits:** plain imperative, no prefixes; small + atomic. **Changeset:** one `patch` for the user-facing `axo` opportunities only.

## File Structure

`packages/lib/src/net/safe-fetch.ts`(+test) · `packages/lib/src/net/hostname.ts`(+test, shared domain/host normalization) · `packages/lib/src/db/schema.ts` (siteAudits + brandOpportunities.siteAuditId) · `packages/lib/src/axo/{types,robots,html,select-pages,fetchers,score,run,read,index}.ts`(+tests) · `packages/lib/src/onboarding/llm.ts` (add providerId) · `packages/lib/package.json` (exports) · `apps/worker/src/jobs/audit-site.ts` · `apps/worker/src/handlers.ts` + `apps/worker/src/index.ts` (queue+register) · `apps/web/src/lib/boss-client.ts` (queue) · `apps/web/src/server/site-audit.ts`(+test) · `apps/web/src/server/opportunities.ts` · `apps/web/src/lib/domain-categories.ts` (re-export shared helper) · `apps/web/src/components/opportunities-report.tsx` · `apps/web/src/locales/{en,tr}.json` · `.changeset/*`.

---

### Task 1: Shared hostname/domain normalization (`packages/lib/src/net/hostname.ts`)

Extract the normalization AXO and Opportunities both need into lib (Opportunities' `extractDomain` currently lives in `apps/web` and can't be imported by lib).

**Files:** Create `packages/lib/src/net/hostname.ts`(+`.test.ts`); modify `packages/lib/package.json` (export `./net/hostname`); modify `apps/web/src/lib/domain-categories.ts` to re-export `extractDomain` from lib.

**Produces:** `export function extractDomain(urlOrDomain: string): string;` (lowercase host, strip scheme/path/port/trailing dot, strip leading `www.`); `export function hostMatchesAllowlist(host: string, allow: string[]): boolean;` (exact, case/dot-insensitive, port-agnostic host compare).

- [ ] **Step 1: failing test**
```ts
import { describe, expect, it } from "vitest";
import { extractDomain, hostMatchesAllowlist } from "./hostname";
it("normalizes host", () => {
  expect(extractDomain("https://WWW.Rigosis.com:443/x?y")).toBe("rigosis.com");
  expect(extractDomain("rigosis.com.")).toBe("rigosis.com");
});
it("allowlist is exact + rejects look-alikes", () => {
  expect(hostMatchesAllowlist("rigosis.com", ["rigosis.com"])).toBe(true);
  expect(hostMatchesAllowlist("rigosis.com.evil.test", ["rigosis.com"])).toBe(false);
});
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement (URL-parse when a scheme is present; else treat as host; lowercase, drop `www.`, drop trailing dot; `hostMatchesAllowlist` compares normalized host, ignoring port).
- [ ] **Step 4:** run → PASS. Update `apps/web/src/lib/domain-categories.ts`: `export { extractDomain } from "@workspace/lib/net/hostname";` and delete the local copy; run `pnpm --filter @workspace/web exec tsc --noEmit` → PASS.
- [ ] **Step 5:** commit `add shared hostname normalization and reuse it in web`.

---

### Task 2: Schema — `site_audits` + `brand_opportunities.site_audit_id`

**Files:** Modify `packages/lib/src/db/schema.ts`; generate migration (do NOT run).

- [ ] **Step 1:** add enum + table + FK column:
```ts
export const siteAuditStatusEnum = pgEnum("site_audit_status", ["completed", "failed"]);
export const siteAudits = pgTable("site_audits", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  brandId: text("brand_id").references(() => brands.id).notNull(),
  status: siteAuditStatusEnum("status").notNull(),
  report: json("report").notNull(),
  schemaVersion: smallint("schema_version").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ brandCreatedIdx: index("site_audits_brand_created_idx").on(t.brandId, t.createdAt) })).enableRLS();
```
In the existing `brandOpportunities` table, add: `siteAuditId: uuid("site_audit_id").references(() => siteAudits.id),` (nullable — existing rows are NULL and become stale once a completed audit exists).
- [ ] **Step 2:** `pnpm --filter @workspace/lib exec drizzle-kit generate` → one migration with the enum, table, index, and the new nullable column.
- [ ] **Step 3:** `pnpm --filter @workspace/lib exec tsc --noEmit` → PASS.
- [ ] **Step 4:** commit `add site_audits table and opportunities site_audit_id link`.

---

### Task 3: AXO types (`packages/lib/src/axo/types.ts`)

Same as spec §Data model. `SITE_AUDIT_SCHEMA_VERSION = 1`; `ResourceStatus`, `BotPosture`, `FetchStatus`, `AuditTarget`, `AiBot`, `SiteAuditReport` (fields exactly as the spec's `SiteAuditReport`). No test (declarations). Steps: write → `tsc --noEmit` → commit `add AXO shared types`.

---

### Task 4: SSRF-safe fetch (`packages/lib/src/net/safe-fetch.ts`) — security core

Use native `node:https`/`node:http` with a **custom `lookup`** that returns only a pre-validated public IP (no `undici` dependency). Resolver is **injectable** for tests.

**Produces:**
```ts
export type SafeFetchStatus = "ok" | "not-found" | "blocked" | "timeout" | "too-large" | "unsupported-content-type" | "failed";
export interface SafeFetchResult { status: SafeFetchStatus; httpStatus: number | null; finalUrl: string | null; body: string | null; contentType: string | null; }
export interface SafeFetchOptions { allowHosts: string[]; accept: "html" | "text"; maxBytes?: number; timeoutMs?: number; maxRedirects?: number; allowPorts?: number[]; resolver?: (host: string) => Promise<string[]>; }
export function isDisallowedAddress(ip: string): boolean;
```

Behavior contract (each a test case in Steps 1/5):
- Reject non-http(s) scheme, embedded credentials (`u.username||u.password`), and ports outside `allowPorts` (default `[80,443]`) → `blocked`.
- Reject host not in `allowHosts` (via `hostMatchesAllowlist`) → `blocked`, re-checked **after every redirect**.
- Resolve via `opts.resolver ?? dnsLookupAll`; if empty or **any** address is disallowed → `blocked`. Pin the socket to the first validated address using the `lookup` option; preserve hostname for Host/SNI. Re-resolve+re-pin per redirect.
- `isDisallowedAddress` covers IPv4 (127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, 0.0.0.0, ≥224 multicast), IPv6 (`::1`, `::`, `fc00::/7`, `fe80::/10`, `ff00::/8`), and **IPv4-mapped IPv6** (`::ffff:127.0.0.1` → check the embedded v4).
- HTTP `404/410` → `not-found`; `2xx` with acceptable content-type (`html` requires `text/html`; `text` requires a text/* or xml type) → `ok`; other/none → `failed` (carry `httpStatus`). Wrong content-type → `unsupported-content-type`.
- Enforce `maxBytes` by aborting the stream and returning `too-large` (never a truncated `ok`); `timeoutMs` → `timeout`.
- **Cancel/destroy** the response stream before following a redirect; **destroy the agent/socket in `finally`** (no per-redirect leak). Never send cookies; do not forward auth on redirect.

- [ ] **Step 1:** write failing tests for `isDisallowedAddress` (incl. `::ffff:10.0.0.1`, `fe80::1`, `169.254.169.254`) and `hostMatchesAllowlist` (reuse from Task 1 or import).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement `isDisallowedAddress` + the request core (node:https with `lookup` pinning; manual redirect loop; capped streaming read that destroys on overflow; `finally` cleanup).
- [ ] **Step 4:** run pure-guard tests → PASS.
- [ ] **Step 5:** behavior tests with an **injected resolver** + a local `node:http` test server (bind `127.0.0.1`, but pass its address via the injected resolver so pinning is exercised without hitting the network): assert (a) pinned address is the one the resolver returned, (b) credentials URL → `blocked`, (c) disallowed port → `blocked`, (d) redirect off-allowlist → `blocked`, (e) `>maxBytes` → `too-large`, (f) `404` → `not-found`, `500` → `failed`, (g) redirect body destroyed, (h) `::ffff:` mapped private → `blocked`. Run → PASS.
- [ ] **Step 6:** add `./net/safe-fetch` export; commit `add SSRF-safe fetch with pinned lookup and injectable resolver`.

---

### Task 5: `evaluateRobots` (pure, RFC 9309 subset)

**Produces:** `export function evaluateRobots(robotsTxt: string, url: string, bot: AiBot): BotPosture;`

Subset: group by user-agent (case-insensitive; a group with no matching UA and no `*` → `unspecified`); support `*` wildcard and `$` end-anchor in paths; **longest-match wins; on equal length `Allow` beats `Disallow`**; percent-decode both rule and path once before compare; multiple UAs sharing a group and repeated groups both merge.

- [ ] **Step 1:** failing tests — fix the earlier contradiction; assert `unspecified` when no group/`*` matches; add cases for `Disallow: /*.pdf$`, equal-length Allow-wins, and two UAs in one group.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement parser (translate `*`→`.*`, `$`→end, escape other regex chars; track match length = literal prefix length; Allow-wins on tie).
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `add RFC 9309-subset robots evaluation for AXO`.

---

### Task 6: HTML analysis via `linkedom` (`packages/lib/src/axo/html.ts`)

Use `linkedom`'s `parseHTML` for structure and `@mozilla/readability` (or DOM text) for clean text — **no regex**.

**Produces:** `checklistForPage(html): PageChecklist` and `extractCleanText(html, maxChars?): string`.

- [ ] **Step 1:** failing tests including reversed-attr meta (`<meta content="x" name="description">`), encoded title (`A &amp; B` → `A & B`), boilerplate/hidden removal, multiple/zero `<h1>`.
```ts
import { parseHTML } from "linkedom";
// test asserts checklistForPage detects meta regardless of attribute order, decodes entities in title,
// headingStructure: 0 h1 → "no-h1", >1 → "weak", 1 → "ok"; extractCleanText drops <script>/<style>/[hidden]/nav/footer and bounds length.
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement with `parseHTML`: `document.querySelector("title")?.textContent`; schema via `script[type="application/ld+json"], [itemscope]`; meta via `document.querySelector('meta[name="description"]')?.getAttribute("content")`; headings via `document.querySelectorAll("h1")`; clean text via Readability on the document (fallback to `body.textContent`), stripping `script,style,nav,footer,[hidden],[aria-hidden="true"]`, collapse whitespace, slice to `maxChars`.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `add AXO HTML checklist and clean-text via linkedom/readability`.

---

### Task 7: `selectAuditPages` (SQL-aggregated, prompt-ranked)

**Produces:** `selectAuditPages(brandId, opts?): Promise<AuditTarget[]>` + pure core `chooseAuditTargets(input)`.

- [ ] **Step 1:** failing tests on `chooseAuditTargets` (pure): own-domain filter via shared `extractDomain`; dedup; **rank pages by citation count**; **rank each page's related prompts by citation count before applying the ≤8 cap**; empty→homepage fallback carrying top enabled prompts.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement. The DB query **aggregates in SQL** — `select url, count(*) as cites, array_agg(prompt order by …)` grouped by url (do not load every citation row); window 30d; use shared `extractDomain`; prompts ranked by per-(url,prompt) citation count then capped. Sitemap-URL fallback is layered in Task 10 (needs `fetchSitemapUrls`); the pure core handles homepage fallback.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `add AXO page selection with SQL aggregation and prompt ranking`.

---

### Task 8: fetchers — `fetchRobots`, `fetchSitemapUrls` (bounded index traversal, correct status)

**Produces:** `fetchRobots(origin): Promise<RobotsInfo>`; `parseSitemapDoc(xml): { pages: string[]; sitemaps: string[] }` (pure); `fetchSitemapUrls(origin, allowHosts, caps): Promise<string[]>`; `statusFromFetch(r: SafeFetchResult): ResourceStatus`.

Resource mapping (`statusFromFetch`): `ok`→`present`; `not-found`→`absent`; `blocked|timeout|too-large|unsupported-content-type|failed`→`unavailable`.

Sitemap: distinguish `<urlset>` (pages) from `<sitemapindex>` (nested sitemaps); decode XML entities (`&amp;` etc.); **no DTD/entity expansion**; bounded traversal — `maxDepth` (e.g. 2), `maxSitemaps` (e.g. 5), `maxUrls` (cap), dedup; every nested sitemap fetched through `safeFetch`; only http/https + allowlisted hosts.

- [ ] **Step 1:** failing tests: `parseSitemapDoc` splits urlset vs index; XXE entity in DTD never expands; `statusFromFetch` maps all six statuses; `fetchSitemapUrls` (with an injected `safeFetch`) follows an index one level, caps, dedups.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement (regex/`linkedom` XML extraction of `<loc>` within `<url>` vs `<sitemap>`; entity-decode; recursion bounded by depth/count).
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `add AXO robots/sitemap fetchers with bounded index traversal`.

---

### Task 9: LLM wrapper `providerId` + `scorePageRelevance`

**Files:** modify `packages/lib/src/onboarding/llm.ts`; create `packages/lib/src/axo/score.ts`(+test).

- [ ] **Step 1:** extend the wrapper so usage attribution has a provider. In `runStructuredCompletionPrompt`:
```ts
const provider = resolveResearchProvider();
if (!provider.runStructuredResearch) throw new Error(`Provider "${provider.id}" does not implement structured research`);
const result = await provider.runStructuredResearch({ prompt, schema, webSearch: false });
return { ...result, providerId: provider.id };
```
Widen `StructuredResearchResult` (or the wrapper's return type) with `providerId: string`. Existing Phase 0 callers ignore the extra field (additive, safe). Run `pnpm --filter @workspace/lib exec tsc --noEmit` → PASS.
- [ ] **Step 2:** failing tests for `scorePageRelevance` (stub `../onboarding/llm`): returns `{score,note,model,providerId}`; returns `null` on throw.
- [ ] **Step 3:** run → FAIL.
- [ ] **Step 4:** implement (Zod score 1–5; prompt conditions on `relatedPrompts`; treats page text as untrusted; returns `providerId` from the wrapper).
- [ ] **Step 5:** run → PASS; commit `add providerId to structured completion and AXO scorer`.

---

### Task 10: `runSiteAudit` orchestrator + `getLatestCompletedAudit`

**Files:** create `axo/run.ts`, `axo/read.ts`, `axo/index.ts`; modify `packages/lib/package.json` (`./axo`).

**Produces:** `runSiteAudit(brandId): Promise<string>`; `getLatestCompletedAudit(brandId): Promise<SiteAudit | null>`.

Behavior: select targets (cited-first; if empty, homepage + `fetchSitemapUrls` up to the cap); resolve distinct origins; `fetchRobots` once per origin; for each page `safeFetch(html)` → on `ok`: `checklistForPage` + `evaluateRobots` per `AiBot` (path-specific) + `scorePageRelevance(extractCleanText(body), …)`; **record a `usage_events` row per score** (`site_audit_score`/`site_audit_score_failed`; org+brand from the brand row; `provider`, `model` from the scorer's `providerId`/`model`; `units:1`; `estimatedCostUsd` via `estimateRunCostUsd`; wrapped so it never throws the audit); run scoring at **concurrency ≤ 3** (manual gate); `status = pages.every(p => p.fetchStatus !== "ok") ? "failed" : "completed"`, with `failureSummary` when failed; insert one `siteAudits` row (`schemaVersion`, `startedAt`, `window` with `citationCount`) and return its id. `getLatestCompletedAudit` = newest `status='completed'` row.

- [ ] **Step 1:** failing tests (mock collaborators + a fake `db` capturing inserts, as in the Phase 0 style):
  - all pages fail → stored `status:"failed"` + `failureSummary`;
  - **fallback path**: `selectAuditPages` returns homepage only when no cited pages, and the audit still runs;
  - **usage recording**: a scored page inserts a `site_audit_score` usage row; a failed score inserts `site_audit_score_failed`;
  - **bounded concurrency**: instrument the mocked scorer to assert peak in-flight ≤ 3.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** run → PASS; `pnpm --filter @workspace/lib exec tsc --noEmit` → PASS.
- [ ] **Step 5:** commit `add AXO audit orchestrator with usage recording and bounded concurrency`.

---

### Task 11: `audit-site` worker job + queue (worker & web) + registration

**Files:** create `apps/worker/src/jobs/audit-site.ts`; modify `apps/worker/src/handlers.ts` (register via `withSentry`), `apps/worker/src/index.ts` (createQueue), `apps/web/src/lib/boss-client.ts` (createQueue).

- [ ] **Step 1:** handler:
```ts
import type { Job } from "pg-boss";
import { runSiteAudit } from "@workspace/lib/axo";
export async function auditSiteJob(jobs: Job<{ brandId: string }>[]): Promise<void> {
  for (const job of jobs) { const id = await runSiteAudit(job.data.brandId); console.log(`Completed site audit ${id} for ${job.data.brandId}`); }
}
```
- [ ] **Step 2:** register in `handlers.ts` mirroring `process-prompt`, wrapped in `withSentry`, with a low team concurrency:
```ts
await boss.work<{ brandId: string }>("audit-site", { batchSize: 1, teamConcurrency: 1 }, withSentry("audit-site", auditSiteJob));
console.log("Registered handler: audit-site");
```
- [ ] **Step 3:** create the queue in **both** `apps/worker/src/index.ts` and `apps/web/src/lib/boss-client.ts` (idempotent), identical options:
```ts
await boss.createQueue("audit-site", { retryLimit: 2, retryDelay: 60, retryBackoff: true, expireInSeconds: 15 * 60 });
```
- [ ] **Step 4:** `pnpm --filter @workspace/worker exec tsc --noEmit && pnpm --filter @workspace/web exec tsc --noEmit` → PASS.
- [ ] **Step 5:** commit `add audit-site worker job, queue, and Sentry-wrapped registration`.

---

### Task 12: Web layer — authorized enqueue + read (`apps/web/src/server/site-audit.ts`)

**Produces:**
```ts
export const AUDIT_REFRESH_AFTER_DAYS = 7;
export async function enqueueSiteAuditIfStale(brandId: string): Promise<{ enqueued: boolean }>;   // authorized
export async function getLatestBrandAudit(brandId: string): Promise<SiteAudit | null>;            // authorized
```
Both call `requireBrandSession(brandId)` first (as `dashboard.ts` does). No `pgboss.job` coupling — return `{ enqueued }` only (MVP has no AXO UI needing queued/running). Enqueue is best-effort; a queue error is caught, logged, and returns `{ enqueued: false }` (must not break callers).

- [ ] **Step 1:** failing tests: (a) unauthorized brand → `requireBrandSession` rejects both functions; (b) no/stale audit → one `send` with `singletonKey: audit-<brandId>` + full options; (c) fresh audit → no `send`; (d) `send` throwing → `{ enqueued:false }`, no throw. Mock `@/lib/boss-client`, `@workspace/lib/axo`, and the auth guard.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement (guard → `getLatestCompletedAudit` → freshness gate → `boss.send(...)` in try/catch).
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `add authorized AXO enqueue and read in web layer`.

---

### Task 13: Opportunities integration — `axo` category, digest, cache coherence, control flow

**Files:** modify `apps/web/src/server/opportunities.ts`, `apps/web/src/components/opportunities-report.tsx`, `apps/web/src/locales/{en,tr}.json`; `.changeset/axo-opportunities.md`.

- [ ] **Step 1:** add `"axo"` to `CATEGORIES`; add en/tr `category-axo` + `-desc`; add `axo` to `CATEGORY_META` in the renderer. Run the i18n parity test → PASS.
- [ ] **Step 2:** **control flow in `resolveOpportunities`** (must run before the fresh early-return):
  1. authorize (existing `requireBrandSession`);
  2. `await enqueueSiteAuditIfStale(brandId)` (best-effort; wrapped so a failure logs and continues);
  3. `latestAudit = await getLatestBrandAudit(brandId)`;
  4. load latest opportunities report; treat it stale if older than the time gate **OR** `report.siteAuditId !== latestAudit?.id`;
  5. serve if fresh, else regenerate.
- [ ] **Step 3:** in `buildDigest`, append a compact summary of `latestAudit.report` (per page: final URL, `fetchStatus`, missing schema/meta, blocked AI bots, `relevanceScore`+note) and extend `GUIDANCE`/`TASK` to allow `axo` opportunities describing concrete readiness fixes. Persist `siteAuditId = latestAudit?.id ?? null` on the inserted `brand_opportunities` row.
- [ ] **Step 4:** test: with a stubbed `site-audit` module, a newer completed audit id than the stored report's `siteAuditId` marks the report stale (regenerate path taken); equal id + fresh time → served. `pnpm --filter @workspace/web exec tsc --noEmit` → PASS.
- [ ] **Step 5:** changeset + commit:
```md
---
"@workspace/web": patch
---
Opportunities now include site-readiness (AXO) recommendations from an audit of the pages AI assistants already cite.
```
`git commit -m "surface AXO site-readiness findings as prioritized opportunities"`

---

### Task 14: Full verification + integration test

- [ ] **Step 1:** integration test (`apps/web` or `packages/lib`, mocking network + LLM, using a test DB or in-memory fake): (1) no audit exists → (2) an Opportunities request enqueues exactly one `audit-site` job → (3) running `runSiteAudit` stores a `completed` audit → (4) the next Opportunities generation references that `siteAuditId` → (5) a newer completed audit marks the cached Opportunities report stale. Run → PASS.
- [ ] **Step 2:** run the gate:
```bash
pnpm --filter @workspace/lib test
pnpm --filter @workspace/worker exec tsc --noEmit
pnpm --filter @workspace/web exec tsc --noEmit
pnpm --filter @workspace/web exec vitest run src/lib/__tests__/i18n.test.ts
pnpm lint
```
Expected: all green.
- [ ] **Step 3:** commit `add AXO end-to-end integration test`.

---

## Self-review notes

- **Spec coverage:** shared host helper (T1) · schema incl. `siteAuditId` (T2) · types (T3) · SSRF-safe fetch (T4) · robots RFC-subset (T5) · linkedom HTML (T6) · selection+SQL-agg+prompt-rank (T7) · fetchers+index traversal+status map (T8) · providerId+scorer (T9) · orchestrator+usage+concurrency+fallback (T10) · worker job+queue both sides+withSentry (T11) · authorized enqueue/read (T12) · Opportunities axo+digest+cache+control-flow (T13) · verification+integration (T14). All spec sections + all 14 review findings map to a task.
- **Type consistency:** `SafeFetchResult` (with `httpStatus`) → `statusFromFetch` (T8) → `ResourceStatus`; scorer returns `{score,note,model,providerId}` consumed by the orchestrator's usage insert; `siteAuditId` column (T2) used by T13.
- **Verify at execution:** `resolveResearchProvider` export path; `requireBrandSession` signature; `withSentry` generic usage; `estimateRunCostUsd` signature; exact linkedom `parseHTML` API.
```
