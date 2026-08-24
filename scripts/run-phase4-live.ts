import { mkdir, writeFile } from "node:fs/promises";
import { WEB_RESEARCH_LIMITS } from "../src/lib/web-research/contracts.ts";
import { readUrl } from "../src/lib/web-research/read-url.ts";
import { WEB_SEARCH_PROVIDER, webSearch } from "../src/lib/web-research/web-search.ts";

// Flip to true immediately after the single approved evidence run.
export const PHASE_4_LIVE_CALLS_DISABLED = true;

const FIXED_QUERY = "OpenRouter web search server tool documentation result limits";
const FIXED_FALLBACK_URL = "https://openrouter.ai/docs/guides/features/server-tools/web-search";

function publicFailure(value: unknown) {
  if (typeof value !== "object" || value === null || !("failure" in value)) return undefined;
  return (value as { failure?: { code: string; message: string } }).failure;
}

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
const authority = process.env.PHASE4_EXECUTE_LIVE === "approved";
const oneShotFlag = process.argv.includes("--execute-approved-once");

if (PHASE_4_LIVE_CALLS_DISABLED || !authority || !oneShotFlag || !apiKey) {
  console.error("Phase 4 live proof is locked or missing its explicit one-shot authority. No request was sent.");
  process.exitCode = 2;
} else {
  const startedAt = performance.now();
  let providerRequests = 0;
  let urlReads = 0;
  let search: Awaited<ReturnType<typeof webSearch>> | undefined;
  let page: Awaited<ReturnType<typeof readUrl>> | undefined;
  let runError: string | undefined;

  try {
    providerRequests += 1;
    search = await webSearch(
      { query: FIXED_QUERY, limit: 5, allowed_domains: ["openrouter.ai"] },
      { apiKey, liveAuthorized: true },
    );
    const reportedCost = search.receipt.cost_usd;
    if (reportedCost !== undefined && reportedCost > WEB_RESEARCH_LIMITS.phaseBudgetUsd) {
      throw new Error("The provider reported spend above the approved Phase 4 cap.");
    }

    const citedOfficial = search.sources.find((source) => {
      try {
        return new URL(source.url).hostname === "openrouter.ai";
      } catch {
        return false;
      }
    });
    urlReads += 1;
    page = await readUrl({ url: citedOfficial?.url ?? FIXED_FALLBACK_URL });
    if ((page.receipt.http_requests ?? 0) > 4) {
      throw new Error("The URL reader exceeded the approved four-request redirect boundary.");
    }
  } catch (error) {
    runError = error instanceof Error ? error.message.slice(0, 300) : "Unknown bounded live-proof failure.";
  }

  const reportedCostUsd = search?.receipt.cost_usd ?? null;
  const status =
    !runError && search?.sources.length && page?.evidence_usable ? "passed" : runError ? "failed" : "partial";
  const report = {
    phase: 4,
    status,
    created_at: new Date().toISOString(),
    query: FIXED_QUERY,
    limits: {
      approved_budget_usd: WEB_RESEARCH_LIMITS.phaseBudgetUsd,
      provider_requests: WEB_RESEARCH_LIMITS.providerRequests,
      searches: 1,
      search_results: WEB_RESEARCH_LIMITS.searchMaxResults,
      characters_per_result: WEB_RESEARCH_LIMITS.searchMaxCharactersPerResult,
      output_tokens: WEB_RESEARCH_LIMITS.searchMaxOutputTokens,
      top_level_url_reads: 1,
      http_requests_including_redirects: 4,
      retries: 0,
    },
    usage: {
      provider_requests: providerRequests,
      top_level_url_reads: urlReads,
      reported_cost_usd: reportedCostUsd,
      conservative_cost_upper_bound_usd: 0.02,
      elapsed_ms: Number((performance.now() - startedAt).toFixed(2)),
    },
    search: search
      ? {
          status: search.status,
          model: search.receipt.provider_model ?? WEB_SEARCH_PROVIDER.model,
          provider: search.receipt.provider_name ?? null,
          engine: WEB_SEARCH_PROVIDER.engine,
          result_count: search.sources.length,
          citations: search.sources.map((source) => ({
            source_id: source.source_id,
            url: source.url,
            title: source.title,
          })),
          receipt: search.receipt,
          failure: publicFailure(search),
        }
      : null,
    read: page
      ? {
          source_id: page.source_id,
          availability: page.availability,
          requested_url: page.requested_url,
          final_url: page.final_url,
          title: page.title,
          evidence_usable: page.evidence_usable,
          receipt: page.receipt,
          failure: publicFailure(page),
        }
      : null,
    error: runError,
  };

  await mkdir("reports", { recursive: true });
  await writeFile("reports/phase-4-live.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (status === "failed") process.exitCode = 1;
}
