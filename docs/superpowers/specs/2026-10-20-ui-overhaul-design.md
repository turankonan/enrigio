# UI overhaul — design

Date: 2026-10-20. Companion UX brief: `docs/ux-designer/UX-BRIEF-overhaul.md` (audience, copy rules,
states). This document is the engineering design: what changes in the code, in what shape, and how it
is verified.

## 1. Outcome

A signed-in user lands on a page with their brands across the top, one selected, and a single scrolling
Home for that brand with five cards in fixed order: visibility score, what to do next, business keywords,
keyword ↔ website match, AI engines vs competitors. Every existing detailed page survives under an
**Advanced** menu with the new theme and no other change. The sidebar is gone. The app carries the
Enrigio logo kit (indigo `#2B2BD9`, orange `#FF7A3D`, night `#0B0B1A`, light `#F5F5FA`).

## 2. Scope

In:
- New shell (top bar + brand strip + Advanced menu + user menu) replacing the sidebar shell.
- New brand Home page replacing the Overview page.
- Brand keywords (new column) and keyword ↔ website check (new table, new worker job).
- Per-engine brand-vs-competitor comparison (new server function).
- Theme tokens, fonts, logo, favicons from the kit.

Out (deliberate, say so in the PR):
- Dark mode. Marking opportunities done. LLM-judged keyword relevance. Multi-market comparison.
- Any layout change to Advanced pages beyond what the theme tokens cause.
- Turkish strings for new keys (English fallback applies; the translation worksheet picks them up).

## 3. Shell

`apps/web/src/routes/_authed.tsx` keeps owning the shell. `Shell()` renders:

```
<TopBar scope={scope} />           // new, components/top-bar.tsx
<main>                             // PageContent as today
  {!bareHeader && <SiteHeader />}   // breadcrumbs only on Advanced pages
  <Outlet />
</main>
```

`SidebarProvider`, `AppSidebar`, `nav-main.tsx` and `app-shell.tsx`'s sidebar wiring are deleted.
The `account` section (choose-plan, accept-invitation) renders a bare `<Outlet />` as today.

**TopBar** (`components/top-bar.tsx`), left to right:
1. `Logo` — now an `<img>` of the kit's horizontal colour SVG (`/brand/enrigio-horizontal.svg`), 28 px
   tall, linking to `/app`. Whitelabel branches of `logo.tsx` stay.
2. `BrandStrip` (`components/brand-strip.tsx`). Source of brands: `scope.organization.brands` from route
   context, already loaded. Scores: new hook `useOrgBrandScores(organizationId)` → `getOrgBrandScoresFn`.
   Card = favicon (existing `useSiteIcons`), name, score as `NN %`, trend arrow with signed delta. Selected
   card = indigo outline (`aria-current="page"`). Not-onboarded brand shows "Setting up" instead of a score.
   Last card = "+ Add brand" → `/app/org/$org/new`, hidden when `brandCreation.kind === "not-offered"`.
   Overflow: horizontal scroll with scroll-snap; below `md` the strip becomes a `Select`.
3. `AdvancedMenu` (`components/advanced-menu.tsx`): a `DropdownMenu` built from `lib/nav-links.ts`,
   which is `brandGroups` + `organizationGroups` + `adminNavItems` moved out of `app-sidebar.tsx`
   unchanged. Groups render as labelled sections. Visible on brand, organization and admin sections.
4. `NavUser` — existing dropdown, restyled; keeps `OrganizationSwitcher`.

`SiteHeader` stays for Advanced pages (breadcrumbs + demo pill). The Home route declares
`staticData: { bareHeader: true }`; `Shell()` reads it off the matches the same way `shell-scope.ts`
reads `staticData.shell`, and skips the header.

## 4. Home page

`routes/_authed/app/org/$org/brand/$brand/index.tsx` is rewritten. If `brand.onboarded` is false it
renders `PromptWizard` exactly as today. Otherwise `<BrandHome />` (`components/home/brand-home.tsx`),
a single column, max width 56 rem, five cards:

| Card | Component | Data hook(s) |
|---|---|---|
| Your visibility score | `home/score-card.tsx` | `useOrgBrandScores` (this brand's entry: score, delta, mentioned/total, N of M) + `useDashboardSummary` for the 30-day series |
| What to do next | `home/next-steps-card.tsx` | `useOpportunities` (existing; regenerates when stale as today) → first 5 by priority high→medium→low, report order within a priority |
| Your business keywords | `home/keywords-card.tsx` | brand from route context (`brand.keywords`), `updateBrandKeywordsFn`, suggestions = distinct `prompts.tags` of the brand, first 10 |
| Do your website and keywords match? | `home/keyword-match-card.tsx` | `useKeywordCheck(brandId)` → `getKeywordCheckFn`, `requestKeywordCheckFn` |
| AI engines and competitors | `home/engines-card.tsx` | `useEngineComparison(brandId)` → `getEngineComparisonFn`; leaderboard from `useShareOfVoice` |

Score band (`lib/score-band.ts`): one function `scoreBand(pct) → "low" | "ok" | "good"` with thresholds
20 and 50, and one `BandPill` component used by cards 1, 4 and 5. Colour + word always together.

Copy goes through `t()`; new keys under `home.*` in `locales/en.json`.

## 5. Data

### 5.1 Brand keywords

Migration `0025_brand_keywords.sql`:
```sql
ALTER TABLE brands ADD COLUMN keywords text[] NOT NULL DEFAULT '{}';
```
Schema: `keywords: text("keywords").array().notNull().default([])`.
Server fn `updateBrandKeywordsFn({ brandId, keywords })` in `server/brands.ts`: `requireBrandSession`,
zod `z.array(z.string().trim().min(1).max(60)).max(20)`, de-duplicate case-insensitively, write, then
`maybeEnqueueKeywordCheck(brandId)`.

### 5.2 Keyword check

Table `keyword_checks`, same shape as `site_audits`:
```sql
CREATE TYPE keyword_check_status AS ENUM ('running','completed','failed');
CREATE TABLE keyword_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL REFERENCES brands(id),
  status keyword_check_status NOT NULL,
  report json NOT NULL,
  started_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX keyword_checks_brand_created_idx ON keyword_checks (brand_id, created_at);
```
RLS enabled like `site_audits`. Same migration file as 5.1.

Report type (`packages/lib/src/keywords/types.ts`):
```ts
interface KeywordCheckReport {
  pages: { url: string; fetched: boolean }[];
  keywords: { keyword: string; status: "found" | "weak" | "missing"; url: string | null; where: "heading" | "body" | null }[];
  failureSummary?: string;
}
```

Job (`packages/lib/src/keywords/run.ts`, `runKeywordCheck(brandId)`), mirroring `axo/run.ts`:
1. Insert `running` row. Load brand (`website`, `additionalDomains`, `keywords`). Empty keywords →
   complete with an empty report.
2. Pages = brand homepage + `selectAuditPages(brandId).targets` URLs, de-duplicated, max 10.
   Fetch each with `safeFetch` against `buildAllowHosts` (export it from `axo/run.ts`). Per page keep
   `title + h1..h3` text (via linkedom, as `html.ts` does) and `extractCleanText(html)`.
3. Match (`packages/lib/src/keywords/match.ts`, pure, exported for tests):
   normalise both sides with NFKC + `toLocaleLowerCase("tr")` when the brand market language is `tr`,
   else `toLowerCase()`, collapse whitespace. `found` = present in any page's headings/title, or ≥ 2
   occurrences in any page's body. `weak` = exactly one body occurrence across all pages. Else
   `missing`. `url` = first page that produced the status, `where` = heading or body.
   `// ponytail: substring match; swap for LLM relevance scoring if customers ask`.
4. Write `completed` (or `failed` with `failureSummary` when no page fetched).

Worker: `apps/worker/src/jobs/check-keywords.ts` + registration in `handlers.ts` (`batchSize: 1`,
`localConcurrency: 1`); queue `check-keywords` created in `lib/boss-client.ts` with `retryLimit: 0`,
`expireInSeconds: 600`.

Web entry points (`server/keywords.ts`, copy of `site-audit.ts` with its cooldown logic):
- `maybeEnqueueKeywordCheck(brandId)` — cooldown: running < 10 min, completed < 7 days, failed < 1 day.
- `requestKeywordCheckFn({ brandId })` — authorized; bypasses the completed-cooldown but not running.
- `getKeywordCheckFn({ brandId })` → `{ latest: KeywordCheck | null; running: boolean }`.
Home calls `maybeEnqueueKeywordCheck` on load (inside `getKeywordCheckFn`) so results appear without a click.

### 5.3 Org brand scores (strip + score card)

`getOrgBrandScoresFn({ organizationId })` in `server/dashboard.ts`: `requireOrgAccess`, then for each
onboarded brand run the existing `getDashboardSummary` SQL twice (current 30 days, previous 30 days)
and return
```ts
{ brandId, score: number | null, previousScore: number | null, mentioned: number, total: number,
  promptsWithMention: number, totalPrompts: number }[]
```
Timezone comes from the client as today. Cached by React Query for 60 s; one request per page load.
`// ponytail: N brands × 2 queries; add a per-org rollup query if orgs grow past ~20 brands`.

### 5.4 Engine comparison

`getEngineComparisonFn({ brandId })` in `server/analysis.ts`. One SQL over `prompt_runs` for the
brand's enabled prompts, last 30 days, effective market, grouped by `model`: `runs`,
`brand_mentioned` count, and per competitor name the count of runs whose `competitors_mentioned`
contains it (unnest + group). Returns

```ts
{ model, label, brandRate: number | null, topCompetitor: { name: string; rate: number } | null,
  verdict: "lead" | "close" | "behind" | null }[]   // close = |diff| < 5 points
```
sorted by `brandRate` desc. Leaderboard reuses `getShareOfVoiceFn` with an optional `model` filter.

## 6. Theme and brand assets

- `apps/web/src/styles.css`: light tokens → `--background #F5F5FA`, `--card #FFFFFF`,
  `--foreground #0B0B1A`, `--primary #2B2BD9`, `--primary-foreground #FFFFFF`, `--accent #FF7A3D`
  (used for the sparkle and positive deltas only), `--ring #2B2BD9`, radius 0.75 rem.
  Chart slot 1 → indigo, slot 2 → night at 60 %, slots 3+ unchanged. The `.dark` block is left in place
  but untouched (no toggle exists).
- Font: import `@fontsource/geist-sans` (400/500/600/700) and `@fontsource/geist-mono` in `styles.css`
  and define `--font-geist-sans` / `--font-geist-mono`, which `--font-sans` already references. Remove the
  Ubuntu `@font-face`, preload and `@fontsource/ubuntu` dependency; delete `usesWordmarkFont`.
- `packages/config/src/constants.ts`: `ENRIGIO_BRAND_COLOR` / `ENRIGIO_THEME_COLOR` → `#2B2BD9`,
  `ENRIGIO_BRAND_FONT` → `"Geist Sans"`.
- Assets copied from the kit into `apps/web/public/brand/` (horizontal colour, horizontal white,
  mark colour, mark white) and `apps/web/public/icons/` (favicons 16/32/180/512, app icon → existing
  192/512 and maskable names, `favicon.ico` regenerated from the 32 px PNG). `__root.tsx` link tags keep
  their paths. `scripts/generate-brand-icons.tsx` is deleted with its script entry; the kit is the source.
- `packages/og/src/render.tsx`: night ground, white horizontal lockup. Email template: logo swap only.

## 7. Files

New: `components/top-bar.tsx`, `brand-strip.tsx`, `advanced-menu.tsx`, `home/*.tsx` (6 files),
`lib/nav-links.ts`, `lib/score-band.ts`, `hooks/use-org-brand-scores.tsx`, `use-keyword-check.tsx`,
`use-engine-comparison.tsx`, `server/keywords.ts`, `packages/lib/src/keywords/{types,match,run,index}.ts`,
`apps/worker/src/jobs/check-keywords.ts`, migration `0025_brand_keywords.sql`, `public/brand/*`.

Changed: `_authed.tsx`, `brand/$brand/index.tsx`, `logo.tsx`, `styles.css`, `__root.tsx`,
`server/dashboard.ts`, `server/analysis.ts`, `server/brands.ts`, `lib/boss-client.ts`,
`worker/handlers.ts`, `schema.ts`, `constants.ts`, `locales/en.json`, `og/render.tsx`, `package.json`
(fonts).

Deleted: `app-sidebar.tsx`, `nav-main.tsx`, `nav-app-info.tsx`, `app-shell.tsx`,
`scripts/generate-brand-icons.tsx`, old `public/icons/*`.

## 8. Error handling

- Each Home card owns its loading skeleton and an inline error with "Try again"; a failing card never
  blanks the page.
- Keyword check: unreachable site → `failed` row with summary; card shows "We couldn't read your site.
  Check the address in Advanced › Brand settings." Enqueue failures are logged, never thrown (as audits).
- Strip: a brand whose score query fails shows "—" and the card still navigates.
- Keyword input: over 20 or over 60 chars is rejected client-side with a one-line reason and server-side
  by zod.

## 9. Testing

Behavioural, per repo rules:
- `packages/lib/src/keywords/match.test.ts`: found via heading, found via two body hits, weak via one hit,
  missing, Turkish dotted/dotless i normalisation, keyword spanning whitespace variants.
- `apps/web/src/lib/score-band.test.ts`: thresholds at 19/20/49/50.
- `apps/web/src/server/__tests__/keywords.test.ts`: cooldown decisions and enqueue options, mirroring
  `site-audit.test.ts`.
- `apps/web/src/server/__tests__/engine-comparison.test.ts`: verdict from rates, sort order, no
  competitors → `topCompetitor: null`.
- Top-5 selection: a small pure helper `pickNextSteps(report)` in `home/next-steps.ts` with one test.
- Storybook stories for `TopBar` and `BrandHome` (fixture data) replace the sidebar stories.
- Gate before PR: `pnpm lint`, `pnpm test`, `turbo run build`, then a browser pass through
  login → Home → Advanced › Share of voice at 1280 px and 390 px.

## 10. Rollout

One PR on branch `ui-overhaul`, commits per step of the implementation plan. The migration is applied by
the user (`pnpm exec drizzle-kit migrate` from `packages/lib`) — never by the agent. Worker and web deploy
together; the new queue is created on web boot, the handler registers on worker boot. No data backfill.
