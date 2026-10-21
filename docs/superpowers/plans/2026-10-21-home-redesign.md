# Home Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the top bar and the five Home cards to the designer's mock, add Mark done (persisted dismissals) and auto-saving keywords.

**Architecture:** Routes, hooks and server functions from the shipped overhaul stay. New design tokens in `styles.css`; two pure SVG components (`ScoreRing`, `Sparkline`); one new table (`opportunity_dismissals`) with two server functions; card markup rewritten to the mock's structure and copy.

**Tech Stack:** React 19, TanStack Start/Router/Query, Tailwind 4, shadcn + Base UI (`@workspace/ui`), Drizzle + Postgres, Vitest, Biome, pnpm + Turborepo.

**Spec:** `docs/superpowers/specs/2026-10-21-home-redesign-design.md` (visual source: `docs/ux-designer/Enrigio Home.dc.html`).

## Global Constraints

- Always `pnpm`; never `drizzle-kit migrate`/`push` (`generate` only, Task 3). Commit subjects are plain imperative sentences. Comments explain why only. Never `biome-ignore`. `pnpm lint:fix` for import ordering.
- Every new or changed i18n key goes into BOTH `apps/web/src/locales/en.json` and `apps/web/src/locales/tr.json` (a parity unit test enforces it). Keys are flat strings; keep both files valid JSON (tab-indented).
- Colours in Home and the shell come from tokens only: `border`, `divider`, `dashed`, `muted`, `muted-foreground`, `tint`, `tint-foreground`, `band-low|ok|good` (+`-foreground`), `delta-up`, `delta-down`, `primary`. No `rose-`/`amber-`/`emerald-` classes remain in `apps/web/src/components/home/**`, `top-bar.tsx`, `brand-strip.tsx`, `advanced-menu.tsx`, `nav-user.tsx`.
- Status is never conveyed by colour alone (a word or icon always accompanies it). Orange never carries text.
- Hooks import only `*-fn.ts` server-function modules.
- Tests verify behaviour. Run unit tests with `cd apps/web && pnpm exec vitest run --project=unit <path>`.
- No `.env` exists in this checkout: verify with `pnpm --filter @workspace/web check-types && pnpm lint && pnpm --filter @workspace/web test` from the repo root; say in every report that the browser pass did not run. `pnpm test`/`pnpm build` hit an "Exec format error" here; use `node_modules/.bin/turbo run test` / `run build` instead.
- Branch: `home-redesign` (already checked out). Repo root `/home/rigosis/projects/enrigio`. Do not commit `enrigio-logo-kit*` changes (they are already tracked; leave them alone).

---

### Task 1: Tokens, BandPill, ScoreRing and Sparkline

**Files:**
- Modify: `apps/web/src/styles.css` (`:root` and `@theme inline`)
- Modify: `apps/web/src/components/home/band-pill.tsx`
- Create: `apps/web/src/components/home/score-ring.tsx`, `apps/web/src/components/home/sparkline.tsx`, `apps/web/src/components/home/sparkline.test.ts`
- Create: `apps/web/src/lib/score-delta.ts`, `apps/web/src/lib/score-delta.test.ts`
- Modify: `apps/web/src/locales/en.json`, `tr.json`

**Interfaces:**
- Produces: tokens listed in Global Constraints; `<BandPill band={ScoreBand | "none"} />`; `<ScoreRing pct={number | null}>{overlay}</ScoreRing>`; `<Sparkline values={(number | null)[]} />` + `sparklinePath(values, W, H)`; `scoreDelta(score, previous) → { kind: "up" | "down" | "same" | "first" | "none"; points: number }`.

- [ ] **Step 1: Tokens** — in `styles.css` `:root`, change `--secondary`, `--muted`, `--accent` to `#f5f5fa`, `--muted-foreground` to `#52526b`, `--border` and `--input` to `#e4e4ef`, and add after `--brand-orange`:
```css
	--divider: #eeeef4;
	--dashed: #c4c4d6;
	--tint: #ededfc;
	--tint-foreground: #1f1fa8;
	--band-low: #fdecec;
	--band-low-foreground: #a3261f;
	--band-ok: #fff1e6;
	--band-ok-foreground: #9a4a12;
	--band-good: #e6f6ec;
	--band-good-foreground: #1e6b3a;
	--delta-up: #c2410c;
	--delta-down: #a3261f;
```
In `@theme inline` add one `--color-<name>: var(--<name>);` line for each of the twelve.

- [ ] **Step 2: Failing tests**

`apps/web/src/lib/score-delta.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { scoreDelta } from "@/lib/score-delta";

describe("scoreDelta", () => {
	it("reports the signed change against last month", () => {
		expect(scoreDelta(42, 37)).toEqual({ kind: "up", points: 5 });
		expect(scoreDelta(17, 21)).toEqual({ kind: "down", points: 4 });
		expect(scoreDelta(30, 30)).toEqual({ kind: "same", points: 0 });
	});
	it("distinguishes a first month from no data at all", () => {
		expect(scoreDelta(42, null)).toEqual({ kind: "first", points: 0 });
		expect(scoreDelta(null, 10)).toEqual({ kind: "none", points: 0 });
		expect(scoreDelta(null, null)).toEqual({ kind: "none", points: 0 });
	});
});
```
`apps/web/src/components/home/sparkline.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { sparklinePath } from "@/components/home/sparkline";

describe("sparklinePath", () => {
	it("draws one point per value from left to right, higher values nearer the top", () => {
		const d = sparklinePath([10, 20, 30], 400, 44);
		const points = d.match(/[ML]([\d.]+),([\d.]+)/g) ?? [];
		expect(points).toHaveLength(3);
		const ys = points.map((p) => Number(p.split(",")[1]));
		expect(ys[0]).toBeGreaterThan(ys[1]);
		expect(ys[1]).toBeGreaterThan(ys[2]);
		expect(d.startsWith("M0,")).toBe(true);
		expect(points[2]?.startsWith("L400,")).toBe(true);
	});
	it("skips gaps and returns an empty path with fewer than two points", () => {
		expect(sparklinePath([null, 5, null], 400, 44)).toBe("");
		expect(sparklinePath([5, null, 9], 400, 44)).toMatch(/^M0,.* L400,/);
	});
});
```
Run both → FAIL (modules missing).

- [ ] **Step 3: Implement**

`apps/web/src/lib/score-delta.ts`:
```ts
export type ScoreDeltaKind = "up" | "down" | "same" | "first" | "none";

export function scoreDelta(score: number | null | undefined, previous: number | null | undefined) {
	if (score === null || score === undefined) return { kind: "none" as const, points: 0 };
	if (previous === null || previous === undefined) return { kind: "first" as const, points: 0 };
	const diff = score - previous;
	if (diff === 0) return { kind: "same" as const, points: 0 };
	return { kind: diff > 0 ? ("up" as const) : ("down" as const), points: Math.abs(diff) };
}
```
`apps/web/src/components/home/sparkline.tsx`:
```tsx
export function sparklinePath(values: (number | null)[], width: number, height: number): string {
	const points = values
		.map((v, i) => ({ v, i }))
		.filter((p): p is { v: number; i: number } => typeof p.v === "number");
	if (points.length < 2) return "";
	const max = Math.max(...points.map((p) => p.v));
	const min = Math.min(...points.map((p) => p.v)) - 4;
	const x = (i: number) => (i * width) / (values.length - 1);
	const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
	return points.map((p, n) => `${n ? "L" : "M"}${x(p.i)},${y(p.v)}`).join(" ");
}

const W = 400;
const H = 44;

export function Sparkline({ values, className }: { values: (number | null)[]; className?: string }) {
	const d = sparklinePath(values, W, H);
	if (!d) return <div className={className} aria-hidden />;
	return (
		<svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden>
			<path d={`${d} L${W},${H} L0,${H} Z`} fill="var(--primary)" fillOpacity={0.08} />
			<path d={d} fill="none" stroke="var(--primary)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
		</svg>
	);
}
```
Note: `sparklinePath` with `[5, null, 9]` must still start at `M0` and end at `L400` because `x()` uses the original index. The first test's "one point per value" holds for gap-free input.

`apps/web/src/components/home/score-ring.tsx`:
```tsx
import type { ReactNode } from "react";

const R = 88;
const C = 2 * Math.PI * R;

export function ScoreRing({ pct, children }: { pct: number | null; children: ReactNode }) {
	const filled = pct === null ? 0 : (C * Math.min(100, Math.max(0, pct))) / 100;
	return (
		<div className="relative mx-auto size-[200px]">
			<svg viewBox="0 0 200 200" className="block size-full -rotate-90" aria-hidden>
				<circle cx={100} cy={100} r={R} fill="none" stroke="var(--divider)" strokeWidth={14} />
				<circle
					cx={100}
					cy={100}
					r={R}
					fill="none"
					stroke={pct === null ? "var(--divider)" : "var(--primary)"}
					strokeWidth={14}
					strokeLinecap="round"
					strokeDasharray={`${filled} ${C}`}
					className="transition-[stroke-dasharray] duration-500"
				/>
			</svg>
			<div className="absolute inset-0 flex flex-col items-center justify-center gap-1">{children}</div>
		</div>
	);
}
```
`band-pill.tsx` — replace STYLE/LABEL and the prop type:
```tsx
const STYLE: Record<ScoreBand | "none", string> = {
	low: "bg-band-low text-band-low-foreground",
	ok: "bg-band-ok text-band-ok-foreground",
	good: "bg-band-good text-band-good-foreground",
	none: "bg-muted text-muted-foreground",
};
const LABEL: Record<ScoreBand | "none", TranslationKey> = {
	low: "home.band_low", ok: "home.band_ok", good: "home.band_good", none: "home.band_none",
};
export function BandPill({ band, className }: { band: ScoreBand | "none"; className?: string }) {
	return (
		<span className={cn("inline-flex items-center rounded-full px-2.5 py-[3px] text-[13px] font-semibold", STYLE[band], className)}>
			{t(LABEL[band])}
		</span>
	);
}
```
Add `"home.band_none": "No data yet"` (tr: `"Henüz veri yok"`) to both locales.

- [ ] **Step 4: Verify** — both tests PASS; `pnpm --filter @workspace/web check-types && pnpm lint && pnpm --filter @workspace/web test` green.
- [ ] **Step 5: Commit** — `git add` the files above; `git commit -m "add the designer's colour tokens, score ring and sparkline"`.

---

### Task 2: Top bar restyle

**Files:**
- Modify: `apps/web/src/components/logo.tsx` (Enrigio branch only), `top-bar.tsx`, `brand-strip.tsx`, `advanced-menu.tsx`, `nav-user.tsx` (trigger only), `site-header.tsx` (sticky offset), `apps/web/src/lib/nav-links.ts`
- Create: `apps/web/src/lib/initials.ts`, `apps/web/src/lib/initials.test.ts`
- Modify: `en.json`, `tr.json`

**Interfaces:**
- Produces: `advancedGroups(scope, features, viewer)` now returns up to three groups labelled `top-bar.group_analysis` / `top-bar.group_brand` / `top-bar.group_organisation`; `initials(name: string | undefined, email: string | undefined): string`.

- [ ] **Step 1: Failing test** `apps/web/src/lib/initials.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { initials } from "@/lib/initials";

describe("initials", () => {
	it("takes the first letters of the first two words of the name", () => {
		expect(initials("Maya Demir", "x@y.z")).toBe("MD");
		expect(initials("ayşe", "x@y.z")).toBe("A");
	});
	it("falls back to the email, then to a question mark", () => {
		expect(initials(undefined, "semi.hop@rigosis.com")).toBe("S");
		expect(initials("", "")).toBe("?");
	});
});
```
Run → FAIL. Implement `apps/web/src/lib/initials.ts`:
```ts
export function initials(name: string | undefined, email: string | undefined): string {
	const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
	const source = words.length > 0 ? words.slice(0, 2).map((w) => w[0] ?? "") : [(email ?? "").trim()[0] ?? ""];
	const text = source.join("").toLocaleUpperCase();
	return text || "?";
}
```
Run → PASS.

- [ ] **Step 2: Logo** — in `logo.tsx` replace the Enrigio branch's `<img …enrigio-horizontal.svg…>` with:
```tsx
<img src="/brand/enrigio-mark.svg" alt="" className={cn("size-[34px]", iconClassName)} />
<span className={cn("text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground", textClassName)}>
	{DEFAULT_APP_NAME.toLowerCase()}
</span>
```
and give the wrapper `gap-2.5`. Add `aria-label={DEFAULT_APP_NAME}` on the wrapper div.

- [ ] **Step 3: nav-links** — replace `advancedGroups` (keep `NavItem`/`NavGroup`; delete `brandGroups` and `organizationGroups` if nothing else imports them — `grep -rn "brandGroups\|organizationGroups" apps/web/src`):
```ts
export function advancedGroups(
	scope: ShellScope,
	features: FeaturesConfig | undefined,
	viewer: { isAdmin: boolean; hasReportAccess: boolean },
): NavGroup[] {
	if (scope.section === "account") return [];
	const groups: NavGroup[] = [];
	const org = scope.organization;
	const brand = scope.brand;

	if (org && brand?.onboarded) {
		const params = brandLinkParams(org, brand);
		groups.push(
			{
				label: t("top-bar.group_analysis"),
				items: [
					{ title: t("app-sidebar.visibility"), link: { to: "/app/org/$org/brand/$brand/visibility", params }, icon: ChartBar },
					{ title: t("app-sidebar.share-of-voice"), link: { to: "/app/org/$org/brand/$brand/share-of-voice", params }, icon: Megaphone },
					{ title: t("app-sidebar.query-fan-out"), link: { to: "/app/org/$org/brand/$brand/query-fan-out", params }, icon: TreeStructure },
					{ title: t("app-sidebar.citations"), link: { to: "/app/org/$org/brand/$brand/citations", params }, icon: LinkIcon },
					{ title: t("app-sidebar.opportunities"), link: { to: "/app/org/$org/brand/$brand/opportunities", params }, icon: Target },
					{ title: t("app-sidebar.prompts"), link: { to: "/app/org/$org/brand/$brand/settings/prompts", params }, icon: ListChecks },
				],
			},
			{
				label: t("top-bar.group_brand"),
				items: [
					{ title: t("top-bar.brand_settings"), link: { to: "/app/org/$org/brand/$brand/settings/brand", params }, icon: Building },
					{ title: t("app-sidebar.competitors"), link: { to: "/app/org/$org/brand/$brand/settings/competitors", params }, icon: Buildings },
					{ title: t("top-bar.tracked_engines"), link: { to: "/app/org/$org/brand/$brand/settings/llms", params }, icon: Cpu },
					{ title: t("top-bar.evaluation_market"), link: { to: "/app/org/$org/brand/$brand/settings/brand", params }, icon: Building },
				],
			},
		);
	}

	if (org) {
		const params = orgLinkParams(org);
		const items: NavItem[] = [
			{ title: t("app-sidebar.organization"), link: { to: "/app/org/$org/settings", params }, icon: Briefcase, exact: true },
			{ title: t("app-sidebar.brands"), link: { to: "/app/org/$org/settings/brands", params }, icon: Buildings },
		];
		if (features?.teamInvites) items.push({ title: t("app-sidebar.team"), link: { to: "/app/org/$org/settings/members", params }, icon: Users });
		if (features?.billing) items.push({ title: t("app-sidebar.billing"), link: { to: "/app/org/$org/settings/billing", params }, icon: CreditCard });
		items.push(
			{ title: t("app-sidebar.api-keys"), link: { to: "/app/org/$org/settings/api-keys", params }, icon: Key },
			{ title: t("app-sidebar.api"), link: { to: "/app/org/$org/settings/api", params }, icon: Code },
			{ title: t("app-sidebar.mcp"), link: { to: "/app/org/$org/settings/mcp", params }, icon: PlugsConnected },
		);
		const reportsEnabled = features?.reportGeneration ?? true;
		items.push(...adminNavItems({ ...viewer, reportsEnabled }));
		groups.push({ label: t("top-bar.group_organisation"), items });
	}

	return groups;
}
```
Keys to add in both locales: `top-bar.group_analysis` "Analysis"/"Analiz", `top-bar.group_brand` "Brand"/"Marka", `top-bar.group_organisation` "Organisation"/"Organizasyon", `top-bar.brand_settings` "Brand settings"/"Marka ayarları", `top-bar.tracked_engines` "Tracked AI engines"/"İzlenen yapay zekâ motorları", `top-bar.evaluation_market` "Evaluation market"/"Değerlendirme pazarı". Remove now-unused icon imports.

- [ ] **Step 4: AdvancedMenu** — trigger and content:
```tsx
<DropdownMenuTrigger
	render={<Button variant="outline" className="h-10 gap-2 rounded-[10px] px-3.5 text-sm font-medium" />}
>
	{t("top-bar.advanced")}
	<CaretDown className="size-3" />
</DropdownMenuTrigger>
<DropdownMenuContent
	align="end"
	sideOffset={8}
	className="grid w-[520px] max-w-[calc(100vw-2rem)] grid-cols-1 gap-[18px] rounded-[14px] p-[18px] sm:grid-cols-3"
>
	{groups.map((group) => (
		<DropdownMenuGroup key={group.label} className="flex flex-col gap-0.5">
			<DropdownMenuLabel className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
				{group.label}
			</DropdownMenuLabel>
			{group.items.map((item) => (
				<DropdownMenuItem
					key={item.title}
					render={<Link {...item.link} />}
					className="cursor-pointer rounded-lg px-2 py-[7px] text-sm data-highlighted:bg-muted data-highlighted:text-primary"
				>
					{item.title}
				</DropdownMenuItem>
			))}
		</DropdownMenuGroup>
	))}
</DropdownMenuContent>
```
Drop the `Fragment`/`DropdownMenuSeparator`/`SlidersHorizontal` imports. If `DropdownMenuContent`'s base classes force `min-w`/flex that fight the grid, check `packages/ui/src/components/dropdown-menu.tsx` and override with the classes above (Tailwind merges via `cn`).

- [ ] **Step 5: NavUser trigger** — replace the trigger block with:
```tsx
<DropdownMenuTrigger
	render={
		<button
			type="button"
			aria-label={t("nav-user.account-and-organizations")}
			className="flex size-10 items-center justify-center rounded-full border bg-card text-sm font-semibold text-primary hover:bg-muted data-popup-open:bg-muted"
		/>
	}
>
	{user.picture ? (
		<Avatar className="size-10 rounded-full">
			<AvatarImage src={user.picture} alt={user.name} />
			<AvatarFallback className="rounded-full bg-card text-primary">{initials(user.name, user.email)}</AvatarFallback>
		</Avatar>
	) : (
		initials(user.name, user.email)
	)}
</DropdownMenuTrigger>
```
Import `initials` from `@/lib/initials`; remove `Button`/`CaretUpDown`/`User` imports if unused.

- [ ] **Step 6: BrandStrip** — rewrite the file:
```tsx
import { Link } from "@tanstack/react-router";
import { brandLinkParams, orgLinkParams } from "@workspace/lib/app-urls";
import { cn } from "@workspace/ui/lib/utils";
import { t } from "@/lib/i18n";
import type { OrganizationSummary } from "@/lib/organizations/types";
import { scoreDelta } from "@/lib/score-delta";

export interface BrandStripScore {
	score: number | null;
	previousScore: number | null;
}

// The mock's tile palette, cycled by position so neighbouring brands differ.
const TINTS = ["#2b2bd9", "#0b0b1a", "#52526b", "#1f1fa8", "#3a3a52"];

function DeltaText({ entry }: { entry: BrandStripScore }) {
	const delta = scoreDelta(entry.score, entry.previousScore);
	if (delta.kind === "none" || delta.kind === "first") return null;
	const glyph = delta.kind === "up" ? "▲" : delta.kind === "down" ? "▼" : "—";
	const color = delta.kind === "up" ? "text-delta-up" : delta.kind === "down" ? "text-delta-down" : "text-muted-foreground";
	const label = t(delta.kind === "up" ? "home.delta_up_short" : delta.kind === "down" ? "home.delta_down_short" : "home.delta_same_short", { points: delta.points });
	return (
		<span className={cn("font-medium", color)}>
			<span aria-hidden>{glyph} {delta.points}</span>
			<span className="sr-only">{label}</span>
		</span>
	);
}

function ScoreLine({ onboarded, entry }: { onboarded: boolean; entry: BrandStripScore | undefined }) {
	if (!onboarded) return <span className="text-[13px] text-muted-foreground">{t("brand-strip.setting_up")}</span>;
	if (!entry || entry.score === null) return <span className="text-[13px] text-muted-foreground">—</span>;
	return (
		<span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
			<span className="font-semibold tabular-nums text-foreground">{entry.score}%</span>
			<DeltaText entry={entry} />
		</span>
	);
}

export function BrandStrip({ organization, currentBrandId, scores }: {
	organization: OrganizationSummary;
	currentBrandId: string | undefined;
	scores: Record<string, BrandStripScore>;
}) {
	return (
		<nav
			aria-label={t("brand-strip.label")}
			className="order-last flex min-w-0 basis-full gap-2.5 overflow-x-auto px-0.5 py-1 [scrollbar-width:none] md:order-none md:flex-1 md:basis-auto"
		>
			{organization.brands.map((brand, index) => {
				const active = brand.id === currentBrandId;
				return (
					<Link
						key={brand.id}
						to="/app/org/$org/brand/$brand"
						params={brandLinkParams(organization, brand)}
						aria-current={active ? "page" : undefined}
						className={cn(
							"flex h-[60px] min-w-[150px] shrink-0 items-center gap-3 rounded-xl border bg-card px-3 text-left text-foreground transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
							active ? "border-primary shadow-[0_0_0_1px_var(--primary)]" : "border-border",
						)}
					>
						<span
							className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold text-white"
							style={{ background: TINTS[index % TINTS.length] }}
							aria-hidden
						>
							{brand.name.trim()[0]?.toLocaleUpperCase() ?? "?"}
						</span>
						<span className="flex min-w-0 flex-col gap-[3px]">
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
					aria-label={t("brand-strip.add")}
					className="flex size-[60px] shrink-0 items-center justify-center rounded-xl border border-dashed border-dashed text-[22px] leading-none text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
				>
					+
				</Link>
			)}
		</nav>
	);
}
```
(`border-dashed border-dashed` = Tailwind's dashed style + the `dashed` colour token; keep both.) Keys: `home.delta_up_short` "up {points}"/"{points} arttı", `home.delta_down_short` "down {points}"/"{points} azaldı", `home.delta_same_short` "no change"/"değişmedi".

- [ ] **Step 7: TopBar + SiteHeader** — in `top-bar.tsx` change the inner div classes to `mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-5 px-4 py-3 md:h-[84px] md:flex-nowrap md:px-6 md:py-0` and the right group to `ml-auto flex shrink-0 items-center gap-2`. In `site-header.tsx` change `md:top-16` to `md:top-[84px]`.

- [ ] **Step 8: Verify** — typecheck, lint, unit tests green; `grep -rn "rose-\|amber-\|emerald-" apps/web/src/components/top-bar.tsx apps/web/src/components/brand-strip.tsx apps/web/src/components/advanced-menu.tsx apps/web/src/components/nav-user.tsx` prints nothing.
- [ ] **Step 9: Commit** — `git commit -m "restyle the top bar, brand strip and Advanced menu to the designer's mock"`.

---

### Task 3: Opportunity dismissals (schema, migration, server functions, hook)

**Files:**
- Modify: `packages/lib/src/db/schema.ts`; generate migration `0026_opportunity_dismissals`
- Create: `apps/web/src/lib/opportunity-key.ts`, `apps/web/src/lib/opportunity-key.test.ts`, `apps/web/src/server/opportunity-dismissals-fn.ts`, `apps/web/src/hooks/use-opportunity-dismissals.tsx`
- Modify: `apps/web/src/components/home/next-steps.ts`, `next-steps.test.ts`

**Interfaces:**
- Produces: `opportunityKey(title): string`; `getDismissedOpportunitiesFn({ brandId }) → string[]`; `dismissOpportunityFn({ brandId, title }) → { dismissed: string[] }`; `useDismissedOpportunities(brandId?)` → `{ data: string[] | undefined, isLoading }`; `useDismissOpportunity(brandId?)` → mutation taking a title (optimistic); `pickNextSteps(opportunities, dismissedKeys: Iterable<string>)`.

- [ ] **Step 1: Failing tests**

`apps/web/src/lib/opportunity-key.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { opportunityKey } from "@/lib/opportunity-key";

describe("opportunityKey", () => {
	it("ignores case, surrounding and repeated whitespace, and unicode form", () => {
		expect(opportunityKey("  Add a  Pricing page ")).toBe("add a pricing page");
		expect(opportunityKey("Add a pricing page")).toBe(opportunityKey("ADD A PRICING PAGE"));
	});
});
```
Extend `next-steps.test.ts` (keep the existing cases, pass `[]` as the second argument there) with:
```ts
	it("skips dismissed opportunities so the next one fills in", () => {
		const picked = pickNextSteps(
			[opp("a", "high"), opp("b", "high"), opp("c", "medium"), opp("d", "medium"), opp("e", "low"), opp("f", "low")],
			["a", "C"].map(opportunityKey),
		);
		expect(picked.map((o) => o.title)).toEqual(["b", "d", "e", "f"]);
	});
```
Run → FAIL.

- [ ] **Step 2: Implement**

`apps/web/src/lib/opportunity-key.ts`:
```ts
/** Reports carry no ids, so a dismissal is keyed by the normalised title. */
export function opportunityKey(title: string): string {
	return title.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}
```
`next-steps.ts`:
```ts
import { opportunityKey } from "@/lib/opportunity-key";
import type { ReportOpportunity } from "@/server/opportunities";

export const NEXT_STEPS_COUNT = 5;
const RANK = { high: 0, medium: 1, low: 2 } as const;

export function pickNextSteps(opportunities: ReportOpportunity[], dismissedKeys: Iterable<string>): ReportOpportunity[] {
	const dismissed = new Set(dismissedKeys);
	return opportunities
		.map((o, index) => ({ o, index }))
		.filter(({ o }) => !dismissed.has(opportunityKey(o.title)))
		.sort((a, b) => (RANK[a.o.priority] ?? 1) - (RANK[b.o.priority] ?? 1) || a.index - b.index)
		.slice(0, NEXT_STEPS_COUNT)
		.map(({ o }) => o);
}
```
Run → PASS.

- [ ] **Step 3: Schema + migration** — in `schema.ts` after `brandOpportunities`:
```ts
// A dismissed next step, keyed by normalised title because reports carry no ids.
export const opportunityDismissals = pgTable(
	"opportunity_dismissals",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		brandId: text("brand_id")
			.references(() => brands.id)
			.notNull(),
		opportunityKey: text("opportunity_key").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => ({ brandKeyIdx: uniqueIndex("opportunity_dismissals_brand_key_idx").on(t.brandId, t.opportunityKey) }),
).enableRLS();
```
(`uniqueIndex` from `drizzle-orm/pg-core`; add to the existing import.) Then `cd packages/lib && pnpm exec drizzle-kit generate --name opportunity_dismissals` and confirm `0026_opportunity_dismissals.sql` creates the table, the unique index, the FK and enables RLS. Never run migrate.

- [ ] **Step 4: Server functions** `apps/web/src/server/opportunity-dismissals-fn.ts`:
```ts
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { opportunityDismissals } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { opportunityKey } from "@/lib/opportunity-key";

async function listDismissed(brandId: string): Promise<string[]> {
	const rows = await db
		.select({ key: opportunityDismissals.opportunityKey })
		.from(opportunityDismissals)
		.where(eq(opportunityDismissals.brandId, brandId));
	return rows.map((r) => r.key);
}

export const getDismissedOpportunitiesFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return listDismissed(data.brandId);
	});

export const dismissOpportunityFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), title: z.string().trim().min(1).max(500) }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		await db
			.insert(opportunityDismissals)
			.values({ brandId: data.brandId, opportunityKey: opportunityKey(data.title) })
			.onConflictDoNothing();
		return { dismissed: await listDismissed(data.brandId) };
	});
```

- [ ] **Step 5: Hook** `apps/web/src/hooks/use-opportunity-dismissals.tsx`:
```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import { opportunityKey } from "@/lib/opportunity-key";
import { dismissOpportunityFn, getDismissedOpportunitiesFn } from "@/server/opportunity-dismissals-fn";

const dismissalsKey = (brandId: string) => ["opportunity-dismissals", brandId] as const;

export function useDismissedOpportunities(brandId?: string) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	const query = useQuery({
		queryKey: dismissalsKey(resolvedBrandId ?? ""),
		queryFn: () => getDismissedOpportunitiesFn({ data: { brandId: resolvedBrandId! } }),
		enabled: !!resolvedBrandId,
		staleTime: 60_000,
	});
	return { data: query.data, isLoading: query.isLoading };
}

export function useDismissOpportunity(brandId?: string) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	const queryClient = useQueryClient();
	const key = dismissalsKey(resolvedBrandId ?? "");
	return useMutation({
		mutationFn: (title: string) => dismissOpportunityFn({ data: { brandId: resolvedBrandId!, title } }),
		// The row disappears at once; the server list replaces the guess when it lands.
		onMutate: async (title) => {
			await queryClient.cancelQueries({ queryKey: key });
			const previous = queryClient.getQueryData<string[]>(key) ?? [];
			queryClient.setQueryData<string[]>(key, [...previous, opportunityKey(title)]);
			return { previous };
		},
		onError: (_error, _title, context) => {
			if (context) queryClient.setQueryData(key, context.previous);
		},
		onSuccess: (result) => queryClient.setQueryData(key, result.dismissed),
	});
}
```

- [ ] **Step 6: Verify** — `cd packages/lib && pnpm exec tsc --noEmit`; web typecheck, lint, unit tests green.
- [ ] **Step 7: Commit** — `git add packages/lib/src/db apps/web/src/lib/opportunity-key.ts apps/web/src/lib/opportunity-key.test.ts apps/web/src/server/opportunity-dismissals-fn.ts apps/web/src/hooks/use-opportunity-dismissals.tsx apps/web/src/components/home/next-steps.ts apps/web/src/components/home/next-steps.test.ts`; `git commit -m "let users dismiss a next step"`.

---

### Task 4: Score card and Next steps card

**Files:**
- Modify: `apps/web/src/components/home/home-card.tsx`, `score-card.tsx`, `next-steps-card.tsx`, `brand-home.tsx` (props only), `en.json`, `tr.json`

**Interfaces:**
- Consumes: `ScoreRing`, `Sparkline`, `scoreDelta`, `BandPill` (`"none"`), `pickNextSteps(opps, keys)`, `useDismissedOpportunities`, `useDismissOpportunity`.
- Produces: `HomeCard` with optional `title`, header row support (`action` sits right of the title, baseline-aligned); `<ScoreCard brandName entry loading error onRetry />` unchanged signature; `<NextStepsCard />` unchanged.

- [ ] **Step 1: HomeCard** — rewrite to a plain section (no shadcn Card):
```tsx
export function HomeCard({ title, titleId, description, action, loading, error, onRetry, className, children }: {
	title?: string;
	titleId?: string;
	description?: string;
	action?: ReactNode;
	loading?: boolean;
	error?: unknown;
	onRetry?: () => void;
	className?: string;
	children: ReactNode;
}) {
	return (
		<section aria-labelledby={titleId} className={cn("flex min-w-0 flex-col gap-3.5 rounded-2xl border bg-card p-6 md:px-8", className)}>
			{title && (
				<div className="flex flex-wrap items-baseline justify-between gap-3">
					<h2 id={titleId} className="text-xl font-semibold tracking-[-0.01em]">{title}</h2>
					{action}
				</div>
			)}
			{description && <p className="text-sm text-muted-foreground">{description}</p>}
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
		</section>
	);
}
```
(Import `cn`; drop the Card imports.)

- [ ] **Step 2: ScoreCard** — rewrite the body (keep the PostHog effect and props):
```tsx
const DELTA_KEY: Record<ScoreDeltaKind, TranslationKey> = {
	up: "home.delta_up", down: "home.delta_down", same: "home.delta_same", first: "home.delta_first", none: "home.delta_none",
};
const DELTA_INK: Record<ScoreDeltaKind, string> = {
	up: "text-delta-up", down: "text-delta-down", same: "", first: "", none: "",
};
…
const score = entry?.score ?? null;
const band = scoreBand(score);
const delta = scoreDelta(score, entry?.previousScore);
const series = summary.data?.visibilityTimeSeries.map((p) => p.overall) ?? [];
return (
	<HomeCard loading={loading} error={error} onRetry={onRetry} className="md:grid md:grid-cols-[minmax(180px,220px)_minmax(0,1fr)] md:items-center md:gap-8 md:py-7">
		<ScoreRing pct={score}>
			<span className="text-[52px] font-semibold leading-none tracking-[-0.04em] tabular-nums">{score === null ? "—" : `${score}%`}</span>
			<BandPill band={band ?? "none"} />
		</ScoreRing>
		<div className="flex min-w-0 flex-col gap-3.5">
			<h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{t("home.score_title")}</h2>
			<p className="text-[22px] font-medium leading-[1.35] tracking-[-0.01em] text-pretty">
				{t("home.score_sentence_before", { brand: brandName })}{" "}
				<strong className="font-bold">{t("home.score_of", { mentioned: entry?.mentionedRuns ?? 0, total: entry?.totalRuns ?? 0 })}</strong>{" "}
				{t("home.score_sentence_after")}{" "}
				<strong className={cn("font-bold", DELTA_INK[delta.kind])}>{t(DELTA_KEY[delta.kind], { points: delta.points })}</strong>.
			</p>
			<p className="text-[15px] text-muted-foreground">
				{t("home.score_coverage", { seen: entry?.promptsWithMention ?? 0, total: entry?.totalPrompts ?? 0 })}
			</p>
			<div className="mt-1 flex items-end gap-4">
				<Sparkline values={series} className="h-11 w-full max-w-[420px]" />
				<span className="whitespace-nowrap text-xs text-muted-foreground">{t("home.last_30_days")}</span>
			</div>
		</div>
	</HomeCard>
);
```
`ScoreRing` wrapper needs `aria-label`: wrap it in `<div role="img" aria-label={…}>` with label `${score ?? "—"}% · ${band word}` built from `t(...)`. Delete the old `score_pending`, `score_sentence`, `score_up`, `score_down` keys from both locales and add:
`home.score_sentence_before` "AI assistants mentioned {brand} in" / "Yapay zekâ asistanları {brand} markasını", `home.score_of` "{mentioned} of {total}" / "{total} yanıtın {mentioned} tanesinde", `home.score_sentence_after` "answers this month," / "andı bu ay,", `home.delta_up` "up {points} from last month" / "geçen aya göre {points} puan yukarıda", `home.delta_down` "down {points} from last month" / "geçen aya göre {points} puan aşağıda", `home.delta_same` "the same as last month" / "geçen ayla aynı", `home.delta_first` "your first full month" / "ilk tam ayınız", `home.delta_none` "first results in about 6 hours" / "ilk sonuçlar yaklaşık 6 saat içinde", `home.last_30_days` "Last 30 days" / "Son 30 gün". (Turkish word order makes the three-part sentence read oddly; accept it — the translation worksheet owns polish.)

- [ ] **Step 3: NextStepsCard** — rewrite:
```tsx
export function NextStepsCard() {
	const params = useBrandParams();
	const { data, isLoading, error, refetch } = useOpportunities();
	const dismissed = useDismissedOpportunities();
	const dismiss = useDismissOpportunity();
	const all = data?.report?.opportunities ?? [];
	const steps = pickNextSteps(all, dismissed.data ?? []);
	const countText = steps.length === 0 ? null : steps.length === 1 ? t("home.next_top_one") : t("home.next_top_n", { n: steps.length });
	const emptyText = data?.report && all.length > 0 ? t("home.next_all_done") : t("home.next_empty");

	return (
		<HomeCard
			title={t("home.next_title")}
			titleId="home-next-steps"
			loading={isLoading || dismissed.isLoading}
			error={error}
			onRetry={() => refetch()}
			action={countText && <span className="text-sm text-muted-foreground">{countText}</span>}
		>
			{steps.length === 0 ? (
				<div className="rounded-xl border border-dashed border-dashed p-7 text-center text-[15px] text-muted-foreground">{emptyText}</div>
			) : (
				<ol className="flex flex-col">
					{steps.map((step, index) => (
						<li key={opportunityKey(step.title)} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-4 border-t border-divider py-4">
							<span className="flex size-7 items-center justify-center rounded-full bg-muted text-[13px] font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
							<div className="flex min-w-0 flex-col gap-1.5">
								<div className="text-base font-medium leading-[1.35] text-pretty">{step.title}</div>
								<div className="text-sm leading-[1.45] text-muted-foreground text-pretty">{step.why}</div>
								<div className="mt-0.5 flex flex-wrap gap-2">
									{step.priority && (
										<span className={cn("whitespace-nowrap rounded-full px-[9px] py-[3px] text-xs font-semibold", step.priority === "high" ? "bg-tint text-tint-foreground" : "bg-muted text-muted-foreground")}>
											{t(PRIORITY[step.priority])}
										</span>
									)}
									{CATEGORY[step.category] && (
										<span className="whitespace-nowrap rounded-full border bg-muted px-[9px] py-[3px] text-xs font-medium text-muted-foreground">{t(CATEGORY[step.category])}</span>
									)}
								</div>
							</div>
							<button
								type="button"
								onClick={() => dismiss.mutate(step.title)}
								disabled={dismiss.isPending}
								className="h-9 whitespace-nowrap rounded-[10px] border bg-card px-3.5 text-sm font-medium hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
							>
								{t("home.next_done")}
							</button>
						</li>
					))}
				</ol>
			)}
			<Link to="/app/org/$org/brand/$brand/opportunities" params={params} className="self-start text-sm font-medium text-primary hover:underline">
				{t("home.next_all")}
			</Link>
		</HomeCard>
	);
}
```
Keys: `home.next_top_n` "Your top {n}, by impact" / "Etkiye göre ilk {n}", `home.next_top_one` "Your top recommendation" / "En önemli öneriniz", `home.next_all_done` "You've done everything on the list. New recommendations arrive after the next check." / "Listedeki her şeyi yaptınız. Yeni öneriler bir sonraki kontrolden sonra gelir.", `home.next_done` "Mark done" / "Yapıldı olarak işaretle"; change `home.next_all` to "See all recommendations →" / "Tüm önerileri gör →"; delete `home.next_description`. Impact labels: change `home.impact_high` etc. to "High impact" / "Medium impact" / "Low impact" if they are not already.

- [ ] **Step 4: Verify** — typecheck, lint, tests. `grep -n "rose-\|amber-\|emerald-" apps/web/src/components/home/*.tsx` must not list these two files.
- [ ] **Step 5: Commit** — `git commit -m "restyle the score and next-steps cards and add Mark done"`.

---

### Task 5: Keywords card (auto-save) and Match card

**Files:**
- Modify: `apps/web/src/components/home/keywords-card.tsx`, `keyword-match-card.tsx`, `en.json`, `tr.json`

**Interfaces:**
- Consumes: `useUpdateBrandKeywords` mutation (prop `update`), `MAX_KEYWORDS`, `MAX_KEYWORD_LENGTH`, `dedupeKeywords`, `keywordsDiffer`, `BandPill`.
- Produces: `<KeywordsCard brand update />` (same props); `<KeywordMatchCard keywords />` (same).

- [ ] **Step 1: KeywordsCard** — rewrite:
```tsx
const SUGGESTION_COUNT = 10;
const SHOW_SUGGESTIONS_BELOW = 8;
const SAVED_VISIBLE_MS = 2500;

export function KeywordsCard({ brand, update }: { brand: BrandWithPrompts; update: ReturnType<typeof useUpdateBrandKeywords> }) {
	const [keywords, setKeywords] = useState<string[]>(brand.keywords);
	const [draft, setDraft] = useState("");
	const full = keywords.length >= MAX_KEYWORDS;

	// "Saved" is a moment, not a state: clear it so the next change starts from a quiet line.
	useEffect(() => {
		if (!update.isSuccess) return;
		const timer = setTimeout(() => update.reset(), SAVED_VISIBLE_MS);
		return () => clearTimeout(timer);
	}, [update.isSuccess, update.reset]);

	const suggestions = useMemo(() => {
		const taken = new Set(keywords.map((k) => k.toLowerCase()));
		return [...new Set(brand.prompts.flatMap((p) => p.tags ?? []))]
			.filter((tag) => tag.length <= MAX_KEYWORD_LENGTH && !taken.has(tag.toLowerCase()))
			.slice(0, SUGGESTION_COUNT);
	}, [brand.prompts, keywords]);

	const save = (next: string[]) => {
		const list = dedupeKeywords(next).slice(0, MAX_KEYWORDS);
		setKeywords(list);
		update.mutate(list);
	};
	const add = (value: string) => {
		const v = value.trim().slice(0, MAX_KEYWORD_LENGTH);
		if (!v || full) return;
		save([...keywords, v]);
		setDraft("");
	};

	const status = update.isPending ? t("home.keywords_saving") : update.isSuccess ? t("home.keywords_saved") : update.isError ? t("home.keywords_save_failed") : "";
	const placeholder = full ? t("home.keywords_full") : keywords.length ? t("home.keywords_add_another") : t("home.keywords_placeholder");

	return (
		<HomeCard
			title={t("home.keywords_title")}
			titleId="home-keywords"
			description={t("home.keywords_description")}
			action={<span className="text-sm tabular-nums text-muted-foreground">{keywords.length} / {MAX_KEYWORDS}</span>}
		>
			<div className={cn("flex min-h-[52px] flex-wrap items-center gap-2 rounded-xl border p-2.5 focus-within:border-primary", full ? "bg-muted" : "bg-card")}>
				{keywords.map((k) => (
					<span key={k.toLowerCase()} className="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-tint pl-3 pr-1.5 text-sm font-medium text-tint-foreground">
						{k}
						<button type="button" onClick={() => save(keywords.filter((x) => x !== k))} aria-label={t("home.keywords_remove", { keyword: k })} className="flex size-5 items-center justify-center rounded-full text-sm leading-none hover:bg-card">×</button>
					</span>
				))}
				<input
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); } }}
					disabled={full}
					placeholder={placeholder}
					aria-label={t("home.keywords_input_label")}
					className="h-[30px] min-w-40 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
				/>
			</div>
			{keywords.length < SHOW_SUGGESTIONS_BELOW && suggestions.length > 0 && (
				<div className="flex flex-col gap-2">
					<span className="text-[13px] text-muted-foreground">{t("home.keywords_suggestions")}</span>
					<div className="flex flex-wrap gap-2">
						{suggestions.map((tag) => (
							<button key={tag} type="button" onClick={() => add(tag)} className="h-[30px] whitespace-nowrap rounded-full border border-dashed border-dashed bg-card px-3 text-sm hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
								+ {tag}
							</button>
						))}
					</div>
				</div>
			)}
			<span aria-live="polite" className={cn("min-h-[18px] text-[13px]", update.isError ? "text-destructive" : "text-muted-foreground")}>{status}</span>
		</HomeCard>
	);
}
```
Keys: change `home.keywords_placeholder` to "Type a keyword and press Enter" / "Bir anahtar kelime yazıp Enter'a basın"; add `home.keywords_add_another` "Add another…" / "Bir tane daha ekle…", `home.keywords_full` "You have reached 20 keywords. Remove one to add another." / "20 anahtar kelimeye ulaştınız. Yenisini eklemek için birini kaldırın.", `home.keywords_remove` "Remove {keyword}" / "{keyword} kaldır", `home.keywords_input_label` "Add keyword" / "Anahtar kelime ekle"; change `home.keywords_suggestions` to "Suggested from the questions we ask about you" / "Sizin hakkınızda sorduğumuz sorulardan önerilenler"; delete `home.keywords_save` and `home.keywords_too_long`. Keep `brand-home.tsx`'s `key={brand.keywords.join("\n")}` on the card.

- [ ] **Step 2: KeywordMatchCard** — rewrite `Row`, `Results`, the pending and no-keyword states:
```tsx
const GROUPS: { status: KeywordStatus; label: TranslationKey; word: TranslationKey; icon: Icon; className: string }[] = [
	{ status: "missing", label: "home.match_missing", word: "home.match_missing", icon: Circle, className: "text-band-low-foreground" },
	{ status: "weak", label: "home.match_weak", word: "home.match_weak", icon: Warning, className: "text-band-ok-foreground" },
	{ status: "found", label: "home.match_found", word: "home.match_found", icon: Check, className: "text-band-good-foreground" },
];

function pageLabel(url: string): string {
	try { const u = new URL(url); return `${u.hostname}${u.pathname === "/" ? "/" : u.pathname}`; } catch { return url; }
}
function detailKey(r: KeywordResult): TranslationKey | null {
	if (r.status === "missing") return null;
	if (r.status === "weak") return "home.match_detail_weak";
	return r.where === "heading" ? "home.match_detail_heading" : "home.match_detail_body";
}

function Row({ result, group }: { result: KeywordResult; group: (typeof GROUPS)[number] }) {
	const detail = detailKey(result);
	return (
		<li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-divider py-[9px]">
			<span className="text-[15px] font-medium">{result.keyword}</span>
			<span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold", group.className)}>
				<group.icon className="size-3.5" aria-hidden /> {t(group.word)}
			</span>
			<span className="col-span-full text-[13px] text-muted-foreground">
				{detail && result.url ? (
					<>
						{t(detail)}{" "}
						<a href={result.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{pageLabel(result.url)}</a>
					</>
				) : (
					t("home.match_add_hint")
				)}
			</span>
		</li>
	);
}
```
Results header:
```tsx
<div className="flex flex-wrap items-center gap-3">
	<span className="text-[28px] font-semibold tracking-[-0.03em] tabular-nums">
		<strong className="font-bold">{t("home.match_found_of", { present, total: results.length })}</strong> {t("home.match_headline_rest", { pct: score ?? 0 })}
	</span>
	<BandPill band={band ?? "none"} />
</div>
<p className="text-sm leading-[1.45] text-muted-foreground">{t("home.match_description")}</p>
```
then, per group with rows, a heading `<div className="flex items-center gap-2 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{t(group.label)} <span className="text-xs font-medium normal-case tracking-normal text-muted-foreground/70">{count}</span></div>` followed by a `<ul>` of `Row`s; footer `<div className="flex items-center gap-3 pt-1 text-[13px] text-muted-foreground">{t("home.match_checked", { ago })} · <button …className="h-8 rounded-lg border bg-card px-3 text-[13px] font-medium hover:border-primary hover:text-primary" disabled={running}>{running ? t("home.match_checking") : t("home.match_check_again")}</button></div>`. Move the "Check again" button out of the `HomeCard` `action` (the card header shows only the title). Pending state:
```tsx
<div className="flex flex-col gap-2.5 py-2">
	{["w-3/5", "w-4/5", "w-[45%]"].map((w) => <div key={w} className={cn("h-3.5 animate-pulse rounded-md bg-divider motion-reduce:animate-none", w)} />)}
	<p className="mt-1.5 text-sm text-muted-foreground">{t("home.match_pending")}</p>
</div>
```
No keywords: `<div className="rounded-xl border border-dashed border-dashed p-7 text-center text-[15px] text-muted-foreground">{t("home.match_no_keywords")}</div>`. Keep the `stale`/`failure` notes. Pass the `HomeCard` `description` as `undefined` (the explanation now sits under the headline). Keys: add `home.match_found_of` "{present} of {total}" / "{total} anahtar kelimeden {present} tanesi", `home.match_headline_rest` "keywords found on your site — {pct} %" / "sitenizde bulundu — % {pct}", `home.match_detail_heading` "Found in a heading on" / "Şu sayfada bir başlıkta bulundu:", `home.match_detail_body` "Found in body text on" / "Şu sayfanın metninde bulundu:", `home.match_detail_weak` "Found once, in body text on" / "Şu sayfanın metninde bir kez bulundu:", `home.match_checked` "Checked {ago}" / "{ago} kontrol edildi"; change `home.match_add_hint` to "Add it to a page title or heading." / "Bir sayfa başlığına veya alt başlığına ekleyin.", `home.match_pending` to "Checking your website for your keywords. This takes a few minutes." / "Web siteniz anahtar kelimeleriniz için kontrol ediliyor. Bu birkaç dakika sürer.", `home.match_no_keywords` to "Add a few business keywords first and we'll check whether your website uses them." / "Önce birkaç işletme anahtar kelimesi ekleyin; web sitenizin bunları kullanıp kullanmadığını kontrol edelim."; `relative()` now returns just the "today" / "1 day ago" / "{days} days ago" fragment: change `home.match_checked_today` to "today"/"bugün", `home.match_checked_day` to "1 day ago"/"1 gün önce", `home.match_checked_days` to "{days} days ago"/"{days} gün önce"; delete `home.match_headline`.

- [ ] **Step 3: Verify** — typecheck, lint, tests; no rose/amber/emerald in these two files.
- [ ] **Step 4: Commit** — `git commit -m "auto-save business keywords and restyle the website match card"`.

---

### Task 6: Engines card and Home layout

**Files:**
- Modify: `apps/web/src/components/home/engines-card.tsx`, `brand-home.tsx`, `en.json`, `tr.json`

**Interfaces:**
- Consumes: `useEngineComparison`, `useShareOfVoice(undefined, { model })`, `EngineRow`, `ModelIcon`, `getModelMeta`.
- Produces: `<EnginesCard hasCompetitors />`; `BrandHome` layout per spec §3.

- [ ] **Step 1: EnginesCard** — rewrite:
```tsx
const TAG: Record<EngineVerdict, { label: TranslationKey; className: string }> = {
	lead: { label: "home.engines_lead", className: "bg-band-good text-band-good-foreground" },
	close: { label: "home.engines_close", className: "bg-band-ok text-band-ok-foreground" },
	behind: { label: "home.engines_behind", className: "bg-band-low text-band-low-foreground" },
};
const pct = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);
const LEADERBOARD_ROWS = 5;

export function EnginesCard({ hasCompetitors }: { hasCompetitors: boolean }) {
	const params = useBrandParams();
	const [model, setModel] = useState<string>("all");
	const engines = useEngineComparison();
	const sov = useShareOfVoice(undefined, model === "all" ? undefined : { model });
	const leaderboard = (sov.data?.entries ?? []).slice(0, LEADERBOARD_ROWS);
	const max = leaderboard[0]?.share || 1;
	const rows = engines.data ?? [];

	return (
		<HomeCard title={t("home.engines_title")} titleId="home-engines" loading={engines.isLoading} error={engines.error} onRetry={() => engines.refetch()}>
			{rows.length === 0 ? (
				<div className="rounded-xl border border-dashed border-dashed p-7 text-center text-[15px] text-muted-foreground">{t("home.engines_empty")}</div>
			) : (
				<div className="grid gap-8 md:grid-cols-[repeat(auto-fit,minmax(380px,1fr))]">
					<div className="flex min-w-0 flex-col">
						<div className="grid grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1.6fr)_auto] gap-3 pb-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
							<span>{t("home.engines_engine")}</span>
							<span className="text-right">{t("home.engines_you")}</span>
							<span>{t("home.engines_top_rival")}</span>
							<span className="sr-only">{t("home.engines_status")}</span>
						</div>
						{rows.map((row) => (
							<div key={row.model} className="grid grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1.6fr)_auto] items-center gap-3 border-t border-divider py-[11px] text-sm">
								<span className="flex min-w-0 items-center gap-2.5">
									<span className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-muted"><ModelIcon iconId={getModelMeta(row.model).iconId} className="size-4" /></span>
									<span className="truncate">{row.label}</span>
								</span>
								<span className="text-right font-semibold tabular-nums">{pct(row.brandRate)}</span>
								<span className="truncate text-muted-foreground">
									{hasCompetitors && row.topCompetitor ? (<>{row.topCompetitor.name} <span className="font-medium tabular-nums text-foreground">{pct(row.topCompetitor.rate)}</span></>) : "—"}
								</span>
								{!hasCompetitors ? (
									<Link to="/app/org/$org/brand/$brand/settings/competitors" params={params} className="whitespace-nowrap rounded-full bg-tint px-[9px] py-[3px] text-xs font-semibold text-tint-foreground hover:underline">{t("home.engines_add_competitors")}</Link>
								) : row.verdict ? (
									<span className={cn("whitespace-nowrap rounded-full px-[9px] py-[3px] text-xs font-semibold", TAG[row.verdict].className)}>{t(TAG[row.verdict].label)}</span>
								) : (<span />)}
							</div>
						))}
					</div>
					<div className="flex min-w-0 flex-col gap-3">
						<div className="flex items-center justify-between gap-3">
							<span className="text-sm font-medium">{t("home.engines_leaderboard")}</span>
							<select value={model} onChange={(e) => setModel(e.target.value)} aria-label={t("home.engines_filter_label")} className="h-8 rounded-lg border bg-card px-2.5 text-[13px]">
								<option value="all">{t("home.engines_all")}</option>
								{rows.map((row) => <option key={row.model} value={row.model}>{row.label}</option>)}
							</select>
						</div>
						<ol className="flex flex-col gap-2.5">
							{leaderboard.map((entry) => (
								<li key={entry.name} className="grid grid-cols-[120px_minmax(0,1fr)_44px] items-center gap-3 text-sm">
									<span className={cn("flex items-center gap-1.5 truncate", entry.isBrand && "font-semibold")}>
										{entry.name}
										{entry.isBrand && <span className="rounded-full bg-tint px-1.5 py-px text-[11px] font-semibold text-tint-foreground">{t("home.engines_you")}</span>}
									</span>
									<span className="block h-3 overflow-hidden rounded-full bg-divider"><span className={cn("block h-full rounded-full", entry.isBrand ? "bg-primary" : "bg-dashed")} style={{ width: `${Math.round((entry.share / max) * 100)}%` }} /></span>
									<span className="text-right tabular-nums text-muted-foreground">{Math.round(entry.share * 100)}%</span>
								</li>
							))}
						</ol>
						<Link to="/app/org/$org/brand/$brand/share-of-voice" params={params} className="mt-1 self-start text-sm font-medium text-primary hover:underline">{t("home.engines_full")}</Link>
					</div>
				</div>
			)}
		</HomeCard>
	);
}
```
Keys: change `home.engines_leaderboard` to "Who AI assistants mention most" / "Yapay zekâ asistanlarının en çok andığı", `home.engines_full` to "Full breakdown →" / "Tam döküm →"; add `home.engines_status` "Status" / "Durum", `home.engines_add_competitors` "Add competitors" / "Rakip ekle", `home.engines_filter_label` "Filter leaderboard by engine" / "Sıralamayı motora göre filtrele", `home.engines_all` "All engines" / "Tüm motorlar"; delete `home.engines_description` and `home.engines_no_rival`. Note `useShareOfVoice`'s second argument type is `ShareOfVoiceFilters` (`{ model?: string }`), and the leaderboard query key already includes the filters.

- [ ] **Step 2: BrandHome** — rewrite:
```tsx
function displayHost(website: string): string {
	try { return new URL(website).hostname; } catch { return website; }
}

export function BrandHome({ brand, organization }: { brand: BrandWithPrompts; organization: OrganizationSummary }) {
	const scores = useOrgBrandScores(organization.id);
	const updateKeywords = useUpdateBrandKeywords(brand.id);
	return (
		<div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 pb-10 pt-1">
			<div className="flex flex-wrap items-baseline gap-3">
				<h1 className="text-[26px] font-semibold tracking-[-0.02em]">{brand.name}</h1>
				<span className="text-sm text-muted-foreground">{t("home.site_this_month", { host: displayHost(brand.website) })}</span>
			</div>
			<ScoreCard brandName={brand.name} entry={scores.data?.[brand.id]} loading={scores.isLoading} error={scores.error} onRetry={() => scores.refetch()} />
			<NextStepsCard />
			<div className="grid gap-5 md:grid-cols-[repeat(auto-fit,minmax(380px,1fr))]">
				<KeywordsCard key={brand.keywords.join("\n")} brand={brand} update={updateKeywords} />
				<KeywordMatchCard keywords={brand.keywords} />
			</div>
			<EnginesCard hasCompetitors={brand.competitors.length > 0} />
		</div>
	);
}
```
Key: `home.site_this_month` "{host} · this month" / "{host} · bu ay".

- [ ] **Step 3: Verify** — typecheck, lint, tests; `grep -rn "rose-\|amber-\|emerald-" apps/web/src/components/home` prints nothing.
- [ ] **Step 4: Commit** — `git commit -m "restyle the engines card and lay the Home out like the mock"`.

---

### Task 7: Final gate and changeset

**Files:**
- Create: `.changeset/home-redesign.md`

- [ ] **Step 1: Gate** — `pnpm lint && node_modules/.bin/turbo run test && node_modules/.bin/turbo run build` all green. Also `node -e` or `python3 -I` check that `en.json` and `tr.json` parse and have identical key sets (the parity test already does this; just make sure it ran).
- [ ] **Step 2: Changeset**
```md
---
"@workspace/web": patch
"@workspace/lib": patch
---

The brand Home now follows the new design: a redesigned top bar and brand strip, a score ring with plain-language deltas, next steps you can mark done, keywords that save as you type, and an engine filter on the leaderboard.
```
- [ ] **Step 3: Commit** — `git commit -m "add changeset for the Home redesign"`; print `git log --oneline main..HEAD`. Report that migration 0026 must be run by the operator.
