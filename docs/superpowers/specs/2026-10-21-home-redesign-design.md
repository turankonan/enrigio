# Home redesign (designer mock) — design

Date: 2026-10-21. Source of truth for visuals and copy: `docs/ux-designer/Enrigio Home.dc.html` (an
interactive React mock with state switches). Builds on the shipped overhaul
(`2026-10-20-ui-overhaul-design.md`); routes, hooks and server functions stay. This is a restyle of the
top bar and the five Home cards plus two behaviours the mock adds: **Mark done** on next steps and
**auto-saving keywords**.

## 1. Tokens

Light `:root` in `apps/web/src/styles.css` (hex, lowercase):

| Token | Value | Mock usage |
|---|---|---|
| `--border`, `--input` | `#e4e4ef` | card/control borders |
| `--muted`, `--secondary`, `--accent` | `#f5f5fa` | subtle fills, hover |
| `--muted-foreground` | `#52526b` | secondary text |
| `--divider` | `#eeeef4` | row dividers, ring track, bar track |
| `--dashed` | `#c4c4d6` | dashed borders, competitor bars |
| `--tint` / `--tint-foreground` | `#ededfc` / `#1f1fa8` | keyword chips, High impact, "You" pill |
| `--band-low` / `-foreground` | `#fdecec` / `#a3261f` | Low, They lead, Missing |
| `--band-ok` / `-foreground` | `#fff1e6` / `#9a4a12` | OK, Close, Weak |
| `--band-good` / `-foreground` | `#e6f6ec` / `#1e6b3a` | Good, You lead, Found |
| `--delta-up` / `--delta-down` | `#c2410c` / `#a3261f` | score deltas |

Each is exposed in `@theme inline` as `--color-<name>` so cards use `bg-band-low`,
`text-tint-foreground`, etc. No Tailwind palette colours (rose/amber/emerald) remain in Home or the shell.
Radii: cards 16px (`rounded-2xl`), tiles/menus 12px (`rounded-xl`), buttons 10px, pills full.
Font stays Geist Sans. Headings: h1 26px/600/-0.02em; card h2 20px/600/-0.01em; section label
13px/600/uppercase/0.06em.

## 2. Top bar

- Bar: sticky, white, 1px `--border` bottom, content `max-w-[1280px]`, `md:h-[84px]`, padding 12/24;
  below `md` it wraps as today (strip on its own row). `SiteHeader` sticks at `md:top-[84px]`.
- Logo: mark SVG (34px, `/brand/enrigio-mark.svg`) + text "enrigio" 22px/600/-0.02em. Whitelabel branch
  unchanged.
- Brand cards (`BrandStrip`): `h-[60px] min-w-[150px]`, white, 1px border, `rounded-xl`, gap 12.
  Left: 28px `rounded-lg` tile with the brand's initial in white on a tint from the palette
  `[#2b2bd9, #0b0b1a, #52526b, #1f1fa8, #3a3a52]` by index. Right: name 14/500 truncated; row of
  bold score (`NN%`) + delta text `▲ 5` (`--delta-up`), `▼ 4` (`--delta-down`), `— 0` (muted).
  Selected: `border-primary` + `shadow-[0_0_0_1px_var(--primary)]`, `aria-current="page"`.
  Not onboarded: "Setting up". No score: "—". Add card: 60×60 dashed square "+" with aria-label.
- Advanced: trigger `h-10 rounded-[10px]` outline button "Advanced ▾". Content: 520px (capped at
  viewport − 32px), `rounded-[14px]`, padding 18, three columns, group label 11px/600/uppercase:
  - **Analysis**: Visibility, Share of voice, Query fan-out, Citations, Opportunities, Prompts
    (→ `settings/prompts`).
  - **Brand**: Brand settings, Competitors, Tracked AI engines, Evaluation market (→ `settings/brand`).
  - **Organisation**: Organisation, Brands, Team*, Billing*, API keys, API, MCP, then admin items
    (*feature-gated as before).
  Brand column only when a brand is in scope; Organisation column only with an organization;
  account section shows nothing.
- Account: 40px round button with the user's initials (image avatar if `user.picture`), menu unchanged.

## 3. Home layout

`BrandHome` content `max-w-[1280px]`, vertical gap 20. Heading row: h1 brand name + "{host} · this
month" (host = `new URL(website).hostname`, fallback raw website). Order: Score (full), Next steps
(full), Keywords + Match in `grid-cols-[repeat(auto-fit,minmax(380px,1fr))] gap-5`, Engines (full).
Cards: white, 1px `--border`, `rounded-2xl`, padding `p-6 md:px-8`. `HomeCard` keeps loading skeleton
and error + "Try again"; `title` becomes optional (the score card draws its own label).

## 4. Cards

### 4.1 Score
Grid `md:grid-cols-[minmax(180px,220px)_minmax(0,1fr)] gap-8 items-center`.
- `ScoreRing` (new, pure SVG): 200px, r 88, stroke 14, track `--divider`, progress `--primary`
  (`--divider` when no score), `stroke-linecap round`, `aria-hidden`; children overlaid: score
  52px/600/-0.04em tabular (`—` when null) and the band pill (`No data yet` pill in muted colours
  when null).
- Right: label "Your visibility score" (section-label style, is the h2); sentence 22px/500:
  "AI assistants mentioned {brand} in **{m} of {t}** answers this month, **{delta phrase}**." Delta
  phrase from `scoreDelta(score, previous)`: `up N from last month` (`--delta-up`),
  `down N from last month` (`--delta-down`), `the same as last month`, `your first full month`
  (no previous), `first results in about 6 hours` (no score; sentence shows `0 of 0`).
  Coverage line as today. `Sparkline` (new, pure SVG, 44px, area fill primary at 8% + 2px line) from
  the 30-day `overall` series, with "Last 30 days" to its right.

### 4.2 Next steps
Header: h2 "What to do next" + right text "Your top {n}, by impact" / "Your top recommendation" /
nothing when empty. Rows: `grid-cols-[28px_minmax(0,1fr)_auto] gap-4 py-4 border-t border-divider`;
number in a 28px muted circle; title 16/500; why 14 muted; pills: impact ("High impact" tint,
"Medium impact"/"Low impact" muted) + category (muted, bordered); **Mark done** button (`h-9
rounded-[10px]` outline, hover primary). Empty: dashed box — "We're preparing your first
recommendations. Check back in about an hour." when no report exists, "You've done everything on the
list. New recommendations arrive after the next check." when all are dismissed. Footer link "See all
recommendations →".

**Dismissals (new):** table `opportunity_dismissals (id uuid pk, brand_id text fk, opportunity_key
text, created_at)` with a unique index on `(brand_id, opportunity_key)`, RLS enabled; migration 0026
generated with drizzle-kit (never migrated by the agent). `opportunityKey(title)` = NFKC, lowercase,
whitespace-collapsed title (the report stores no ids). Server fns in `server/opportunity-dismissals-fn.ts`:
`getDismissedOpportunitiesFn({brandId}) → string[]` and `dismissOpportunityFn({brandId, title}) →
{ dismissed: string[] }` (insert, ignore conflicts); both `requireBrandSession` first.
`pickNextSteps(opportunities, dismissedKeys)` filters dismissed, then ranks and takes five.

### 4.3 Keywords (auto-save)
Header: h2 + "{n} / 20". Helper line as today. Chip box (1px border, `rounded-xl`, min-h 52, muted
background when full): chips `bg-tint text-tint-foreground` 30px with an × button
(`aria-label="Remove {k}"`); inline input: placeholder "Type a keyword and press Enter" (empty),
"Add another…" (some), "You have reached 20 keywords. Remove one to add another." (full, input
disabled). Enter adds (trimmed, max 60 chars, case-insensitive de-dup); × removes. **Every change
saves immediately** through `useUpdateBrandKeywords` (no Save button); the server already coalesces
check enqueues. Status line (`aria-live="polite"`, min-h 18): "Saving…" while pending, "Saved" for
2.5 s after success, "We couldn't save your keywords. Try again." on error. Suggestions block
("Suggested from the questions we ask about you", dashed "+ tag" chips, max 10, tags ≤ 60 chars not
already chosen) shows while fewer than 8 keywords are set.

### 4.4 Match
Results: headline 28px "**{present} of {total}** keywords found on your site — {pct} %" + band pill;
explanation line; groups in order Missing → Weak → Found, each with uppercase label + count, rows
`grid-cols-[minmax(0,1fr)_auto]`: keyword 15/500; status `icon + word` coloured by band tokens
(Circle / Warning / Check icons); detail line: found+heading → "Found in a heading on {host}{path}",
found+body → "Found in body text on …", weak → "Found once, in body text on …" (link to the page),
missing → "Add it to a page title or heading." Footer line "Checked {ago} · [Check again]" (button
disabled while running). Pending: three pulsing bars + "Checking your website for your keywords. This
takes a few minutes." No keywords: dashed box "Add a few business keywords first and we'll check whether
your website uses them." Stale note kept.

### 4.5 Engines
Two columns (`repeat(auto-fit,minmax(380px,1fr))`, gap 32). Left: header labels "AI assistant / You /
Best competitor" (uppercase 12px) and rows `grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1.6fr)_auto]`:
24px muted tile holding the `ModelIcon` + name; your rate bold; rival "{name} **{rate}**" or "—"; tag
pill You lead (good) / Close (ok) / They lead (low); when the brand has no competitors configured every
row's pill is "Add competitors" (tint) linking to Competitors settings. Right: "Who AI assistants
mention most" + native `<select>` (All engines + one option per engine row, by model label) driving
`useShareOfVoice(undefined, { model })`; top 5 rows `grid-cols-[120px_minmax(0,1fr)_44px]`: name
(bold + tint "You" pill for the brand), 12px bar (`--divider` track, `--primary` fill for the brand,
`--dashed` for others, width relative to the leader), percentage; "Full breakdown →".

## 5. i18n

New/changed keys under `home.*` and `top-bar.*` in **both** `en.json` and `tr.json`. Existing keys
whose English text changes are edited in place.

## 6. Tests
`sparklinePath`, `scoreDelta`, `opportunityKey`, `pickNextSteps` with dismissals, `initials`.
Gate: lint, full unit suites, `turbo run build`. Browser pass remains with the operator (no `.env`).

## 7. Out of scope
Advanced pages beyond the token refresh; dark mode; mobile breakpoints beyond the current wrap; the
mock's "in the footer / in navigation" match details (the checker does not record page sections).
