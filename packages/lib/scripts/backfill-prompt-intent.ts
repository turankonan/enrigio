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
