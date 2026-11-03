# Score v2 Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make score v2, intent sub-scores and brand accuracy computable from existing data, gate v2 behind an offline back-test, and show all of them to admins without changing any user-facing number.

**Architecture:** Pure scoring math lives in `packages/lib/src/score/` and is shared by the read layer (SQL `CASE` built from the same weight constant) and the back-test script. Two new columns (`prompts.intent`, `prompt_runs.accuracy_claims`) are filled by the existing brand-analysis job and mention classifier. One admin-only server function aggregates everything for a new `/admin/scores` page.

**Tech Stack:** TypeScript, Drizzle ORM + drizzle-kit migrations, PostgreSQL, Vitest, TanStack Start server functions, pg-boss worker, shadcn table, `tsx` scripts with `pg`.

**Spec:** `docs/superpowers/specs/2026-11-03-score-v2-foundations-design.md`

## Global Constraints

- Node.js 24, pnpm only; never npm/npx. Run tests with `pnpm --filter <pkg> test -- <file>`.
- Migrations: generate with `pnpm exec drizzle-kit generate` from `packages/lib`. **Never run `drizzle-kit migrate`.**
- `prompt_runs.accuracy_claims` is nullable with no default: null = not assessed. Never default it to `[]`.
- Score v2 weights: not mentioned 0; rank 1 → 1.0; rank 2 → 0.7; rank 3 → 0.5; rank ≥ 4 or null → 0.3. One constant, `packages/lib/src/score/v2.ts`.
- v2 and sub-scores use **enabled unbranded prompts** only; branded status via `getEffectiveBrandedStatus(systemTags, tags)`.
- Intent enum values: `discovery | comparison | local | price`. Null = unclassified.
- v2 averages over runs, exactly as v1 does, so a platform sampled four times a day weighs four times one sampled once. Deliberate: the back-test isolates rank weighting. Do not normalise by prompt × model here.
- No user-facing surface (Home, Prompts, reports, API v1, MCP) changes shape or value.
- Commit subjects: plain imperative sentences, no prefixes. Commit after every task.
- Comments explain why only. Mark deliberate shortcuts with a `// ponytail:` comment.
- Before handing back: `pnpm lint` must pass.

---

## File map

| File | Responsibility |
|---|---|
| `packages/lib/src/score/v2.ts` (new) | Weight table, `weightFor`, `scoreV2` |
| `packages/lib/src/score/backtest.ts` (new) | `spearman`, `direction`, `verdict` |
| `packages/lib/src/score/*.test.ts` (new) | Unit tests for the above |
| `packages/lib/package.json` | Export `./score`, add script entries |
| `packages/lib/src/db/schema.ts` | `promptIntentEnum`, `prompts.intent`, `promptRuns.accuracyClaims`, `AccuracyClaim` type |
| `packages/lib/src/db/migrations/0027_*.sql` (generated) | The two columns |
| `packages/lib/src/mention-classify.ts` + test | Optional `profile`, `claims` output |
| `apps/worker/src/jobs/process-prompt.ts` + test | Pass profile for branded prompts, write `accuracyClaims` |
| `packages/lib/src/onboarding/analyze.ts` | `intent` on suggested prompts |
| `apps/web/src/server/onboarding-core.ts` | `intent` through `promptInputSchema` and `insertPrompts` |
| `apps/web/src/components/prompts-list-editor.tsx`, `prompt-wizard.tsx` | Carry `intent` from suggestion to save payload |
| `apps/web/src/lib/postgres-read.ts` | `getScoreV2Summary`, `getIntentScoreSummary`, `getAccuracySummary` |
| `apps/web/src/server/scores.ts` (new) + test | `getAdminScoreBreakdownFn` |
| `apps/web/src/routes/_authed/admin/scores.tsx` (new), `apps/web/src/lib/admin-nav.ts` | Admin table + nav item |
| `packages/lib/scripts/backtest-score-v2.ts` (new) | Phase V back-test and `--labels` export |
| `packages/lib/scripts/backfill-prompt-intent.ts` (new) | One-off intent classification |

---

### Task 1: Score math module

**Files:**
- Create: `packages/lib/src/score/v2.ts`
- Create: `packages/lib/src/score/v2.test.ts`
- Modify: `packages/lib/package.json` (exports)

**Interfaces:**
- Produces: `RANK_WEIGHTS = { rank1: 1, rank2: 0.7, rank3: 0.5, other: 0.3 }`, `weightFor(run: { brandMentioned: boolean; brandRank: number | null }): number`, `scoreV2(runs: ScoredRun[]): number | null` (rounded 0–100, null on empty).

- [ ] **Step 1: Write the failing test**

```ts
// packages/lib/src/score/v2.test.ts
import { describe, expect, it } from "vitest";
import { RANK_WEIGHTS, scoreV2, weightFor } from "./v2";

describe("weightFor", () => {
	it("gives 0 when the brand is not mentioned, whatever the rank says", () => {
		expect(weightFor({ brandMentioned: false, brandRank: 1 })).toBe(0);
	});
	it("steps down by rank and floors at the 'other' weight", () => {
		expect(weightFor({ brandMentioned: true, brandRank: 1 })).toBe(RANK_WEIGHTS.rank1);
		expect(weightFor({ brandMentioned: true, brandRank: 2 })).toBe(RANK_WEIGHTS.rank2);
		expect(weightFor({ brandMentioned: true, brandRank: 3 })).toBe(RANK_WEIGHTS.rank3);
		expect(weightFor({ brandMentioned: true, brandRank: 7 })).toBe(RANK_WEIGHTS.other);
	});
	it("treats a mention with no rank as the 'other' weight", () => {
		expect(weightFor({ brandMentioned: true, brandRank: null })).toBe(RANK_WEIGHTS.other);
	});
});

describe("scoreV2", () => {
	it("is null with no runs", () => {
		expect(scoreV2([])).toBeNull();
	});
	it("is the rounded mean weight × 100", () => {
		const runs = [
			{ brandMentioned: true, brandRank: 1 }, // 1.0
			{ brandMentioned: true, brandRank: 2 }, // 0.7
			{ brandMentioned: false, brandRank: null }, // 0
			{ brandMentioned: true, brandRank: null }, // 0.3
		];
		expect(scoreV2(runs)).toBe(50); // (1 + 0.7 + 0 + 0.3) / 4 = 0.5
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/lib test -- src/score/v2.test.ts`
Expected: FAIL, cannot find module `./v2`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/lib/src/score/v2.ts
/**
 * Score v2: rank-weighted visibility. Lives here so the SQL read layer and
 * the offline back-test build from the same numbers and cannot drift.
 */
export const RANK_WEIGHTS = { rank1: 1, rank2: 0.7, rank3: 0.5, other: 0.3 } as const;

export interface ScoredRun {
	brandMentioned: boolean;
	brandRank: number | null;
}

export function weightFor(run: ScoredRun): number {
	if (!run.brandMentioned) return 0;
	if (run.brandRank === 1) return RANK_WEIGHTS.rank1;
	if (run.brandRank === 2) return RANK_WEIGHTS.rank2;
	if (run.brandRank === 3) return RANK_WEIGHTS.rank3;
	return RANK_WEIGHTS.other;
}

export function scoreV2(runs: readonly ScoredRun[]): number | null {
	if (runs.length === 0) return null;
	const total = runs.reduce((sum, run) => sum + weightFor(run), 0);
	return Math.round((total / runs.length) * 100);
}
```

- [ ] **Step 4: Export the module**

In `packages/lib/package.json`, inside `"exports"`, add after the `"./mention-classify"` line:

```json
		"./score": "./src/score/index.ts",
```

Create `packages/lib/src/score/index.ts`:

```ts
export { RANK_WEIGHTS, type ScoredRun, scoreV2, weightFor } from "./v2";
export { type Direction, direction, spearman, type Verdict, type VerdictRow, verdict } from "./backtest";
```

(`./backtest` is written in Task 2; until then leave its export line out and add it in Task 2.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @workspace/lib test -- src/score/v2.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/lib/src/score packages/lib/package.json
git commit -m "add the rank-weighted score v2 math"
```

---

### Task 2: Back-test statistics

**Files:**
- Create: `packages/lib/src/score/backtest.ts`
- Create: `packages/lib/src/score/backtest.test.ts`
- Modify: `packages/lib/src/score/index.ts`

**Interfaces:**
- Produces: `spearman(a: number[], b: number[]): number | null` (null if < 3 pairs or zero variance), `direction(now: number, before: number): Direction` with `type Direction = "up" | "down" | "flat"`, `verdict(rows: VerdictRow[]): Verdict` with
  ```ts
  interface VerdictRow { spearman: number | null; directionV1: Direction; directionV2: Direction; trendGap: number }
  type Verdict = { outcome: "pass" | "fail" | "inconclusive"; reasons: string[] }
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// packages/lib/src/score/backtest.test.ts
import { describe, expect, it } from "vitest";
import { direction, spearman, verdict } from "./backtest";

describe("spearman", () => {
	it("is 1 for identical orderings and -1 for reversed", () => {
		expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBe(1);
		expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBe(-1);
	});
	it("uses average ranks for ties", () => {
		// a has a tie at positions 2 and 3 → ranks 1, 2.5, 2.5, 4
		const r = spearman([1, 2, 2, 3], [1, 2, 3, 4]);
		expect(r).toBeCloseTo(0.9487, 3);
	});
	it("is null with fewer than 3 pairs or no variance", () => {
		expect(spearman([1, 2], [1, 2])).toBeNull();
		expect(spearman([5, 5, 5], [1, 2, 3])).toBeNull();
	});
});

describe("direction", () => {
	it("marks ±3 as a move and anything smaller as flat", () => {
		expect(direction(40, 37)).toBe("up");
		expect(direction(37, 40)).toBe("down");
		expect(direction(40, 38)).toBe("flat");
		expect(direction(38, 40)).toBe("flat");
	});
});

describe("verdict", () => {
	const good = { spearman: 0.9, directionV1: "up" as const, directionV2: "up" as const, trendGap: 1 };
	it("is inconclusive below five brands", () => {
		expect(verdict([good, good, good, good]).outcome).toBe("inconclusive");
	});
	it("passes when 80% correlate, no direction flips, and the median trend gap is within 5", () => {
		const weak = { ...good, spearman: 0.2 };
		expect(verdict([good, good, good, good, weak]).outcome).toBe("pass");
	});
	it("fails on a direction flip", () => {
		const flipped = { ...good, directionV2: "down" as const };
		const v = verdict([good, good, good, good, flipped]);
		expect(v.outcome).toBe("fail");
		expect(v.reasons.join(" ")).toMatch(/direction/);
	});
	it("fails when the median trend gap exceeds 5", () => {
		const wide = { ...good, trendGap: 9 };
		expect(verdict([wide, wide, wide, good, good]).outcome).toBe("fail");
	});
	it("fails when under 80% of brands correlate", () => {
		const weak = { ...good, spearman: 0.5 };
		expect(verdict([good, good, good, weak, weak]).outcome).toBe("fail");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @workspace/lib test -- src/score/backtest.test.ts`
Expected: FAIL, cannot find module `./backtest`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/lib/src/score/backtest.ts
/** Statistics for the phase V back-test. Thresholds come from the proposal (section 5). */

export type Direction = "up" | "down" | "flat";

const MOVE_THRESHOLD = 3;
const MIN_BRANDS = 5;
const MIN_SPEARMAN = 0.7;
const MIN_CORRELATED_SHARE = 0.8;
const MAX_MEDIAN_TREND_GAP = 5;

function averageRanks(values: number[]): number[] {
	const order = values.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v);
	const ranks = new Array<number>(values.length);
	let k = 0;
	while (k < order.length) {
		let j = k;
		while (j + 1 < order.length && order[j + 1].v === order[k].v) j++;
		const rank = (k + j) / 2 + 1;
		for (let m = k; m <= j; m++) ranks[order[m].i] = rank;
		k = j + 1;
	}
	return ranks;
}

/** Pearson correlation of average ranks, which is Spearman with tie correction. */
export function spearman(a: number[], b: number[]): number | null {
	if (a.length !== b.length || a.length < 3) return null;
	const ra = averageRanks(a);
	const rb = averageRanks(b);
	const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
	const ma = mean(ra);
	const mb = mean(rb);
	let num = 0;
	let da = 0;
	let db = 0;
	for (let i = 0; i < ra.length; i++) {
		num += (ra[i] - ma) * (rb[i] - mb);
		da += (ra[i] - ma) ** 2;
		db += (rb[i] - mb) ** 2;
	}
	if (da === 0 || db === 0) return null;
	return num / Math.sqrt(da * db);
}

export function direction(now: number, before: number): Direction {
	const delta = now - before;
	if (delta >= MOVE_THRESHOLD) return "up";
	if (delta <= -MOVE_THRESHOLD) return "down";
	return "flat";
}

export interface VerdictRow {
	spearman: number | null;
	directionV1: Direction;
	directionV2: Direction;
	trendGap: number;
}

export interface Verdict {
	outcome: "pass" | "fail" | "inconclusive";
	reasons: string[];
}

export function verdict(rows: VerdictRow[]): Verdict {
	if (rows.length < MIN_BRANDS) {
		return { outcome: "inconclusive", reasons: [`${rows.length} qualifying brand(s); need ${MIN_BRANDS}`] };
	}
	const reasons: string[] = [];
	const correlated = rows.filter((r) => r.spearman !== null && r.spearman >= MIN_SPEARMAN).length;
	if (correlated / rows.length < MIN_CORRELATED_SHARE) {
		reasons.push(`only ${correlated}/${rows.length} brands have Spearman ≥ ${MIN_SPEARMAN}`);
	}
	const flips = rows.filter((r) => r.directionV1 !== r.directionV2).length;
	if (flips > 0) reasons.push(`${flips} brand(s) change direction between v1 and v2`);
	const gaps = rows.map((r) => r.trendGap).sort((x, y) => x - y);
	const median = gaps.length % 2 ? gaps[(gaps.length - 1) / 2] : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2;
	if (median > MAX_MEDIAN_TREND_GAP) reasons.push(`median trend gap ${median} > ${MAX_MEDIAN_TREND_GAP}`);
	return { outcome: reasons.length === 0 ? "pass" : "fail", reasons };
}
```

- [ ] **Step 4: Add the export line to `packages/lib/src/score/index.ts`**

```ts
export { type Direction, direction, spearman, type Verdict, type VerdictRow, verdict } from "./backtest";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @workspace/lib test -- src/score`
Expected: PASS (all tests in both files).

- [ ] **Step 6: Commit**

```bash
git add packages/lib/src/score
git commit -m "add the back-test statistics for score v2"
```

---

### Task 3: Schema columns and migration

**Files:**
- Modify: `packages/lib/src/db/schema.ts:28-31` (enums), `:71-93` (prompts), `:113-147` (promptRuns), `:290-300` (types)
- Create: `packages/lib/src/db/migrations/0027_*.sql` (generated)

**Interfaces:**
- Produces: `promptIntentEnum`, `PROMPT_INTENTS = ["discovery","comparison","local","price"] as const`, `type PromptIntent`, `prompts.intent`, `promptRuns.accuracyClaims`, `type AccuracyClaim = { claim: string; status: "contradicted" | "unsupported" }`.

- [ ] **Step 1: Add the enum and types**

After line 31 (`keywordCheckStatusEnum`) in `packages/lib/src/db/schema.ts`:

```ts
export const PROMPT_INTENTS = ["discovery", "comparison", "local", "price"] as const;
export type PromptIntent = (typeof PROMPT_INTENTS)[number];
export const promptIntentEnum = pgEnum("prompt_intent", PROMPT_INTENTS);

/** One factual claim an AI answer made about the brand, judged against the brand profile. */
export interface AccuracyClaim {
	claim: string;
	status: "contradicted" | "unsupported";
}
```

- [ ] **Step 2: Add the columns**

In `prompts`, after `systemTags`:

```ts
		/** Buyer intent for the score's sub-scores. Null = not classified. Brand questions stay null. */
		intent: promptIntentEnum("intent"),
```

In `promptRuns`, after `brandRank`:

```ts
		// Null = not assessed (every historical row, a classifier failure, or an
		// unbranded prompt). An empty array is a positive "assessed, nothing
		// contradicted" — never default this column.
		accuracyClaims: jsonb("accuracy_claims").$type<AccuracyClaim[]>(),
```

- [ ] **Step 3: Generate the migration**

Run from `packages/lib`:

```bash
pnpm exec drizzle-kit generate --name prompt_intent_and_accuracy_claims
```

Expected: a new file `src/db/migrations/0027_prompt_intent_and_accuracy_claims.sql` containing `CREATE TYPE "public"."prompt_intent" AS ENUM('discovery', 'comparison', 'local', 'price')`, `ALTER TABLE "prompts" ADD COLUMN "intent" "prompt_intent"`, and `ALTER TABLE "prompt_runs" ADD COLUMN "accuracy_claims" jsonb`, plus the updated `meta/0027_snapshot.json` and `_journal.json`. Open it and confirm there is **no** `DEFAULT` on `accuracy_claims`. Do not run `drizzle-kit migrate`.

- [ ] **Step 4: Type-check**

Run: `pnpm --filter @workspace/lib check-types`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/lib/src/db
git commit -m "add prompt intent and run accuracy claims columns"
```

---

### Task 4: Classifier returns accuracy claims

**Files:**
- Modify: `packages/lib/src/mention-classify.ts`
- Modify: `packages/lib/src/mention-classify.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface BrandProfile { name: string; website: string; additionalDomains: string[]; aliases: string[]; keywords: string[] }
  interface MentionClassification { sentiment: ...; brandRank: number | null; claims?: AccuracyClaim[] }
  classifyMention(input: { answer; brandName; competitorNames; profile?: BrandProfile }): Promise<MentionClassification | null>
  ```
  `claims` is present only when `profile` was given.

- [ ] **Step 1: Write the failing tests** (append to the existing `describe("classifyMention")`)

```ts
	it("asks for claims and returns them only when a profile is given", async () => {
		runStructuredCompletionPrompt.mockResolvedValue({
			object: {
				sentiment: "neutral",
				brandRank: null,
				claims: [{ claim: "Acme is based in Berlin", status: "contradicted" }],
			},
		});
		const out = await classifyMention({
			answer: "Acme, based in Berlin, sells widgets.",
			brandName: "Acme",
			competitorNames: [],
			profile: { name: "Acme", website: "acme.example", additionalDomains: [], aliases: [], keywords: ["widgets"] },
		});
		expect(out).toEqual({
			sentiment: "neutral",
			brandRank: null,
			claims: [{ claim: "Acme is based in Berlin", status: "contradicted" }],
		});
		const prompt = runStructuredCompletionPrompt.mock.calls.at(-1)?.[0] as string;
		expect(prompt).toContain("acme.example");
		expect(prompt).toContain("widgets");
	});

	it("omits claims when no profile is given, even if the model returns some", async () => {
		runStructuredCompletionPrompt.mockResolvedValue({
			object: { sentiment: "positive", brandRank: 1, claims: [{ claim: "x", status: "unsupported" }] },
		});
		const out = await classifyMention({ answer: "Acme is first.", brandName: "Acme", competitorNames: [] });
		expect(out).toEqual({ sentiment: "positive", brandRank: 1 });
	});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @workspace/lib test -- src/mention-classify.test.ts`
Expected: the two new tests FAIL (claims missing / profile text absent).

- [ ] **Step 3: Implement**

Replace the body of `packages/lib/src/mention-classify.ts` below the imports with:

```ts
import type { AccuracyClaim } from "./db/schema";

export interface MentionClassification {
	sentiment: "positive" | "neutral" | "negative";
	brandRank: number | null;
	/** Present only when a profile was supplied. */
	claims?: AccuracyClaim[];
}

/** The facts the classifier may call an answer wrong about. Identity only until the wizard adds more. */
export interface BrandProfile {
	name: string;
	website: string;
	additionalDomains: string[];
	aliases: string[];
	keywords: string[];
}

const baseSchema = z.object({
	sentiment: z.enum(["positive", "neutral", "negative"]).describe("How the answer speaks about the brand overall."),
	brandRank: z
		.number()
		.int()
		.min(1)
		.nullable()
		.describe(
			"1-based position of the brand among all named options in the answer (1 = recommended first). Null if the answer implies no ordering.",
		),
});

const claimsSchema = baseSchema.extend({
	claims: z
		.array(
			z.object({
				claim: z.string().describe("A factual statement the answer makes about the brand, quoted or closely paraphrased."),
				status: z
					.enum(["contradicted", "unsupported"])
					.describe(
						"'contradicted' only when the profile states otherwise. 'unsupported' when the profile says nothing about it.",
					),
			}),
		)
		.describe("Every factual claim about the brand that is not confirmed by the profile. Empty if all are confirmed."),
});

function profileText(profile: BrandProfile): string {
	return [
		`Canonical name: ${profile.name}`,
		`Website: ${profile.website}`,
		profile.additionalDomains.length ? `Other domains: ${profile.additionalDomains.join(", ")}` : "",
		profile.aliases.length ? `Also known as: ${profile.aliases.join(", ")}` : "",
		profile.keywords.length ? `What the business does (owner's words): ${profile.keywords.join("; ")}` : "",
	]
		.filter(Boolean)
		.join("\n");
}

export async function classifyMention(input: {
	answer: string;
	brandName: string;
	competitorNames: string[];
	profile?: BrandProfile;
}): Promise<MentionClassification | null> {
	const prompt = [
		`An AI assistant produced this answer:\n"""\n${input.answer}\n"""`,
		`The brand of interest is "${input.brandName}".`,
		input.competitorNames.length ? `Other tracked brands: ${input.competitorNames.join(", ")}.` : "",
		`Classify the sentiment toward "${input.brandName}" and its 1-based rank among all named options in the answer.`,
		input.profile
			? `This is the authoritative profile of the brand:\n${profileText(input.profile)}\n\nList every factual claim the answer makes about the brand that the profile does not confirm. Mark a claim "contradicted" only when the profile states something different; mark it "unsupported" when the profile is silent.`
			: "",
	]
		.filter(Boolean)
		.join("\n\n");

	try {
		// runStructuredCompletionPrompt is web-search OFF: a single completion over the
		// context in the prompt, no tools, no agent loop. Returns { object, modelVersion }.
		if (input.profile) {
			const { object } = await runStructuredCompletionPrompt(prompt, claimsSchema);
			return { sentiment: object.sentiment, brandRank: object.brandRank, claims: object.claims };
		}
		const { object } = await runStructuredCompletionPrompt(prompt, baseSchema);
		return { sentiment: object.sentiment, brandRank: object.brandRank };
	} catch (error) {
		console.error("[mention-classify] classification failed:", error);
		return null;
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @workspace/lib test -- src/mention-classify.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/lib/src/mention-classify.ts packages/lib/src/mention-classify.test.ts
git commit -m "let the mention classifier check answers against a brand profile"
```

---

### Task 5: Worker writes accuracy claims for branded prompts

**Files:**
- Modify: `apps/worker/src/jobs/process-prompt.ts:206-242` (`savePromptRun`), `:297-370` (`runModelIteration`), `:487-496` (call site)
- Modify: `apps/worker/src/jobs/process-prompt.test.ts`

**Interfaces:**
- Consumes: `classifyMention` with `profile` (Task 4), `promptRuns.accuracyClaims` (Task 3), `getEffectiveBrandedStatus` from `@workspace/lib/tag-utils`.
- Produces: `runModelIteration` takes a new `branded: boolean`; `savePromptRun` takes `accuracyClaims: AccuracyClaim[] | null` after `brandRank`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/worker/src/jobs/process-prompt.test.ts`. First, the classifier must be mockable: add near the other mocks at the top of the file:

```ts
const classifyMention = vi.hoisted(() => vi.fn());
vi.mock("@workspace/lib/mention-classify", () => ({ classifyMention }));
```

Then a new describe block at the end of the file:

```ts
const MENTIONING_RESULT: ScrapeResult = {
	textContent: "Acme Corp is a solid choice; it is based in Berlin.",
	rawOutput: {},
	webQueries: [],
	citations: [],
	modelVersion: "test-model",
};

function iteration(branded: boolean) {
	return runModelIteration({
		promptId: "prompt_1",
		promptValue: branded ? "is acme corp any good" : "best widget makers",
		brand: makeBrand(),
		competitorsList,
		config: { model: "chatgpt", provider: "test-provider", webSearch: true, version: "v" } as ModelConfig,
		providerImpl: makeProvider(async () => MENTIONING_RESULT),
		runIndex: 1,
		effectiveMarket: resolveEffectiveMarket({ defaultMarketKey: null }),
		branded,
	});
}

describe("runModelIteration accuracy claims", () => {
	beforeEach(() => {
		insertedPromptRuns.length = 0;
		classifyMention.mockReset();
	});

	it("passes the brand profile for a branded prompt and stores the claims", async () => {
		classifyMention.mockResolvedValue({
			sentiment: "neutral",
			brandRank: null,
			claims: [{ claim: "based in Berlin", status: "unsupported" }],
		});
		await iteration(true);
		expect(classifyMention).toHaveBeenCalledWith(
			expect.objectContaining({ profile: expect.objectContaining({ name: "Acme Corp", website: "https://acme.example" }) }),
		);
		expect(insertedPromptRuns[0]?.accuracyClaims).toEqual([{ claim: "based in Berlin", status: "unsupported" }]);
	});

	it("passes no profile for an unbranded prompt and stores null", async () => {
		classifyMention.mockResolvedValue({ sentiment: "positive", brandRank: 2 });
		await iteration(false);
		expect(classifyMention.mock.calls[0]?.[0]).not.toHaveProperty("profile");
		expect(insertedPromptRuns[0]?.accuracyClaims).toBeNull();
	});

	it("stores null when the classifier fails", async () => {
		classifyMention.mockResolvedValue(null);
		await iteration(true);
		expect(insertedPromptRuns[0]?.accuracyClaims).toBeNull();
	});
});
```

Add `import type { ModelConfig } from "@workspace/lib/providers";` to the test's imports (merge with the existing `Provider, ScrapeResult` import). Check the exact `ModelConfig` fields in `packages/lib/src/providers` and adjust the cast's object if the type requires more.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @workspace/worker test -- src/jobs/process-prompt.test.ts`
Expected: the three new tests FAIL (`branded` unknown / `accuracyClaims` undefined).

- [ ] **Step 3: Implement**

In `process-prompt.ts`:

1. Import: `import type { AccuracyClaim } from "@workspace/lib/db/schema";` and `import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";`.
2. `savePromptRun`: add parameter `accuracyClaims: AccuracyClaim[] | null,` right after `brandRank: number | null,` and add `accuracyClaims,` to the `.values({...})` object after `brandRank,`.
3. `runModelIteration`: add `branded: boolean;` to the parameter type and `branded,` to the destructuring. Replace the classifier call with:

```ts
		// Sentiment and in-answer rank are meaningless without a mention; skip the
		// classifier (and its cost) unless the brand actually showed up. The profile
		// goes along only for brand questions: those are the answers whose facts
		// about the brand we score for accuracy.
		const classification = brandMentioned
			? await classifyMention({
					answer: safeTextContent,
					brandName: brand.name,
					competitorNames: competitorsList.map((c) => c.name),
					...(branded
						? {
								profile: {
									name: brand.name,
									website: brand.website,
									additionalDomains: brand.additionalDomains ?? [],
									aliases: brand.aliases ?? [],
									keywords: brand.keywords ?? [],
								},
							}
						: {}),
				})
			: null;
```

and pass `classification?.claims ?? null,` to `savePromptRun` right after `classification?.brandRank ?? null,`.

4. Call site (around line 487): add `branded: getEffectiveBrandedStatus(prompt.systemTags ?? [], prompt.tags ?? []).isBranded,` to the `runModelIteration({...})` arguments.

- [ ] **Step 4: Run the whole worker test file**

Run: `pnpm --filter @workspace/worker test -- src/jobs/process-prompt.test.ts`
Expected: PASS, including the four pre-existing market-stamping tests (they call `runModelIteration` too; add `branded: false` to each of their calls).

- [ ] **Step 5: Type-check the worker**

Run: `pnpm --filter @workspace/worker check-types` (or `pnpm exec tsc --noEmit -p apps/worker`)
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/jobs/process-prompt.ts apps/worker/src/jobs/process-prompt.test.ts
git commit -m "record accuracy claims for brand-question runs"
```

---

### Task 6: Intent from brand analysis through to the prompts table

**Files:**
- Modify: `packages/lib/src/onboarding/analyze.ts:46-57` (`promptSchema`), `:95-98` (`OnboardingPrompt`), `:362-376` (`normalizePrompts`)
- Modify: `apps/web/src/server/onboarding-core.ts:36-40` (`promptInputSchema`), `:225-275` (`insertPrompts`), `:396-405` (wizard mapping)
- Modify: `apps/web/src/components/prompts-list-editor.tsx:39-62`
- Modify: `apps/web/src/components/prompt-wizard.tsx:174-176`, `:225-227`
- Test: `packages/lib/src/onboarding/analyze.test.ts` (exists? if not, create), `apps/web/src/server/__tests__/prompt-save.test.ts` is unrelated; add `apps/web/src/server/__tests__/onboarding-intent.test.ts`

**Interfaces:**
- Consumes: `PROMPT_INTENTS`, `PromptIntent` (Task 3).
- Produces: `OnboardingPrompt.intent: PromptIntent | null`; `promptInputSchema.intent` optional nullable; `insertPrompts` writes `intent`; `EditablePrompt.intent?: PromptIntent | null`.

- [ ] **Step 1: Write the failing test for the normaliser**

Find how `normalizePrompts` is exercised today: `grep -n "normalizePrompts\|suggestedPrompts" packages/lib/src/onboarding/*.test.ts`. If a test file for `analyze.ts` exists, add there; otherwise create `packages/lib/src/onboarding/analyze.test.ts` with the minimal import the module allows (if `normalizePrompts` is not exported, export it for the test — it is pure).

```ts
import { describe, expect, it } from "vitest";
import { normalizePrompts } from "./analyze";

describe("normalizePrompts intent", () => {
	it("keeps a valid intent and nulls anything else", () => {
		const out = normalizePrompts(
			[
				{ prompt: "best widgets", tags: [], intent: "discovery" },
				{ prompt: "widgets near me", tags: [], intent: "somewhere" as never },
				{ prompt: "is acme good", tags: [], intent: null },
			],
			10,
		);
		expect(out.map((p) => p.intent)).toEqual(["discovery", null, null]);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @workspace/lib test -- src/onboarding/analyze.test.ts`
Expected: FAIL (`intent` not on the type / not returned).

- [ ] **Step 3: Implement in `analyze.ts`**

Import `PROMPT_INTENTS, type PromptIntent` from `"../db/schema"`.

`promptSchema` gains:

```ts
	intent: z
		.enum(PROMPT_INTENTS)
		.nullable()
		.describe(
			"Buyer intent of an UNBRANDED prompt: 'discovery' (finding options, e.g. 'best X'), 'comparison' (X vs Y, alternatives), 'local' (near me, in <city>), 'price' (cost, pricing). Null for branded prompts or when none fits.",
		),
```

`OnboardingPrompt` gains `intent: PromptIntent | null;`.

`normalizePrompts` pushes `intent: PROMPT_INTENTS.includes(suggestion.intent as PromptIntent) ? (suggestion.intent as PromptIntent) : null,`. Export the function if it is not already.

- [ ] **Step 4: Run the lib test**

Run: `pnpm --filter @workspace/lib test -- src/onboarding`
Expected: PASS, including any existing analyze tests (fix fixtures that now need `intent`).

- [ ] **Step 5: Carry intent through the web layer**

`apps/web/src/server/onboarding-core.ts`:

- import `PROMPT_INTENTS` from `@workspace/lib/db/schema`;
- `promptInputSchema` gains `intent: z.enum(PROMPT_INTENTS).nullable().optional(),`;
- `insertPrompts` `source` type gains `intent?: PromptIntent | null`, the `rows` element type gains `intent: PromptIntent | null`, and the push adds `intent: p.intent ?? null,`;
- both callers of `insertPrompts` that map `input.prompts` (lines ~320 and ~396) add `intent: p.intent ?? null,` to the mapped object.

`apps/web/src/components/prompts-list-editor.tsx`: `EditablePrompt` gains `intent?: PromptIntent | null;` and `newPromptEntry` copies it: `intent: partial?.intent ?? null,`.

`apps/web/src/components/prompt-wizard.tsx`: the suggestion mapping becomes `newPromptEntry({ value: p.prompt, tags: p.tags, intent: p.intent, enabled: true })` and the payload mapping becomes `({ value: p.value.trim(), tags: p.tags, intent: p.intent ?? null, enabled: true })`.

- [ ] **Step 6: Write a server-side test that intent is persisted**

`apps/web/src/server/__tests__/onboarding-intent.test.ts`, following the mocking style of `prompt-save.test.ts` (read it first for the db mock shape):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const inserted: Record<string, unknown>[][] = [];
vi.mock("@workspace/lib/db/db", async () => {
	const schema = await vi.importActual<typeof import("@workspace/lib/db/schema")>("@workspace/lib/db/schema");
	const conn = {
		query: { prompts: { findMany: async () => [] } },
		insert: (table: unknown) => ({
			values: (rows: Record<string, unknown>[]) => {
				if (table === schema.prompts) inserted.push(rows);
				return { returning: async () => rows.map((_, i) => ({ id: `p${i}` })) };
			},
		}),
	};
	return { db: conn };
});
vi.mock("@workspace/lib/entitlements", () => ({
	assertCanAddPrompts: async () => {},
	assertCompetitorCap: async () => {},
	getBrandOrganizationId: async () => "org_1",
}));
vi.mock("@/lib/job-scheduler", () => ({ createMultiplePromptJobSchedulers: async () => {} }));

const { insertPrompts } = await import("@/server/onboarding-core");

describe("insertPrompts intent", () => {
	beforeEach(() => {
		inserted.length = 0;
	});
	it("persists a given intent and nulls a missing one", async () => {
		await insertPrompts({
			brandId: "brand_1",
			brandName: "Acme",
			website: "https://acme.example",
			source: [
				{ value: "best widgets", tags: [], enabled: true, intent: "discovery" },
				{ value: "is acme good", tags: [], enabled: true },
			],
			dedupeAgainstExisting: false,
		});
		expect(inserted[0]?.map((r) => r.intent)).toEqual(["discovery", null]);
	});
});
```

`insertPrompts` is not exported today (`async function insertPrompts`); export it. If its argument shape differs from the call above (check lines 225–235), match the real shape.

- [ ] **Step 7: Run the web unit tests for the touched files**

Run: `pnpm --filter @workspace/web test -- src/server/__tests__/onboarding-intent.test.ts`
Expected: PASS.

- [ ] **Step 8: Type-check web**

Run: `pnpm --filter @workspace/web check-types` (if no such script, `pnpm exec tsc --noEmit -p apps/web`).
Expected: clean. The Storybook story `apps/web/src/stories/prompt-wizard.stories.tsx` may need `intent: null` on its fixture prompts.

- [ ] **Step 9: Commit**

```bash
git add packages/lib/src/onboarding apps/web/src/server/onboarding-core.ts apps/web/src/components/prompts-list-editor.tsx apps/web/src/components/prompt-wizard.tsx apps/web/src/server/__tests__/onboarding-intent.test.ts apps/web/src/stories
git commit -m "carry a buyer intent from brand analysis onto new prompts"
```

---

### Task 7: Read-layer queries for v2, intents and accuracy

**Files:**
- Modify: `apps/web/src/lib/postgres-read.ts` (append after `getDashboardSummary`, ~line 250)

**Interfaces:**
- Consumes: `RANK_WEIGHTS` from `@workspace/lib/score`; existing helpers `queryPg`, `dateFilter`, `promptIdFilter`, `marketScope`, `uuidList`.
- Produces:
  ```ts
  interface ScoreV2Summary { total_runs: number; score_v2: number | null }
  interface IntentScoreRow { intent: PromptIntent; prompt_count: number; total_runs: number; score_v2: number | null }
  interface AccuracySummary { branded_mentioned_runs: number; assessed_runs: number; accurate_runs: number; unsupported_runs: number; unrecognised_runs: number }
  getScoreV2Summary(brandId, fromDate, toDate, timezone, promptIds: string[], marketKey): Promise<ScoreV2Summary>
  getIntentScoreSummary(brandId, fromDate, toDate, timezone, promptIds: string[], marketKey): Promise<IntentScoreRow[]>
  getAccuracySummary(brandId, fromDate, toDate, timezone, brandedPromptIds: string[], marketKey): Promise<AccuracySummary>
  ```
  All three return zero rows / null score when `promptIds` is empty, without querying.

- [ ] **Step 1: Add the shared weight expression and the three queries**

```ts
import { RANK_WEIGHTS } from "@workspace/lib/score";
import type { PromptIntent } from "@workspace/lib/db/schema";

/** Same numbers as scoreV2(); the constant is the single source. */
const RANK_WEIGHT_CASE = sql`CASE
	WHEN NOT brand_mentioned THEN 0
	WHEN brand_rank = 1 THEN ${RANK_WEIGHTS.rank1}
	WHEN brand_rank = 2 THEN ${RANK_WEIGHTS.rank2}
	WHEN brand_rank = 3 THEN ${RANK_WEIGHTS.rank3}
	ELSE ${RANK_WEIGHTS.other}
END`;

export interface ScoreV2Summary {
	total_runs: number;
	score_v2: number | null;
}

export async function getScoreV2Summary(
	brandId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	promptIds: string[],
	effectiveMarketKey: string,
): Promise<ScoreV2Summary> {
	if (promptIds.length === 0) return { total_runs: 0, score_v2: null };
	const [row] = await queryPg<ScoreV2Summary>(sql`
		SELECT
			count(*)::int AS total_runs,
			round(avg(${RANK_WEIGHT_CASE}) * 100)::int AS score_v2
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptIdFilter(promptIds)}
			${marketScope(effectiveMarketKey)}
	`);
	return row ?? { total_runs: 0, score_v2: null };
}

export interface IntentScoreRow {
	intent: PromptIntent;
	prompt_count: number;
	total_runs: number;
	score_v2: number | null;
}

export async function getIntentScoreSummary(
	brandId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	promptIds: string[],
	effectiveMarketKey: string,
): Promise<IntentScoreRow[]> {
	if (promptIds.length === 0) return [];
	return queryPg<IntentScoreRow>(sql`
		WITH scoped_runs AS (
			SELECT prompt_id, ${RANK_WEIGHT_CASE} AS weight
			FROM prompt_runs
			WHERE brand_id = ${brandId}
				${dateFilter(fromDate, toDate, timezone)}
				${promptIdFilter(promptIds)}
				${marketScope(effectiveMarketKey)}
		)
		SELECT
			p.intent AS intent,
			count(DISTINCT p.id)::int AS prompt_count,
			count(s.prompt_id)::int AS total_runs,
			round(avg(s.weight) * 100)::int AS score_v2
		FROM prompts p
		LEFT JOIN scoped_runs s ON s.prompt_id = p.id
		WHERE p.brand_id = ${brandId}
			AND p.intent IS NOT NULL
			AND p.id IN (${uuidList(promptIds)})
		GROUP BY p.intent
		ORDER BY p.intent
	`);
}

export interface AccuracySummary {
	branded_mentioned_runs: number;
	assessed_runs: number;
	/** Assessed runs with no contradicted claim (unsupported claims allowed). */
	accurate_runs: number;
	/** Assessed runs carrying at least one unsupported claim. Shown, never scored. */
	unsupported_runs: number;
	unrecognised_runs: number;
}

export async function getAccuracySummary(
	brandId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	brandedPromptIds: string[],
	effectiveMarketKey: string,
): Promise<AccuracySummary> {
	const empty = { branded_mentioned_runs: 0, assessed_runs: 0, accurate_runs: 0, unsupported_runs: 0, unrecognised_runs: 0 };
	if (brandedPromptIds.length === 0) return empty;
	const [row] = await queryPg<AccuracySummary>(sql`
		SELECT
			count(*) FILTER (WHERE brand_mentioned)::int AS branded_mentioned_runs,
			count(*) FILTER (WHERE brand_mentioned AND accuracy_claims IS NOT NULL)::int AS assessed_runs,
			count(*) FILTER (
				WHERE brand_mentioned
					AND accuracy_claims IS NOT NULL
					AND NOT EXISTS (
						SELECT 1 FROM jsonb_array_elements(accuracy_claims) c WHERE c->>'status' = 'contradicted'
					)
			)::int AS accurate_runs,
			count(*) FILTER (
				WHERE brand_mentioned
					AND accuracy_claims IS NOT NULL
					AND EXISTS (
						SELECT 1 FROM jsonb_array_elements(accuracy_claims) c WHERE c->>'status' = 'unsupported'
					)
			)::int AS unsupported_runs,
			count(*) FILTER (WHERE NOT brand_mentioned)::int AS unrecognised_runs
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptIdFilter(brandedPromptIds)}
			${marketScope(effectiveMarketKey)}
	`);
	return row ?? empty;
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @workspace/web check-types`
Expected: clean. (`promptIdFilter` takes `string[] | undefined`; passing a non-empty array is fine.)

- [ ] **Step 3: Smoke the SQL against the local database**

With the app's `.env` loaded and the migration from Task 3 applied by the operator (ask; do not apply it yourself), run a one-off:

```bash
cd apps/web && pnpm exec tsx -e '
import { getScoreV2Summary, getAccuracySummary } from "./src/lib/postgres-read";
const b = process.argv[1];
console.log(await getScoreV2Summary(b, "2026-10-01", "2026-11-03", "UTC", [], "tr-TR"));
' <any brand id>
```

Expected: `{ total_runs: 0, score_v2: null }` (empty prompt list short-circuits). If the migration is not applied locally, skip this step and say so in the commit message body.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/postgres-read.ts
git commit -m "add score v2, intent and accuracy read queries"
```

---

### Task 8: Admin score breakdown server function

**Files:**
- Create: `apps/web/src/server/scores.ts`
- Create: `apps/web/src/server/__tests__/scores.test.ts`

**Interfaces:**
- Consumes: Task 7 queries, `getDashboardSummary`, `getEffectiveBrandedStatus`, `resolveEffectiveMarket`, `requireAuthSession` + `isAdmin` from `@/lib/auth/helpers`, `shiftDateStr`/`resolveTimezone` as used in `dashboard.ts` (import from the same modules `dashboard.ts` does).
- Produces:
  ```ts
  interface AdminScoreRow {
    brandId: string; name: string; marketKey: string;
    totalRuns: number; models: number;
    v1: number | null;
    v2: number | null; cohortPrompts: number;
    intents: Record<PromptIntent, { score: number | null; promptCount: number }>;
    classifiedPrompts: number; unbrandedPrompts: number;
    noContradiction: number | null; assessedRuns: number; accurateRuns: number; unsupportedRuns: number;
    unrecognisedRuns: number;
  }
  getAdminScoreBreakdownFn(): Promise<AdminScoreRow[]>   // 30-day window, admin only
  ```

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/server/__tests__/scores.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({
	getDashboardSummary: vi.fn(),
	getScoreV2Summary: vi.fn(),
	getIntentScoreSummary: vi.fn(),
	getAccuracySummary: vi.fn(),
	getDistinctModelCount: vi.fn(),
}));
vi.mock("@/lib/postgres-read", () => reads);
vi.mock("@/lib/auth/helpers", () => ({
	requireAuthSession: async () => ({ user: { id: "u1", role: "admin" } }),
	isAdmin: (s: { user: { role: string } }) => s.user.role === "admin",
}));
vi.mock("@workspace/lib/db/db", () => ({
	db: {
		query: {
			brands: {
				findMany: async () => [{ id: "b1", name: "Acme", defaultMarketKey: "tr-TR", onboarded: true }],
			},
			prompts: {
				findMany: async () => [
					{ id: "p1", brandId: "b1", enabled: true, tags: [], systemTags: ["unbranded"], intent: "discovery" },
					{ id: "p2", brandId: "b1", enabled: true, tags: [], systemTags: ["unbranded"], intent: null },
					{ id: "p3", brandId: "b1", enabled: true, tags: [], systemTags: ["branded"], intent: null },
				],
			},
		},
	},
}));

const { computeAdminScoreRows } = await import("@/server/scores");

describe("computeAdminScoreRows", () => {
	beforeEach(() => {
		reads.getDashboardSummary.mockResolvedValue([{ total_runs: 120, avg_visibility: 41 }]);
		reads.getScoreV2Summary.mockResolvedValue({ total_runs: 80, score_v2: 33 });
		reads.getIntentScoreSummary.mockResolvedValue([{ intent: "discovery", prompt_count: 1, total_runs: 40, score_v2: 29 }]);
		reads.getAccuracySummary.mockResolvedValue({
			branded_mentioned_runs: 30,
			assessed_runs: 10,
			accurate_runs: 9,
			unsupported_runs: 3,
			unrecognised_runs: 4,
		});
		reads.getDistinctModelCount.mockResolvedValue(4);
	});

	it("splits prompts by branded status and reports coverage beside every score", async () => {
		const [row] = await computeAdminScoreRows("UTC");
		expect(row).toMatchObject({
			brandId: "b1",
			v1: 41,
			v2: 33,
			cohortPrompts: 2,
			classifiedPrompts: 1,
			unbrandedPrompts: 2,
			noContradiction: 90,
			assessedRuns: 10,
			accurateRuns: 9,
			unsupportedRuns: 3,
			unrecognisedRuns: 4,
			models: 4,
		});
		expect(row.intents.discovery).toEqual({ score: 29, promptCount: 1 });
		expect(row.intents.price).toEqual({ score: null, promptCount: 0 });
		// v2 and intents are asked for the unbranded prompts only; accuracy for the branded ones.
		expect(reads.getScoreV2Summary.mock.calls[0]?.[4]).toEqual(["p1", "p2"]);
		expect(reads.getAccuracySummary.mock.calls[0]?.[4]).toEqual(["p3"]);
	});

	it("reports null when nothing was assessed", async () => {
		reads.getAccuracySummary.mockResolvedValue({
			branded_mentioned_runs: 5,
			assessed_runs: 0,
			accurate_runs: 0,
			unsupported_runs: 0,
			unrecognised_runs: 0,
		});
		const [row] = await computeAdminScoreRows("UTC");
		expect(row.noContradiction).toBeNull();
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @workspace/web test -- src/server/__tests__/scores.test.ts`
Expected: FAIL, module `@/server/scores` not found.

- [ ] **Step 3: Add `getDistinctModelCount` to the read layer**

Append to `apps/web/src/lib/postgres-read.ts`:

```ts
export async function getDistinctModelCount(
	brandId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	effectiveMarketKey: string,
): Promise<number> {
	const [row] = await queryPg<{ models: number }>(sql`
		SELECT count(DISTINCT model)::int AS models
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${marketScope(effectiveMarketKey)}
	`);
	return row?.models ?? 0;
}
```

- [ ] **Step 4: Implement the server module**

```ts
// apps/web/src/server/scores.ts
/**
 * Admin-only breakdown of the shipped score (v1) beside the candidate score
 * (v2), its intent sub-scores and brand accuracy. Nothing here feeds a
 * user-facing surface; the v2 switch is a separate change gated on the
 * phase V back-test.
 */
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { PROMPT_INTENTS, type PromptIntent } from "@workspace/lib/db/schema";
import { resolveEffectiveMarket } from "@workspace/lib/markets";
import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";
import { isAdmin, requireAuthSession } from "@/lib/auth/helpers";
import {
	getAccuracySummary,
	getDashboardSummary,
	getDistinctModelCount,
	getIntentScoreSummary,
	getScoreV2Summary,
} from "@/lib/postgres-read";
import { resolveTimezone, shiftDateStr } from "@/lib/timezone-utils";

const WINDOW_DAYS = 30;

export interface AdminScoreRow {
	brandId: string;
	name: string;
	marketKey: string;
	totalRuns: number;
	models: number;
	v1: number | null;
	v2: number | null;
	cohortPrompts: number;
	intents: Record<PromptIntent, { score: number | null; promptCount: number }>;
	classifiedPrompts: number;
	unbrandedPrompts: number;
	/** accurate ÷ assessed, as a percentage. Null until something was assessed. */
	noContradiction: number | null;
	assessedRuns: number;
	accurateRuns: number;
	unsupportedRuns: number;
	unrecognisedRuns: number;
}

export async function computeAdminScoreRows(timezone: string): Promise<AdminScoreRow[]> {
	const today = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
	const from = shiftDateStr(today, { days: -(WINDOW_DAYS - 1) });
	const brandRows = await db.query.brands.findMany({ where: (b, { eq }) => eq(b.onboarded, true) });
	const promptRows = await db.query.prompts.findMany({ where: (p, { eq }) => eq(p.enabled, true) });

	// ponytail: five queries per brand; roll into one org-wide query past ~50 brands.
	return Promise.all(
		brandRows.map(async (brand) => {
			const marketKey = resolveEffectiveMarket({ defaultMarketKey: brand.defaultMarketKey }).key;
			const own = promptRows.filter((p) => p.brandId === brand.id);
			const unbranded = own.filter((p) => !getEffectiveBrandedStatus(p.systemTags ?? [], p.tags ?? []).isBranded);
			const branded = own.filter((p) => getEffectiveBrandedStatus(p.systemTags ?? [], p.tags ?? []).isBranded);
			const allIds = own.map((p) => p.id);
			const unbrandedIds = unbranded.map((p) => p.id);
			const brandedIds = branded.map((p) => p.id);

			const [[v1], v2, intentRows, accuracy, models] = await Promise.all([
				getDashboardSummary(brand.id, from, today, timezone, allIds, marketKey),
				getScoreV2Summary(brand.id, from, today, timezone, unbrandedIds, marketKey),
				getIntentScoreSummary(brand.id, from, today, timezone, unbrandedIds, marketKey),
				getAccuracySummary(brand.id, from, today, timezone, brandedIds, marketKey),
				getDistinctModelCount(brand.id, from, today, timezone, marketKey),
			]);

			const intents = Object.fromEntries(
				PROMPT_INTENTS.map((intent) => {
					const row = intentRows.find((r) => r.intent === intent);
					return [intent, { score: row?.score_v2 ?? null, promptCount: row?.prompt_count ?? 0 }];
				}),
			) as AdminScoreRow["intents"];

			return {
				brandId: brand.id,
				name: brand.name,
				marketKey,
				totalRuns: v1?.total_runs ?? 0,
				models,
				v1: v1?.total_runs ? v1.avg_visibility : null,
				v2: v2.score_v2,
				cohortPrompts: unbranded.length,
				intents,
				classifiedPrompts: unbranded.filter((p) => p.intent !== null).length,
				unbrandedPrompts: unbranded.length,
				noContradiction:
					accuracy.assessed_runs > 0 ? Math.round((accuracy.accurate_runs / accuracy.assessed_runs) * 100) : null,
				assessedRuns: accuracy.assessed_runs,
				accurateRuns: accuracy.accurate_runs,
				unsupportedRuns: accuracy.unsupported_runs,
				unrecognisedRuns: accuracy.unrecognised_runs,
			};
		}),
	);
}

export const getAdminScoreBreakdownFn = createServerFn({ method: "GET" }).handler(async () => {
	const session = await requireAuthSession();
	if (!isAdmin(session)) throw new Error("Unauthorized: Admin access required");
	return computeAdminScoreRows(resolveTimezone("UTC"));
});
```

If `db.query.brands.findMany` with a `where` callback is not the style used elsewhere, use `db.select().from(brands).where(eq(brands.onboarded, true))` like `dashboard.ts` does; adjust the test's mock accordingly.

- [ ] **Step 5: Run the test**

Run: `pnpm --filter @workspace/web test -- src/server/__tests__/scores.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/server/scores.ts apps/web/src/server/__tests__/scores.test.ts apps/web/src/lib/postgres-read.ts
git commit -m "add the admin score breakdown server function"
```

---

### Task 9: Admin scores page and nav item

**Files:**
- Create: `apps/web/src/routes/_authed/admin/scores.tsx`
- Modify: `apps/web/src/lib/admin-nav.ts:17-22`

**Interfaces:**
- Consumes: `getAdminScoreBreakdownFn`, `AdminScoreRow` (Task 8).

- [ ] **Step 1: Add the nav item**

In `adminNavItems`, after the Tools entry:

```ts
		{ title: "Scores", link: { to: "/admin/scores" }, icon: Gauge },
```

Add `Gauge` to the `@phosphor-icons/react` import.

- [ ] **Step 2: Write the page**

```tsx
// apps/web/src/routes/_authed/admin/scores.tsx
/** /admin/scores - v1 beside v2, intent sub-scores and brand accuracy, with coverage. */
import { createFileRoute } from "@tanstack/react-router";
import { PROMPT_INTENTS } from "@workspace/lib/db/schema";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { useEffect, useState } from "react";
import { pageHead } from "@/lib/route-head";
import { type AdminScoreRow, getAdminScoreBreakdownFn } from "@/server/scores";

export const Route = createFileRoute("/_authed/admin/scores")({
	staticData: { crumb: "Scores" },
	head: pageHead({ description: "Shipped score beside the rank-weighted candidate." }),
	component: ScoresPage,
});

const INTENT_LABEL: Record<(typeof PROMPT_INTENTS)[number], string> = {
	discovery: "Discovery",
	comparison: "Comparison",
	local: "Local",
	price: "Price",
};

function pct(value: number | null): string {
	return value === null ? "—" : `${value}%`;
}

function ScoresPage() {
	const [rows, setRows] = useState<AdminScoreRow[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		getAdminScoreBreakdownFn()
			.then(setRows)
			.catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
	}, []);

	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<h1 className="text-3xl font-bold tracking-tight">Scores</h1>
				<p className="text-muted-foreground">
					Last 30 days per brand. v1 is what users see today. v2 is the rank-weighted candidate over buyer prompts;
					it replaces v1 only after the back-test passes. "No contradiction" covers brand questions only: the share
					of assessed answers that contradict none of the facts we hold, which until the wizard stores address,
					hours and services are the name, aliases (including the parent company), website and domains, and the
					owner's keywords. "Unsupported" counts answers that state something those facts neither confirm nor
					deny; it is shown, never scored.
				</p>
			</div>
			{error && <p className="text-destructive">{error}</p>}
			{!rows && !error && <Skeleton className="h-40 w-full" />}
			{rows && (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Brand</TableHead>
							<TableHead>Runs · models</TableHead>
							<TableHead>v1</TableHead>
							<TableHead>v2 (cohort)</TableHead>
							{PROMPT_INTENTS.map((i) => (
								<TableHead key={i}>{INTENT_LABEL[i]}</TableHead>
							))}
							<TableHead>Classified</TableHead>
							<TableHead title="Assessed brand-question runs with no contradicted claim ÷ assessed. Identity facts only in this phase.">
								No contradiction
							</TableHead>
							<TableHead title="Assessed runs with at least one claim the profile cannot confirm. Not scored.">
								Unsupported
							</TableHead>
							<TableHead>Unrecognised</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((r) => (
							<TableRow key={r.brandId}>
								<TableCell>
									{r.name} <span className="text-muted-foreground">· {r.marketKey}</span>
								</TableCell>
								<TableCell>
									{r.totalRuns} · {r.models}
								</TableCell>
								<TableCell>{pct(r.v1)}</TableCell>
								<TableCell>
									{pct(r.v2)} <span className="text-muted-foreground">({r.cohortPrompts})</span>
								</TableCell>
								{PROMPT_INTENTS.map((i) => (
									<TableCell key={i}>
										{r.intents[i].promptCount === 0 ? "—" : pct(r.intents[i].score)}{" "}
										<span className="text-muted-foreground">({r.intents[i].promptCount})</span>
									</TableCell>
								))}
								<TableCell>
									{r.classifiedPrompts} / {r.unbrandedPrompts}
								</TableCell>
								<TableCell>
									{pct(r.noContradiction)}{" "}
									<span className="text-muted-foreground">
										({r.accurateRuns} / {r.assessedRuns})
									</span>
								</TableCell>
								<TableCell>{r.unsupportedRuns}</TableCell>
								<TableCell>{r.unrecognisedRuns}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</div>
	);
}
```

- [ ] **Step 3: Regenerate the route tree and type-check**

Run: `pnpm --filter @workspace/web dev` briefly (TanStack generates `routeTree.gen.ts` on start) or the project's route-gen script if one exists (`grep -n "routes\|gen" apps/web/package.json`). Then `pnpm --filter @workspace/web check-types`.
Expected: clean; `routeTree.gen.ts` now lists `/admin/scores`.

- [ ] **Step 4: Open the page**

With the dev server running and an admin session, open `http://localhost:3000/admin/scores`. Expected: a table with one row per onboarded brand; every v2 and no-contradiction cell has a count beside it; brands with no assessed runs show "—" there.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/_authed/admin/scores.tsx apps/web/src/lib/admin-nav.ts apps/web/src/routeTree.gen.ts
git commit -m "show score v2 and accuracy per brand on an admin page"
```

---

### Task 10: Back-test script

**Files:**
- Create: `packages/lib/scripts/backtest-score-v2.ts`
- Modify: `packages/lib/package.json` (scripts)

**Interfaces:**
- Consumes: `weightFor`, `scoreV2`, `spearman`, `direction`, `verdict` from `../src/score`; `getEffectiveBrandedStatus` from `../src/tag-utils`; `resolveEffectiveMarket` from `../src/markets`.
- Produces: a CLI. `pnpm --filter @workspace/lib backtest:score-v2 [--json out.json] [--labels 50 --out-dir ./labels]`.

- [ ] **Step 1: Add the script entries**

In `packages/lib/package.json` scripts:

```json
		"backtest:score-v2": "tsx scripts/backtest-score-v2.ts",
		"backfill:prompt-intent": "tsx scripts/backfill-prompt-intent.ts"
```

- [ ] **Step 2: Write the script**

```ts
// packages/lib/scripts/backtest-score-v2.ts
/**
 * Phase V back-test: does rank-weighted score v2 order prompts and move month
 * over month like the shipped mention-rate score v1, on the same buyer-prompt
 * cohort? Read-only. Thresholds live in src/score/backtest.ts.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm -C packages/lib exec tsx scripts/backtest-score-v2.ts [--json rows.json]
 *   DATABASE_URL=postgres://... pnpm -C packages/lib exec tsx scripts/backtest-score-v2.ts --labels 50 --out-dir ./labels
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Client } from "pg";
import { resolveEffectiveMarket } from "../src/markets";
import { direction, scoreV2, spearman, verdict, type VerdictRow } from "../src/score";
import { getEffectiveBrandedStatus } from "../src/tag-utils";
import { extractTextContent } from "../src/text-extraction";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL is required");
	process.exit(2);
}
if (!/localhost|127\.0\.0\.1/.test(DATABASE_URL) && process.env.ALLOW_REMOTE_DB !== "1") {
	console.error("Refusing to run against a non-local database (set ALLOW_REMOTE_DB=1 to override)");
	process.exit(2);
}

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		json: { type: "string" },
		labels: { type: "string" },
		"out-dir": { type: "string", default: "./labels" },
	},
});

const WINDOW_DAYS = 30;
const MIN_MODELS = 4;
const MIN_RUNS_PER_PROMPT = 4;

interface BrandRow {
	id: string;
	name: string;
	default_market_key: string | null;
}
interface PromptRow {
	id: string;
	tags: string[];
	system_tags: string[];
}
interface RunRow {
	prompt_id: string;
	model: string;
	brand_mentioned: boolean;
	brand_rank: number | null;
	created_at: Date;
}

interface BrandReport {
	brandId: string;
	name: string;
	cohortPrompts: number;
	runs: number;
	models: number;
	v1All: number | null;
	v1Buyer: number | null;
	v2: number | null;
	spearman: number | null;
	trendV1: number | null;
	trendV2: number | null;
	directionV1: string;
	directionV2: string;
	levelGap: number | null;
	trendGap: number | null;
}

const mentionRate = (runs: RunRow[]) =>
	runs.length === 0 ? null : Math.round((runs.filter((r) => r.brand_mentioned).length / runs.length) * 100);
const toScored = (runs: RunRow[]) => runs.map((r) => ({ brandMentioned: r.brand_mentioned, brandRank: r.brand_rank }));

async function loadRuns(client: Client, brandId: string, marketKey: string, since: Date): Promise<RunRow[]> {
	const { rows } = await client.query<RunRow>(
		`SELECT r.prompt_id, r.model, r.brand_mentioned, r.brand_rank, r.created_at
		 FROM prompt_runs r
		 JOIN prompts p ON p.id = r.prompt_id
		 WHERE r.brand_id = $1 AND p.enabled AND r.created_at >= $2
		   AND (r.market_key = $3 OR r.market_key = 'global')`,
		[brandId, since, marketKey],
	);
	return rows;
}

function analyseBrand(brand: BrandRow, prompts: PromptRow[], runs: RunRow[], now: Date): BrandReport | null {
	const cutoff = new Date(now.getTime() - WINDOW_DAYS * 864e5);
	const current = runs.filter((r) => r.created_at >= cutoff);
	const previous = runs.filter((r) => r.created_at < cutoff);
	// Only models seen in both windows, so a pick change cannot pose as a score change.
	const modelsNow = new Set(current.map((r) => r.model));
	const modelsBefore = new Set(previous.map((r) => r.model));
	const shared = [...modelsNow].filter((m) => modelsBefore.has(m));
	if (shared.length < MIN_MODELS) return null;
	const inShared = (r: RunRow) => shared.includes(r.model);
	const cur = current.filter(inShared);
	const prev = previous.filter(inShared);

	const unbrandedIds = new Set(
		prompts.filter((p) => !getEffectiveBrandedStatus(p.system_tags, p.tags).isBranded).map((p) => p.id),
	);
	const group = (runs: RunRow[]) => {
		const byPrompt = new Map<string, RunRow[]>();
		for (const r of runs) {
			if (!unbrandedIds.has(r.prompt_id)) continue;
			byPrompt.set(r.prompt_id, [...(byPrompt.get(r.prompt_id) ?? []), r]);
		}
		return byPrompt;
	};
	const curByPrompt = group(cur);
	const prevByPrompt = group(prev);

	// A prompt is in the cohort only when, on the models it ran on in BOTH
	// windows, it has enough runs in each window. Pairs seen in one window only
	// are dropped from both, so a prompt or model that came or went between
	// windows cannot pose as a trend.
	const cohort: { id: string; cur: RunRow[]; prev: RunRow[] }[] = [];
	for (const [id, curRuns] of curByPrompt) {
		const prevRuns = prevByPrompt.get(id) ?? [];
		const models = new Set(curRuns.map((r) => r.model));
		const paired = [...new Set(prevRuns.map((r) => r.model))].filter((m) => models.has(m));
		const c = curRuns.filter((r) => paired.includes(r.model));
		const pv = prevRuns.filter((r) => paired.includes(r.model));
		if (c.length >= MIN_RUNS_PER_PROMPT && pv.length >= MIN_RUNS_PER_PROMPT) cohort.push({ id, cur: c, prev: pv });
	}
	if (cohort.length === 0) return null;
	const curCohort = cohort.flatMap((c) => c.cur);
	const prevCohort = cohort.flatMap((c) => c.prev);

	const perPromptV1 = cohort.map((c) => mentionRate(c.cur) ?? 0);
	const perPromptV2 = cohort.map((c) => scoreV2(toScored(c.cur)) ?? 0);

	const v1Buyer = mentionRate(curCohort);
	const v2 = scoreV2(toScored(curCohort));
	const v1BuyerPrev = mentionRate(prevCohort);
	const v2Prev = scoreV2(toScored(prevCohort));
	const trendV1 = v1Buyer !== null && v1BuyerPrev !== null ? v1Buyer - v1BuyerPrev : null;
	const trendV2 = v2 !== null && v2Prev !== null ? v2 - v2Prev : null;

	return {
		brandId: brand.id,
		name: brand.name,
		cohortPrompts: cohort.length,
		runs: curCohort.length,
		models: shared.length,
		v1All: mentionRate(cur),
		v1Buyer,
		v2,
		spearman: spearman(perPromptV1, perPromptV2),
		trendV1,
		trendV2,
		directionV1: trendV1 === null ? "n/a" : direction(trendV1, 0),
		directionV2: trendV2 === null ? "n/a" : direction(trendV2, 0),
		levelGap: v1Buyer !== null && v2 !== null ? v1Buyer - v2 : null,
		trendGap: trendV1 !== null && trendV2 !== null ? Math.abs(trendV1 - trendV2) : null,
	};
}

async function runBacktest(client: Client): Promise<void> {
	const now = new Date();
	const since = new Date(now.getTime() - 2 * WINDOW_DAYS * 864e5);
	const { rows: brandRows } = await client.query<BrandRow>(
		"SELECT id, name, default_market_key FROM brands WHERE onboarded AND enabled",
	);
	const reports: BrandReport[] = [];
	for (const brand of brandRows) {
		const marketKey = resolveEffectiveMarket({ defaultMarketKey: brand.default_market_key }).key;
		const { rows: prompts } = await client.query<PromptRow>(
			"SELECT id, tags, system_tags FROM prompts WHERE brand_id = $1 AND enabled",
			[brand.id],
		);
		const runs = await loadRuns(client, brand.id, marketKey, since);
		const report = analyseBrand(brand, prompts, runs, now);
		if (report) reports.push(report);
	}

	console.table(reports.map(({ brandId, ...rest }) => rest));
	const rows: VerdictRow[] = reports
		.filter((r) => r.trendGap !== null)
		.map((r) => ({
			spearman: r.spearman,
			directionV1: r.directionV1 as VerdictRow["directionV1"],
			directionV2: r.directionV2 as VerdictRow["directionV2"],
			trendGap: r.trendGap as number,
		}));
	const result = verdict(rows);
	// Level gap is reported, never gated: every v2 weight is ≤ 1, so v2 sits
	// below v1-buyer by design. The gate is ordering and trend, not level.
	console.log(`\nVerdict: ${result.outcome.toUpperCase()} (level gap is informational)`);
	for (const reason of result.reasons) console.log(`  - ${reason}`);
	if (values.json) {
		writeFileSync(values.json, JSON.stringify({ generatedAt: now.toISOString(), reports, verdict: result }, null, 2));
		console.log(`✓ wrote ${values.json}`);
	}
}

interface LabelRow {
	id: string;
	brand_id: string;
	model: string;
	provider: string | null;
	raw_output: unknown;
	accuracy_claims: unknown;
	prompt: string;
	name: string;
	website: string;
	additional_domains: string[];
	aliases: string[];
	keywords: string[];
}

const csvCell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;

async function exportLabels(client: Client, n: number, outDir: string): Promise<void> {
	// Only runs the new classifier assessed carry claims; before the worker
	// change ships, this exports nothing.
	const { rows } = await client.query<LabelRow>(
		`SELECT r.id, r.brand_id, r.model, r.provider, r.raw_output, r.accuracy_claims, p.value AS prompt,
		        b.name, b.website, b.additional_domains, b.aliases, b.keywords
		 FROM prompt_runs r
		 JOIN prompts p ON p.id = r.prompt_id
		 JOIN brands b ON b.id = r.brand_id
		 WHERE r.brand_mentioned AND r.accuracy_claims IS NOT NULL
		 ORDER BY random()
		 LIMIT $1`,
		[n],
	);
	mkdirSync(outDir, { recursive: true });
	const answers = [
		["run_id", "brand_id", "model", "prompt", "answer", "profile"].map(csvCell).join(","),
		...rows.map((r) =>
			[
				r.id,
				r.brand_id,
				r.model,
				r.prompt,
				extractTextContent(r.raw_output, r.provider ?? r.model),
				[
					`name: ${r.name}`,
					`website: ${r.website}`,
					`domains: ${r.additional_domains.join(", ")}`,
					`aliases: ${r.aliases.join(", ")}`,
					`keywords: ${r.keywords.join("; ")}`,
				].join(" | "),
			]
				.map(csvCell)
				.join(","),
		),
	].join("\n");
	const claims = [
		["run_id", "claims_json"].map(csvCell).join(","),
		...rows.map((r) => [r.id, JSON.stringify(r.accuracy_claims)].map(csvCell).join(",")),
	].join("\n");
	writeFileSync(join(outDir, "answers.csv"), answers);
	writeFileSync(join(outDir, "classifier-claims.csv"), claims);
	console.log(`✓ wrote ${rows.length} answers to ${outDir}/answers.csv (labellers) and classifier-claims.csv (keep separate)`);
}

async function main(): Promise<void> {
	const client = new Client({ connectionString: DATABASE_URL });
	await client.connect();
	try {
		if (values.labels) await exportLabels(client, Number(values.labels), values["out-dir"] ?? "./labels");
		else await runBacktest(client);
	} finally {
		await client.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
```

Verify `extractTextContent`'s second argument semantics in `packages/lib/src/text-extraction.ts:351` (provider id or engine) and pass what `process-prompt.ts` would have used; if the provider column is the right key, keep `r.provider ?? r.model`.

Add `labels/` to `.gitignore` at the repo root.

- [ ] **Step 3: Smoke-run against the local database**

```bash
cd packages/lib && DATABASE_URL=<local url from .env> pnpm backtest:score-v2
```

Expected: a table (possibly empty) and `Verdict: INCONCLUSIVE` with the brand count reason when fewer than 5 brands qualify. No exception.

- [ ] **Step 4: Commit**

```bash
git add packages/lib/scripts/backtest-score-v2.ts packages/lib/package.json .gitignore
git commit -m "add the score v2 back-test and labelling export script"
```

---

### Task 11: Intent backfill script

**Files:**
- Create: `packages/lib/scripts/backfill-prompt-intent.ts`
- Create: `packages/lib/src/score/intent-backfill.ts` + `intent-backfill.test.ts` (pure batching/classification helper)

**Interfaces:**
- Consumes: `runStructuredCompletionPrompt` from `../src/onboarding/llm`, `PROMPT_INTENTS`.
- Produces: `classifyIntents(prompts: { id: string; value: string }[], run = runStructuredCompletionPrompt): Promise<Map<string, PromptIntent | null>>` (one model call per batch of 25).

- [ ] **Step 1: Write the failing test**

```ts
// packages/lib/src/score/intent-backfill.test.ts
import { describe, expect, it, vi } from "vitest";
import { classifyIntents, INTENT_BATCH_SIZE } from "./intent-backfill";

describe("classifyIntents", () => {
	it("sends one call per batch and maps ids to intents, nulling unknown values", async () => {
		const run = vi.fn(async (_prompt: string) => ({
			object: {
				items: [
					{ id: "a", intent: "discovery" },
					{ id: "b", intent: "nonsense" },
					{ id: "c", intent: null },
				],
			},
		}));
		const prompts = Array.from({ length: INTENT_BATCH_SIZE + 1 }, (_, i) => ({ id: i < 3 ? "abc"[i] : `x${i}`, value: `q${i}` }));
		const out = await classifyIntents(prompts, run as never);
		expect(run).toHaveBeenCalledTimes(2);
		expect(out.get("a")).toBe("discovery");
		expect(out.get("b")).toBeNull();
		expect(out.get("c")).toBeNull();
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @workspace/lib test -- src/score/intent-backfill.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the helper**

```ts
// packages/lib/src/score/intent-backfill.ts
import { z } from "zod";
import { PROMPT_INTENTS, type PromptIntent } from "../db/schema";
import { runStructuredCompletionPrompt } from "../onboarding/llm";

export const INTENT_BATCH_SIZE = 25;

const schema = z.object({
	items: z.array(
		z.object({
			id: z.string(),
			intent: z
				.string()
				.nullable()
				.describe("One of discovery, comparison, local, price; null when none fits."),
		}),
	),
});

const GUIDANCE =
	"Classify each buyer search prompt by intent: 'discovery' = finding or listing options (best X, top X, X recommendations); 'comparison' = X vs Y, alternatives to X; 'local' = near me, in a named place; 'price' = cost, pricing, how much. Use null when none fits. Return every id exactly once.";

export async function classifyIntents(
	prompts: readonly { id: string; value: string }[],
	run: typeof runStructuredCompletionPrompt = runStructuredCompletionPrompt,
): Promise<Map<string, PromptIntent | null>> {
	const out = new Map<string, PromptIntent | null>();
	for (let i = 0; i < prompts.length; i += INTENT_BATCH_SIZE) {
		const batch = prompts.slice(i, i + INTENT_BATCH_SIZE);
		const prompt = `${GUIDANCE}\n\n${batch.map((p) => `${p.id}: ${p.value}`).join("\n")}`;
		const { object } = await run(prompt, schema);
		for (const p of batch) out.set(p.id, null);
		for (const item of object.items) {
			if (!out.has(item.id)) continue;
			out.set(item.id, PROMPT_INTENTS.includes(item.intent as PromptIntent) ? (item.intent as PromptIntent) : null);
		}
	}
	return out;
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @workspace/lib test -- src/score/intent-backfill.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the script**

```ts
// packages/lib/scripts/backfill-prompt-intent.ts
/**
 * One-off: give every enabled, unbranded prompt without an intent one of the
 * four buyer intents (or leave it null when none fits). Safe to repeat but not
 * free: rows with an intent are never touched, while prompts the model left
 * null are selected and sent again on every run. Run it once; the dry run
 * prints the bill first.
 *
 * Sends prompt text only, never answers. Prints the number of model calls it
 * will make and stops unless --yes is passed.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm -C packages/lib exec tsx scripts/backfill-prompt-intent.ts [--yes]
 */

import { parseArgs } from "node:util";
import { Client } from "pg";
import { classifyIntents, INTENT_BATCH_SIZE } from "../src/score/intent-backfill";
import { getEffectiveBrandedStatus } from "../src/tag-utils";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL is required");
	process.exit(2);
}
if (!/localhost|127\.0\.0\.1/.test(DATABASE_URL) && process.env.ALLOW_REMOTE_DB !== "1") {
	console.error("Refusing to run against a non-local database (set ALLOW_REMOTE_DB=1 to override)");
	process.exit(2);
}

const { values } = parseArgs({ args: process.argv.slice(2), options: { yes: { type: "boolean", default: false } } });

interface PromptRow {
	id: string;
	value: string;
	tags: string[];
	system_tags: string[];
}

async function main(): Promise<void> {
	const client = new Client({ connectionString: DATABASE_URL });
	await client.connect();
	try {
		const { rows } = await client.query<PromptRow>(
			"SELECT id, value, tags, system_tags FROM prompts WHERE enabled AND intent IS NULL ORDER BY id",
		);
		const targets = rows.filter((p) => !getEffectiveBrandedStatus(p.system_tags, p.tags).isBranded);
		const calls = Math.ceil(targets.length / INTENT_BATCH_SIZE);
		console.log(`${targets.length} unbranded prompt(s) without an intent → ${calls} model call(s)`);
		if (!values.yes) {
			console.log("Dry run. Pass --yes to classify and write.");
			return;
		}
		const intents = await classifyIntents(targets);
		let written = 0;
		for (const [id, intent] of intents) {
			if (intent === null) continue;
			const { rowCount } = await client.query("UPDATE prompts SET intent = $1 WHERE id = $2 AND intent IS NULL", [
				intent,
				id,
			]);
			written += rowCount ?? 0;
		}
		console.log(`✓ set intent on ${written} prompt(s); ${targets.length - written} left null (no fitting intent)`);
	} finally {
		await client.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
```

- [ ] **Step 6: Dry-run against the local database**

```bash
cd packages/lib && DATABASE_URL=<local url> pnpm backfill:prompt-intent
```

Expected: a count line and "Dry run. Pass --yes to classify and write." with no model call made. Do not pass `--yes`; the operator does that.

- [ ] **Step 7: Commit**

```bash
git add packages/lib/scripts/backfill-prompt-intent.ts packages/lib/src/score/intent-backfill.ts packages/lib/src/score/intent-backfill.test.ts
git commit -m "add the one-off prompt intent backfill"
```

---

### Task 12: Lint, full tests, hand-back

**Files:** none new.

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: no errors. Fix anything reported with `pnpm lint:fix` then by hand; never add `biome-ignore`.

- [ ] **Step 2: Full unit tests**

Run: `pnpm test`
Expected: all green across lib, worker and web.

- [ ] **Step 3: Type-check everything**

Run: `pnpm -r check-types` (or `pnpm exec turbo run check-types`).
Expected: clean.

- [ ] **Step 4: Commit any lint fixes**

```bash
git add -A -- ':!docs/Enrigio Web App.html' ':!*Zone.Identifier'
git commit -m "tidy lint findings from the score v2 foundations"
```

- [ ] **Step 5: Report back** with: the migration file name (not applied), the two operator commands (`backtest:score-v2`, `backfill:prompt-intent --yes`) and the note that the `--labels` export only returns rows after the worker change has run in production for a few days.
