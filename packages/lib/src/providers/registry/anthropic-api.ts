import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import Anthropic from "@anthropic-ai/sdk";
import { getCredential } from "../../secrets";
import { extractCitationsFromAnthropic, extractTextFromAnthropic } from "../../text-extraction";
import {
	ANTHROPIC_WEB_SEARCH_MAX_USES,
	API_PROVIDER_MAX_OUTPUT_TOKENS,
	configuredWhen,
	RESEARCH_WEB_SEARCH_MAX_USES,
	warnIfOutputCapped,
} from "../config";
import type {
	Provider,
	ProviderOptions,
	ScrapeResult,
	StructuredResearchOptions,
	StructuredResearchResult,
} from "../types";
import { structuredResearch } from "./ai-sdk";
import { nonEmptyStrings, sanitizeForJson, sleep } from "./scrape-shared";

const DEFAULT_RESEARCH_MODEL = "claude-sonnet-5";
// Completion-only structured calls (mention classifier, intent backfill) are
// short classification jobs: Haiku answers them at a twentieth of Sonnet's
// token price, while web-grounded research keeps Sonnet.
const COMPLETION_MODEL = "claude-haiku-5-5";

function getAnthropicLanguageModel(model: string) {
	const apiKey = getCredential("ANTHROPIC_API_KEY");
	return apiKey ? createAnthropic({ apiKey })(model) : anthropic(model);
}

function getClient(): Anthropic {
	return new Anthropic({ apiKey: getCredential("ANTHROPIC_API_KEY")! });
}

async function runAnthropic(prompt: string, model: string, options?: ProviderOptions): Promise<ScrapeResult> {
	const client = getClient();
	const tools: Anthropic.Messages.ToolUnion[] = [];
	if (options?.webSearch) {
		tools.push({
			type: "web_search_20250305",
			name: "web_search",
			max_uses: ANTHROPIC_WEB_SEARCH_MAX_USES,
		});
	}

	const makeRequest = () =>
		client.messages.create({
			model,
			max_tokens: API_PROVIDER_MAX_OUTPUT_TOKENS["anthropic-api"],
			messages: [{ role: "user", content: prompt }],
			...(tools.length > 0 ? { tools } : {}),
		});

	let response = await makeRequest();

	// Retry once on a transient web search error. `max_uses_exceeded` is not one:
	// the model already got its allowed search and finished the answer, so a
	// retry would only pay the search fee and the tokens a second time.
	for (const block of response.content) {
		if (block.type !== "web_search_tool_result") continue;
		const error = Array.isArray(block.content) ? undefined : block.content;
		if (error?.type !== "web_search_tool_result_error") continue;
		if (error.error_code === "max_uses_exceeded") continue;
		console.warn(`[anthropic-api] web search error: ${error.error_code}, retrying in 10s...`);
		await sleep(10_000);
		response = await makeRequest();
		break;
	}

	warnIfOutputCapped("anthropic-api", model, response.stop_reason);

	const textContent = extractTextFromAnthropic(response);

	const webQueries = nonEmptyStrings(
		response.content.flatMap((block) =>
			// A tool's input is typed `unknown` because its shape is tool-specific.
			block.type === "server_tool_use" && block.name === "web_search"
				? [(block.input as { query?: unknown } | null)?.query]
				: [],
		),
	);

	const citations = extractCitationsFromAnthropic(response);

	// Strip full page text from web search results to reduce storage.
	// Only url/title are used for citation extraction.
	const trimmedContent = response.content.map((block) => {
		if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) return block;
		return {
			...block,
			content: block.content.map((result) => ({
				type: result.type,
				url: result.url,
				title: result.title,
			})),
		};
	});

	return {
		rawOutput: sanitizeForJson({ ...response, content: trimmedContent }),
		webQueries,
		textContent,
		citations,
		modelVersion: model,
	};
}

export const anthropicApi: Provider = {
	id: "anthropic-api",
	name: "Anthropic API",
	access: "api",
	docsAnchor: "direct-model-apis",

	isConfigured: configuredWhen("ANTHROPIC_API_KEY"),

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const version = options?.version ?? DEFAULT_RESEARCH_MODEL;
		return runAnthropic(prompt, version, options);
	},

	async runStructuredResearch<T>({
		prompt,
		schema,
		webSearch = true,
	}: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
		const model = webSearch ? DEFAULT_RESEARCH_MODEL : COMPLETION_MODEL;
		const object = await structuredResearch(getAnthropicLanguageModel(model), {
			prompt,
			schema,
			...(webSearch
				? { tools: { web_search: anthropic.tools.webSearch_20250305({ maxUses: RESEARCH_WEB_SEARCH_MAX_USES }) } }
				: {}),
		});
		return { object, modelVersion: model };
	},
};
