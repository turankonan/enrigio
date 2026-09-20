/**
 * Idempotent backfill for phase 2a's per-brand evaluation market.
 *
 * Two independent, non-destructive steps:
 *  1. Brand defaults: give every brand without one the deployment's current
 *     env market, so the market picker has a sane starting point.
 *  2. Cutover rows: `prompt_runs.market_key` defaults to 'legacy' for every
 *     pre-2a row. This attributes what the stored columns can PROVE — see
 *     `historicalMarketKeyFor` — and nothing more. A row this can't prove
 *     stays 'legacy' unless the operator passes `--historical-market` to
 *     assert a real market for provably-localizable history.
 *
 * Only rows with `market_key = 'legacy'` are ever touched; genuine 'global'
 * and real-market rows (written by the phase-2a worker) are left alone. A
 * second run finds nothing new to do and writes 0 rows.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm -C packages/lib exec tsx scripts/backfill-brand-markets.ts [--historical-market <key>]
 */

import { parseArgs } from "node:util";
import { getMarket, getMarketForCodes } from "@workspace/config/markets";
import { Client } from "pg";
import { historicalMarketKeyFor, isConfirmedLocalizableLegacyRow } from "../src/markets/backfill-classify";
import { dfsLanguageCode, dfsLocationCode } from "../src/providers/registry/dataforseo-shared";

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
	options: { "historical-market": { type: "string" } },
});

const historicalMarketKey = values["historical-market"];
if (historicalMarketKey !== undefined && !getMarket(historicalMarketKey)) {
	console.error(`Unknown --historical-market "${historicalMarketKey}" — not in the market catalog`);
	process.exit(2);
}

interface LegacyRow {
	id: string;
	model: string;
	provider: string | null;
	version: string | null;
	web_search_enabled: boolean;
}

const BATCH_SIZE = 500;

type RowOutcome = { key: "global" } | { key: "historical" } | { key: "left-legacy" };

/**
 * What to do with one legacy row, given the operator's `--historical-market`
 * choice (or lack of one). Kept separate from the DB loop so the branching
 * stays simple enough for the linter's complexity budget and is unit-testable
 * on its own.
 */
function classifyRow(row: LegacyRow, historicalMarketKey: string | undefined): RowOutcome {
	const asClassifierRow = {
		model: row.model,
		provider: row.provider,
		version: row.version,
		webSearchEnabled: row.web_search_enabled,
	};
	if (historicalMarketKeyFor(asClassifierRow) === "global") return { key: "global" };
	if (historicalMarketKey && isConfirmedLocalizableLegacyRow(asClassifierRow)) return { key: "historical" };
	// Never write legacy → legacy: skipping the no-op keeps the affected-row
	// count honest and makes a second run a true no-op.
	return { key: "left-legacy" };
}

async function backfillBrandDefaults(client: Client): Promise<void> {
	const envMarket = getMarketForCodes(dfsLocationCode(), dfsLanguageCode());
	if (!envMarket) {
		console.warn(
			`⚠ deployment env (location ${dfsLocationCode()}, language ${dfsLanguageCode()}) maps to no catalog market — skipping brand-default backfill`,
		);
		return;
	}
	const { rowCount } = await client.query(
		"UPDATE brands SET default_market_key = $1 WHERE default_market_key IS NULL",
		[envMarket.key],
	);
	console.log(`✓ set default_market_key = '${envMarket.key}' on ${rowCount ?? 0} brand(s)`);
}

async function backfillPromptRuns(client: Client): Promise<void> {
	let toGlobal = 0;
	let toHistorical = 0;
	let leftLegacy = 0;
	let lastId: string | null = null;

	for (;;) {
		const { rows } = await client.query<LegacyRow>(
			`SELECT id, model, provider, version, web_search_enabled
			 FROM prompt_runs
			 WHERE market_key = 'legacy' ${lastId ? "AND id > $2" : ""}
			 ORDER BY id
			 LIMIT $1`,
			lastId ? [BATCH_SIZE, lastId] : [BATCH_SIZE],
		);
		if (rows.length === 0) break;
		lastId = rows[rows.length - 1].id;

		for (const row of rows) {
			const outcome = classifyRow(row, historicalMarketKey);
			switch (outcome.key) {
				case "global":
					await client.query("UPDATE prompt_runs SET market_key = 'global' WHERE id = $1 AND market_key = 'legacy'", [
						row.id,
					]);
					toGlobal++;
					break;
				case "historical":
					await client.query("UPDATE prompt_runs SET market_key = $1 WHERE id = $2 AND market_key = 'legacy'", [
						historicalMarketKey,
						row.id,
					]);
					toHistorical++;
					break;
				case "left-legacy":
					leftLegacy++;
					break;
			}
		}

		if (rows.length < BATCH_SIZE) break;
	}

	console.log(
		`✓ prompt_runs: ${toGlobal} → global, ${toHistorical} → ${historicalMarketKey ?? "(n/a)"}, ${leftLegacy} left legacy`,
	);
}

async function main(): Promise<void> {
	const client = new Client({ connectionString: DATABASE_URL });
	await client.connect();
	try {
		await backfillBrandDefaults(client);
		await backfillPromptRuns(client);
	} finally {
		await client.end();
	}
	console.log("\nBrand-market backfill complete");
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
