# Rigosis rebrand — implementation plan

Sources: `AnswerEcho Rebrand.dc.html` (design sheet, authoritative for values),
`UX-BRIEF.md` (scope). Decisions taken 2026-09-17: Crisp widget **removed**,
docs links → **rigosis.com path**, login pitch → **AnswerEcho-specific copy**.

## Final tokens (from the sheet — supersede the brief where they differ)

| Token | Value | Notes |
|---|---|---|
| Brand green | `#39b54a` | mark, fills, theme-color; never carries white text |
| Action green | `#277a33` | `--primary`, links, focus ring — 5.4:1 with white (brief's `#2e8b3d` failed at 4.31:1) |
| Ink | `#32373c` | headings, wordmark, glyph on the mark |
| Dark-mode green | `#4ade80` | dark `--primary`; buttons take **ink** text, not white |
| Chart slot 1 | `#1f7a3d` | deep green, NOT brand green — luminance separation under deuteranopia |
| Type | Ubuntu Bold (display/wordmark), Ubuntu Medium (headings), Cabin (body/report prose), **system stack kept for dense data UI** (tables, filters, axis labels) |

## Steps — one commit each, in order

1. **Brand constants + fonts** — `packages/config/src/constants.ts`:
   `ANSWERECHO_BRAND_COLOR`/`ANSWERECHO_THEME_COLOR` → `#39b54a`,
   `ANSWERECHO_BRAND_FONT` → `"Ubuntu"`. Add `@fontsource/ubuntu` (+ Cabin if
   used in-app), drop `@fontsource/titan-one`. Old packages, so
   `minimumReleaseAge` won't block.
2. **Icons** — `apps/web/scripts/generate-brand-icons.tsx`: embed Ubuntu Bold
   WOFF2 in place of Titan One; mark = lowercase "a" in ink on the green
   rounded square ("mark A" on the sheet). Run `pnpm generate-icons`; confirm
   favicon/apple-touch/maskable set all regenerate.
3. **Wordmark** — `apps/web/src/components/logo.tsx` (47 lines): Ubuntu Bold,
   "Answer" in ink / "Echo" in action green; dark mode uses white + `#4ade80`.
4. **Theme** — `apps/web/src/styles.css` (and check
   `packages/ui/src/styles/globals.css` for duplicated tokens): light
   `--primary` → `#277a33` (as oklch), `--primary-foreground` white; dark
   `--primary` → `#4ade80`, foreground **ink**. Verify focus rings, links,
   charts' `var(--color-*)` fallbacks in both themes.
5. **Login** — `apps/web/src/components/auth/sales-panel.tsx`: replace
   customer logos + G2 badge with the pitch line
   *"See how AI answers talk about your brand."* and footer
   *"AnswerEcho by Rigosis"*. Then delete
   `packages/ui/src/brand/customers.tsx` / `g2-rating.tsx` if nothing else
   imports them.
6. **Crisp removal** — delete `apps/web/src/lib/crisp.ts` + its call sites and
   tests, drop `CRISP_WEBSITE_ID` from constants.
7. **Docs links** — `PROVIDERS_DOCS_URL` → `https://www.rigosis.com/answerecho/docs/providers`,
   `API_DOCS_URL` → `https://www.rigosis.com/answerecho/docs/api`.
   (404 until published — accepted 2026-09-17.)
8. **OG images** — `packages/og/src/render.tsx`: ink ground, ring texture,
   all-white wordmark, 1200×630 per the sheet's "Shared report & OG" frame.
9. **Email** — `packages/deployment/src/email-templates.ts`: sender + footer
   "AnswerEcho by Rigosis", humanist font fallback stack.
10. **Chart slot 1** — `DEFAULT_CHART_COLORS[0]` → `#1f7a3d`, slots 2+
    untouched. Gate on CVD check (below) before merging.

## Verification gates

- Steps 1–4: `pnpm generate-icons`, brand-kit + login + app-sidebar Storybook
  stories, light **and** dark.
- Step 10: Chrome DevTools vision-deficiency emulation (deuteranopia +
  protanopia) on a real multi-series chart story — the sheet's matrix is an
  approximation, not the test.
- The sheet's three rules, checked on every touched surface: no white text on
  `#39b54a`; status never by colour alone; `#277a33` never used as text on
  dark backgrounds.
- Finish: `node_modules/.bin/turbo run test build`, `pnpm lint`, deploy to the
  Render demo and eyeball login → dashboard → a shared report.
