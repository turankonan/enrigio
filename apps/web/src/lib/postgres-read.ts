/**
 * Postgres analytics read layer.
 *
 * All analytics queries run against PostgreSQL with covering indices
 * on prompt_runs and citations tables.
 */

import { parseModelFilter } from "@workspace/config/model-filter";
import { db } from "@workspace/lib/db/db";
import type { PromptIntent } from "@workspace/lib/db/schema";
import { getAllProviders } from "@workspace/lib/providers";
import { RANK_WEIGHTS } from "@workspace/lib/score";
import { type SQL, sql } from "drizzle-orm";
import type { ModelCompetitorMentionRow } from "@/lib/engine-comparison";
import {
	type FanoutBreakdownRow,
	type FanoutModelTotalRow,
	type FanoutPromptTotalRow,
	UNAVAILABLE_SENTINEL,
} from "@/lib/fanout-analysis";

export interface DashboardSummary {
	total_prompts: number;
	prompts_with_mention: number;
	total_runs: number;
	avg_visibility: number;
	non_branded_visibility: number;
	sentiment_positive: number;
	sentiment_neutral: number;
	sentiment_negative: number;
	avg_brand_rank: number | null;
	last_updated: string | null;
}

export interface VisibilityTimeSeriesPoint {
	date: string;
	total_runs: number;
	brand_mentioned_count: number;
	is_branded: boolean;
}

export interface PromptSummary {
	prompt_id: string;
	total_runs: number;
	/** Fraction of runs in which the brand was mentioned, 0..1. */
	brand_mention_rate: number;
	/** Fraction of runs in which any tracked competitor was mentioned, 0..1. */
	competitor_mention_rate: number;
	total_weighted_mentions: number;
	last_run_date: string | null;
}

export interface PromptFirstEvaluatedAt {
	prompt_id: string;
	first_evaluated_at: string;
}

export interface CitationDomainStats {
	domain: string;
	count: number;
	example_title: string | null;
}

export interface CitationUrlStats {
	url: string;
	domain: string;
	title: string | null;
	count: number;
	avg_position: number | null;
	prompt_count: number;
}

export interface PromptMentionSummary {
	total_runs: number;
	brand_mentioned_count: number;
	competitor_mentioned_count: number;
}

export interface TopCompetitorMention {
	competitor_name: string;
	mention_count: number;
}

export interface DailyCitationStats {
	date: string;
	domain: string;
	count: number;
}

export interface ProcessedBatchChartDataPoint {
	prompt_id: string;
	date: string;
	total_runs: number;
	brand_mentioned_count: number;
	competitor_counts: Record<string, number>;
}

async function queryPg<T>(query: SQL): Promise<T[]> {
	const result = await db.execute(query);
	return result.rows as T[];
}

/**
 * Two spellings reach here. The dashboard asks for calendar days, so
 * `YYYY-MM-DD` is resolved against `timezone` with `to` covering the whole of
 * its last day; `/api/v1` asks with instants, which are used as given.
 *
 * The only place that distinction exists — every window below is half-open.
 */
export const isCalendarDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

function windowStart(from: string, timezone: string): SQL {
	return isCalendarDay(from) ? sql`(${from}::date AT TIME ZONE ${timezone})` : sql`${from}::timestamptz`;
}

function windowEnd(to: string, timezone: string): SQL {
	return isCalendarDay(to) ? sql`((${to}::date + interval '1 day') AT TIME ZONE ${timezone})` : sql`${to}::timestamptz`;
}

function dateFilter(fromDate: string | null, toDate: string | null, timezone: string): SQL {
	if (!fromDate || !toDate) return sql``;
	return sql`AND created_at >= ${windowStart(fromDate, timezone)} AND created_at < ${windowEnd(toDate, timezone)}`;
}

function uuidList(ids: string[]): SQL {
	return sql.join(
		ids.map((id) => sql`${id}::uuid`),
		sql`, `,
	);
}

function promptIdFilter(enabledPromptIds?: string[]): SQL {
	if (!enabledPromptIds?.length) return sql``;
	return sql`AND prompt_id IN (${uuidList(enabledPromptIds)})`;
}

/**
 * Provider ids that reach a model by calling it directly. Combined with
 * `web_search_enabled`, this is what separates a grounded API answer from the
 * same model scraped off its consumer product — `prompt_runs` records the
 * provider, and both rows carry `model = 'chatgpt'` with web search on.
 *
 * Caveat: a provider that picks its route per target (DataForSEO scrapes by
 * default and calls the API when a target pins a version) is classified by its
 * default here, since the row doesn't record which route ran.
 */
const API_PROVIDER_IDS = getAllProviders()
	.filter((provider) => provider.access === "api")
	.map((provider) => provider.id);

/**
 * Narrow to one target. A bare model id means the standard platform; the
 * `::premium` variant means the grounded API call sold from the premium pool.
 *
 * The provider list is bound one parameter per id rather than as an array:
 * drizzle flattens a JS array into a single text parameter, which `ANY(...)`
 * then can't compare element-wise.
 */
function modelFilter(model?: string, opts?: { alias?: string; source?: "prompt_runs" | "citations" }): SQL {
	const target = model ? parseModelFilter(model) : null;
	if (!target) return sql``;
	const prefix = opts?.alias ? sql.raw(`${opts.alias}.`) : sql``;
	// No API providers configured means nothing can be grounded, so the premium
	// side matches nothing and the standard side matches everything.
	if (API_PROVIDER_IDS.length === 0) {
		return target.premium ? sql`AND FALSE` : sql`AND ${prefix}model = ${target.model}`;
	}
	const providers = sql.join(
		API_PROVIDER_IDS.map((id) => sql`${id}`),
		sql`, `,
	);
	// A citation records which model cited it but not how that model was
	// reached, so the grounded test has to go through the run it came from.
	const grounded =
		opts?.source === "citations"
			? sql`EXISTS (
					SELECT 1 FROM prompt_runs AS mf_run
					WHERE mf_run.id = ${prefix}prompt_run_id
						AND mf_run.web_search_enabled
						AND mf_run.provider IN (${providers})
				)`
			: sql`(${prefix}web_search_enabled AND ${prefix}provider IN (${providers}))`;
	return sql`AND ${prefix}model = ${target.model} AND ${target.premium ? grounded : sql`NOT ${grounded}`}`;
}

function webSearchFilter(webSearchEnabled?: boolean): SQL {
	if (webSearchEnabled === undefined) return sql``;
	return sql`AND web_search_enabled = ${webSearchEnabled}`;
}

/**
 * A closed set of known FROM shapes reached by brand-scoped reads —
 * deliberately not an arbitrary alias string through `sql.raw`, so this can
 * never be pointed at an unvetted table/column.
 */
type MarketScopeSource =
	| "prompt_runs" // unaliased prompt_runs row
	| "pr" // prompt_runs aliased "pr" (fanout queries)
	| "citations"; // citations row — EXISTS-join back to prompt_runs

/**
 * Scopes a brand-scoped read to the brand's effective market plus `global`
 * (proven non-localizable, so it belongs in every market's view). `legacy`
 * and every other real market are excluded by omission — this is a fixed,
 * single-market scope, not a user-facing filter.
 */
export function marketScope(effectiveMarketKey: string, source: MarketScopeSource = "prompt_runs"): SQL {
	if (source === "citations") {
		return sql`AND EXISTS (
			SELECT 1 FROM prompt_runs AS ms_run
			WHERE ms_run.id = prompt_run_id
				AND (ms_run.market_key = ${effectiveMarketKey} OR ms_run.market_key = 'global')
		)`;
	}
	const prefix = source === "pr" ? sql.raw("pr.") : sql``;
	return sql`AND (${prefix}market_key = ${effectiveMarketKey} OR ${prefix}market_key = 'global')`;
}

export async function getDashboardSummary(
	brandId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	enabledPromptIds: string[] | undefined,
	effectiveMarketKey: string,
): Promise<DashboardSummary[]> {
	const rows = await queryPg<DashboardSummary>(sql`
		SELECT
			count(DISTINCT prompt_id)::int AS total_prompts,
			count(DISTINCT prompt_id) FILTER (WHERE brand_mentioned)::int AS prompts_with_mention,
			count(*)::int AS total_runs,
			round(count(*) FILTER (WHERE brand_mentioned) * 100.0 / NULLIF(count(*), 0), 0)::int AS avg_visibility,
			round(count(*) FILTER (WHERE brand_mentioned) * 100.0 / NULLIF(count(*), 0), 0)::int AS non_branded_visibility,
			count(*) FILTER (WHERE sentiment = 'positive')::int AS sentiment_positive,
			count(*) FILTER (WHERE sentiment = 'neutral')::int  AS sentiment_neutral,
			count(*) FILTER (WHERE sentiment = 'negative')::int AS sentiment_negative,
			round(avg(brand_rank) FILTER (WHERE brand_rank IS NOT NULL), 1)::float AS avg_brand_rank,
			to_char(max(created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || '.000Z' AS last_updated
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${marketScope(effectiveMarketKey)}
	`);
	return rows;
}

/**
 * Same numbers as scoreV2(); the constant is the single source. The ::numeric casts matter:
 * pg sends parameters untyped, so without them Postgres resolves the CASE to integer from
 * the `THEN 0` branch and rejects 0.7 at runtime. Nothing tests this SQL.
 */
const RANK_WEIGHT_CASE = sql`CASE
	WHEN NOT brand_mentioned THEN 0
	WHEN brand_rank = 1 THEN ${RANK_WEIGHTS.rank1}::numeric
	WHEN brand_rank = 2 THEN ${RANK_WEIGHTS.rank2}::numeric
	WHEN brand_rank = 3 THEN ${RANK_WEIGHTS.rank3}::numeric
	ELSE ${RANK_WEIGHTS.other}::numeric
END`;

export interface ScoreV2Summary {
	total_runs: number;
	prompt_count: number;
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
	if (promptIds.length === 0) return { total_runs: 0, prompt_count: 0, score_v2: null };
	const [row] = await queryPg<ScoreV2Summary>(sql`
		SELECT
			count(*)::int AS total_runs,
			count(DISTINCT prompt_id)::int AS prompt_count,
			round(avg(${RANK_WEIGHT_CASE}) * 100)::int AS score_v2
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptIdFilter(promptIds)}
			${marketScope(effectiveMarketKey)}
	`);
	return row ?? { total_runs: 0, prompt_count: 0, score_v2: null };
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
	const empty = {
		branded_mentioned_runs: 0,
		assessed_runs: 0,
		accurate_runs: 0,
		unsupported_runs: 0,
		unrecognised_runs: 0,
	};
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

export interface PerPromptVisibilityPoint {
	prompt_id: string;
	date: string;
	total_runs: number;
	brand_mentioned_count: number;
}

export async function getPerPromptVisibilityTimeSeries(
	brandId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	enabledPromptIds: string[] | undefined,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<PerPromptVisibilityPoint[]> {
	if (!enabledPromptIds?.length) return [];
	const rows = await queryPg<PerPromptVisibilityPoint>(sql`
		SELECT
			prompt_id,
			(created_at AT TIME ZONE ${timezone})::date AS date,
			count(*)::int AS total_runs,
			count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_count
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
			${marketScope(effectiveMarketKey)}
		GROUP BY prompt_id, date
		ORDER BY prompt_id, date
	`);
	return rows;
}

export interface VisibilityDailyAggregate {
	date: string;
	/** Raw observation totals — do not include carried-forward values, so period totals stay faithful. */
	actual_branded_runs: number;
	actual_branded_mentioned: number;
	actual_nonbranded_runs: number;
	actual_nonbranded_mentioned: number;
	/** LVCF-smoothed totals used to draw the visibility time-series. */
	lvcf_branded_runs: number;
	lvcf_branded_mentioned: number;
	lvcf_nonbranded_runs: number;
	lvcf_nonbranded_mentioned: number;
}

/**
 * Single-query replacement for `getPerPromptVisibilityTimeSeries` + JS
 * `applyPerPromptLVCF`.
 *
 * Builds a (prompt × date) grid in-database, left-joins raw daily observations,
 * and groups rows by the running count of non-null observations to carry the
 * last observation forward. Leading-null dates
 * (before a prompt's first observation) are back-seeded with the prompt's
 * earliest value to mirror the existing JS behavior. The result is already
 * aggregated by day and bucketed by branded / non-branded.
 *
 * Returns one row per date in [fromDate, toDate], which is O(days) transfer
 * rather than O(prompts × days), and drops the JS LVCF pass entirely.
 */
export async function getVisibilityDailyAggregate(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds: string[],
	brandedPromptIds: string[],
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<VisibilityDailyAggregate[]> {
	if (enabledPromptIds.length === 0) return [];

	// `brandedIdsRelation` is a subquery that yields one row per branded
	// prompt id. Joining prompts_list against it and checking `IS NOT NULL`
	// lets us classify branded prompts *without* relying on `pid = ANY(...)`
	// which has a NULL-element footgun: `ARRAY[]::uuid[]` works fine but
	// `unnest(ARRAY[]::uuid[])` returned 0 rows in a way that let NULLs
	// propagate through an earlier attempt. The LEFT JOIN is explicit and
	// behaves predictably whether the branded set is empty, partial, or all.
	const brandedIdsRelation = brandedPromptIds.length
		? sql`(SELECT unnest(ARRAY[${sql.join(
				brandedPromptIds.map((id) => sql`${id}::uuid`),
				sql`, `,
			)}]::uuid[]) AS bid)`
		: sql`(SELECT NULL::uuid AS bid WHERE FALSE)`;

	const rows = await queryPg<VisibilityDailyAggregate>(sql`
		WITH
			date_range AS (
				SELECT series::date AS day
				FROM generate_series(${fromDate}::date, ${toDate}::date, interval '1 day') AS g(series)
			),
			prompts_list AS (
				SELECT
					p.pid AS prompt_id,
					bp.bid IS NOT NULL AS is_branded
				FROM unnest(ARRAY[${sql.join(
					enabledPromptIds.map((id) => sql`${id}::uuid`),
					sql`, `,
				)}]::uuid[]) AS p(pid)
				LEFT JOIN ${brandedIdsRelation} bp ON bp.bid = p.pid
			),
			observations AS (
				SELECT
					prompt_id,
					(created_at AT TIME ZONE ${timezone})::date AS obs_date,
					count(*)::int AS total_runs,
					count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_count
				FROM prompt_runs
				WHERE brand_id = ${brandId}
					AND prompt_id IN (${uuidList(enabledPromptIds)})
					AND created_at >= ${windowStart(fromDate, timezone)}
					AND created_at < ${windowEnd(toDate, timezone)}
					${modelFilter(model)}
					${marketScope(effectiveMarketKey)}
				-- Group by the SELECT alias, not the full expression: drizzle
				-- emits a fresh $N parameter for every timezone interpolation,
				-- so the SELECT expression and GROUP BY expression aren't
				-- recognized as identical by Postgres and the query errors
				-- with "column prompt_runs.created_at must appear in GROUP BY".
				GROUP BY prompt_id, obs_date
			),
			first_obs AS (
				SELECT DISTINCT ON (prompt_id)
					prompt_id,
					total_runs AS first_runs,
					brand_mentioned_count AS first_mentioned
				FROM observations
				ORDER BY prompt_id, obs_date
			),
			grid AS (
				SELECT
					pl.prompt_id,
					pl.is_branded,
					dr.day AS date,
					obs.total_runs AS actual_runs,
					obs.brand_mentioned_count AS actual_mentioned,
					count(obs.total_runs) OVER (PARTITION BY pl.prompt_id ORDER BY dr.day) AS fwd_grp
				FROM prompts_list pl
				CROSS JOIN date_range dr
				LEFT JOIN observations obs
					ON obs.prompt_id = pl.prompt_id AND obs.obs_date = dr.day
			),
			lvcf AS (
				SELECT
					g.prompt_id,
					g.is_branded,
					g.date,
					g.actual_runs,
					g.actual_mentioned,
					coalesce(
						max(g.actual_runs) OVER (PARTITION BY g.prompt_id, g.fwd_grp),
						fo.first_runs
					) AS lvcf_runs,
					coalesce(
						max(g.actual_mentioned) OVER (PARTITION BY g.prompt_id, g.fwd_grp),
						fo.first_mentioned
					) AS lvcf_mentioned
				FROM grid g
				LEFT JOIN first_obs fo ON fo.prompt_id = g.prompt_id
			)
		SELECT
			to_char(date, 'YYYY-MM-DD') AS date,
			coalesce(sum(actual_runs) FILTER (WHERE is_branded), 0)::int AS actual_branded_runs,
			coalesce(sum(actual_mentioned) FILTER (WHERE is_branded), 0)::int AS actual_branded_mentioned,
			coalesce(sum(actual_runs) FILTER (WHERE NOT is_branded), 0)::int AS actual_nonbranded_runs,
			coalesce(sum(actual_mentioned) FILTER (WHERE NOT is_branded), 0)::int AS actual_nonbranded_mentioned,
			coalesce(sum(lvcf_runs) FILTER (WHERE is_branded), 0)::int AS lvcf_branded_runs,
			coalesce(sum(lvcf_mentioned) FILTER (WHERE is_branded), 0)::int AS lvcf_branded_mentioned,
			coalesce(sum(lvcf_runs) FILTER (WHERE NOT is_branded), 0)::int AS lvcf_nonbranded_runs,
			coalesce(sum(lvcf_mentioned) FILTER (WHERE NOT is_branded), 0)::int AS lvcf_nonbranded_mentioned
		FROM lvcf
		GROUP BY date
		ORDER BY date
	`);
	return rows;
}

/**
 * Plain count of citations for the filter window. The visibility bar needs
 * only this scalar, avoiding a row per date and domain on large tables.
 */
export async function getCitationsTotalCount(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds: string[] | undefined,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<number> {
	if (enabledPromptIds && enabledPromptIds.length === 0) return 0;
	const rows = await queryPg<{ total: number }>(sql`
		SELECT count(*)::int AS total
		FROM citations
		WHERE brand_id = ${brandId}
			AND created_at >= ${windowStart(fromDate, timezone)}
			AND created_at < ${windowEnd(toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model, { source: "citations" })}
			${marketScope(effectiveMarketKey, "citations")}
	`);
	return Number(rows[0]?.total ?? 0);
}

export async function getVisibilityTimeSeries(
	brandId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	brandedPromptIds: string[],
	enabledPromptIds: string[] | undefined,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<VisibilityTimeSeriesPoint[]> {
	const isBranded = brandedPromptIds.length > 0 ? sql`(prompt_id IN (${uuidList(brandedPromptIds)}))` : sql`FALSE`;
	const rows = await queryPg<VisibilityTimeSeriesPoint>(sql`
		SELECT
			(created_at AT TIME ZONE ${timezone})::date AS date,
			count(*)::int AS total_runs,
			count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_count,
			${isBranded} AS is_branded
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
			${marketScope(effectiveMarketKey)}
		GROUP BY date, is_branded
		ORDER BY date
	`);
	return rows;
}

export async function getPromptsFirstEvaluatedAt(
	brandId: string,
	promptIds: string[],
	effectiveMarketKey: string,
): Promise<PromptFirstEvaluatedAt[]> {
	if (promptIds.length === 0) return [];

	const rows = await queryPg<PromptFirstEvaluatedAt>(sql`
		SELECT
			prompt_id,
			min(created_at) AT TIME ZONE 'UTC' AS first_evaluated_at
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			AND prompt_id IN (${uuidList(promptIds)})
			${marketScope(effectiveMarketKey)}
		GROUP BY prompt_id
	`);
	return rows;
}

export async function getPromptsSummary(
	brandId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	webSearchEnabled: boolean | undefined,
	model: string | undefined,
	enabledPromptIds: string[] | undefined,
	effectiveMarketKey: string,
): Promise<PromptSummary[]> {
	const rows = await queryPg<PromptSummary>(sql`
		SELECT
			prompt_id,
			count(*)::int AS total_runs,
			(count(*) FILTER (WHERE brand_mentioned)::float / NULLIF(count(*), 0)) AS brand_mention_rate,
			(count(*) FILTER (WHERE array_length(competitors_mentioned, 1) > 0)::float / NULLIF(count(*), 0)) AS competitor_mention_rate,
			(count(*) FILTER (WHERE brand_mentioned) * 2 + COALESCE(sum(array_length(competitors_mentioned, 1)), 0))::int AS total_weighted_mentions,
			max((created_at AT TIME ZONE ${timezone})::date) AS last_run_date
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${webSearchFilter(webSearchEnabled)}
			${modelFilter(model)}
			${promptIdFilter(enabledPromptIds)}
			${marketScope(effectiveMarketKey)}
		GROUP BY prompt_id
		ORDER BY total_runs DESC
	`);
	return rows;
}

export interface WebQueryCount {
	model: string;
	web_query: string;
	query_count: number;
}

export async function getPromptWebQueryCounts(
	promptId: string,
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<WebQueryCount[]> {
	// The `unavailable` sentinel (search happened, query strings unexposed) isn't
	// a usable web query — without this filter it becomes a model's "top query"
	// whenever a provider never exposes strings (OpenRouter; DataForSEO Google).
	const rows = await queryPg<WebQueryCount>(sql`
		SELECT
			model,
			web_query,
			count(*)::int AS query_count
		FROM prompt_runs, unnest(web_queries) AS web_query
		WHERE prompt_id = ${promptId}
			AND array_length(web_queries, 1) > 0
			AND lower(btrim(web_query)) <> ${UNAVAILABLE_SENTINEL}
			${dateFilter(fromDate, toDate, timezone)}
			${modelFilter(model)}
			${marketScope(effectiveMarketKey)}
		GROUP BY model, web_query
		ORDER BY model, query_count DESC
	`);
	return rows;
}

export async function getCitationDomainStats(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds: string[] | undefined,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<CitationDomainStats[]> {
	const rows = await queryPg<CitationDomainStats>(sql`
		SELECT
			domain,
			count(*)::int AS count,
			(array_agg(title ORDER BY created_at DESC) FILTER (WHERE title IS NOT NULL))[1] AS example_title
		FROM citations
		WHERE brand_id = ${brandId}
			AND created_at >= ${windowStart(fromDate, timezone)}
			AND created_at < ${windowEnd(toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model, { source: "citations" })}
			${marketScope(effectiveMarketKey, "citations")}
		GROUP BY domain
		ORDER BY count DESC
	`);
	return rows;
}

export async function getCitationUrlStats(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds: string[] | undefined,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<CitationUrlStats[]> {
	const rows = await queryPg<CitationUrlStats>(sql`
		SELECT
			url,
			domain,
			(array_agg(title ORDER BY created_at DESC) FILTER (WHERE title IS NOT NULL))[1] AS title,
			count(*)::int AS count,
			round(avg(citation_index)::numeric, 1)::float AS avg_position,
			count(DISTINCT prompt_id)::int AS prompt_count
		FROM citations
		WHERE brand_id = ${brandId}
			AND created_at >= ${windowStart(fromDate, timezone)}
			AND created_at < ${windowEnd(toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model, { source: "citations" })}
			${marketScope(effectiveMarketKey, "citations")}
		GROUP BY url, domain
		ORDER BY count DESC
	`);
	return rows;
}

export async function getCitationDomainPromptCounts(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds: string[] | undefined,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<Map<string, number>> {
	const rows = await queryPg<{ domain: string; prompt_count: number }>(sql`
		SELECT domain, count(DISTINCT prompt_id)::int AS prompt_count
		FROM citations
		WHERE brand_id = ${brandId}
			AND created_at >= ${windowStart(fromDate, timezone)}
			AND created_at < ${windowEnd(toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model, { source: "citations" })}
			${marketScope(effectiveMarketKey, "citations")}
		GROUP BY domain
	`);
	return new Map(rows.map((row) => [row.domain, Number(row.prompt_count)]));
}

export async function getPromptCitationUrlStats(
	promptId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	effectiveMarketKey: string,
): Promise<CitationUrlStats[]> {
	const rows = await queryPg<CitationUrlStats>(sql`
		SELECT
			url,
			domain,
			(array_agg(title ORDER BY created_at DESC) FILTER (WHERE title IS NOT NULL))[1] AS title,
			count(*)::int AS count,
			round(avg(citation_index)::numeric, 1)::float AS avg_position,
			count(DISTINCT prompt_id)::int AS prompt_count
		FROM citations
		WHERE prompt_id = ${promptId}
			AND created_at >= ${windowStart(fromDate, timezone)}
			AND created_at < ${windowEnd(toDate, timezone)}
			${marketScope(effectiveMarketKey, "citations")}
		GROUP BY url, domain
		ORDER BY count DESC
	`);
	return rows;
}

export async function getPromptMentionSummary(
	promptId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	effectiveMarketKey: string,
): Promise<PromptMentionSummary> {
	const rows = await queryPg<PromptMentionSummary>(sql`
		SELECT
			count(*)::int AS total_runs,
			count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_count,
			COALESCE(sum(array_length(competitors_mentioned, 1)), 0)::int AS competitor_mentioned_count
		FROM prompt_runs
		WHERE prompt_id = ${promptId}
			AND created_at >= ${windowStart(fromDate, timezone)}
			AND created_at < ${windowEnd(toDate, timezone)}
			${marketScope(effectiveMarketKey)}
	`);
	return rows[0] || { total_runs: 0, brand_mentioned_count: 0, competitor_mentioned_count: 0 };
}

export async function getPromptTopCompetitorMentions(
	promptId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	limit: number,
	effectiveMarketKey: string,
): Promise<TopCompetitorMention[]> {
	const rows = await queryPg<TopCompetitorMention>(sql`
		SELECT
			competitor_name,
			count(DISTINCT pr.id)::int AS mention_count
		FROM prompt_runs pr, unnest(pr.competitors_mentioned) AS competitor_name
		WHERE pr.prompt_id = ${promptId}
			AND pr.created_at >= ${windowStart(fromDate, timezone)}
			AND pr.created_at < ${windowEnd(toDate, timezone)}
			${marketScope(effectiveMarketKey, "pr")}
		GROUP BY competitor_name
		ORDER BY mention_count DESC
		LIMIT ${limit}
	`);
	return rows;
}

export async function getDailyCitationStats(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds: string[] | undefined,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<DailyCitationStats[]> {
	const rows = await queryPg<DailyCitationStats>(sql`
		SELECT
			(created_at AT TIME ZONE ${timezone})::date AS date,
			domain,
			count(*)::int AS count
		FROM citations
		WHERE brand_id = ${brandId}
			AND created_at >= ${windowStart(fromDate, timezone)}
			AND created_at < ${windowEnd(toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model, { source: "citations" })}
			${marketScope(effectiveMarketKey, "citations")}
		GROUP BY date, domain
		ORDER BY date
	`);
	return rows;
}

export interface PerPromptDailyCitationStats {
	prompt_id: string;
	date: string;
	domain: string;
	count: number;
}

export async function getPerPromptDailyCitationStats(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds: string[] | undefined,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<PerPromptDailyCitationStats[]> {
	if (!enabledPromptIds?.length) return [];
	const rows = await queryPg<PerPromptDailyCitationStats>(sql`
		SELECT
			prompt_id,
			(created_at AT TIME ZONE ${timezone})::date AS date,
			domain,
			count(*)::int AS count
		FROM citations
		WHERE brand_id = ${brandId}
			AND created_at >= ${windowStart(fromDate, timezone)}
			AND created_at < ${windowEnd(toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model, { source: "citations" })}
			${marketScope(effectiveMarketKey, "citations")}
		GROUP BY prompt_id, date, domain
		ORDER BY prompt_id, date
	`);
	return rows;
}

export interface PerPromptRunStats {
	prompt_id: string;
	runs: number;
	/** Distinct days on which this prompt was run (for the chosen model filter). */
	run_days: number;
	/** Fraction of runs in which the brand was mentioned, 0..1. */
	brand_mention_rate: number;
	/** Fraction of runs in which any tracked competitor was mentioned, 0..1. */
	competitor_mention_rate: number;
}

export async function getPerPromptRunStats(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds: string[] | undefined,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<PerPromptRunStats[]> {
	const rows = await queryPg<PerPromptRunStats>(sql`
		SELECT
			prompt_id,
			count(*)::int AS runs,
			count(DISTINCT (created_at AT TIME ZONE ${timezone})::date)::int AS run_days,
			round(avg(CASE WHEN brand_mentioned THEN 1 ELSE 0 END)::numeric, 4)::float AS brand_mention_rate,
			round(avg(CASE WHEN cardinality(competitors_mentioned) > 0 THEN 1 ELSE 0 END)::numeric, 4)::float AS competitor_mention_rate
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
			${marketScope(effectiveMarketKey)}
		GROUP BY prompt_id
	`);
	return rows;
}

export interface BrandMentionTotals {
	total_runs: number;
	brand_mentioned_runs: number;
	/** Distinct prompts in which the brand was mentioned at least once. */
	brand_mentioned_prompts: number;
}

export async function getBrandMentionTotals(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds: string[] | undefined,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<BrandMentionTotals> {
	const rows = await queryPg<BrandMentionTotals>(sql`
		SELECT
			count(*)::int AS total_runs,
			count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_runs,
			count(DISTINCT prompt_id) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_prompts
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
			${marketScope(effectiveMarketKey)}
	`);
	return rows[0] ?? { total_runs: 0, brand_mentioned_runs: 0, brand_mentioned_prompts: 0 };
}

export interface PerPromptDailyMentionRow {
	prompt_id: string;
	date: string;
	/** Runs that day (for this prompt) mentioning the brand. */
	brand_mentions: number;
	/** Competitor mention instances that day (for this prompt). */
	competitor_mentions: number;
}

/** Per-prompt, per-day brand and competitor mention counts — feeds LVCF-smoothed share of voice. */
export async function getPerPromptDailyMentions(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds: string[] | undefined,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<PerPromptDailyMentionRow[]> {
	if (!enabledPromptIds?.length) return [];
	const rows = await queryPg<PerPromptDailyMentionRow>(sql`
		SELECT
			prompt_id,
			(created_at AT TIME ZONE ${timezone})::date::text AS date,
			count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentions,
			COALESCE(sum(cardinality(competitors_mentioned)), 0)::int AS competitor_mentions
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
			${marketScope(effectiveMarketKey)}
		GROUP BY prompt_id, date
		ORDER BY prompt_id, date
	`);
	return rows;
}

export interface PromptRunRow {
	id: string;
	prompt_id: string;
	brand_id: string;
	model: string;
	provider: string | null;
	web_search_enabled: boolean;
	brand_mentioned: boolean;
	competitors_mentioned: string[];
	web_queries: string[];
	citation_count: number;
	created_at: string;
}

/** Here rather than in the route so the window goes through the same
 * timezone-aware `dateFilter` as every other read. */
export async function getPromptRuns(
	promptId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	limit: number,
	offset: number,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<PromptRunRow[]> {
	return queryPg<PromptRunRow>(sql`
		SELECT
			prompt_runs.id::text AS id,
			prompt_runs.prompt_id::text AS prompt_id,
			prompt_runs.brand_id,
			prompt_runs.model,
			prompt_runs.provider,
			prompt_runs.web_search_enabled,
			prompt_runs.brand_mentioned,
			prompt_runs.competitors_mentioned,
			prompt_runs.web_queries,
			(SELECT count(*) FROM citations c WHERE c.prompt_run_id = prompt_runs.id)::int AS citation_count,
			prompt_runs.created_at
		FROM prompt_runs
		WHERE prompt_id = ${promptId}::uuid
			${dateFilter(fromDate, toDate, timezone)}
			${modelFilter(model)}
			${marketScope(effectiveMarketKey)}
		ORDER BY prompt_runs.created_at DESC
		LIMIT ${limit} OFFSET ${offset}
	`);
}

export async function countPromptRuns(
	promptId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<number> {
	const rows = await queryPg<{ total: number }>(sql`
		SELECT count(*)::int AS total
		FROM prompt_runs
		WHERE prompt_id = ${promptId}::uuid
			${dateFilter(fromDate, toDate, timezone)}
			${modelFilter(model)}
			${marketScope(effectiveMarketKey)}
	`);
	return rows[0]?.total ?? 0;
}

export interface PerPromptDailyCompetitorRow {
	prompt_id: string;
	date: string;
	competitor: string;
	/** Competitor mention instances that day (for this prompt). */
	mentions: number;
}

/**
 * Per-prompt, per-day, per-competitor mention counts. Feeds the LVCF "current
 * standings" leaderboard so the headline number, donut, and table all reflect
 * the same last-day state as the share-of-voice trend (rather than a whole-window
 * aggregate that wouldn't match the line's end).
 */
export async function getPerPromptDailyCompetitorMentions(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds: string[] | undefined,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<PerPromptDailyCompetitorRow[]> {
	if (!enabledPromptIds?.length) return [];
	const rows = await queryPg<PerPromptDailyCompetitorRow>(sql`
		SELECT
			prompt_id,
			(created_at AT TIME ZONE ${timezone})::date::text AS date,
			competitor,
			count(*)::int AS mentions
		FROM prompt_runs, unnest(competitors_mentioned) AS competitor
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model)}
			${marketScope(effectiveMarketKey)}
		GROUP BY prompt_id, date, competitor
		ORDER BY prompt_id, date
	`);
	return rows;
}

export interface PerPromptCitationPageRow {
	prompt_id: string;
	url: string | null;
	domain: string;
	/** A representative cited page title for this URL (most recent non-null). */
	title: string | null;
	count: number;
}

/** Per prompt, citations at the page (URL) level: one row per prompt+URL with a
 * representative title and its domain, ordered by count. Aggregate to domains in
 * JS for the landscape digest; use the URLs for the citation drill-downs. */
export async function getPerPromptCitationPages(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds: string[] | undefined,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<PerPromptCitationPageRow[]> {
	if (!enabledPromptIds?.length) return [];
	const rows = await queryPg<PerPromptCitationPageRow>(sql`
		SELECT
			prompt_id,
			url,
			domain,
			(array_agg(title ORDER BY created_at DESC) FILTER (WHERE title IS NOT NULL))[1] AS title,
			count(*)::int AS count
		FROM citations
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model, { source: "citations" })}
			${marketScope(effectiveMarketKey, "citations")}
		GROUP BY prompt_id, url, domain
		ORDER BY prompt_id, count DESC
	`);
	return rows;
}

export interface PerPromptDailyCitationPageRow {
	prompt_id: string;
	date: string;
	url: string | null;
	domain: string;
	title: string | null;
	count: number;
}

/** Per prompt + day + URL: citation counts with a representative title. Powers the
 *  category and page-type time-series, which are classified in JS from url + title. */
export async function getPerPromptDailyCitationPages(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds: string[] | undefined,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<PerPromptDailyCitationPageRow[]> {
	if (!enabledPromptIds?.length) return [];
	const rows = await queryPg<PerPromptDailyCitationPageRow>(sql`
		SELECT
			prompt_id,
			(created_at AT TIME ZONE ${timezone})::date AS date,
			url,
			domain,
			(array_agg(title ORDER BY created_at DESC) FILTER (WHERE title IS NOT NULL))[1] AS title,
			count(*)::int AS count
		FROM citations
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model, { source: "citations" })}
			${marketScope(effectiveMarketKey, "citations")}
		GROUP BY prompt_id, date, url, domain
		ORDER BY prompt_id, date
	`);
	return rows;
}

export interface ModelMentionRateRow {
	model: string;
	runs: number;
	brand_mentioned_count: number;
}

/** Brand mention rate grouped by model, over a window — how the brand is doing
 * on each tracked platform. */
export async function getBrandMentionRateByModel(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds: string[] | undefined,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<ModelMentionRateRow[]> {
	if (!enabledPromptIds?.length) return [];
	const rows = await queryPg<ModelMentionRateRow>(sql`
		SELECT
			model,
			count(*)::int AS runs,
			count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_count
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${dateFilter(fromDate, toDate, timezone)}
			${promptIdFilter(enabledPromptIds)}
			${modelFilter(model, { source: "prompt_runs" })}
			${marketScope(effectiveMarketKey)}
		GROUP BY model
		ORDER BY runs DESC
	`);
	return rows;
}

export async function getBrandEarliestRunDate(brandId: string, effectiveMarketKey: string): Promise<string | null> {
	const rows = await queryPg<{ earliest_date: string | null }>(sql`
		SELECT min(created_at) AS earliest_date
		FROM prompt_runs
		WHERE brand_id = ${brandId}
			${marketScope(effectiveMarketKey)}
	`);
	return rows[0]?.earliest_date || null;
}

export async function getBatchChartData(
	brandId: string,
	promptIds: string[],
	fromDate: string | null,
	toDate: string | null,
	timezone: string,
	webSearchEnabled: boolean | undefined,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<ProcessedBatchChartDataPoint[]> {
	if (promptIds.length === 0) return [];

	const [brandData, competitorData] = await Promise.all([
		queryPg<{
			prompt_id: string;
			date: string;
			total_runs: number;
			brand_mentioned_count: number;
		}>(sql`
			SELECT
				prompt_id,
				(created_at AT TIME ZONE ${timezone})::date AS date,
				count(*)::int AS total_runs,
				count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_count
			FROM prompt_runs
			WHERE brand_id = ${brandId}
				AND prompt_id IN (${uuidList(promptIds)})
				${dateFilter(fromDate, toDate, timezone)}
				${webSearchFilter(webSearchEnabled)}
				${modelFilter(model)}
				${marketScope(effectiveMarketKey)}
			GROUP BY prompt_id, date
			ORDER BY prompt_id, date
		`),
		queryPg<{
			prompt_id: string;
			date: string;
			competitor_name: string;
			mention_count: number;
		}>(sql`
			SELECT
				prompt_id,
				(created_at AT TIME ZONE ${timezone})::date AS date,
				competitor_name,
				count(*)::int AS mention_count
			FROM prompt_runs, unnest(competitors_mentioned) AS competitor_name
			WHERE brand_id = ${brandId}
				AND prompt_id IN (${uuidList(promptIds)})
				${dateFilter(fromDate, toDate, timezone)}
				${webSearchFilter(webSearchEnabled)}
				${modelFilter(model)}
				${marketScope(effectiveMarketKey)}
			GROUP BY prompt_id, date, competitor_name
			ORDER BY prompt_id, date, competitor_name
		`),
	]);

	const competitorMap = new Map<string, Map<string, Record<string, number>>>();
	for (const row of competitorData) {
		const dateKey = String(row.date);
		if (!competitorMap.has(row.prompt_id)) competitorMap.set(row.prompt_id, new Map());
		const promptData = competitorMap.get(row.prompt_id)!;
		if (!promptData.has(dateKey)) promptData.set(dateKey, {});
		promptData.get(dateKey)![row.competitor_name] = Number(row.mention_count);
	}

	return brandData.map((row) => ({
		prompt_id: row.prompt_id,
		date: row.date,
		total_runs: row.total_runs,
		brand_mentioned_count: row.brand_mentioned_count,
		competitor_counts: competitorMap.get(row.prompt_id)?.get(String(row.date)) || {},
	}));
}

/**
 * Predicate selecting genuine fan-out queries: non-empty, not the `unavailable`
 * sentinel (OpenRouter and DataForSEO always; BrightData/Olostep on extraction
 * failure), and not the prompt repeated verbatim. Shared by the breakdown, model
 * totals, and per-prompt totals so all three count the same set. Requires a
 * `wq` unnest alias plus the `pr` prompt_runs and `p` prompts rows in scope.
 *
 * The verbatim-repeat exclusion is a display rule, not data cleaning: engines
 * genuinely search the prompt verbatim sometimes, and those entries stay in
 * `web_queries` — but a repeat says nothing about how the prompt was rewritten,
 * so it isn't fan-out. The comparison uses the prompt's CURRENT text, so after
 * a prompt edit, searches of the old wording start surfacing as queries: for
 * honest providers those are real searches; only pre-2026-06 DataForSEO rows
 * (which fabricated `[prompt]` as their query field; the provider now writes
 * the sentinel) would surface something that never ran, and those age out of
 * the lookback windows.
 */
function genuineFanoutWq(): SQL {
	return sql`length(btrim(wq)) > 0 AND lower(btrim(wq)) <> ${UNAVAILABLE_SENTINEL} AND lower(btrim(wq)) <> lower(btrim(p.value))`;
}

/**
 * (prompt × model × query) fan-out counts with how often the brand was mentioned.
 * The LATERAL emits each run's DISTINCT normalized queries, so a run that lists
 * the same query twice contributes one instance (`count` = runs that searched it,
 * keeping `brand_mentions <= count` and the count >= 2 Invisible/Won gate
 * meaning "ran in 2+ runs"). Normalizing here (lowercase + trim) merges case
 * variants exactly like the aggregator's `norm`.
 */
export async function getFanoutBreakdown(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds: string[] | undefined,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<FanoutBreakdownRow[]> {
	if (!enabledPromptIds?.length) return [];
	return queryPg<FanoutBreakdownRow>(sql`
		SELECT
			pr.prompt_id,
			pr.model,
			fq.query,
			count(*)::int AS count,
			count(*) FILTER (WHERE pr.brand_mentioned)::int AS brand_mentions
		FROM prompt_runs pr
		JOIN prompts p ON p.id = pr.prompt_id
		CROSS JOIN LATERAL (
			SELECT DISTINCT lower(btrim(wq)) AS query FROM unnest(pr.web_queries) AS wq WHERE ${genuineFanoutWq()}
		) fq
		WHERE pr.brand_id = ${brandId}
			AND pr.created_at >= ${windowStart(fromDate, timezone)}
			AND pr.created_at < ${windowEnd(toDate, timezone)}
			AND pr.prompt_id IN (${uuidList(enabledPromptIds)})
			${modelFilter(model, { alias: "pr" })}
			${marketScope(effectiveMarketKey, "pr")}
		GROUP BY pr.prompt_id, pr.model, fq.query
	`);
}

/** Per-model run counts and fan-out totals (the denominators for fan-outs-per-execution). */
export async function getFanoutModelTotals(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds: string[] | undefined,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<FanoutModelTotalRow[]> {
	if (!enabledPromptIds?.length) return [];
	// `runs` counts every web-search-enabled run ("Search Prompt Runs"); `fanout_runs`
	// and `total_queries` count only genuine fan-out (via `genuineFanoutWq`), so they
	// stay consistent with `getFanoutBreakdown`. The per-run LATERAL yields one row per
	// run holding its DISTINCT genuine-query count (per-run duplicates count once, as
	// in the breakdown). Engines that don't expose their searches contribute runs
	// but no queries.
	return queryPg<FanoutModelTotalRow>(sql`
		SELECT
			pr.model,
			count(*) FILTER (WHERE pr.web_search_enabled)::int AS runs,
			count(*) FILTER (WHERE fq.cnt > 0)::int AS fanout_runs,
			COALESCE(sum(fq.cnt), 0)::int AS total_queries
		FROM prompt_runs pr
		JOIN prompts p ON p.id = pr.prompt_id
		CROSS JOIN LATERAL (
			SELECT count(DISTINCT lower(btrim(wq)))::int AS cnt FROM unnest(pr.web_queries) AS wq WHERE ${genuineFanoutWq()}
		) fq
		WHERE pr.brand_id = ${brandId}
			AND pr.created_at >= ${windowStart(fromDate, timezone)}
			AND pr.created_at < ${windowEnd(toDate, timezone)}
			AND pr.prompt_id IN (${uuidList(enabledPromptIds)})
			${modelFilter(model, { alias: "pr" })}
			${marketScope(effectiveMarketKey, "pr")}
		GROUP BY pr.model
		ORDER BY total_queries DESC
	`);
}

/**
 * Per-prompt count of runs that produced ≥1 genuine fan-out query — the
 * denominator for avg fan-out per run. Uses the same `genuineFanoutWq` filter as
 * the breakdown, so echoes/sentinels don't inflate it.
 */
export async function getFanoutPromptTotals(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds: string[] | undefined,
	model: string | undefined,
	effectiveMarketKey: string,
): Promise<FanoutPromptTotalRow[]> {
	if (!enabledPromptIds?.length) return [];
	return queryPg<FanoutPromptTotalRow>(sql`
		SELECT
			pr.prompt_id,
			count(*) FILTER (WHERE fq.cnt > 0)::int AS runs
		FROM prompt_runs pr
		JOIN prompts p ON p.id = pr.prompt_id
		CROSS JOIN LATERAL (
			SELECT count(DISTINCT lower(btrim(wq)))::int AS cnt FROM unnest(pr.web_queries) AS wq WHERE ${genuineFanoutWq()}
		) fq
		WHERE pr.brand_id = ${brandId}
			AND pr.created_at >= ${windowStart(fromDate, timezone)}
			AND pr.created_at < ${windowEnd(toDate, timezone)}
			AND pr.prompt_id IN (${uuidList(enabledPromptIds)})
			${modelFilter(model, { alias: "pr" })}
			${marketScope(effectiveMarketKey, "pr")}
		GROUP BY pr.prompt_id
	`);
}

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
		ORDER BY t.model, competitor_count DESC, competitor
	`);
}

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
