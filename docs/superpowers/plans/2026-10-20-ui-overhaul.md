# UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sidebar dashboard with a top bar + brand strip + one five-card brand Home, add brand keywords and a keyword↔website check, and rebrand to the Enrigio logo kit.

**Architecture:** The TanStack Start app keeps its routes and server functions. A new shell (`TopBar`) replaces `AppSidebar`; the brand index route renders `BrandHome`, whose cards reuse existing hooks plus three new server functions. Keywords get a column on `brands`; the keyword check is a pg-boss job in `packages/lib/src/keywords` mirroring the AXO site audit.

**Tech Stack:** React 19, TanStack Router/Start/Query, Tailwind 4, shadcn + Base UI (`@workspace/ui`), Drizzle + Postgres, pg-boss, Vitest, Biome, pnpm + Turborepo, Node 24.

**Spec:** `docs/superpowers/specs/2026-10-20-ui-overhaul-design.md` (plus UX brief `docs/ux-designer/UX-BRIEF-overhaul.md`).

## Global Constraints

- Always `pnpm`; never `npm`, `yarn`, `npx`. Never touch `pnpm-workspace.yaml` supply-chain settings.
- Never run `drizzle-kit migrate`. `drizzle-kit generate` (writes files only) is allowed and required in Task 7.
- Commit subjects: plain imperative sentences, no prefixes (`add brand keywords column`, not `feat: ...`).
- Comments explain why only; never restate code; no "previously" comments; no issue numbers in code.
- Never add `biome-ignore`. Run `pnpm lint` before handing back; `pnpm lint:fix` for mechanical fixes.
- Tests test behaviour (outcomes, rules, failure modes), not implementation shape.
- Brand tokens: indigo `#2B2BD9`, orange `#FF7A3D`, night `#0B0B1A`, light `#F5F5FA`, white `#FFFFFF`. Orange never carries text. Status never by colour alone. Light mode only.
- All user-facing strings go through `t()` from `@/lib/i18n` with keys added to `apps/web/src/locales/en.json` only (Turkish falls back to English).
- Keep database modules out of client chunks: hooks import only `*-fn.ts` server-function wrapper modules.
- Mark deliberate shortcuts with a `// ponytail:` comment naming the ceiling and the upgrade path.
- Repo root: `/home/rigosis/projects/enrigio`. Logo kit extracted at `/tmp/claude-1000/-home-rigosis-projects-enrigio/9e54d5ec-31fa-4411-bd13-070e8cafe741/scratchpad/logokit/enrigio-logo-kit/` (if missing: `unzip enrigio-logo-kit.zip` from the repo root into that directory).
- Branch: `ui-overhaul` (already created). Work there; one commit per task.
- Deliberate deviation from the spec: no new Storybook stories in this pass (the sidebar story is deleted, nothing replaces it); add them when the designer needs fixtures.

---

### Task 1: Theme tokens, fonts, logo and favicons

**Files:**
- Modify: `apps/web/src/styles.css` (imports at top, `:root` block)
- Modify: `apps/web/src/components/logo.tsx`
- Modify: `packages/config/src/constants.ts:30-37` and `DEFAULT_CHART_COLORS[0..1]`
- Modify: `packages/og/src/render.tsx:7,17`
- Create: `apps/web/public/brand/enrigio-horizontal.svg`, `enrigio-horizontal-white.svg`, `enrigio-mark.svg`, `enrigio-mark-white.svg`
- Replace: every file in `apps/web/public/icons/`
- Delete: `apps/web/scripts/generate-brand-icons.tsx`, `apps/web/scripts/generate-brand-kit.tsx`, their `package.json` script entries, and any story that imports them

**Interfaces:**
- Produces: `Logo` component rendering `/brand/enrigio-horizontal.svg`; CSS token `--color-brand-orange` (class `text-brand-orange`, `bg-brand-orange`).

- [ ] **Step 1: Copy kit assets**

```bash
K=/tmp/claude-1000/-home-rigosis-projects-enrigio/9e54d5ec-31fa-4411-bd13-070e8cafe741/scratchpad/logokit/enrigio-logo-kit
W=/home/rigosis/projects/enrigio/apps/web/public
mkdir -p $W/brand
cp $K/enrigio-yatay-renkli-seffaf.svg $W/brand/enrigio-horizontal.svg
cp $K/enrigio-yatay-beyaz-seffaf.svg  $W/brand/enrigio-horizontal-white.svg
cp $K/enrigio-isaret-renkli-seffaf.svg $W/brand/enrigio-mark.svg
cp $K/enrigio-isaret-beyaz-seffaf.svg  $W/brand/enrigio-mark-white.svg
rm $W/icons/*
cp $K/enrigio-app-ikon-indigo.svg $W/icons/enrigio-icon.svg
cp $K/enrigio-app-ikon-indigo.svg $W/icons/enrigio-icon-maskable.svg
cp $K/enrigio-favicon-180.png $W/icons/apple-touch-icon.png
python3 -I - "$K" "$W/icons" <<'EOF'
import sys
from PIL import Image
kit, out = sys.argv[1], sys.argv[2]
app = Image.open(f"{kit}/enrigio-app-ikon-indigo.png").convert("RGBA")
for size in (96, 192, 512):
    app.resize((size, size), Image.LANCZOS).save(f"{out}/enrigio-icon-{size}.png")
for size in (192, 512):
    app.resize((size, size), Image.LANCZOS).save(f"{out}/enrigio-icon-maskable-{size}.png")
fav32 = Image.open(f"{kit}/enrigio-favicon-32.png").convert("RGBA")
fav32.save(f"{out}/favicon.ico", sizes=[(16, 16), (32, 32)])
EOF
ls $W/icons
```
Expected: `apple-touch-icon.png enrigio-icon-192.png enrigio-icon-512.png enrigio-icon-96.png enrigio-icon-maskable-192.png enrigio-icon-maskable-512.png enrigio-icon-maskable.svg enrigio-icon.svg favicon.ico`.

- [ ] **Step 2: Delete the icon/kit generator scripts**

```bash
cd /home/rigosis/projects/enrigio
rm apps/web/scripts/generate-brand-icons.tsx apps/web/scripts/generate-brand-kit.tsx
grep -l "scripts/generate-brand" apps/web/src/stories/*.tsx | xargs -r rm
```
In `apps/web/package.json` remove the two lines `"generate-icons": ...` and `"generate-brand-kit": ...`.

- [ ] **Step 3: Fonts and tokens in `apps/web/src/styles.css`**

Directly under the line `@import "tw-animate-css";` add:
```css
@import "@fontsource/geist-sans/400.css";
@import "@fontsource/geist-sans/500.css";
@import "@fontsource/geist-sans/600.css";
@import "@fontsource/geist-sans/700.css";
@import "@fontsource/geist-mono/400.css";
```
Inside the `@theme inline { ... }` block add one line next to `--color-background`:
```css
	--color-brand-orange: var(--brand-orange);
```
Replace the whole light `:root { ... }` block (the one that starts with `--radius: 0.625rem;`) with:
```css
:root {
	--font-geist-sans: "Geist Sans", ui-sans-serif, system-ui, sans-serif;
	--font-geist-mono: "Geist Mono", ui-monospace, monospace;
	--radius: 0.75rem;
	--background: #f5f5fa;
	--foreground: #0b0b1a;
	--card: #ffffff;
	--card-foreground: #0b0b1a;
	--popover: #ffffff;
	--popover-foreground: #0b0b1a;
	--primary: #2b2bd9;
	--primary-foreground: #ffffff;
	--secondary: #ececf6;
	--secondary-foreground: #0b0b1a;
	--muted: #ececf6;
	--muted-foreground: #5c5c73;
	--accent: #ececf6;
	--accent-foreground: #0b0b1a;
	--destructive: #d92b2b;
	--border: #e2e2ee;
	--input: #e2e2ee;
	--ring: #2b2bd9;
	/* Orange is the kit's sparkle colour: fills and deltas only, never text (2.6:1 on white). */
	--brand-orange: #ff7a3d;
	--chart-1: #2b2bd9;
	--chart-2: #ff7a3d;
	--chart-3: #0b0b1a;
	--chart-4: #8f8fe8;
	--chart-5: #5c5c73;
	--sidebar: #ffffff;
	--sidebar-foreground: #0b0b1a;
	--sidebar-primary: #2b2bd9;
	--sidebar-primary-foreground: #ffffff;
	--sidebar-accent: #ececf6;
	--sidebar-accent-foreground: #0b0b1a;
	--sidebar-border: #e2e2ee;
	--sidebar-ring: #2b2bd9;
}
```
Leave the `.dark { ... }` block and the Ubuntu `@font-face` untouched (the OG image and chart export still render the Ubuntu wordmark).

- [ ] **Step 4: Constants and OG colours**

`packages/config/src/constants.ts`: set
```ts
export const ENRIGIO_BRAND_COLOR = "#2B2BD9";
export const ENRIGIO_BRAND_FONT = "Ubuntu";
export const ENRIGIO_THEME_COLOR = "#2B2BD9";
export const ENRIGIO_BACKGROUND_COLOR = "#F5F5FA";
/** Night — headings and body text. */
export const ENRIGIO_INK_COLOR = "#0B0B1A";
/** Indigo — buttons, links, focus ring; 8:1 on white. */
export const ENRIGIO_ACTION_COLOR = "#2B2BD9";
```
and change the first two entries of `DEFAULT_CHART_COLORS` to `"#2b2bd9"` and `"#ff7a3d"`, and the first two entries of its "Dark" tier (currently `"#14582b"`, `"#bb8807"`) to `"#1b1ba8"` and `"#cc5a1f"`. Update the comment above the array: replace "anchored to the brand green" with "anchored to the brand indigo".

`packages/og/src/render.tsx`: `ACCENT_COLORS = ["#2B2BD9", "#FF7A3D", "#8F8FE8", "#1B1BA8"]` and `const INK = "#0B0B1A";`.

- [ ] **Step 5: Logo component**

Replace the Enrigio branch of `apps/web/src/components/logo.tsx` so the file reads:
```tsx
import { useRouteContext } from "@tanstack/react-router";
import { DEFAULT_APP_ICON, DEFAULT_APP_NAME } from "@workspace/config/constants";
import type { ClientConfig } from "@workspace/config/types";
import { cn } from "@workspace/ui/lib/utils";
import type { ComponentPropsWithoutRef } from "react";

interface LogoProps extends ComponentPropsWithoutRef<"div"> {
	iconClassName?: string;
	textClassName?: string;
}

/** Whether the Enrigio lockup renders — drives the wordmark font preload in `__root.tsx`. */
export function usesWordmarkFont(branding: { icon?: string; name?: string } | undefined) {
	const hasCustomBranding =
		Boolean(branding?.icon && branding?.name) &&
		(branding?.icon !== DEFAULT_APP_ICON || branding?.name !== DEFAULT_APP_NAME);
	return !hasCustomBranding;
}

export function Logo({ className, iconClassName, textClassName, ...props }: LogoProps) {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const branding = context.clientConfig?.branding;

	if (usesWordmarkFont(branding)) {
		return (
			<div {...props} className={cn("flex items-center", className)}>
				<img src="/brand/enrigio-horizontal.svg" alt={DEFAULT_APP_NAME} className={cn("h-7 w-auto", iconClassName)} />
			</div>
		);
	}

	return (
		<div {...props} className={cn("flex items-center gap-2", className)}>
			{branding?.icon && (
				<img
					src={branding.icon}
					alt={`${branding.name} logo`}
					className={cn("size-5", iconClassName)}
					fetchPriority="low"
				/>
			)}
			<span className={cn("text-base font-semibold", textClassName)}>{branding?.name}</span>
		</div>
	);
}
```

- [ ] **Step 6: Verify**

```bash
cd /home/rigosis/projects/enrigio
pnpm --filter @workspace/web check-types && pnpm lint && pnpm --filter @workspace/web test
```
Expected: all pass. If `apps/web/src/lib/__tests__/og-image.test.ts` asserts the old green hex values, update those expectations to the new `ACCENT_COLORS`/`INK` values (that test checks the colours reach the image, not which colours).

- [ ] **Step 7: Commit**

```bash
git add -A apps/web/public apps/web/src/styles.css apps/web/src/components/logo.tsx apps/web/package.json apps/web/scripts apps/web/src/stories packages/config/src/constants.ts packages/og/src/render.tsx apps/web/src/lib/__tests__
git commit -m "apply the Enrigio logo kit colours, fonts and icons"
```

---

### Task 2: Score band helper

**Files:**
- Create: `apps/web/src/lib/score-band.ts`
- Create: `apps/web/src/lib/score-band.test.ts`
- Create: `apps/web/src/components/home/band-pill.tsx`
- Modify: `apps/web/src/locales/en.json` (3 keys)

**Interfaces:**
- Produces: `scoreBand(pct: number | null | undefined): ScoreBand | null` with `ScoreBand = "low" | "ok" | "good"`; `<BandPill band={ScoreBand} />`.

- [ ] **Step 1: Write the failing test** `apps/web/src/lib/score-band.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { scoreBand } from "@/lib/score-band";

describe("scoreBand", () => {
	it("is low below 20, ok from 20 to 49, good from 50", () => {
		expect(scoreBand(0)).toBe("low");
		expect(scoreBand(19)).toBe("low");
		expect(scoreBand(20)).toBe("ok");
		expect(scoreBand(49)).toBe("ok");
		expect(scoreBand(50)).toBe("good");
		expect(scoreBand(100)).toBe("good");
	});

	it("has no band without a score", () => {
		expect(scoreBand(null)).toBeNull();
		expect(scoreBand(undefined)).toBeNull();
		expect(scoreBand(Number.NaN)).toBeNull();
	});
});
```

- [ ] **Step 2: Run it** — `cd apps/web && pnpm exec vitest run --project=unit src/lib/score-band.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** `apps/web/src/lib/score-band.ts`

```ts
export type ScoreBand = "low" | "ok" | "good";

// ponytail: fixed thresholds; make them per-deployment config if a customer asks.
export const SCORE_BAND_OK_FROM = 20;
export const SCORE_BAND_GOOD_FROM = 50;

export function scoreBand(pct: number | null | undefined): ScoreBand | null {
	if (pct === null || pct === undefined || Number.isNaN(pct)) return null;
	if (pct < SCORE_BAND_OK_FROM) return "low";
	if (pct < SCORE_BAND_GOOD_FROM) return "ok";
	return "good";
}
```

`apps/web/src/components/home/band-pill.tsx`:
```tsx
import { cn } from "@workspace/ui/lib/utils";
import { t, type TranslationKey } from "@/lib/i18n";
import type { ScoreBand } from "@/lib/score-band";

const STYLE: Record<ScoreBand, string> = {
	low: "bg-rose-100 text-rose-900",
	ok: "bg-amber-100 text-amber-900",
	good: "bg-emerald-100 text-emerald-900",
};

const LABEL: Record<ScoreBand, TranslationKey> = {
	low: "home.band_low",
	ok: "home.band_ok",
	good: "home.band_good",
};

export function BandPill({ band, className }: { band: ScoreBand; className?: string }) {
	return (
		<span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", STYLE[band], className)}>
			{t(LABEL[band])}
		</span>
	);
}
```

Add to `apps/web/src/locales/en.json` (anywhere, keep JSON valid):
```json
	"home.band_low": "Low",
	"home.band_ok": "OK",
	"home.band_good": "Good",
```

- [ ] **Step 4: Run tests** — same command → PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/lib/score-band.ts apps/web/src/lib/score-band.test.ts apps/web/src/components/home/band-pill.tsx apps/web/src/locales/en.json
git commit -m "add visibility score bands"
```

---

### Task 3: Navigation links module and Advanced menu

**Files:**
- Create: `apps/web/src/lib/nav-links.ts` (moved from `app-sidebar.tsx`)
- Create: `apps/web/src/components/advanced-menu.tsx`
- Modify: `apps/web/src/lib/admin-nav.ts:2` (import `NavItem` from `@/lib/nav-links`)
- Modify: `apps/web/src/locales/en.json` (1 key)

**Interfaces:**
- Produces: `NavItem`, `NavGroup`, `brandGroups(organization, brand)`, `organizationGroups(organization, features)`, `advancedGroups(scope, features, viewer)`; `<AdvancedMenu scope={ShellScope} />`.

- [ ] **Step 1: Create `apps/web/src/lib/nav-links.ts`**

Move `NavItem`/`NavGroup` from `components/nav-main.tsx` and `brandGroups`/`organizationGroups` verbatim from `components/app-sidebar.tsx`, then add `advancedGroups`:
```ts
import type { Icon } from "@phosphor-icons/react";
import {
	Briefcase,
	Building,
	Buildings,
	ChartBar,
	Code,
	Cpu,
	CreditCard,
	Key,
	Link as LinkIcon,
	ListChecks,
	Megaphone,
	PlugsConnected,
	Target,
	TreeStructure,
	Users,
} from "@phosphor-icons/react";
import type { LinkProps } from "@tanstack/react-router";
import type { FeaturesConfig } from "@workspace/config/types";
import { brandLinkParams, orgLinkParams } from "@workspace/lib/app-urls";
import type { BrandWithPrompts } from "@workspace/lib/db/schema";
import { adminNavItems } from "@/lib/admin-nav";
import { t } from "@/lib/i18n";
import type { OrganizationSummary } from "@/lib/organizations/types";
import type { ShellScope } from "@/lib/shell-scope";

export interface NavItem {
	title: string;
	link: LinkProps;
	icon?: Icon;
	exact?: boolean;
}

export interface NavGroup {
	label: string;
	items: NavItem[];
}

export function organizationGroups(organization: OrganizationSummary, features?: FeaturesConfig): NavGroup[] {
	// ...body copied verbatim from app-sidebar.tsx...
}

export function brandGroups(organization: OrganizationSummary, brand: BrandWithPrompts): NavGroup[] {
	// ...body copied verbatim from app-sidebar.tsx, but WITHOUT the "overview" item:
	// the brand Home is reached from the brand strip, not from this menu.
}

export function advancedGroups(
	scope: ShellScope,
	features: FeaturesConfig | undefined,
	viewer: { isAdmin: boolean; hasReportAccess: boolean },
): NavGroup[] {
	const reportsEnabled = features?.reportGeneration ?? true;
	const groups: NavGroup[] = [];
	if (scope.organization && scope.brand) groups.push(...brandGroups(scope.organization, scope.brand));
	if (scope.organization) groups.push(...organizationGroups(scope.organization, features));
	const admin = scope.section === "account" ? [] : adminNavItems({ ...viewer, reportsEnabled });
	if (admin.length > 0) groups.push({ label: t("settings.members.role_admin"), items: admin });
	return groups;
}
```
In `brandGroups`, delete the `dashboard` "overview" entry and the `if (brand.onboarded)` push into it; return `[{ label: t("app-sidebar.dashboard"), items: [visibility, shareOfVoice, queryFanOut, citations, opportunities] }, settingsGroup]` only when `brand.onboarded`, else `[]`.

`adminNavItems` imports `NavItem` from `@/components/nav-main` — change to `@/lib/nav-links`. (`nav-links.ts` importing `admin-nav.ts` and vice-versa is a type-only cycle on one side; keep the `admin-nav.ts` import as `import type`.)

- [ ] **Step 2: Create `apps/web/src/components/advanced-menu.tsx`**

```tsx
import { CaretDown, SlidersHorizontal } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Fragment } from "react";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";
import { useViewer } from "@/hooks/use-route-context";
import { t } from "@/lib/i18n";
import { advancedGroups } from "@/lib/nav-links";
import type { ShellScope } from "@/lib/shell-scope";

/** Every detailed page lives here so the Home stays free of technical surfaces. */
export function AdvancedMenu({ scope }: { scope: ShellScope }) {
	const features = useDeploymentFeatures();
	const viewer = useViewer();
	const groups = advancedGroups(scope, features, viewer);
	if (groups.length === 0) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
				<SlidersHorizontal className="size-4" />
				{t("top-bar.advanced")}
				<CaretDown className="size-3.5 opacity-70" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" sideOffset={8} className="min-w-60">
				{groups.map((group, index) => (
					<Fragment key={group.label}>
						{index > 0 && <DropdownMenuSeparator />}
						<DropdownMenuGroup>
							<DropdownMenuLabel className="text-muted-foreground text-xs">{group.label}</DropdownMenuLabel>
							{group.items.map((item) => (
								<DropdownMenuItem key={item.title} render={<Link {...item.link} />} className="cursor-pointer">
									{item.icon && <item.icon className="size-4" />}
									{item.title}
								</DropdownMenuItem>
							))}
						</DropdownMenuGroup>
					</Fragment>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
```
Add `"top-bar.advanced": "Advanced"` to `en.json`.

- [ ] **Step 3: Typecheck** — `pnpm --filter @workspace/web check-types` → PASS (app-sidebar still compiles because it still has its own copies; that is fine until Task 5 deletes it).

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/lib/nav-links.ts apps/web/src/components/advanced-menu.tsx apps/web/src/lib/admin-nav.ts apps/web/src/locales/en.json
git commit -m "add the Advanced navigation menu"
```

---

### Task 4: Detach the user menu from the sidebar

**Files:**
- Modify: `apps/web/src/components/nav-user.tsx`

**Interfaces:**
- Produces: `<NavUser />` with no props, a round avatar trigger that works outside `SidebarProvider`.

- [ ] **Step 1: Rewrite the component head**

In `nav-user.tsx`:
1. Delete the import line of `SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar` and the `NavItem` import; add `import { Button } from "@workspace/ui/components/button";`.
2. Replace the signature with `export function NavUser() {` and delete `showOrganizations`/`adminItems` usages: the organisation switcher always renders; the `adminItems.length > 0 && (...)` block is deleted (admin links now live in the Advanced menu).
3. Delete `const { isMobile, setOpenMobile } = useSidebar();` and `const close = () => setOpenMobile(false);`. Replace every `onClick={close}` with nothing, every `onNavigate={close}` with nothing, and remove the `onNavigate` parameter from `OrganizationSwitcher` and `OrganizationSection` (and the `onClick={onNavigate}` inside them).
4. Replace the outer `<SidebarMenu><SidebarMenuItem><DropdownMenu>` … `</DropdownMenu></SidebarMenuItem></SidebarMenu>` with just `<DropdownMenu>` … `</DropdownMenu>`.
5. Replace the trigger with:
```tsx
<DropdownMenuTrigger
	render={
		<Button
			variant="ghost"
			size="sm"
			aria-label={t("nav-user.account-and-organizations")}
			className="h-10 gap-2 rounded-full pl-1 pr-2 data-popup-open:bg-accent"
		/>
	}
>
	<Avatar className="size-8 rounded-full">
		<AvatarImage src={user.picture} alt={user.name} />
		<AvatarFallback className="rounded-full bg-primary/10 text-primary">
			<User className="size-4" />
		</AvatarFallback>
	</Avatar>
	<CaretUpDown className="size-4 opacity-70" />
</DropdownMenuTrigger>
```
6. Replace the `DropdownMenuContent` props with `className="min-w-64 rounded-lg" align="end" sideOffset={8}`.

- [ ] **Step 2: Typecheck** — `pnpm --filter @workspace/web check-types`. `app-sidebar.tsx` passes `adminItems`/`showOrganizations` to `NavUser`; remove those props there for now (the file is deleted in Task 5).

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/components/nav-user.tsx apps/web/src/components/app-sidebar.tsx
git commit -m "make the user menu independent of the sidebar"
```

---

### Task 5: Top bar, brand strip and the new shell

**Files:**
- Create: `apps/web/src/components/top-bar.tsx`, `apps/web/src/components/brand-strip.tsx`
- Modify: `apps/web/src/routes/_authed.tsx`, `apps/web/src/components/app-shell.tsx`, `apps/web/src/components/site-header.tsx`, `apps/web/src/lib/shell-scope.ts`, `apps/web/src/locales/en.json`
- Delete: `apps/web/src/components/app-sidebar.tsx`, `nav-main.tsx`, `nav-app-info.tsx`, `apps/web/src/stories/app-sidebar.stories.tsx`

**Interfaces:**
- Produces: `<TopBar scope scores? />`, `<BrandStrip organization currentBrandId scores />` with `BrandStripScore = { score: number | null; previousScore: number | null }`; `staticData.bareHeader?: boolean`.

- [ ] **Step 1: `apps/web/src/lib/shell-scope.ts`** — extend the module augmentation:
```ts
declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		shell?: ShellSection;
		/** Home-style pages draw their own heading, so the breadcrumb header stays off. */
		bareHeader?: boolean;
	}
}
```

- [ ] **Step 2: `apps/web/src/components/brand-strip.tsx`**

```tsx
import { ArrowDown, ArrowUp, Plus } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { brandLinkParams, orgLinkParams } from "@workspace/lib/app-urls";
import { cn } from "@workspace/ui/lib/utils";
import { SiteIcon } from "@/components/site-icon";
import { t } from "@/lib/i18n";
import type { OrganizationSummary } from "@/lib/organizations/types";
import { scoreBand } from "@/lib/score-band";

export interface BrandStripScore {
	score: number | null;
	previousScore: number | null;
}

const BAND_TEXT = { low: "text-rose-700", ok: "text-amber-700", good: "text-emerald-700" } as const;

function ScoreLine({ onboarded, entry }: { onboarded: boolean; entry: BrandStripScore | undefined }) {
	if (!onboarded) return <span className="text-xs text-muted-foreground">{t("brand-strip.setting_up")}</span>;
	if (!entry || entry.score === null) return <span className="text-xs text-muted-foreground">—</span>;
	const band = scoreBand(entry.score);
	const delta = entry.previousScore === null ? null : entry.score - entry.previousScore;
	return (
		<span className="flex items-center gap-1 text-sm">
			<span className={cn("font-semibold tabular-nums", band && BAND_TEXT[band])}>{entry.score}%</span>
			{delta !== null && delta !== 0 && (
				<span className={cn("flex items-center text-xs", delta > 0 ? "text-emerald-700" : "text-rose-700")}>
					{delta > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
					{Math.abs(delta)}
				</span>
			)}
		</span>
	);
}

export function BrandStrip({
	organization,
	currentBrandId,
	scores,
}: {
	organization: OrganizationSummary;
	currentBrandId: string | undefined;
	scores: Record<string, BrandStripScore>;
}) {
	return (
		<nav aria-label={t("brand-strip.label")} className="flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto py-2">
			{organization.brands.map((brand) => {
				const active = brand.id === currentBrandId;
				return (
					<Link
						key={brand.id}
						to="/app/org/$org/brand/$brand"
						params={brandLinkParams(organization, brand)}
						aria-current={active ? "page" : undefined}
						className={cn(
							"flex shrink-0 snap-start items-center gap-3 rounded-xl border bg-card px-3 py-2 transition-colors",
							active ? "border-primary ring-2 ring-primary/25" : "border-border hover:bg-accent",
						)}
					>
						<SiteIcon domain={brand.website} size="md" />
						<span className="flex min-w-0 flex-col">
							<span className="max-w-40 truncate text-sm font-medium">{brand.name}</span>
							<ScoreLine onboarded={brand.onboarded} entry={scores[brand.id]} />
						</span>
					</Link>
				);
			})}
			{organization.brandCreation.kind !== "not-offered" && (
				<Link
					to="/app/org/$org/new"
					params={orgLinkParams(organization)}
					className="flex shrink-0 items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
				>
					<Plus className="size-4" />
					{t("brand-strip.add")}
				</Link>
			)}
		</nav>
	);
}
```
If `brandLinkParams` rejects the summary brand type (`OrganizationBrand` has `id`, `slug`, `name`), pass `{ id: brand.id, slug: brand.slug }` instead.

- [ ] **Step 3: `apps/web/src/components/top-bar.tsx`**

```tsx
import { Link } from "@tanstack/react-router";
import { AdvancedMenu } from "@/components/advanced-menu";
import { type BrandStripScore, BrandStrip } from "@/components/brand-strip";
import { DemoModePill } from "@/components/demo-mode-pill";
import { Logo } from "@/components/logo";
import { NavUser } from "@/components/nav-user";
import type { ShellScope } from "@/lib/shell-scope";

export function TopBar({ scope, scores = {} }: { scope: ShellScope; scores?: Record<string, BrandStripScore> }) {
	return (
		<header className="sticky top-0 z-20 border-b bg-card">
			<div className="mx-auto flex min-h-16 max-w-7xl items-center gap-4 px-4 md:px-6">
				<Link to="/app" className="shrink-0">
					<Logo />
				</Link>
				{scope.organization && (
					<BrandStrip organization={scope.organization} currentBrandId={scope.brand?.id} scores={scores} />
				)}
				<div className="ml-auto flex shrink-0 items-center gap-2">
					<DemoModePill />
					<AdvancedMenu scope={scope} />
					<NavUser />
				</div>
			</div>
		</header>
	);
}
```

- [ ] **Step 4: `apps/web/src/components/app-shell.tsx`** — delete `AppShell` and the sidebar import; keep only `PageContent`.

- [ ] **Step 5: `apps/web/src/components/site-header.tsx`** — remove the `SidebarTrigger` and `Separator` elements and their imports, and change the header class to `"bg-background sticky top-16 z-10 flex h-12 shrink-0 items-center border-b"`.

- [ ] **Step 6: `apps/web/src/routes/_authed.tsx`** — replace imports of `AppShell`/`AppSidebar` with `TopBar`, add `useMatches` to the router import, and replace `Shell()`:
```tsx
function Shell() {
	const scope = useShellScope();
	const bareHeader = useMatches({ select: (matches) => matches.some((match) => match.staticData.bareHeader) });

	if (!scope) return <Outlet />;

	return (
		<div className="flex min-h-svh flex-col bg-background">
			<TopBar scope={scope} />
			{scope.section === "account" ? (
				<div className="flex flex-1 flex-col">
					<Outlet />
				</div>
			) : (
				<>
					{!bareHeader && <SiteHeader />}
					<PageContent>
						<Outlet />
					</PageContent>
				</>
			)}
		</div>
	);
}
```

- [ ] **Step 7: Delete the sidebar**
```bash
git rm apps/web/src/components/app-sidebar.tsx apps/web/src/components/nav-main.tsx apps/web/src/components/nav-app-info.tsx apps/web/src/stories/app-sidebar.stories.tsx
grep -rn "app-sidebar\|nav-main\|nav-app-info\|AppShell" apps/web/src --include=*.ts --include=*.tsx
```
Expected: no matches (fix any that appear). `nav-app-info.*` keys in `en.json`/`tr.json` may stay.

Add to `en.json`: `"brand-strip.label": "Your brands"`, `"brand-strip.add": "Add brand"`, `"brand-strip.setting_up": "Setting up"`.

- [ ] **Step 8: Verify**
```bash
pnpm --filter @workspace/web check-types && pnpm lint && pnpm --filter @workspace/web test
```
Then start the app (`pnpm dev`, port 3000) and confirm: top bar with logo, brand cards, Advanced menu and avatar; no sidebar on any page; breadcrumb header still present on Advanced pages.

- [ ] **Step 9: Commit**
```bash
git add -A apps/web/src
git commit -m "replace the sidebar with a top bar and brand strip"
```

---

### Task 6: Brand scores for the strip and the score card

**Files:**
- Modify: `apps/web/src/server/dashboard.ts` (append)
- Create: `apps/web/src/hooks/use-org-brand-scores.tsx`
- Modify: `apps/web/src/components/top-bar.tsx`

**Interfaces:**
- Produces: `getOrgBrandScoresFn({ organizationId, timezone })` → `OrgBrandScore[]`; `useOrgBrandScores(organizationId)` → `{ data: Record<string, OrgBrandScore> | undefined, isLoading }`.

- [ ] **Step 1: Server function** — append to `apps/web/src/server/dashboard.ts` (add `requireAuthSession, requireOrgAccess` to the `@/lib/auth/helpers` import and `shiftDateStr` to the timezone-utils import):
```ts
export interface OrgBrandScore {
	brandId: string;
	/** Mention rate over the last 30 days, 0–100, null before the first run. */
	score: number | null;
	/** Same rate over the 30 days before that. */
	previousScore: number | null;
	totalRuns: number;
	/** Runs that mentioned the brand, derived from the rounded rate. */
	mentionedRuns: number;
	promptsWithMention: number;
	totalPrompts: number;
}

const SCORE_WINDOW_DAYS = 30;

export const getOrgBrandScoresFn = createServerFn({ method: "GET" })
	.validator(z.object({ organizationId: z.string(), timezone: z.string().default("UTC") }))
	.handler(async ({ data }): Promise<OrgBrandScore[]> => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.organizationId);
		const timezone = resolveTimezone(data.timezone);
		const today = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
		const current = { from: shiftDateStr(today, { days: -(SCORE_WINDOW_DAYS - 1) }), to: today };
		const previous = {
			from: shiftDateStr(today, { days: -(2 * SCORE_WINDOW_DAYS - 1) }),
			to: shiftDateStr(today, { days: -SCORE_WINDOW_DAYS }),
		};

		const brandRows = await db
			.select({ id: brands.id, defaultMarketKey: brands.defaultMarketKey })
			.from(brands)
			.where(and(eq(brands.organizationId, data.organizationId), eq(brands.onboarded, true)));

		// ponytail: two summary queries per brand; add one org-wide rollup query past ~20 brands.
		return Promise.all(
			brandRows.map(async (brand) => {
				const marketKey = resolveEffectiveMarket({ defaultMarketKey: brand.defaultMarketKey }).key;
				const enabled = await db
					.select({ id: prompts.id })
					.from(prompts)
					.where(and(eq(prompts.brandId, brand.id), eq(prompts.enabled, true)));
				const promptIds = enabled.map((row) => row.id);
				const [[now], [before]] = await Promise.all([
					getDashboardSummary(brand.id, current.from, current.to, timezone, promptIds, marketKey),
					getDashboardSummary(brand.id, previous.from, previous.to, timezone, promptIds, marketKey),
				]);
				const totalRuns = now?.total_runs ?? 0;
				const score = totalRuns > 0 ? now.avg_visibility : null;
				return {
					brandId: brand.id,
					score,
					previousScore: before?.total_runs ? before.avg_visibility : null,
					totalRuns,
					mentionedRuns: score === null ? 0 : Math.round((totalRuns * score) / 100),
					promptsWithMention: now?.prompts_with_mention ?? 0,
					totalPrompts: now?.total_prompts ?? 0,
				};
			}),
		);
	});
```
Note: `getDashboardSummary` with an empty `promptIds` list applies no prompt filter (it counts every run); that matches the existing dashboard's behaviour for a brand with no enabled prompts.

- [ ] **Step 2: Hook** `apps/web/src/hooks/use-org-brand-scores.tsx`
```tsx
import { useQuery } from "@tanstack/react-query";
import { getOrgBrandScoresFn, type OrgBrandScore } from "@/server/dashboard";

export const orgBrandScoresKey = (organizationId: string) => ["org-brand-scores", organizationId] as const;

export function useOrgBrandScores(organizationId: string | undefined) {
	const query = useQuery({
		queryKey: orgBrandScoresKey(organizationId ?? ""),
		queryFn: async () => {
			const rows = await getOrgBrandScoresFn({
				data: { organizationId: organizationId!, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
			});
			return Object.fromEntries(rows.map((row) => [row.brandId, row])) as Record<string, OrgBrandScore>;
		},
		enabled: !!organizationId,
		staleTime: 60_000,
		placeholderData: (prev) => prev,
	});
	return { data: query.data, isLoading: query.isLoading, error: query.error };
}
```

- [ ] **Step 3: Wire the strip** — in `top-bar.tsx` remove the `scores` prop and compute it: `const { data: scores } = useOrgBrandScores(scope.organization?.id);` then pass `scores={scores ?? {}}`.

- [ ] **Step 4: Verify** — typecheck, lint, run the app: brand cards show `NN%` with arrows for brands that have runs.

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/server/dashboard.ts apps/web/src/hooks/use-org-brand-scores.tsx apps/web/src/components/top-bar.tsx
git commit -m "show each brand's visibility score in the brand strip"
```

---

### Task 7: Keywords column and keyword_checks table

**Files:**
- Modify: `packages/lib/src/db/schema.ts`
- Generate: `packages/lib/src/db/migrations/0025_brand_keywords.sql` + snapshot + journal entry

- [ ] **Step 1: Schema** — in `schema.ts`:
Next to `siteAuditStatusEnum` add:
```ts
export const keywordCheckStatusEnum = pgEnum("keyword_check_status", ["running", "completed", "failed"]);
```
In `brands`, after `defaultMarketKey`:
```ts
		/** Up to 20 user-written phrases describing the business; matched against the site by the keyword check. */
		keywords: text("keywords").array().notNull().default([]),
```
After the `siteAudits` table:
```ts
// One row per keyword↔website check, append-only like site_audits; the Home reads the latest completed row.
export const keywordChecks = pgTable(
	"keyword_checks",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		brandId: text("brand_id")
			.references(() => brands.id)
			.notNull(),
		status: keywordCheckStatusEnum("status").notNull(),
		report: json("report").notNull(),
		startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => ({ brandCreatedIdx: index("keyword_checks_brand_created_idx").on(t.brandId, t.createdAt) }),
).enableRLS();
```

- [ ] **Step 2: Generate the migration (never migrate)**
```bash
cd /home/rigosis/projects/enrigio/packages/lib && pnpm exec drizzle-kit generate --name brand_keywords
cat src/db/migrations/0025_brand_keywords.sql
```
Expected SQL: `CREATE TYPE "public"."keyword_check_status" ...`, `CREATE TABLE "keyword_checks" (...)`, `ALTER TABLE "brands" ADD COLUMN "keywords" text[] DEFAULT '{}' NOT NULL`, the index, and `ALTER TABLE "keyword_checks" ENABLE ROW LEVEL SECURITY`.

- [ ] **Step 3: Typecheck the monorepo** — `pnpm --filter @workspace/lib check-types` (or `pnpm exec tsc --noEmit` in `packages/lib`) → PASS.

- [ ] **Step 4: Commit**
```bash
git add packages/lib/src/db
git commit -m "add brand keywords column and keyword_checks table"
```

---

### Task 8: Keyword matching and the check runner (packages/lib)

**Files:**
- Create: `packages/lib/src/keywords/types.ts`, `match.ts`, `match.test.ts`, `page-text.ts`, `read.ts`, `run.ts`, `index.ts`
- Modify: `packages/lib/src/axo/run.ts` (export `buildAllowHosts`), `packages/lib/package.json` (exports)

**Interfaces:**
- Produces (client-safe, `@workspace/lib/keywords/match`): `matchKeywords(keywords, pages, lang)`, `overlapScore(results)`, types `KeywordResult`, `KeywordStatus`, `KeywordCheckReport`, `PageText`.
- Produces (server-only, `@workspace/lib/keywords`): `runKeywordCheck(brandId): Promise<string>`, `getLatestCompletedKeywordCheck(brandId)`, `getLatestKeywordCheckAttempt(brandId)`, type `KeywordCheck`.

- [ ] **Step 1: Types** `packages/lib/src/keywords/types.ts`
```ts
export type KeywordStatus = "found" | "weak" | "missing";

export interface KeywordResult {
	keyword: string;
	status: KeywordStatus;
	/** Page that produced the status; null when missing. */
	url: string | null;
	where: "heading" | "body" | null;
}

export interface KeywordCheckReport {
	pages: { url: string; fetched: boolean }[];
	keywords: KeywordResult[];
	failureSummary?: string;
}

/** One fetched page, split so a heading hit can outrank body text. */
export interface PageText {
	url: string;
	headings: string;
	body: string;
}
```

- [ ] **Step 2: Failing test** `packages/lib/src/keywords/match.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { matchKeywords, overlapScore } from "./match";

const page = (url: string, headings: string, body: string) => ({ url, headings, body });

describe("matchKeywords", () => {
	it("marks a keyword found when it appears in a heading or title", () => {
		const [r] = matchKeywords(["dental implants"], [page("/a", "Dental Implants in Izmir", "")]);
		expect(r).toEqual({ keyword: "dental implants", status: "found", url: "/a", where: "heading" });
	});

	it("marks a keyword found when the body mentions it at least twice across pages", () => {
		const pages = [page("/a", "", "we do dental implants"), page("/b", "", "dental implants cost")];
		expect(matchKeywords(["dental implants"], pages)[0]).toMatchObject({ status: "found", url: "/a", where: "body" });
	});

	it("marks a single body mention weak", () => {
		const [r] = matchKeywords(["veneers"], [page("/a", "", "we also offer veneers")]);
		expect(r).toMatchObject({ status: "weak", url: "/a", where: "body" });
	});

	it("marks absent keywords missing", () => {
		const [r] = matchKeywords(["orthodontics"], [page("/a", "Smile", "teeth whitening")]);
		expect(r).toEqual({ keyword: "orthodontics", status: "missing", url: null, where: null });
	});

	it("ignores case, extra whitespace and unicode form", () => {
		const [r] = matchKeywords(["Teeth   Whitening"], [page("/a", "TEETH WHITENING", "")]);
		expect(r.status).toBe("found");
	});

	it("lowercases Turkish dotted I correctly when the market language is tr", () => {
		const [r] = matchKeywords(["diş implantı"], [page("/a", "DİŞ İMPLANTI", "")], "tr");
		expect(r.status).toBe("found");
	});
});

describe("overlapScore", () => {
	it("counts found and weak keywords as present, as a rounded percentage", () => {
		expect(
			overlapScore([
				{ keyword: "a", status: "found", url: "/", where: "body" },
				{ keyword: "b", status: "weak", url: "/", where: "body" },
				{ keyword: "c", status: "missing", url: null, where: null },
			]),
		).toBe(67);
	});

	it("has no score without keywords", () => {
		expect(overlapScore([])).toBeNull();
	});
});
```

- [ ] **Step 3: Run** — `cd packages/lib && pnpm exec vitest run src/keywords/match.test.ts` → FAIL (module missing).

- [ ] **Step 4: Implement** `packages/lib/src/keywords/match.ts`
```ts
import type { KeywordResult, PageText } from "./types";

export function normalizeText(text: string, lang = "en"): string {
	const lower = lang === "tr" ? text.toLocaleLowerCase("tr") : text.toLowerCase();
	return lower.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function countOccurrences(haystack: string, needle: string): number {
	if (!needle) return 0;
	let count = 0;
	let index = haystack.indexOf(needle);
	while (index !== -1) {
		count += 1;
		index = haystack.indexOf(needle, index + needle.length);
	}
	return count;
}

// ponytail: plain substring matching; swap for LLM relevance scoring if customers ask.
export function matchKeywords(keywords: string[], pages: PageText[], lang = "en"): KeywordResult[] {
	const prepared = pages.map((page) => ({
		url: page.url,
		headings: normalizeText(page.headings, lang),
		body: normalizeText(page.body, lang),
	}));

	return keywords.map((keyword) => {
		const needle = normalizeText(keyword, lang);
		let bodyHits = 0;
		let firstBodyUrl: string | null = null;
		for (const page of prepared) {
			if (countOccurrences(page.headings, needle) > 0) {
				return { keyword, status: "found", url: page.url, where: "heading" };
			}
			const hits = countOccurrences(page.body, needle);
			if (hits > 0 && firstBodyUrl === null) firstBodyUrl = page.url;
			bodyHits += hits;
		}
		if (bodyHits >= 2) return { keyword, status: "found", url: firstBodyUrl, where: "body" };
		if (bodyHits === 1) return { keyword, status: "weak", url: firstBodyUrl, where: "body" };
		return { keyword, status: "missing", url: null, where: null };
	});
}

/** Share of keywords present on the site (found or weak), 0–100; null when there are none. */
export function overlapScore(results: KeywordResult[]): number | null {
	if (results.length === 0) return null;
	const present = results.filter((r) => r.status !== "missing").length;
	return Math.round((present / results.length) * 100);
}
```

- [ ] **Step 5: Run** → PASS.

- [ ] **Step 6: Page text, reads, runner**

`packages/lib/src/keywords/page-text.ts`:
```ts
import { parseHTML } from "linkedom";
import { extractCleanText } from "../axo/html";
import type { PageText } from "./types";

const BODY_MAX_CHARS = 50_000;

export function pageTextFromHtml(url: string, html: string): PageText {
	const { document } = parseHTML(html);
	const headings = [
		document.querySelector("title")?.textContent ?? "",
		...[...document.querySelectorAll("h1, h2, h3")].map((el) => el.textContent ?? ""),
	].join(" \n ");
	return { url, headings, body: extractCleanText(html, BODY_MAX_CHARS) };
}
```

`packages/lib/src/keywords/read.ts`:
```ts
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/db";
import { keywordChecks } from "../db/schema";
import type { KeywordCheckReport } from "./types";

export type KeywordCheck = Omit<typeof keywordChecks.$inferSelect, "report"> & { report: KeywordCheckReport };

export async function getLatestCompletedKeywordCheck(brandId: string): Promise<KeywordCheck | null> {
	const [row] = await db
		.select()
		.from(keywordChecks)
		.where(and(eq(keywordChecks.brandId, brandId), eq(keywordChecks.status, "completed")))
		.orderBy(desc(keywordChecks.createdAt))
		.limit(1);
	return (row as KeywordCheck | undefined) ?? null;
}

/** Newest row of any status — what the enqueue cooldown looks at. */
export async function getLatestKeywordCheckAttempt(brandId: string): Promise<KeywordCheck | null> {
	const [row] = await db
		.select()
		.from(keywordChecks)
		.where(eq(keywordChecks.brandId, brandId))
		.orderBy(desc(keywordChecks.createdAt))
		.limit(1);
	return (row as KeywordCheck | undefined) ?? null;
}
```

In `packages/lib/src/axo/run.ts` change `function buildAllowHosts(` to `export function buildAllowHosts(`.

`packages/lib/src/keywords/run.ts`:
```ts
import { eq } from "drizzle-orm";
import { buildAllowHosts } from "../axo/run";
import { selectAuditPages } from "../axo/select-pages";
import { db } from "../db/db";
import { brands, keywordChecks } from "../db/schema";
import { resolveEffectiveMarket } from "../markets/effective";
import { safeFetch } from "../net/safe-fetch";
import { matchKeywords } from "./match";
import { pageTextFromHtml } from "./page-text";
import type { KeywordCheckReport, PageText } from "./types";

const MAX_PAGES = 10;

/** Runs one keyword↔website check for `brandId` and persists it. Returns the row id. */
export async function runKeywordCheck(brandId: string): Promise<string> {
	const startedAt = new Date();
	const empty: KeywordCheckReport = { pages: [], keywords: [] };
	const [inserted] = await db
		.insert(keywordChecks)
		.values({ brandId, status: "running", report: empty, startedAt })
		.returning({ id: keywordChecks.id });
	const checkId = (inserted as { id: string }).id;

	try {
		const [brand] = await db
			.select({
				website: brands.website,
				additionalDomains: brands.additionalDomains,
				keywords: brands.keywords,
				defaultMarketKey: brands.defaultMarketKey,
			})
			.from(brands)
			.where(eq(brands.id, brandId))
			.limit(1);
		if (!brand) throw new Error(`Keyword check: brand not found: ${brandId}`);

		if (brand.keywords.length === 0) {
			await db.update(keywordChecks).set({ status: "completed", report: empty }).where(eq(keywordChecks.id, checkId));
			return checkId;
		}

		const lang = resolveEffectiveMarket({ defaultMarketKey: brand.defaultMarketKey }).languageCode;
		const allowHosts = buildAllowHosts(brand.website, brand.additionalDomains);
		const selection = await selectAuditPages(brandId);
		const urls = [...new Set([brand.website, ...selection.targets.map((t) => t.url)])].slice(0, MAX_PAGES);

		const fetched = await Promise.all(
			urls.map(async (url) => {
				const result = await safeFetch(url, { allowHosts, accept: "html" });
				return { url, body: result.status === "ok" ? result.body : null };
			}),
		);
		const pages: PageText[] = fetched
			.filter((p): p is { url: string; body: string } => typeof p.body === "string")
			.map((p) => pageTextFromHtml(p.url, p.body));

		const report: KeywordCheckReport = {
			pages: fetched.map((p) => ({ url: p.url, fetched: p.body !== null })),
			keywords: matchKeywords(brand.keywords, pages, lang),
			...(pages.length === 0 ? { failureSummary: "No page on the site could be read." } : {}),
		};
		await db
			.update(keywordChecks)
			.set({ status: pages.length === 0 ? "failed" : "completed", report })
			.where(eq(keywordChecks.id, checkId));
		return checkId;
	} catch (error) {
		const failureSummary = error instanceof Error ? error.message : String(error);
		await db
			.update(keywordChecks)
			.set({ status: "failed", report: { ...empty, failureSummary } })
			.where(eq(keywordChecks.id, checkId));
		throw error;
	}
}
```

`packages/lib/src/keywords/index.ts`:
```ts
export { getLatestCompletedKeywordCheck, getLatestKeywordCheckAttempt, type KeywordCheck } from "./read";
export { runKeywordCheck } from "./run";
export type { KeywordCheckReport, KeywordResult, KeywordStatus } from "./types";
```

`packages/lib/package.json` exports — add after `"./axo"`:
```json
		"./keywords": "./src/keywords/index.ts",
		"./keywords/match": "./src/keywords/match.ts",
		"./keywords/types": "./src/keywords/types.ts"
```

- [ ] **Step 7: Verify** — `cd packages/lib && pnpm exec vitest run src/keywords && pnpm exec tsc --noEmit` → PASS.

- [ ] **Step 8: Commit**
```bash
git add packages/lib/src/keywords packages/lib/src/axo/run.ts packages/lib/package.json
git commit -m "add the keyword website check runner"
```

---

### Task 9: Worker job and queue

**Files:**
- Create: `apps/worker/src/jobs/check-keywords.ts`
- Modify: `apps/worker/src/handlers.ts`, `apps/web/src/lib/boss-client.ts`

- [ ] **Step 1: Job** `apps/worker/src/jobs/check-keywords.ts`
```ts
import { runKeywordCheck } from "@workspace/lib/keywords";
import type { Job } from "pg-boss";

export interface CheckKeywordsData {
	brandId: string;
}

export async function checkKeywordsJob(jobs: Job<CheckKeywordsData>[]): Promise<void> {
	for (const job of jobs) {
		const id = await runKeywordCheck(job.data.brandId);
		console.log(`Completed keyword check ${id} for brand ${job.data.brandId}`);
	}
}
```

- [ ] **Step 2: Register** — in `handlers.ts` import `{ type CheckKeywordsData, checkKeywordsJob } from "./jobs/check-keywords"` and after the `audit-site` registration add:
```ts
	await boss.work<CheckKeywordsData>(
		"check-keywords",
		{ batchSize: 1, localConcurrency: 1 },
		withSentry("check-keywords", checkKeywordsJob),
	);
	console.log("Registered handler: check-keywords");
```

- [ ] **Step 3: Queue** — in `apps/web/src/lib/boss-client.ts` after the `audit-site` `createQueue` add:
```ts
		await boss.createQueue("check-keywords", {
			retryLimit: 0,
			expireInSeconds: 60 * 10,
		});
```
Check whether the worker also creates queues (grep `createQueue` in `apps/worker/src`); if it does, add the same entry there.

- [ ] **Step 4: Verify** — `pnpm --filter @workspace/worker check-types` (or `pnpm exec tsc --noEmit` in `apps/worker`) and `pnpm --filter @workspace/web check-types` → PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/worker/src apps/web/src/lib/boss-client.ts
git commit -m "run keyword checks as a worker job"
```

---

### Task 10: Keyword server functions and cooldown

**Files:**
- Create: `apps/web/src/server/keywords.ts` (core), `apps/web/src/server/keywords-fn.ts` (server fns), `apps/web/src/server/__tests__/keywords.test.ts`
- Create: `apps/web/src/hooks/use-keyword-check.tsx`, `apps/web/src/hooks/use-brand-keywords.tsx`

**Interfaces:**
- Produces: `maybeEnqueueKeywordCheck(brandId, { force? })` → `{ enqueued: boolean }`; `getKeywordCheckFn({ brandId })` → `KeywordCheckView`; `requestKeywordCheckFn({ brandId })`; `updateBrandKeywordsFn({ brandId, keywords })` → `{ keywords: string[] }`; hooks `useKeywordCheck(brandId)`, `useUpdateBrandKeywords()`.

- [ ] **Step 1: Failing test** `apps/web/src/server/__tests__/keywords.test.ts`
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getLatestKeywordCheckAttempt, send } = vi.hoisted(() => ({
	getLatestKeywordCheckAttempt: vi.fn(),
	send: vi.fn(),
}));

vi.mock("@workspace/lib/keywords", () => ({ getLatestKeywordCheckAttempt, getLatestCompletedKeywordCheck: vi.fn() }));
vi.mock("@/lib/boss-client", () => ({ getBoss: vi.fn(async () => ({ send })) }));

import { KEYWORD_CHECK_RUNNING_STALE_MINUTES, maybeEnqueueKeywordCheck } from "@/server/keywords";

const BRAND_ID = "brand-1";
const attemptAt = (status: "running" | "completed" | "failed", ageMs: number) => ({
	status,
	createdAt: new Date(Date.now() - ageMs),
});

describe("maybeEnqueueKeywordCheck", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		send.mockResolvedValue("job-id");
	});

	it("enqueues when nothing ran before", async () => {
		getLatestKeywordCheckAttempt.mockResolvedValue(null);
		await expect(maybeEnqueueKeywordCheck(BRAND_ID)).resolves.toEqual({ enqueued: true });
		expect(send).toHaveBeenCalledWith(
			"check-keywords",
			{ brandId: BRAND_ID },
			{ singletonKey: `keywords-${BRAND_ID}`, singletonSeconds: 600, retryLimit: 0, expireInSeconds: 600 },
		);
	});

	it("skips a fresh completed check unless forced", async () => {
		getLatestKeywordCheckAttempt.mockResolvedValue(attemptAt("completed", 60 * 60 * 1000));
		await expect(maybeEnqueueKeywordCheck(BRAND_ID)).resolves.toEqual({ enqueued: false });
		await expect(maybeEnqueueKeywordCheck(BRAND_ID, { force: true })).resolves.toEqual({ enqueued: true });
	});

	it("never double-runs a check that is still in flight, even when forced", async () => {
		getLatestKeywordCheckAttempt.mockResolvedValue(attemptAt("running", 60 * 1000));
		await expect(maybeEnqueueKeywordCheck(BRAND_ID, { force: true })).resolves.toEqual({ enqueued: false });
	});

	it("treats a running row older than the stale window as crashed", async () => {
		getLatestKeywordCheckAttempt.mockResolvedValue(
			attemptAt("running", (KEYWORD_CHECK_RUNNING_STALE_MINUTES + 1) * 60 * 1000),
		);
		await expect(maybeEnqueueKeywordCheck(BRAND_ID)).resolves.toEqual({ enqueued: true });
	});

	it("skips a recent failure", async () => {
		getLatestKeywordCheckAttempt.mockResolvedValue(attemptAt("failed", 60 * 60 * 1000));
		await expect(maybeEnqueueKeywordCheck(BRAND_ID)).resolves.toEqual({ enqueued: false });
	});

	it("reports enqueued:false instead of throwing when the queue is down", async () => {
		getLatestKeywordCheckAttempt.mockResolvedValue(null);
		send.mockRejectedValue(new Error("queue down"));
		await expect(maybeEnqueueKeywordCheck(BRAND_ID)).resolves.toEqual({ enqueued: false });
	});
});
```

- [ ] **Step 2: Run** — `cd apps/web && pnpm exec vitest run --project=unit src/server/__tests__/keywords.test.ts` → FAIL.

- [ ] **Step 3: Core** `apps/web/src/server/keywords.ts`
```ts
/**
 * Enqueue gate and reads for keyword checks. Authorization happens in
 * `keywords-fn.ts`; this module is also called from server code that has
 * already authorized (brand keyword updates).
 */
import {
	getLatestCompletedKeywordCheck,
	getLatestKeywordCheckAttempt,
	type KeywordCheck,
} from "@workspace/lib/keywords";
import { getBoss } from "@/lib/boss-client";

export const KEYWORD_CHECK_REFRESH_AFTER_DAYS = 7;
export const KEYWORD_CHECK_FAILED_RETRY_DAYS = 1;
export const KEYWORD_CHECK_RUNNING_STALE_MINUTES = 10;

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function isRunning(attempt: KeywordCheck | null): boolean {
	return (
		attempt?.status === "running" &&
		Date.now() - attempt.createdAt.getTime() < KEYWORD_CHECK_RUNNING_STALE_MINUTES * MINUTE_MS
	);
}

function isOnCooldown(attempt: KeywordCheck, force: boolean): boolean {
	const age = Date.now() - attempt.createdAt.getTime();
	if (attempt.status === "running") return isRunning(attempt);
	if (attempt.status === "completed") return !force && age < KEYWORD_CHECK_REFRESH_AFTER_DAYS * DAY_MS;
	if (attempt.status === "failed") return !force && age < KEYWORD_CHECK_FAILED_RETRY_DAYS * DAY_MS;
	return false;
}

export async function maybeEnqueueKeywordCheck(
	brandId: string,
	opts: { force?: boolean } = {},
): Promise<{ enqueued: boolean }> {
	const attempt = await getLatestKeywordCheckAttempt(brandId);
	if (attempt && isOnCooldown(attempt, opts.force ?? false)) return { enqueued: false };

	try {
		const boss = await getBoss();
		await boss.send(
			"check-keywords",
			{ brandId },
			{
				singletonKey: `keywords-${brandId}`,
				singletonSeconds: KEYWORD_CHECK_RUNNING_STALE_MINUTES * 60,
				retryLimit: 0,
				expireInSeconds: KEYWORD_CHECK_RUNNING_STALE_MINUTES * 60,
			},
		);
		return { enqueued: true };
	} catch (error) {
		console.error(`Failed to enqueue keyword check for brand ${brandId}:`, error);
		return { enqueued: false };
	}
}

export interface KeywordCheckView {
	latest: KeywordCheck | null;
	running: boolean;
	/** Failure text of the newest attempt when it failed after the latest success, else null. */
	failure: string | null;
}

export async function readKeywordCheck(brandId: string): Promise<KeywordCheckView> {
	const [latest, attempt] = await Promise.all([
		getLatestCompletedKeywordCheck(brandId),
		getLatestKeywordCheckAttempt(brandId),
	]);
	const failedAfterLatest =
		attempt?.status === "failed" && (!latest || attempt.createdAt > latest.createdAt)
			? (attempt.report.failureSummary ?? "The check failed.")
			: null;
	return { latest, running: isRunning(attempt), failure: failedAfterLatest };
}
```

- [ ] **Step 4: Server functions** `apps/web/src/server/keywords-fn.ts`
```ts
/** Thin wrappers so the client graph never resolves the db-backed core. */
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { type KeywordCheckView, maybeEnqueueKeywordCheck, readKeywordCheck } from "@/server/keywords";

export const MAX_KEYWORDS = 20;
export const MAX_KEYWORD_LENGTH = 60;

export const getKeywordCheckFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }): Promise<KeywordCheckView> => {
		await requireBrandSession(data.brandId);
		// Opening the Home is enough to keep the check fresh; no button needed.
		await maybeEnqueueKeywordCheck(data.brandId);
		return readKeywordCheck(data.brandId);
	});

export const requestKeywordCheckFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return maybeEnqueueKeywordCheck(data.brandId, { force: true });
	});

export const updateBrandKeywordsFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			keywords: z.array(z.string().trim().min(1).max(MAX_KEYWORD_LENGTH)).max(MAX_KEYWORDS),
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const seen = new Set<string>();
		const keywords = data.keywords.filter((keyword) => {
			const key = keyword.toLowerCase();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
		await db.update(brands).set({ keywords, updatedAt: new Date() }).where(eq(brands.id, data.brandId));
		await maybeEnqueueKeywordCheck(data.brandId, { force: true });
		return { keywords };
	});
```

- [ ] **Step 5: Hooks**

`apps/web/src/hooks/use-keyword-check.tsx`:
```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import { getKeywordCheckFn, requestKeywordCheckFn } from "@/server/keywords-fn";

export const keywordCheckKey = (brandId: string) => ["keyword-check", brandId] as const;

export function useKeywordCheck(brandId?: string) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	const query = useQuery({
		queryKey: keywordCheckKey(resolvedBrandId ?? ""),
		queryFn: () => getKeywordCheckFn({ data: { brandId: resolvedBrandId! } }),
		enabled: !!resolvedBrandId,
		staleTime: 30_000,
		// A running check finishes within a couple of minutes; poll until it lands.
		refetchInterval: (q) => (q.state.data?.running ? 15_000 : false),
	});
	return { data: query.data, isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

export function useRequestKeywordCheck(brandId?: string) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => requestKeywordCheckFn({ data: { brandId: resolvedBrandId! } }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: keywordCheckKey(resolvedBrandId ?? "") }),
	});
}
```

`apps/web/src/hooks/use-brand-keywords.tsx`:
```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { keywordCheckKey } from "@/hooks/use-keyword-check";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import { updateBrandKeywordsFn } from "@/server/keywords-fn";

export function useUpdateBrandKeywords(brandId?: string) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	const queryClient = useQueryClient();
	const router = useRouter();
	return useMutation({
		mutationFn: (keywords: string[]) => updateBrandKeywordsFn({ data: { brandId: resolvedBrandId!, keywords } }),
		onSuccess: async () => {
			// The brand layout loader carries `brand.keywords`; invalidating the router reloads it.
			await router.invalidate();
			await queryClient.invalidateQueries({ queryKey: keywordCheckKey(resolvedBrandId ?? "") });
		},
	});
}
```

- [ ] **Step 6: Run tests + typecheck** — the keywords test → PASS; `pnpm --filter @workspace/web check-types` → PASS.

- [ ] **Step 7: Commit**
```bash
git add apps/web/src/server/keywords.ts apps/web/src/server/keywords-fn.ts apps/web/src/server/__tests__/keywords.test.ts apps/web/src/hooks/use-keyword-check.tsx apps/web/src/hooks/use-brand-keywords.tsx
git commit -m "add keyword check server functions with an enqueue cooldown"
```

---

### Task 11: Engine comparison

**Files:**
- Modify: `apps/web/src/lib/postgres-read.ts` (append query), `apps/web/src/server/analysis.ts` (append fn)
- Create: `apps/web/src/lib/engine-comparison.ts`, `apps/web/src/lib/engine-comparison.test.ts`, `apps/web/src/hooks/use-engine-comparison.tsx`

**Interfaces:**
- Produces: `buildEngineRows(rows, label)` → `EngineRow[]`; `getEngineComparisonFn({ brandId, timezone })` → `EngineRow[]`; `useEngineComparison(brandId)`.

- [ ] **Step 1: Failing test** `apps/web/src/lib/engine-comparison.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { buildEngineRows, verdictFor } from "@/lib/engine-comparison";

const label = (model: string) => model.toUpperCase();

describe("verdictFor", () => {
	it("is close within five points, otherwise lead or behind", () => {
		expect(verdictFor(0.5, 0.47)).toBe("close");
		expect(verdictFor(0.6, 0.4)).toBe("lead");
		expect(verdictFor(0.2, 0.4)).toBe("behind");
		expect(verdictFor(null, 0.4)).toBeNull();
		expect(verdictFor(0.4, null)).toBeNull();
	});
});

describe("buildEngineRows", () => {
	it("keeps the strongest competitor per engine and sorts by the brand's rate", () => {
		const rows = buildEngineRows(
			[
				{ model: "chatgpt", runs: 10, brand_mentioned_count: 3, competitor: "Acme", competitor_count: 6 },
				{ model: "chatgpt", runs: 10, brand_mentioned_count: 3, competitor: "Beta", competitor_count: 2 },
				{ model: "gemini", runs: 4, brand_mentioned_count: 4, competitor: null, competitor_count: 0 },
			],
			label,
		);
		expect(rows.map((r) => r.model)).toEqual(["gemini", "chatgpt"]);
		expect(rows[1]).toEqual({
			model: "chatgpt",
			label: "CHATGPT",
			brandRate: 0.3,
			topCompetitor: { name: "Acme", rate: 0.6 },
			verdict: "behind",
		});
		expect(rows[0].topCompetitor).toBeNull();
		expect(rows[0].verdict).toBeNull();
	});
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Pure module** `apps/web/src/lib/engine-comparison.ts`
```ts
export interface ModelCompetitorMentionRow {
	model: string;
	runs: number;
	brand_mentioned_count: number;
	competitor: string | null;
	competitor_count: number;
}

export type EngineVerdict = "lead" | "close" | "behind";

export interface EngineRow {
	model: string;
	label: string;
	/** 0–1 */
	brandRate: number | null;
	topCompetitor: { name: string; rate: number } | null;
	verdict: EngineVerdict | null;
}

const CLOSE_POINTS = 5;

export function verdictFor(brandRate: number | null, competitorRate: number | null): EngineVerdict | null {
	if (brandRate === null || competitorRate === null) return null;
	const diff = (brandRate - competitorRate) * 100;
	if (Math.abs(diff) < CLOSE_POINTS) return "close";
	return diff > 0 ? "lead" : "behind";
}

export function buildEngineRows(rows: ModelCompetitorMentionRow[], label: (model: string) => string): EngineRow[] {
	const byModel = new Map<string, EngineRow>();
	for (const row of rows) {
		const entry = byModel.get(row.model) ?? {
			model: row.model,
			label: label(row.model),
			brandRate: row.runs > 0 ? row.brand_mentioned_count / row.runs : null,
			topCompetitor: null,
			verdict: null,
		};
		if (row.competitor && row.runs > 0) {
			const rate = row.competitor_count / row.runs;
			if (!entry.topCompetitor || rate > entry.topCompetitor.rate) entry.topCompetitor = { name: row.competitor, rate };
		}
		byModel.set(row.model, entry);
	}
	return [...byModel.values()]
		.map((entry) => ({ ...entry, verdict: verdictFor(entry.brandRate, entry.topCompetitor?.rate ?? null) }))
		.sort((a, b) => (b.brandRate ?? -1) - (a.brandRate ?? -1));
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: SQL** — append to `apps/web/src/lib/postgres-read.ts` (import `type ModelCompetitorMentionRow` from `@/lib/engine-comparison`):
```ts
/** Per engine: run totals, brand mentions, and one row per competitor name mentioned. */
export async function getModelCompetitorMentions(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds: string[] | undefined,
	effectiveMarketKey: string,
): Promise<ModelCompetitorMentionRow[]> {
	if (!enabledPromptIds?.length) return [];
	return queryPg<ModelCompetitorMentionRow>(sql`
		WITH runs AS (
			SELECT model, brand_mentioned, competitors_mentioned
			FROM prompt_runs
			WHERE brand_id = ${brandId}
				${dateFilter(fromDate, toDate, timezone)}
				${promptIdFilter(enabledPromptIds)}
				${marketScope(effectiveMarketKey)}
		),
		totals AS (
			SELECT model, count(*)::int AS runs, count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_count
			FROM runs GROUP BY model
		),
		comp AS (
			SELECT model, name AS competitor, count(*)::int AS competitor_count
			FROM runs, unnest(competitors_mentioned) AS name
			GROUP BY model, name
		)
		SELECT t.model, t.runs, t.brand_mentioned_count, comp.competitor, coalesce(comp.competitor_count, 0)::int AS competitor_count
		FROM totals t
		LEFT JOIN comp ON comp.model = t.model
		ORDER BY t.model, competitor_count DESC
	`);
}
```
(`queryPg`, `dateFilter`, `promptIdFilter`, `marketScope` already exist in that file.)

- [ ] **Step 6: Server fn** — append to `apps/web/src/server/analysis.ts`:
```ts
import { getModelMeta } from "@workspace/config/models";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { resolveEffectiveMarket } from "@workspace/lib/markets";
import { eq } from "drizzle-orm";
import { buildEngineRows, type EngineRow } from "@/lib/engine-comparison";
import { getModelCompetitorMentions } from "@/lib/postgres-read";
import { resolveFilteredPrompts } from "@/server/prompt-resolution";

export const getEngineComparisonFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string(), timezone: z.string().default("UTC") }))
	.handler(async ({ data }): Promise<EngineRow[]> => {
		await requireBrandSession(data.brandId);
		const { timezone, fromDateStr, toDateStr } = resolveLookbackRange("1m", data.timezone);
		const [brandRow] = await db
			.select({ defaultMarketKey: brands.defaultMarketKey })
			.from(brands)
			.where(eq(brands.id, data.brandId))
			.limit(1);
		const marketKey = resolveEffectiveMarket({ defaultMarketKey: brandRow?.defaultMarketKey ?? null }).key;
		const prompts = await resolveFilteredPrompts(data.brandId, {});
		const rows = await getModelCompetitorMentions(
			data.brandId,
			fromDateStr,
			toDateStr,
			timezone,
			prompts.map((p) => p.id),
			marketKey,
		);
		return buildEngineRows(rows, (model) => getModelMeta(model).label);
	});
```
(Merge the imports into the existing import block at the top of the file.)

- [ ] **Step 7: Hook** `apps/web/src/hooks/use-engine-comparison.tsx`
```tsx
import { useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import { getEngineComparisonFn } from "@/server/analysis";

export function useEngineComparison(brandId?: string) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	const query = useQuery({
		queryKey: ["engine-comparison", resolvedBrandId ?? ""],
		queryFn: () =>
			getEngineComparisonFn({
				data: { brandId: resolvedBrandId!, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
			}),
		enabled: !!resolvedBrandId,
		staleTime: 60_000,
	});
	return { data: query.data, isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}
```

- [ ] **Step 8: Verify** — tests + `check-types` → PASS.

- [ ] **Step 9: Commit**
```bash
git add apps/web/src/lib/engine-comparison.ts apps/web/src/lib/engine-comparison.test.ts apps/web/src/lib/postgres-read.ts apps/web/src/server/analysis.ts apps/web/src/hooks/use-engine-comparison.tsx
git commit -m "compare brand and competitor mention rates per AI engine"
```

---

### Task 12: Brand Home page

**Files:**
- Create: `apps/web/src/components/home/brand-home.tsx`, `score-card.tsx`, `next-steps.ts`, `next-steps.test.ts`, `next-steps-card.tsx`, `keywords-card.tsx`, `keyword-match-card.tsx`, `engines-card.tsx`, `home-card.tsx`
- Modify: `apps/web/src/routes/_authed/app/org/$org/brand/$brand/index.tsx`, `apps/web/src/locales/en.json`

**Interfaces:**
- Consumes: `useOrgBrandScores`, `useDashboardSummary`, `useOpportunities`, `useKeywordCheck`, `useRequestKeywordCheck`, `useUpdateBrandKeywords`, `useEngineComparison`, `useShareOfVoice`, `scoreBand`, `BandPill`, `overlapScore`.
- Produces: `<BrandHome brand organization />`.

- [ ] **Step 1: Failing test** `apps/web/src/components/home/next-steps.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { pickNextSteps } from "@/components/home/next-steps";

const opp = (title: string, priority: "high" | "medium" | "low") => ({
	title,
	priority,
	category: "creation" as const,
	why: "",
	expectedImpact: "",
	relatedPrompts: [],
	yourCitations: [],
	competitorCitations: [],
});

describe("pickNextSteps", () => {
	it("returns at most five, highest priority first, keeping report order within a priority", () => {
		const picked = pickNextSteps([
			opp("m1", "medium"),
			opp("l1", "low"),
			opp("h1", "high"),
			opp("m2", "medium"),
			opp("h2", "high"),
			opp("m3", "medium"),
			opp("l2", "low"),
		]);
		expect(picked.map((o) => o.title)).toEqual(["h1", "h2", "m1", "m2", "m3"]);
	});

	it("returns an empty list for no opportunities", () => {
		expect(pickNextSteps([])).toEqual([]);
	});
});
```

- [ ] **Step 2: Run** → FAIL. **Implement** `apps/web/src/components/home/next-steps.ts`:
```ts
import type { ReportOpportunity } from "@/server/opportunities";

export const NEXT_STEPS_COUNT = 5;
const RANK = { high: 0, medium: 1, low: 2 } as const;

export function pickNextSteps(opportunities: ReportOpportunity[]): ReportOpportunity[] {
	return opportunities
		.map((o, index) => ({ o, index }))
		.sort((a, b) => (RANK[a.o.priority] ?? 1) - (RANK[b.o.priority] ?? 1) || a.index - b.index)
		.slice(0, NEXT_STEPS_COUNT)
		.map(({ o }) => o);
}
```
Run → PASS. (If importing `@/server/opportunities` pulls server-only code into the client, change the import to `import type` — it already is type-only, which Vite erases.)

- [ ] **Step 3: Shared card frame** `apps/web/src/components/home/home-card.tsx`
```tsx
import { ArrowsClockwise } from "@phosphor-icons/react";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n";

export function HomeCard({
	title,
	description,
	action,
	loading,
	error,
	onRetry,
	children,
}: {
	title: string;
	description?: string;
	action?: ReactNode;
	loading?: boolean;
	error?: unknown;
	onRetry?: () => void;
	children: ReactNode;
}) {
	return (
		<Card className="gap-4">
			<CardHeader className="flex flex-row items-start justify-between gap-4">
				<div>
					<CardTitle className="text-lg">{title}</CardTitle>
					{description && <CardDescription>{description}</CardDescription>}
				</div>
				{action}
			</CardHeader>
			<CardContent>
				{loading ? (
					<div className="space-y-3">
						<Skeleton className="h-8 w-40" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-3/4" />
					</div>
				) : error ? (
					<div className="flex items-center gap-3 text-sm text-muted-foreground">
						{t("home.card_error")}
						{onRetry && (
							<Button variant="outline" size="sm" onClick={onRetry}>
								<ArrowsClockwise className="size-4" /> {t("home.try_again")}
							</Button>
						)}
					</div>
				) : (
					children
				)}
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 4: Score card** `apps/web/src/components/home/score-card.tsx`
```tsx
import { ArrowDown, ArrowUp } from "@phosphor-icons/react";
import { cn } from "@workspace/ui/lib/utils";
import { BandPill } from "@/components/home/band-pill";
import { HomeCard } from "@/components/home/home-card";
import { TrendChart } from "@/components/trend-chart";
import { useDashboardSummary } from "@/hooks/use-dashboard-summary";
import { t } from "@/lib/i18n";
import { scoreBand } from "@/lib/score-band";
import type { OrgBrandScore } from "@/server/dashboard";

const RING: Record<"low" | "ok" | "good", string> = {
	low: "border-rose-500",
	ok: "border-amber-500",
	good: "border-emerald-500",
};

export function ScoreCard({ brandName, entry, loading }: { brandName: string; entry: OrgBrandScore | undefined; loading: boolean }) {
	const summary = useDashboardSummary(undefined, "1m");
	const band = scoreBand(entry?.score);
	const delta = entry && entry.score !== null && entry.previousScore !== null ? entry.score - entry.previousScore : null;

	return (
		<HomeCard title={t("home.score_title")} loading={loading}>
			{!entry || entry.score === null ? (
				<p className="text-muted-foreground">{t("home.score_pending")}</p>
			) : (
				<div className="flex flex-col gap-6 md:flex-row md:items-center">
					<div
						className={cn("flex size-36 shrink-0 flex-col items-center justify-center rounded-full border-8", band && RING[band])}
						role="img"
						aria-label={`${entry.score}%`}
					>
						<span className="text-4xl font-bold tabular-nums">{entry.score}%</span>
						{band && <BandPill band={band} className="mt-1" />}
					</div>
					<div className="flex min-w-0 flex-1 flex-col gap-2">
						<p className="text-lg">
							{t("home.score_sentence", {
								brand: brandName,
								mentioned: entry.mentionedRuns,
								total: entry.totalRuns,
							})}{" "}
							{delta !== null && delta !== 0 && (
								<span className={cn("inline-flex items-center gap-0.5 font-medium", delta > 0 ? "text-emerald-700" : "text-rose-700")}>
									{delta > 0 ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
									{t(delta > 0 ? "home.score_up" : "home.score_down", { points: Math.abs(delta) })}
								</span>
							)}
						</p>
						<p className="text-sm text-muted-foreground">
							{t("home.score_coverage", { seen: entry.promptsWithMention, total: entry.totalPrompts })}
						</p>
						{summary.data && (
							<TrendChart
								data={summary.data.visibilityTimeSeries.map((p) => ({ date: p.date, value: p.overall }))}
								label={t("home.score_title")}
								color="var(--primary)"
								className="h-16"
							/>
						)}
					</div>
				</div>
			)}
		</HomeCard>
	);
}
```
Check `TrendChart`'s props in `apps/web/src/components/trend-chart.tsx` (`data`, `label`, `color`, `className`) and drop any that do not exist.

- [ ] **Step 5: Next steps card** `apps/web/src/components/home/next-steps-card.tsx`
```tsx
import { ArrowRight } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { HomeCard } from "@/components/home/home-card";
import { pickNextSteps } from "@/components/home/next-steps";
import { useOpportunities } from "@/hooks/use-opportunities";
import { useBrandParams } from "@/hooks/use-route-params";
import { t, type TranslationKey } from "@/lib/i18n";

const CATEGORY: Record<string, TranslationKey> = {
	creation: "home.cat_creation",
	"existing-content": "home.cat_existing",
	outreach: "home.cat_outreach",
	social: "home.cat_social",
	axo: "home.cat_axo",
};
const PRIORITY: Record<string, TranslationKey> = {
	high: "home.impact_high",
	medium: "home.impact_medium",
	low: "home.impact_low",
};

export function NextStepsCard() {
	const params = useBrandParams();
	const { data, isLoading, error, refetch } = useOpportunities();
	const steps = pickNextSteps(data?.report?.opportunities ?? []);

	return (
		<HomeCard
			title={t("home.next_title")}
			description={t("home.next_description")}
			loading={isLoading}
			error={error}
			onRetry={() => refetch()}
			action={
				<Link to="/app/org/$org/brand/$brand/opportunities" params={params} className="flex items-center gap-1 text-sm text-primary">
					{t("home.next_all")} <ArrowRight className="size-4" />
				</Link>
			}
		>
			{steps.length === 0 ? (
				<p className="text-muted-foreground">{t("home.next_empty")}</p>
			) : (
				<ol className="flex flex-col divide-y">
					{steps.map((step, index) => (
						<li key={step.title} className="flex gap-4 py-3">
							<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
								{index + 1}
							</span>
							<div className="flex min-w-0 flex-col gap-1">
								<span className="font-medium">{step.title}</span>
								<span className="text-sm text-muted-foreground">{step.why}</span>
								<span className="flex flex-wrap gap-1.5 pt-1">
									{step.priority && <Badge variant={step.priority === "high" ? "default" : "secondary"}>{t(PRIORITY[step.priority])}</Badge>}
									{CATEGORY[step.category] && <Badge variant="outline">{t(CATEGORY[step.category])}</Badge>}
								</span>
							</div>
						</li>
					))}
				</ol>
			)}
		</HomeCard>
	);
}
```

- [ ] **Step 6: Keywords card** `apps/web/src/components/home/keywords-card.tsx`
```tsx
import { Button } from "@workspace/ui/components/button";
import { TagsInput } from "@workspace/ui/components/tags-input";
import type { BrandWithPrompts } from "@workspace/lib/db/schema";
import { useMemo, useState } from "react";
import { HomeCard } from "@/components/home/home-card";
import { useUpdateBrandKeywords } from "@/hooks/use-brand-keywords";
import { t } from "@/lib/i18n";
import { MAX_KEYWORD_LENGTH, MAX_KEYWORDS } from "@/server/keywords-fn";

const SUGGESTION_COUNT = 10;

export function KeywordsCard({ brand }: { brand: BrandWithPrompts }) {
	const [draft, setDraft] = useState<string[]>(brand.keywords);
	const update = useUpdateBrandKeywords(brand.id);
	const dirty = draft.join("\n") !== brand.keywords.join("\n");

	const suggestions = useMemo(() => {
		const taken = new Set(draft.map((k) => k.toLowerCase()));
		return [...new Set(brand.prompts.flatMap((p) => p.tags ?? []))]
			.filter((tag) => !taken.has(tag.toLowerCase()))
			.slice(0, SUGGESTION_COUNT);
	}, [brand.prompts, draft]);

	return (
		<HomeCard
			title={t("home.keywords_title")}
			description={t("home.keywords_description")}
			action={<span className="text-sm tabular-nums text-muted-foreground">{draft.length} / {MAX_KEYWORDS}</span>}
		>
			<div className="flex flex-col gap-3">
				<TagsInput
					value={draft}
					onValueChange={setDraft}
					allowCustomValues
					maxItems={MAX_KEYWORDS}
					placeholder={t("home.keywords_placeholder")}
					onValidate={(value) => (value.trim().length <= MAX_KEYWORD_LENGTH ? true : t("home.keywords_too_long"))}
					pasteSplitter={/[\n,]+/}
				/>
				{suggestions.length > 0 && (
					<div className="flex flex-wrap items-center gap-1.5 text-sm">
						<span className="text-muted-foreground">{t("home.keywords_suggestions")}</span>
						{suggestions.map((tag) => (
							<Button
								key={tag}
								type="button"
								variant="outline"
								size="sm"
								className="h-7 rounded-full"
								disabled={draft.length >= MAX_KEYWORDS}
								onClick={() => setDraft((prev) => [...prev, tag])}
							>
								+ {tag}
							</Button>
						))}
					</div>
				)}
				<div className="flex items-center gap-3">
					<Button type="button" size="sm" disabled={!dirty || update.isPending} onClick={() => update.mutate(draft)}>
						{update.isPending ? t("home.keywords_saving") : t("home.keywords_save")}
					</Button>
					{update.isSuccess && !dirty && <span className="text-sm text-muted-foreground">{t("home.keywords_saved")}</span>}
					{update.isError && <span className="text-sm text-destructive">{t("home.card_error")}</span>}
				</div>
			</div>
		</HomeCard>
	);
}
```
If `@/server/keywords-fn` cannot be imported from a component for the two constants (client bundle check in `scripts/check-server-bundle.mjs` fails), move `MAX_KEYWORDS`/`MAX_KEYWORD_LENGTH` to `apps/web/src/lib/keyword-limits.ts` and import them from there in both places.

- [ ] **Step 7: Keyword match card** `apps/web/src/components/home/keyword-match-card.tsx`
```tsx
import { ArrowsClockwise, CheckCircle, Warning, XCircle } from "@phosphor-icons/react";
import { overlapScore } from "@workspace/lib/keywords/match";
import type { KeywordResult, KeywordStatus } from "@workspace/lib/keywords/types";
import { Button } from "@workspace/ui/components/button";
import { BandPill } from "@/components/home/band-pill";
import { HomeCard } from "@/components/home/home-card";
import { useKeywordCheck, useRequestKeywordCheck } from "@/hooks/use-keyword-check";
import { t, type TranslationKey } from "@/lib/i18n";
import { scoreBand } from "@/lib/score-band";

const ORDER: KeywordStatus[] = ["missing", "weak", "found"];
const STATUS: Record<KeywordStatus, { label: TranslationKey; icon: typeof CheckCircle; className: string }> = {
	missing: { label: "home.match_missing", icon: XCircle, className: "text-rose-700" },
	weak: { label: "home.match_weak", icon: Warning, className: "text-amber-700" },
	found: { label: "home.match_found", icon: CheckCircle, className: "text-emerald-700" },
};

function relative(date: Date): string {
	const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
	if (days <= 0) return t("home.match_checked_today");
	return t("home.match_checked_days", { days });
}

function Row({ result }: { result: KeywordResult }) {
	const meta = STATUS[result.status];
	return (
		<li className="flex items-center gap-3 py-2">
			<meta.icon className={`size-5 shrink-0 ${meta.className}`} weight="fill" />
			<span className="min-w-0 flex-1 truncate">{result.keyword}</span>
			<span className={`text-sm ${meta.className}`}>{t(meta.label)}</span>
			{result.url ? (
				<a href={result.url} target="_blank" rel="noreferrer" className="max-w-48 truncate text-sm text-primary underline">
					{new URL(result.url).pathname || "/"}
				</a>
			) : (
				<span className="text-sm text-muted-foreground">{t("home.match_add_hint")}</span>
			)}
		</li>
	);
}

export function KeywordMatchCard({ hasKeywords }: { hasKeywords: boolean }) {
	const { data, isLoading, error, refetch } = useKeywordCheck();
	const request = useRequestKeywordCheck();
	const results = data?.latest?.report.keywords ?? [];
	const score = overlapScore(results);
	const band = scoreBand(score);
	const present = results.filter((r) => r.status !== "missing").length;

	return (
		<HomeCard
			title={t("home.match_title")}
			description={t("home.match_description")}
			loading={isLoading}
			error={error}
			onRetry={() => refetch()}
			action={
				hasKeywords && (
					<Button variant="outline" size="sm" disabled={data?.running || request.isPending} onClick={() => request.mutate()}>
						<ArrowsClockwise className={`size-4 ${data?.running ? "animate-spin" : ""}`} />
						{data?.running ? t("home.match_checking") : t("home.match_check_again")}
					</Button>
				)
			}
		>
			{!hasKeywords ? (
				<p className="text-muted-foreground">{t("home.match_no_keywords")}</p>
			) : !data?.latest ? (
				<p className="text-muted-foreground">{data?.failure ? t("home.match_failed") : t("home.match_pending")}</p>
			) : (
				<div className="flex flex-col gap-4">
					<div className="flex flex-wrap items-center gap-3">
						<span className="text-3xl font-bold tabular-nums">{score ?? 0}%</span>
						{band && <BandPill band={band} />}
						<span className="text-muted-foreground">
							{t("home.match_headline", { present, total: results.length })}
						</span>
					</div>
					{data.failure && <p className="text-sm text-amber-800">{t("home.match_failed")}</p>}
					<ul className="divide-y">
						{ORDER.flatMap((status) => results.filter((r) => r.status === status)).map((result) => (
							<Row key={result.keyword} result={result} />
						))}
					</ul>
					<p className="text-xs text-muted-foreground">{relative(new Date(data.latest.createdAt))}</p>
				</div>
			)}
		</HomeCard>
	);
}
```

- [ ] **Step 8: Engines card** `apps/web/src/components/home/engines-card.tsx`
```tsx
import { ArrowRight } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { cn } from "@workspace/ui/lib/utils";
import { HomeCard } from "@/components/home/home-card";
import { useEngineComparison } from "@/hooks/use-engine-comparison";
import { useBrandParams } from "@/hooks/use-route-params";
import { useShareOfVoice } from "@/hooks/use-share-of-voice";
import type { EngineVerdict } from "@/lib/engine-comparison";
import { t, type TranslationKey } from "@/lib/i18n";

const VERDICT: Record<EngineVerdict, { label: TranslationKey; className: string }> = {
	lead: { label: "home.engines_lead", className: "bg-emerald-100 text-emerald-900" },
	close: { label: "home.engines_close", className: "bg-amber-100 text-amber-900" },
	behind: { label: "home.engines_behind", className: "bg-rose-100 text-rose-900" },
};

const pct = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);

export function EnginesCard() {
	const params = useBrandParams();
	const engines = useEngineComparison();
	const sov = useShareOfVoice();
	const leaderboard = (sov.data?.entries ?? []).slice(0, 6);
	const max = Math.max(...leaderboard.map((e) => e.share), 0.0001);

	return (
		<HomeCard
			title={t("home.engines_title")}
			description={t("home.engines_description")}
			loading={engines.isLoading}
			error={engines.error}
			onRetry={() => engines.refetch()}
			action={
				<Link to="/app/org/$org/brand/$brand/share-of-voice" params={params} className="flex items-center gap-1 text-sm text-primary">
					{t("home.engines_full")} <ArrowRight className="size-4" />
				</Link>
			}
		>
			{(engines.data?.length ?? 0) === 0 ? (
				<p className="text-muted-foreground">{t("home.engines_empty")}</p>
			) : (
				<div className="flex flex-col gap-6">
					<table className="w-full text-sm">
						<thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
							<tr>
								<th className="py-1 font-medium">{t("home.engines_engine")}</th>
								<th className="py-1 text-right font-medium">{t("home.engines_you")}</th>
								<th className="py-1 text-right font-medium">{t("home.engines_top_rival")}</th>
								<th className="py-1 text-right font-medium" />
							</tr>
						</thead>
						<tbody className="divide-y">
							{engines.data?.map((row) => (
								<tr key={row.model}>
									<td className="flex items-center gap-2 py-2">
										<ModelIcon model={row.model} className="size-5" />
										{row.label}
									</td>
									<td className="py-2 text-right font-semibold tabular-nums">{pct(row.brandRate)}</td>
									<td className="py-2 text-right tabular-nums text-muted-foreground">
										{row.topCompetitor ? `${row.topCompetitor.name} · ${pct(row.topCompetitor.rate)}` : t("home.engines_no_rival")}
									</td>
									<td className="py-2 text-right">
										{row.verdict && (
											<span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", VERDICT[row.verdict].className)}>
												{t(VERDICT[row.verdict].label)}
											</span>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{leaderboard.length > 0 && (
						<div>
							<h3 className="mb-2 text-sm font-medium">{t("home.engines_leaderboard")}</h3>
							<ol className="flex flex-col gap-1.5">
								{leaderboard.map((entry) => (
									<li key={entry.name} className="flex items-center gap-3 text-sm">
										<span className={cn("w-32 truncate", entry.isBrand && "font-semibold")}>{entry.name}</span>
										<span className="h-3 flex-1 rounded-full bg-muted">
											<span
												className={cn("block h-3 rounded-full", entry.isBrand ? "bg-primary" : "bg-muted-foreground/40")}
												style={{ width: `${(entry.share / max) * 100}%` }}
											/>
										</span>
										<span className="w-12 text-right tabular-nums">{Math.round(entry.share * 100)}%</span>
									</li>
								))}
							</ol>
						</div>
					)}
				</div>
			)}
		</HomeCard>
	);
}
```
Check `ModelIcon`'s props in `packages/ui/src/brand/model-icon.tsx` and adapt the prop name if it is not `model`.

- [ ] **Step 9: Home** `apps/web/src/components/home/brand-home.tsx`
```tsx
import type { BrandWithPrompts } from "@workspace/lib/db/schema";
import { EnginesCard } from "@/components/home/engines-card";
import { KeywordMatchCard } from "@/components/home/keyword-match-card";
import { KeywordsCard } from "@/components/home/keywords-card";
import { NextStepsCard } from "@/components/home/next-steps-card";
import { ScoreCard } from "@/components/home/score-card";
import { useOrgBrandScores } from "@/hooks/use-org-brand-scores";
import type { OrganizationSummary } from "@/lib/organizations/types";

export function BrandHome({ brand, organization }: { brand: BrandWithPrompts; organization: OrganizationSummary }) {
	const scores = useOrgBrandScores(organization.id);
	return (
		<div className="mx-auto flex w-full max-w-4xl flex-col gap-4 py-2">
			<h1 className="px-1 text-2xl font-bold">{brand.name}</h1>
			<ScoreCard brandName={brand.name} entry={scores.data?.[brand.id]} loading={scores.isLoading} />
			<NextStepsCard />
			<KeywordsCard key={brand.keywords.join("\n")} brand={brand} />
			<KeywordMatchCard hasKeywords={brand.keywords.length > 0} />
			<EnginesCard />
		</div>
	);
}
```

- [ ] **Step 10: Route** — rewrite `apps/web/src/routes/_authed/app/org/$org/brand/$brand/index.tsx` keeping only `ResearchBrandData` (the onboarding wizard branch) and its imports, plus:
```tsx
export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/")({
	staticData: { crumb: t("dashboard.crumb"), bareHeader: true },
	head: pageHead({ description: t("dashboard.head_description") }),
	component: DashboardPage,
});

function DashboardPage() {
	const { brandId, organization } = Route.useRouteContext();
	const brand = useMatch({ from: BRAND_ROUTE_ID, select: (match) => match.loaderData?.brand });
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };

	if (!brand) return null;
	if (!brand.onboarded) return <ResearchBrandData brandId={brandId} clientConfig={context.clientConfig} />;
	return <BrandHome brand={brand} organization={organization} />;
}
```
(`useMatch` from `@tanstack/react-router`, `BRAND_ROUTE_ID` from `@/lib/route-subject`.) Delete every other helper in the file (`TrendSection`, `TrackingStats`, `AwaitingFirstEvaluation`, `useDashboardMetrics`, `useReportedPromptCount`, colour helpers, etc.). Delete `apps/web/src/stories/overview.stories.tsx` if it imports from this route.

- [ ] **Step 11: Strings** — add to `en.json`:
```json
	"home.card_error": "We couldn't load this part.",
	"home.try_again": "Try again",
	"home.score_title": "Your visibility score",
	"home.score_pending": "First results arrive within a day of setting up. Check back soon.",
	"home.score_sentence": "AI assistants mentioned {brand} in {mentioned} of {total} answers this month.",
	"home.score_up": "up {points} from last month",
	"home.score_down": "down {points} from last month",
	"home.score_coverage": "Seen in {seen} of {total} questions you track.",
	"home.next_title": "What to do next",
	"home.next_description": "The five changes most likely to get you mentioned more often.",
	"home.next_all": "See all recommendations",
	"home.next_empty": "We're preparing your first recommendations. Check back in about an hour.",
	"home.impact_high": "High impact",
	"home.impact_medium": "Medium impact",
	"home.impact_low": "Low impact",
	"home.cat_creation": "New content",
	"home.cat_existing": "Improve a page",
	"home.cat_outreach": "Get mentioned elsewhere",
	"home.cat_social": "Social",
	"home.cat_axo": "Website readiness",
	"home.keywords_title": "Your business keywords",
	"home.keywords_description": "Words customers would use to find a business like yours.",
	"home.keywords_placeholder": "Type a phrase and press Enter",
	"home.keywords_too_long": "Keep it under 60 characters.",
	"home.keywords_suggestions": "Suggestions:",
	"home.keywords_save": "Save keywords",
	"home.keywords_saving": "Saving…",
	"home.keywords_saved": "Saved",
	"home.match_title": "Do your website and keywords match?",
	"home.match_description": "AI assistants describe businesses using the words on their websites. Missing keywords are the easiest wins.",
	"home.match_headline": "{present} of {total} keywords found on your site",
	"home.match_no_keywords": "Add keywords above and we'll check your site for them.",
	"home.match_pending": "Checking your site… this takes a few minutes.",
	"home.match_failed": "We couldn't read your site. Check the address under Advanced › Brand settings.",
	"home.match_checking": "Checking…",
	"home.match_check_again": "Check again",
	"home.match_missing": "Missing",
	"home.match_weak": "Weak",
	"home.match_found": "Found",
	"home.match_add_hint": "Add to a page title or heading",
	"home.match_checked_today": "Checked today",
	"home.match_checked_days": "Checked {days} days ago",
	"home.engines_title": "AI engines and competitors",
	"home.engines_description": "Where you are strong, where you are weak, and who is ahead.",
	"home.engines_full": "Full breakdown",
	"home.engines_empty": "No answers recorded yet. Results appear after the first run.",
	"home.engines_engine": "Engine",
	"home.engines_you": "You",
	"home.engines_top_rival": "Top rival",
	"home.engines_no_rival": "No rival mentioned",
	"home.engines_lead": "You lead",
	"home.engines_close": "Close",
	"home.engines_behind": "They lead",
	"home.engines_leaderboard": "Overall share of voice",
```

- [ ] **Step 12: Verify**
```bash
cd /home/rigosis/projects/enrigio
pnpm --filter @workspace/web check-types && pnpm lint && pnpm --filter @workspace/web test
```
Then run the app against a database that has migration 0025 applied (ask the user to run it if `brands.keywords` does not exist; do not run it yourself) and walk: Home shows five cards; keywords save; check runs (worker must be running: `pnpm dev` starts it); engines table renders; Advanced › Share of voice still works; 390 px width stacks cleanly.

- [ ] **Step 13: Commit**
```bash
git add -A apps/web/src
git commit -m "add the brand Home with score, next steps, keywords, site match and engines"
```

---

### Task 13: Final gate and changeset

**Files:**
- Create: `.changeset/<name>.md`
- Modify: spec §6 note (Ubuntu kept for OG/export)

- [ ] **Step 1: Full gate**
```bash
cd /home/rigosis/projects/enrigio
pnpm lint && pnpm test && node_modules/.bin/turbo run build
```
All must pass. Fix anything `scripts/check-server-bundle.mjs` flags (a db import reaching the client chunk — move the offending import behind a `*-fn.ts` wrapper).

- [ ] **Step 2: Changeset** — `.changeset/brand-home-overhaul.md`:
```md
---
"@workspace/web": minor
"@workspace/worker": patch
"@workspace/lib": patch
---

New brand Home with a plain-language visibility score, next steps, business keywords, a keyword-to-website match check, and per-engine competitor comparison; detailed pages move under an Advanced menu.
```
(Use the package names as they appear in each `package.json`.)

- [ ] **Step 3: Spec touch-up** — in `docs/superpowers/specs/2026-10-20-ui-overhaul-design.md` §6 replace the sentence about removing the Ubuntu `@font-face`, preload and dependency with: "The Ubuntu face stays for the OG image and chart export wordmark; the app itself no longer uses it."

- [ ] **Step 4: Commit and report**
```bash
git add .changeset docs/superpowers/specs
git commit -m "add changeset for the brand Home overhaul"
git log --oneline main..HEAD
```
Report to the user: the branch, the migration they must run (`cd packages/lib && pnpm exec drizzle-kit migrate`), and that the worker must be restarted to pick up the `check-keywords` handler.
