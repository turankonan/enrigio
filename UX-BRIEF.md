# UX brief — Rigosis branding for Enrigio

## Objective

Reskin the Enrigio dashboard (forked Elmo UI) so it reads as a Rigosis
product: name, logo, color, type, and the shareable surfaces (reports, OG
images, emails) — without redesigning layout or flows.

## Brand foundation (from rigosis.com)

| Token | Value | Notes |
|---|---|---|
| Primary green | `#39b54a` | Rigosis accent; too light for white text (≈2.9:1) — use only for fills/highlights |
| Action green | `#2e8b3d` (derived) | Darkened primary for buttons/links; passes AA on white |
| Ink | `#32373c` | Rigosis dark slate — headings, wordmark |
| Background | `#ffffff` / existing neutral scale | Keep the shadcn neutrals |
| Heading font | Ubuntu | Rigosis site font; use Bold for the wordmark |
| Body font | Cabin, or keep the app's current UI font | Cabin is the Rigosis body face; keeping the dashboard font is acceptable — data UIs live and die on legibility |

Tone: "if you can't measure it, you can't manage it" — measurement-first,
corporate, no mascots. That means retiring the playful Titan One display font
entirely.

## Voice

Product name is **Enrigio**, attributed as "Enrigio by Rigosis" on the
login screen, report footers, and email footers. UI copy stays as-is.

## Scope, in priority order

**P1 — identity (blocks the demo)**
1. `packages/config/src/constants.ts` — `ENRIGIO_BRAND_COLOR` and
   `ENRIGIO_THEME_COLOR` → `#39b54a`; `ENRIGIO_BRAND_FONT` → `Ubuntu`
   (add `@fontsource/ubuntu`, drop `@fontsource/titan-one`).
2. `apps/web/scripts/generate-brand-icons.tsx` — swap the embedded Titan One
   WOFF2 for Ubuntu Bold, regenerate every icon in `apps/web/public/icons/`
   (favicon, apple-touch, maskable set). Simple mark: lowercase "a" or an
   echo/soundwave glyph on the green.
3. `apps/web/src/components/logo.tsx` — wordmark "Enrigio" in Ubuntu Bold,
   ink `#32373c`, green accent on the "Echo" half or the mark.
4. Primary action color in the web app theme (shadcn `--primary`) → action
   green; verify focus rings and links follow.

**P2 — shareable/outbound surfaces (seen by demo stakeholders)**
5. `packages/og/` — OG images for shareable reports: new mark, green accent.
6. `apps/web/scripts/generate-brand-kit.tsx` + `apps/web/src/stories/brand-kit.stories.tsx` — regenerate.
7. `packages/deployment/src/email-templates.ts` — sender name/branding
   ("Enrigio by Rigosis").
8. `DEFAULT_CHART_COLORS` (constants.ts) — replace only slot 1 (`#2563eb` →
   a green that keeps the documented color-blind separation; test the first
   four under protanopia/deuteranopia before committing — hue order there is
   load-bearing). Leave the other 10 hue families alone.

**P3 — de-Elmo the leftovers**
9. `apps/web/src/components/auth/sales-panel.tsx` and
   `packages/ui/src/brand/customers.tsx` / `g2-rating.tsx` — upstream's
   customer logos and G2 rating. Remove the panel or replace with a one-line
   Rigosis value prop; do not ship someone else's social proof.
10. `CRISP_WEBSITE_ID` (constants.ts) — upstream's support-chat ID. Replace
    with a Rigosis Crisp ID or remove the widget.
11. `PROVIDERS_DOCS_URL` / `API_DOCS_URL` now point at `enrigio.com`,
    which we don't own — repoint to wherever docs will live (e.g.
    `rigosis.com/enrigio/docs`) or hide the links until docs exist.

## Accessibility rules

- All text on green uses the derived action green or white-on-`#2e8b3d`; never
  white on `#39b54a`.
- Green is now the brand accent **and** the conventional success color — status
  indicators must keep icons/labels, not color alone.
- Re-check dark mode after the `--primary` swap; the green needs a lighter
  dark-mode variant (~`#4ade80` range) to hold contrast on dark surfaces.

## Out of scope

Layout, navigation, chart types, onboarding flow, and copy rewrites — the
fork's UX is the reason we adopted it. Whitelabel mode already exists for
per-customer branding; this brief only sets the product default.

## Definition of done

Login page, sidebar, favicon/browser tab, a shared report link, and one
transactional email all show Enrigio/Rigosis identity with zero Elmo
visual remnants, in light and dark mode.
