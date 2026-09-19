# AXO — Website AI-Readiness Audit (Phase 1) Implementation Plan (v3)

> **v3 changelog (plan review round 2):** safe-fetch tests inject the *transport* (not just resolver) so loopback stays blocked while a fixture is reachable; `selectAuditPages` returns `SelectionResult` metadata and the orchestrator (not the core) composes the homepage+sitemap fallback; scorer returns a discriminated `ScoreResult` (failures keep provider/model) and only the completion *wrapper* type gains `providerId`; Opportunities cache comparison normalizes `null`/`undefined`; enqueue cooldown keys off the latest *attempt* with a separate `AUDIT_FAILED_RETRY_DAYS` (no failed-audit retry loop); domain-helper re-export uses import+export; hostname tests cover ports/IPv6 and SSRF exact-match keeps `www` explicit; robots percent-decode is non-fatal; digest is char-bounded + delimited as untrusted.

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

**Produces:** `export function extractDomain(urlOrDomain: string): string;` (lowercase host, strip scheme/path/port/trailing dot, strip leading `www.` — used for **citation-domain grouping only**); `export function hostMatchesAllowlist(host: string, allow: string[]): boolean;` — **exact normalized-host match (lowercase + trailing-dot only; NO `www.` stripping)**, port-agnostic. The SSRF allowlist uses `hostMatchesAllowlist`, so the brand allowlist must be built to include both apex and `www.` forms explicitly (deliberate — `www`-stripping is not exact-host matching and must not weaken the SSRF gate).

- [ ] **Step 1: failing test**
```ts
import { describe, expect, it } from "vitest";
import { extractDomain, hostMatchesAllowlist } from "./hostname";
it("normalizes host for grouping", () => {
  expect(extractDomain("https://WWW.Rigosis.com:443/x?y")).toBe("rigosis.com");
  expect(extractDomain("rigosis.com.")).toBe("rigosis.com");
  expect(extractDomain("rigosis.com:8443")).toBe("rigosis.com");   // schemeless host:port
});
it("allowlist is exact (no www strip), port-agnostic, rejects look-alikes", () => {
  expect(hostMatchesAllowlist("rigosis.com:443", ["rigosis.com"])).toBe(true);
  expect(hostMatchesAllowlist("www.rigosis.com", ["rigosis.com"])).toBe(false);   // caller must add the www variant
  expect(hostMatchesAllowlist("rigosis.com.evil.test", ["rigosis.com"])).toBe(false);
  expect(hostMatchesAllowlist("[::1]", ["::1"])).toBe(true);       // IPv6 literal
});
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement (URL-parse when a scheme is present; else treat as `host[:port]`; `extractDomain` lowercases, drops `www.`, drops trailing dot; `hostMatchesAllowlist` strips only port + trailing-dot + lowercases, then compares exactly — no `www` stripping; handle IPv6 literals in brackets).
- [ ] **Step 4:** run → PASS. In `apps/web/src/lib/domain-categories.ts`, replace the local `extractDomain` with an import + re-export so in-file callers keep a local binding:
```ts
import { extractDomain } from "@workspace/lib/net/hostname";
export { extractDomain };
```
Run `pnpm --filter @workspace/web exec tsc --noEmit` → PASS.
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
export interface SafeFetchOptions {
  allowHosts: string[]; accept: "html" | "text"; maxBytes?: number; timeoutMs?: number; maxRedirects?: number; allowPorts?: number[];
  resolver?: (host: string) => Promise<string[]>;          // injectable DNS (tests control resolution)
  transport?: (opts: { hostname: string; port: number; pinnedIp: string; path: string; headers: Record<string,string> }) => Promise<{ statusCode: number; headers: Record<string,string>; stream: NodeJS.ReadableStream }>;  // injectable request transport (tests route a validated public IP to a local fixture)
}
export function isDisallowedAddress(ip: string): boolean;
```

The `resolver` still enforces the private-IP gate (mandatory — production must reject loopback). The **`transport`** seam is what tests use to reach a local fixture: the resolver returns an *approved public* address (e.g. `93.184.216.34`), the gate passes, and the injected transport routes that pinned IP to the local `node:http` server — so pinning is asserted (the transport receives `pinnedIp`) without ever whitelisting loopback. In production, the default transport connects `node:https` to `pinnedIp` with the `lookup` override.

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
- [ ] **Step 5:** behavior tests using the **injected `resolver` (returns an approved public IP)** + **injected `transport` (routes `pinnedIp` to a local `node:http` fixture)** — loopback stays blocked in production, and pinning is still asserted: (a) the transport receives the exact `pinnedIp` the resolver returned; (b) credentials URL (`https://u:p@rigosis.com`) → `blocked`; (c) disallowed port (`:8443` with default `allowPorts`) → `blocked`; (d) redirect off-allowlist → `blocked` (re-checked post-redirect); (e) body `>maxBytes` → `too-large` (not truncated-ok); (f) fixture `404` → `not-found`, `500` → `failed` (with `httpStatus`); (g) redirect response stream destroyed before the next hop; (h) resolver returning `::ffff:10.0.0.1` → `blocked`. Also assert the default (non-injected) path rejects a resolver result of `127.0.0.1`. Run → PASS.
- [ ] **Step 6:** add `./net/safe-fetch` export; commit `add SSRF-safe fetch with pinned lookup and injectable resolver`.

---

### Task 5: `evaluateRobots` (pure, RFC 9309 subset)

**Produces:** `export function evaluateRobots(robotsTxt: string, url: string, bot: AiBot): BotPosture;`

Subset: group by user-agent (case-insensitive; a group with no matching UA and no `*` → `unspecified`); support `*` wildcard and `$` end-anchor in paths; **longest-match wins; on equal length `Allow` beats `Disallow`**; percent-decode both rule and path once before compare; multiple UAs sharing a group and repeated groups both merge.

- [ ] **Step 1:** failing tests — fix the earlier contradiction; assert `unspecified` when no group/`*` matches; add cases for `Disallow: /*.pdf$`, equal-length Allow-wins, and two UAs in one group.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement parser (translate `*`→`.*`, `$`→end, escape other regex chars; track match length = literal prefix length; Allow-wins on tie). Percent-decode rule + path inside `try/catch` — **malformed encoding is non-fatal**, fall back to the raw string.
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

**Produces:**
```ts
export interface AuditWindow { fromIso: string; toIso: string }
export interface SelectionResult { targets: AuditTarget[]; usedFallback: boolean; citationCount: number; window: AuditWindow }
export function selectAuditPages(brandId: string, opts?): Promise<SelectionResult>;   // cited-only; targets:[] when none
export function chooseAuditTargets(input): AuditTarget[];                              // pure; cited rows → ranked targets, NO homepage
```
The pure core returns **cited targets only** (empty array when the brand has no owned citations) — it does **not** inject the homepage. `selectAuditPages` returns `usedFallback:false` + `citationCount` + `window`; the **orchestrator (Task 10)** composes the homepage + sitemap fallback when `targets` is empty (so the fallback contract is unambiguous — the reviewer's fix).

- [ ] **Step 1:** failing tests on `chooseAuditTargets` (pure): own-domain filter via shared `extractDomain`; dedup; **rank pages by citation count**; **rank each page's related prompts by citation count before the ≤8 cap**; **empty citations → `[]`** (no homepage).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement. The DB query **aggregates in SQL with nested per-(url,prompt) counts** — group citations by `(url, prompt_value)` to get per-prompt frequency, then by `url` for page frequency; select the top pages by page-frequency and, within each, the top-N prompts by per-prompt frequency **before** the page limit (do not load every citation row). Window = 30d; own-domain via shared `extractDomain`. `selectAuditPages` wraps this and returns `SelectionResult`.
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

- [ ] **Step 1:** extend **only the wrapper's return type** (do NOT add a required field to the shared `StructuredResearchResult` — that would break every provider implementation). In `llm.ts`:
```ts
export type StructuredCompletionResult<T> = StructuredResearchResult<T> & { providerId: string };
export async function runStructuredCompletionPrompt<T>(prompt: string, schema: z.ZodType<T>): Promise<StructuredCompletionResult<T>> {
  const provider = resolveResearchProvider();
  if (!provider.runStructuredResearch) throw new Error(`Provider "${provider.id}" does not implement structured research`);
  const result = await provider.runStructuredResearch({ prompt, schema, webSearch: false });
  return { ...result, providerId: provider.id };
}
```
Phase 0 callers ignore the extra field (additive, safe). `pnpm --filter @workspace/lib exec tsc --noEmit` → PASS.
- [ ] **Step 2:** `scorePageRelevance` returns a **discriminated result** so a failure still carries provider/model for `site_audit_score_failed`:
```ts
export type ScoreResult =
  | { ok: true;  score: number; note: string; providerId: string; model: string }
  | { ok: false; providerId: string | null; model: string | null; errorKind: string };
export function scorePageRelevance(input: { pageText: string; brandName: string; relatedPrompts: string[] }): Promise<ScoreResult>;
```
- [ ] **Step 3:** failing tests (stub `../onboarding/llm`): success → `{ok:true, score, note, providerId, model}`; thrown error → `{ok:false, providerId:null, model:null, errorKind:"exception"}`.
- [ ] **Step 4:** run → FAIL, then implement (Zod score 1–5; prompt conditions on `relatedPrompts`; treats page text as untrusted; on success reads `providerId`/`modelVersion` from the wrapper; on catch returns `ok:false` with whatever provider/model context is available).
- [ ] **Step 5:** run → PASS; commit `add providerId to completion wrapper and discriminated AXO scorer`.

---

### Task 10: `runSiteAudit` orchestrator + `getLatestCompletedAudit`

**Files:** create `axo/run.ts`, `axo/read.ts`, `axo/index.ts`; modify `packages/lib/package.json` (`./axo`).

**Produces:** `runSiteAudit(brandId): Promise<string>`; `getLatestCompletedAudit(brandId): Promise<SiteAudit | null>`; `getLatestAuditAttempt(brandId): Promise<SiteAudit | null>` (newest of any status — for the enqueue cooldown).

Behavior: `const sel = await selectAuditPages(brandId)`. **Fallback composed here** (not in selection): if `sel.targets` is empty, build targets from the brand homepage plus `fetchSitemapUrls(origin, allowHosts, cap)` up to the page limit, each carrying the brand's top enabled prompts; mark the audit as fallback via `sel.usedFallback` / an empty `citationCount`. Resolve distinct origins; `fetchRobots` once per origin; for each page `safeFetch(html)` → on `ok`: `checklistForPage` + `evaluateRobots` per `AiBot` (path-specific) + `scorePageRelevance(extractCleanText(body), …)`. **Record a `usage_events` row per score from the discriminated result**: `ok:true` → `site_audit_score` with `provider = res.providerId`, `model = res.model`; `ok:false` → `site_audit_score_failed` with `provider = res.providerId`, `model = res.model` (either may be null); both with org+brand from the brand row, `units:1`, `estimatedCostUsd` via `estimateRunCostUsd`; the insert is wrapped so it never throws the audit. Run scoring at **concurrency ≤ 3** (manual gate). `status = pages.every(p => p.fetchStatus !== "ok") ? "failed" : "completed"`, with `failureSummary` when failed; insert one `siteAudits` row (`schemaVersion`, `startedAt`, `report.window` with `sel.window` + `sel.citationCount`) and return its id. `getLatestCompletedAudit` = newest `status='completed'` row; **also add `getLatestAuditAttempt(brandId)` = newest row of any status** (used by the enqueue cooldown in Task 12).

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
export const AUDIT_REFRESH_AFTER_DAYS = 7;      // re-audit cadence after a SUCCESS
export const AUDIT_FAILED_RETRY_DAYS = 1;       // don't re-crawl a failing site more than daily
export async function enqueueSiteAuditIfStale(brandId: string): Promise<{ enqueued: boolean }>;   // authorized
export async function getLatestBrandAudit(brandId: string): Promise<SiteAudit | null>;            // authorized — latest COMPLETED, for display
```
Both call `requireBrandSession(brandId)` first (as `dashboard.ts` does). No `pgboss.job` coupling — return `{ enqueued }` only (MVP has no AXO UI needing queued/running). Enqueue is best-effort; a queue error is caught, logged, returns `{ enqueued:false }`.

**Cooldown keys off the latest _attempt_ (any status), not the latest completed** — otherwise a repeatedly-failing site would be re-enqueued forever once the singleton window lapses:
- latest attempt is `completed` and age < `AUDIT_REFRESH_AFTER_DAYS` → skip;
- latest attempt is `failed` and age < `AUDIT_FAILED_RETRY_DAYS` → skip;
- otherwise (no attempt / stale success / retry-eligible failure) → enqueue.
Display (`getLatestBrandAudit`) always returns the latest **completed** audit.

- [ ] **Step 1:** failing tests: (a) unauthorized brand → `requireBrandSession` rejects both; (b) no attempt → one `send` with `singletonKey: audit-<brandId>` + full options; (c) fresh completed attempt → no `send`; (d) **recent failed attempt → no `send`** (retry cooldown); (e) old failed attempt (> `AUDIT_FAILED_RETRY_DAYS`) → `send`; (f) `send` throwing → `{ enqueued:false }`, no throw. Mock `@/lib/boss-client`, `@workspace/lib/axo` (`getLatestAuditAttempt`, `getLatestCompletedAudit`), and the auth guard.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement (guard → `getLatestAuditAttempt` → cooldown gate above → `boss.send(...)` in try/catch; `getLatestBrandAudit` → `getLatestCompletedAudit`).
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
  4. load latest opportunities report; **normalize the id comparison to avoid `null !== undefined` churn**:
     ```ts
     const latestAuditId = latestAudit?.id ?? null;
     const auditStale = (report.siteAuditId ?? null) !== latestAuditId;
     const isStale = timeGateStale || auditStale;
     ```
  5. serve if fresh, else regenerate.
- [ ] **Step 3:** in `buildDigest`, append a **character-bounded** (e.g. ≤2000 chars) summary of `latestAudit.report`, **clearly delimited as untrusted page-derived data** (e.g. wrapped in a labelled `""" … """` block the prompt is told to treat as data, not instructions): per page — final URL, `fetchStatus`, missing schema/meta, blocked AI bots, `relevanceScore`+note. Extend `GUIDANCE`/`TASK` to allow `axo` opportunities describing concrete readiness fixes. Persist `siteAuditId = latestAudit?.id ?? null` on the inserted `brand_opportunities` row.
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
