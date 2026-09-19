/**
 * Pure, per-URL robots.txt evaluator (RFC 9309 subset). No network, no I/O —
 * callers fetch robots.txt themselves (via net/safe-fetch) and pass the body
 * in here.
 *
 * Grouping: consecutive `User-agent` lines belong to one group; once a rule
 * (`Allow`/`Disallow`) has been seen, the next `User-agent` line starts a new
 * group. A bot's applicable rules are the union of every group whose
 * user-agent list contains that bot (case-insensitive); if none do, the
 * union of every `*` group is used instead. No matching group at all (and no
 * `*` group) is `unspecified`, distinct from a matching group with no
 * matching rule (`allowed`).
 */

import type { AiBot, BotPosture } from "./types";

interface Rule {
	allow: boolean;
	path: string;
}

interface Group {
	agents: string[];
	rules: Rule[];
}

function safeDecode(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

interface ParsedLine {
	field: string;
	value: string;
}

function parseLine(rawLine: string): ParsedLine | null {
	const line = rawLine.split("#")[0]?.trim() ?? "";
	if (!line) return null;
	const colonIdx = line.indexOf(":");
	if (colonIdx === -1) return null;
	return { field: line.slice(0, colonIdx).trim().toLowerCase(), value: line.slice(colonIdx + 1).trim() };
}

/** Accumulates lines into groups; isolated from `parseGroups`'s loop to keep both simple. */
class GroupBuilder {
	private readonly groups: Group[] = [];
	private agents: string[] = [];
	private rules: Rule[] = [];
	private sawRule = false;

	addUserAgent(value: string): void {
		if (this.sawRule) this.flush();
		this.agents.push(value.toLowerCase());
	}

	addRule(allow: boolean, value: string): void {
		if (this.agents.length === 0) return; // rule with no preceding user-agent — ignore
		this.sawRule = true;
		if (!allow && value === "") return; // empty Disallow means no restriction
		this.rules.push({ allow, path: value });
	}

	private flush(): void {
		if (this.agents.length > 0) {
			this.groups.push({ agents: this.agents, rules: this.rules });
		}
		this.agents = [];
		this.rules = [];
		this.sawRule = false;
	}

	build(): Group[] {
		this.flush();
		return this.groups;
	}
}

function parseGroups(robotsTxt: string): Group[] {
	const builder = new GroupBuilder();
	for (const rawLine of robotsTxt.split(/\r\n|\r|\n/)) {
		const parsed = parseLine(rawLine);
		if (!parsed) continue;
		if (parsed.field === "user-agent") {
			builder.addUserAgent(parsed.value);
		} else if (parsed.field === "allow" || parsed.field === "disallow") {
			builder.addRule(parsed.field === "allow", parsed.value);
		}
		// Other fields (Sitemap, Crawl-delay, ...) are out of scope and ignored.
	}
	return builder.build();
}

/**
 * The length of the literal (non-wildcard) prefix of a decoded rule path —
 * `*` is always a wildcard boundary, `$` only when it's the final character
 * (end-of-string anchor). This stands in for RFC 9309's "longest match" —
 * simpler than measuring full regex-match length, and sufficient for the
 * `Allow`/`Disallow` precedence this evaluator needs.
 */
function literalPrefixLength(pattern: string): number {
	for (let i = 0; i < pattern.length; i++) {
		if (pattern[i] === "*") return i;
		if (pattern[i] === "$" && i === pattern.length - 1) return i;
	}
	return pattern.length;
}

const REGEX_METACHARS = /[.*+?^${}()|[\]\\]/;

function patternToRegex(pattern: string): RegExp {
	let source = "^";
	for (let i = 0; i < pattern.length; i++) {
		const ch = pattern[i] as string;
		if (ch === "*") {
			source += ".*";
		} else if (ch === "$" && i === pattern.length - 1) {
			source += "$";
		} else if (REGEX_METACHARS.test(ch)) {
			source += `\\${ch}`;
		} else {
			source += ch;
		}
	}
	return new RegExp(source);
}

function pathFromUrl(url: string): string {
	try {
		return new URL(url).pathname;
	} catch {
		return url;
	}
}

function matchingRules(groups: Group[], bot: AiBot): Rule[] | null {
	const botLower = bot.toLowerCase();
	const specific = groups.filter((g) => g.agents.includes(botLower));
	const matched = specific.length > 0 ? specific : groups.filter((g) => g.agents.includes("*"));
	if (matched.length === 0) return null;
	return matched.flatMap((g) => g.rules);
}

export function evaluateRobots(robotsTxt: string, url: string, bot: AiBot): BotPosture {
	const groups = parseGroups(robotsTxt);
	const rules = matchingRules(groups, bot);
	if (rules === null) return "unspecified";

	const decodedPath = safeDecode(pathFromUrl(url));

	let winner: Rule | null = null;
	let winnerLength = -1;
	for (const rule of rules) {
		const decodedPattern = safeDecode(rule.path);
		if (!patternToRegex(decodedPattern).test(decodedPath)) continue;
		const length = literalPrefixLength(decodedPattern);
		if (winner === null || length > winnerLength || (length === winnerLength && rule.allow && !winner.allow)) {
			winner = rule;
			winnerLength = length;
		}
	}

	if (winner === null) return "allowed";
	return winner.allow ? "allowed" : "blocked";
}
