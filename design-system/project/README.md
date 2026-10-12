# AnswerEcho

AnswerEcho is Rigosis's AI visibility platform: it tracks how AI answer engines (ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews) mention, cite, and describe brands. The design system is measurement-first and corporate — "if you can't measure it, you can't manage it." No mascots, no playful display type; the data is the personality.

The UI is a forked shadcn/Tailwind dashboard reskinned with Rigosis identity. Layout, navigation and flows are deliberately upstream; this system governs color, type, iconography and the shared component library (`@workspace/ui`).

## Identity

- **Product name:** AnswerEcho, attributed as "AnswerEcho by Rigosis" on the login screen, report footers and email footers. UI copy is otherwise unbranded.
- **Wordmark:** "AnswerEcho" set in Ubuntu Bold, `ink` (#32373c) with the "Echo" half in `action-green` (light) / `primary` (dark). Never set the wordmark in the UI sans.
- **Mark:** lowercase "a" glyph on the `brand-green` field (see Logos).

## Color rules

1. **`brand-green` (#39b54a) never carries text.** It is a fill color only — the logo field, highlights, decorative accents. White on brand green is 2.9:1 and fails AA.
2. **Interactive green is `primary`:** action green #277a33 in light mode (5.4:1 with white), a #4ade80-range green in dark mode that takes **ink text**, not white. Focus rings follow `ring` = `primary`.
3. **Green is both the brand accent and the conventional success color**, so status indicators must always pair color with an icon or label — never color alone.
4. Neutrals are the stock shadcn zinc scale; don't invent new grays.
5. Product charts use the 11-hue categorical palette (`cat-1`…`cat-11`), anchored to brand green in slot 1. The hue *order* preserves color-blind separation (tested under protanopia/deuteranopia) — assign series in order, never shuffle. `DEFAULT_CHART_COLORS` expands these into 55 colors across five lightness tiers.

## Typography

- **Geist Sans** is the UI face — the dashboard's base size is 14px (`body`). Weights 400/500/600 only.
- **Geist Mono** for code, API paths, IDs and aligned numbers (`tabular-nums` in tables).
- **Ubuntu Bold (700)** exists solely for the wordmark; the app ships no other Ubuntu weight. Don't use it for headings or UI chrome.

## Iconography

Interface icons are **Phosphor** (`@phosphor-icons/react`), regular weight, sized 16–20px to match text. Tabler and Lucide were retired — don't reintroduce them. Status icons accompany every color-coded state (rule 3 above).

## Components

The live components are shadcn-based React in `packages/ui/src/components` and are consumed as `@workspace/ui` inside the monorepo — install new ones with the shadcn CLI, never hand-create them. The previews here are static renditions styled from the tokens, for reference outside the codebase.

Full inventory: alert, avatar, badge, breadcrumb, button, calendar, card, chart, checkbox, collapsible, combobox, command, dialog, dropdown-menu, form, input-group, input, kbd, label, navigation-menu, popover, progress, select, separator, sheet, sidebar, skeleton, spinner, switch, table, tabs, tags-input, textarea, tooltip.

## Not synced

- Components: read-only sync — no React bundle was built. Button, Badge, Card and Input have hand-written static previews; the remaining 30 components are listed above but have no cards.
- `DEFAULT_CHART_COLORS` tiers 2–5 (44 derived colors) live only in `packages/config/src/constants.ts`.
- The logo SVGs' embedded Ubuntu font was stripped on upload; `answerecho-icon-512.png` is the faithful rendering of the mark.
