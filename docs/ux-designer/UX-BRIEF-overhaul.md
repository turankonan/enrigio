# Enrigio UI overhaul — UX brief

Date: 2026-10-20 · Owner: Rigosis product · Status: brief for design, implementation not started

## 1. Goal

Redesign the Enrigio web app so a non-technical business owner can open it, see their brands at the top,
pick one, and understand within ten seconds how visible that brand is in AI answers and what to do about it.
The new interface should share nothing visually with the current one (a forked, sidebar-driven analytics
dashboard).

- **Primary user:** a small or mid-size business owner or marketing manager with no SEO background.
- **Secondary user:** an agency analyst who needs the detailed pages. Those pages move under an **Advanced** menu.

Ease of use is the top priority. If a screen needs a tooltip to be understood, it is not done.

**What the product measures.** Enrigio sends a brand's tracked questions to AI assistants (ChatGPT, Gemini,
Claude, Perplexity, Copilot, Grok, Google AI Overviews and others), records whether the brand was mentioned,
in what position, with what sentiment, and which sources were cited.
The visibility score is: answers that mention the brand ÷ all answers, as a percentage.

## 2. Brand assets and tokens

Source: `enrigio-logo-kit.zip` (repo root; 41 files, SVG + PNG). The mark is an indigo lowercase "e" ring
with an orange four-point sparkle; the wordmark is a geometric sans in near-black.

| Token  | Value     | Use |
|--------|-----------|-----|
| Indigo | `#2B2BD9` | Primary actions, links, focus ring, selected brand card, score ring |
| Orange | `#FF7A3D` | Sparkle, positive deltas, at most one accent per screen |
| Night  | `#0B0B1A` | Headings, body text, dark surfaces |
| Light  | `#F5F5FA` | Page background |
| White  | `#FFFFFF` | Cards |

Kit contents: horizontal (`yatay`) and stacked (`dikey`) lockups in full colour, white, black, and on
light / night / indigo backgrounds; mark only (`isaret`); app icon on indigo and night; favicons at 16, 32,
180, 512 px; round profile image. No type specimen is included. Geist Sans is already installed in the
app and is the default typeface unless you propose otherwise.

Superseded: the current green palette, the "AnswerEcho" text wordmark, and the earlier Rigosis green
rebrand sheet (`docs/ux-designer/PLAN.md`).

Accessibility rules:
- Indigo on white passes AA for text (~8:1). Orange on white does not (~2.6:1): orange never carries text.
- Status is never shown by colour alone; always pair with a word or icon.
- Light mode only in this pass. Night-background logo variants exist for a later dark mode.

## 3. Information architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [e✦ enrigio]   ┌────────┐ ┌────────┐ ┌────────┐ ┌───┐     Advanced ▾  👤 │
│                │ Acme   │ │ Beta   │ │ Gamma  │ │ + │                    │
│                │  42% ▲ │ │  17% ▼ │ │  63% ▲ │ └───┘                    │
│                └────────┘ └────────┘ └────────┘                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   1. Your visibility score                                               │
│   2. What to do next                                                     │
│   3. Your business keywords                                              │
│   4. Do your website and keywords match?                                 │
│   5. AI engines and competitors                                          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Top bar (always visible)**
- Logo mark + wordmark, left.
- **Brand strip:** one card per brand in the organisation. Card shows brand name, site favicon, current
  visibility score, and a trend arrow versus the previous period. The selected brand is outlined in indigo.
  Clicking a card loads that brand's Home. An "add brand" card closes the strip. Horizontal scroll when
  more than fit; the strip collapses to a dropdown on narrow screens.
- **Advanced** menu, right: every existing detailed page (see list below). Nothing technical appears
  outside this menu.
- **User menu:** organisation switcher, team, billing, sign out.

**No sidebar.** The brand Home is the only page a basic user ever needs.

**Advanced menu contents** (existing pages, restyled, otherwise unchanged in this pass):
Visibility detail · Share of voice · Query fan-out · Citations · Prompts · Brand settings · Competitors ·
Tracked AI engines · Evaluation market · Organisation settings · API keys · API reference · MCP · Admin.

**Routes stay as they are.** `/app/org/{org}/brand/{brand}` is the brand Home; the detailed pages keep
their current paths under the same prefix.

## 4. The five Home sections

Design each as a self-contained card. Order is fixed. Data noted per section is what the backend can
supply today or will add for this overhaul; do not design for data not listed.

### 4.1 Your visibility score

The first thing on the page and the largest element.

- One big number (0–100 %) in a ring or arc, with a three-step band and a word: **Low** (0–19),
  **OK** (20–49), **Good** (50+). Thresholds are placeholders; design must allow them to change.
- One plain sentence under it, filled from data:
  "AI assistants mentioned Acme in **42 of 100** answers this month, **up 5** from last month."
- Secondary line: "Seen in N of M questions you track."
- A small sparkline of the last 30 days is acceptable; no axis labels, no legend.

Data available: score, previous-period score, mentioned count, total count, question coverage (N of M),
branded vs non-branded split, 30-day daily series, sentiment split, average rank when mentioned.
Show only what the basic user needs; the rest is in Advanced.

### 4.2 What to do next

A checklist of the **top five** recommendations, ordered by priority.

- Each item: a verb-first title ("Add a pricing page that answers 'how much does X cost'"), one line of
  why, an **Impact** chip (High / Medium / Low), and a category chip (New content · Improve a page ·
  Get mentioned elsewhere · Social · Website readiness).
- A "Mark done" control per item; done items drop out of the five. Design it now; engineering ships it
  in a later pass.
- Footer link: "See all recommendations" → Advanced › Opportunities.
- Empty state: "We're preparing your first recommendations. Check back in about an hour."

Data available: 8–12 generated opportunities per brand, each with title, why, category, priority,
related questions, and citation evidence. Status (done / dismissed) is new and will be added.

### 4.3 Your business keywords

Up to **20** short phrases the user types to describe what they sell. These feed section 4.4.

- Chip input: type, press Enter, chip appears. Counter "12 / 20". Remove on ×.
- Helper text in one line: "Words customers would use to find a business like yours."
- Suggestion row on first visit: up to 10 suggested phrases derived from the brand's existing tracked
  questions, each addable in one click.
- Save is automatic; show a quiet "Saved" confirmation.

Data: new `keywords` field on the brand (max 20, each ≤ 60 characters). Suggestions come from existing
question tags.

### 4.4 Do your website and keywords match?

Shows how many of the keywords from 4.3 actually appear on the brand's website.

- Headline: a percentage ("**7 of 12** keywords found on your site — 58 %") with the same Low / OK / Good
  band as 4.1.
- One sentence: "AI assistants describe businesses using the words on their websites. Missing keywords
  are the easiest wins."
- Keyword list, three groups in this order: **Missing** (not found), **Weak** (found once, or only in
  navigation/footer), **Found** (in a heading or body text). Each row: keyword, status word + icon,
  and for Found/Weak the page it was found on as a link.
- Per missing keyword, one suggested action: "Add to a page title or heading."
- Timestamp: "Checked 2 days ago · Check again" (button; re-check takes a few minutes).
- Empty state when 4.3 has no keywords: point to 4.3. Pending state while the first check runs.

Data: new background job. It reuses the pages the site audit already fetches (home page plus the pages
AI engines cite), does plain text matching, and returns per-keyword status, page URL, and match
location. No semantic or AI scoring in this pass.

### 4.5 AI engines and competitors

Answers "where am I strong, where am I weak, and who is beating me."

- A row per tracked AI engine: engine logo + name, **your score**, **best competitor name + score**, and a
  tag: **You lead** / **Close** / **They lead**. Sort by your score descending.
- Below it, an overall leaderboard: you and your competitors ranked by share of voice across all engines,
  as a horizontal bar list with the brand's own bar in indigo and competitors in grey.
- A toggle "All engines ▾" to filter the leaderboard to one engine.
- Footer link: "Full breakdown" → Advanced › Share of voice.

Data available: per-engine visibility for the brand and each competitor; share-of-voice totals; trend
versus previous period; up to ~10 tracked engines; competitor list from brand settings.

## 5. Copy and simplicity rules

- Write for someone who has never heard "SEO", "LLM", "citation" or "prompt". Say "AI assistants",
  "questions we ask them", "sources they link to".
- Every number gets a sentence that says what it means. Never a bare metric with a label.
- One verb per action label. "Check again", "Add keyword", "Mark done".
- No jargon anywhere outside Advanced. Terms that stay technical (model names, API, MCP, market key)
  live only inside Advanced pages.
- Three-step bands (Low / OK / Good) everywhere a score appears; same colours, same words.
- Time is relative and rounded: "2 days ago", "this month", never ISO dates on Home.
- Copy is English; Turkish follows through the existing translation files, so avoid text baked into images.

## 6. States to design

| Screen / section | States needed |
|---|---|
| Brand strip | 1 brand · 3 brands · 8+ brands (overflow) · brand still being set up (no score yet) |
| Home, new brand | Set-up wizard (website → confirm name, competitors, questions) replaces sections 1–5 until done |
| Home, brand set up < 24 h | Sections 1 and 5 show "First results in about N hours"; 2 shows preparing state; 3 and 4 usable |
| 4.1 score | Low / OK / Good · no previous period · no data |
| 4.2 actions | Five items · fewer than five · all done · generating |
| 4.3 keywords | Empty with suggestions · partial · at 20 (input disabled with reason) |
| 4.4 match | Not yet checked · checking · results · site unreachable |
| 4.5 engines | Full · competitors not configured (prompt to add) · one engine only |
| Global | Loading skeletons per card, never a full-page spinner · error per card with "Try again" |
| Narrow / mobile | Strip becomes a dropdown; cards stack; tables become lists |

## 7. Deliverables, constraints, out of scope, open questions

**Deliverables**
1. Figma (or equivalent) frames for: top bar + brand strip; Home with all five sections; each state in
   section 6; the Advanced menu open; one restyled Advanced page (Share of voice) as the pattern for the rest.
2. A token sheet: colours, type scale, spacing, radius, elevation, chip and band styles, in CSS-variable
   form so engineering can paste into `apps/web/src/styles.css`.
3. Component inventory mapped to existing shadcn/Base UI components (card, badge, tabs, dialog, tooltip,
   chart, table, tags-input, progress are available); flag anything new.
4. Logo placement spec: which kit file goes where (top bar, favicon set, app icon, OG image, email header).

**Constraints**
- Tailwind 4 + shadcn-style components; Recharts for charts. Keep designs implementable with those.
- No new routes for Home; Advanced pages keep their current layouts and only take the new theme.
- Light mode only. Responsive down to 360 px wide.
- WCAG AA contrast for all text; keyboard-reachable brand strip and menus.

**Out of scope for this pass**
- Dark mode. Multi-market comparison (designed separately, deferred). Paid placement of any kind.
- Redesigning the Advanced pages beyond theme. Marketing site. Email templates beyond logo swap.

**Open questions for the designer**
1. Brand strip: show every brand's score at once (default) or only the selected brand's?
2. Should 4.3 and 4.4 merge into one card ("Keywords & website match") or stay separate as drafted?
3. Three-step band wording: Low / OK / Good, or Needs work / Fair / Strong?
4. Typeface: keep Geist Sans or propose one closer to the wordmark?

**References in the repo**
- Current UI: `apps/web/src/components/app-sidebar.tsx`, `apps/web/src/routes/_authed/app/org/$org/brand/$brand/index.tsx`
- Score definition and worked example: `docs/CUSTOMER-FEEDBACK-REVIEW.md`
- Product phase status: `docs/maya-gap-status.md`
- Logo kit: `enrigio-logo-kit.zip`
