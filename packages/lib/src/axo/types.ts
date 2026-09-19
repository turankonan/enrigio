export const SITE_AUDIT_SCHEMA_VERSION = 1;

export type ResourceStatus = "present" | "absent" | "unavailable";
export type BotPosture = "allowed" | "blocked" | "unspecified";
// FetchStatus is unified with net/safe-fetch's SafeFetchStatus (Task 4) — keep these seven values identical.
export type FetchStatus = "ok" | "not-found" | "blocked" | "timeout" | "too-large" | "unsupported-content-type" | "failed";
export type AiBot = "GPTBot" | "ClaudeBot" | "PerplexityBot" | "Google-Extended";

export interface AuditTarget { url: string; relatedPrompts: string[]; }
export interface AuditWindow { fromIso: string; toIso: string; }

export interface SiteAuditReport {
  window: { fromIso: string; toIso: string; citationCount: number };
  failureSummary?: string;
  usedFallback?: boolean;
  origins: { origin: string; llmsTxt: ResourceStatus; sitemap: ResourceStatus }[];
  pages: {
    requestedUrl: string;
    finalUrl: string | null;
    fetchStatus: FetchStatus;
    relatedPrompts: string[];
    title: string | null;
    hasSchema: boolean | null;
    hasMetaDescription: boolean | null;
    headingStructure: "ok" | "no-h1" | "weak" | null;
    robotsPosture: Record<AiBot, BotPosture>;
    relevanceScore: number | null;
    relevanceNote: string | null;
    scoreModel: string | null;
  }[];
}
