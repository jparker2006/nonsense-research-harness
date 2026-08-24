import { readFile, writeFile } from "node:fs/promises";
import { readUrl } from "../src/lib/web-research/read-url.ts";
import { WEB_SEARCH_PROVIDER, webSearch } from "../src/lib/web-research/web-search.ts";
import type { WebSearchInput, WebSearchResult } from "../src/lib/web-research/types.ts";

export const PHASE_4_1_LIVE_CALLS_DISABLED = true;

const REPORT_PATH = "reports/phase-4-1-web-search.json";
const LIMITS = Object.freeze({
  provider_requests: 5,
  budget_usd: 0.2,
  retries_per_request: 0,
});
const UNRECEIPTED_COST_UPPER_BOUND = Object.freeze({
  perplexity: 0.005,
  exa: 0.007,
  native: 0.08,
});
const CANARY = Object.freeze({
  observed_via: "https://www.nasa.gov/news-release/feed/",
  feed_last_build_at: "Mon, 24 Aug 2026 04:01:00 +0000",
  title: "What Lake Bonneville Left Behind",
  url: "https://science.nasa.gov/earth/earth-observatory/what-lake-bonneville-left-behind/",
  published_at: "Mon, 24 Aug 2026 04:01:00 +0000",
});

type Diagnostic = {
  http_status: number;
  provider_error_code?: string | number;
  provider_error_message?: string;
};

type Attempt = {
  name: "compatibility" | "freshness";
  engine: "perplexity" | "exa" | "native";
  created_at: string;
  query: string;
  search_status: WebSearchResult["status"];
  latency_ms: number;
  result_count: number;
  sources: Array<{ source_id: string; url: string; title: string | null }>;
  receipt: WebSearchResult["receipt"];
  failure?: WebSearchResult["failure"];
  diagnostic?: Diagnostic;
  opened_source?: {
    source_id: string;
    availability: string;
    final_url?: string;
    title: string | null;
    published_at?: string | null;
    receipt: Record<string, unknown>;
    failure?: { code: string; message: string };
  };
  freshness_canary_matched?: boolean;
};

type Report = {
  phase: "4.1";
  status: "in_progress" | "passed" | "failed";
  updated_at: string;
  limits: typeof LIMITS;
  official_contract_checked_at: string;
  repair: {
    removed_unsupported_tool_choice: true;
    current_contract_url: "https://openrouter.ai/docs/guides/features/server-tools/web-search";
    search_requires_usage_or_native_citation_bound_proof: true;
    perplexity_live_failure: "HTTP 500 Internal Server Error";
    exa_live_failure: "HTTP 500 Internal Server Error";
    replacement_engine: "native";
    native_tradeoff: "Provider-side result-count and context-size controls are unavailable; returned candidates are still code-capped.";
  };
  canary: typeof CANARY;
  usage: {
    provider_requests: number;
    reported_cost_usd: number;
    receipts_missing_cost: number;
    unreceipted_cost_upper_bound_usd: number;
    total_cost_upper_bound_usd: number;
  };
  attempts: Attempt[];
};

function sanitizeProviderDiagnostic(response: Response, body: string): Diagnostic {
  const diagnostic: Diagnostic = { http_status: response.status };
  try {
    const parsed = JSON.parse(body) as { error?: { code?: unknown; message?: unknown } };
    if (typeof parsed.error?.code === "string" || typeof parsed.error?.code === "number") {
      diagnostic.provider_error_code = parsed.error.code;
    }
    if (typeof parsed.error?.message === "string") {
      diagnostic.provider_error_message = parsed.error.message
        .replace(/sk-or-[A-Za-z0-9_-]+/g, "[redacted]")
        .slice(0, 300);
    }
  } catch {
    // HTTP status remains sufficient when the provider body is not structured JSON.
  }
  return diagnostic;
}

async function loadReport(): Promise<Report> {
  try {
    const parsed = JSON.parse(await readFile(REPORT_PATH, "utf8")) as Report;
    if (parsed.phase !== "4.1" || !Array.isArray(parsed.attempts)) throw new Error("bad report");
    parsed.limits = LIMITS;
    delete (parsed.repair as Record<string, unknown>).search_still_requires_exact_usage_proof;
    parsed.repair = {
      ...parsed.repair,
      current_contract_url: "https://openrouter.ai/docs/guides/features/server-tools/web-search",
      search_requires_usage_or_native_citation_bound_proof: true,
      perplexity_live_failure: "HTTP 500 Internal Server Error",
      exa_live_failure: "HTTP 500 Internal Server Error",
      replacement_engine: "native",
      native_tradeoff:
        "Provider-side result-count and context-size controls are unavailable; returned candidates are still code-capped.",
    };
    parsed.attempts = parsed.attempts.map((attempt) => ({
      ...attempt,
      engine: attempt.engine ?? "perplexity",
    }));
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return {
      phase: "4.1",
      status: "in_progress",
      updated_at: new Date().toISOString(),
      limits: LIMITS,
      official_contract_checked_at: "2026-08-23T00:00:00-10:00",
      repair: {
        removed_unsupported_tool_choice: true,
        current_contract_url: "https://openrouter.ai/docs/guides/features/server-tools/web-search",
        search_requires_usage_or_native_citation_bound_proof: true,
        perplexity_live_failure: "HTTP 500 Internal Server Error",
        exa_live_failure: "HTTP 500 Internal Server Error",
        replacement_engine: "native",
        native_tradeoff:
          "Provider-side result-count and context-size controls are unavailable; returned candidates are still code-capped.",
      },
      canary: CANARY,
      usage: {
        provider_requests: 0,
        reported_cost_usd: 0,
        receipts_missing_cost: 0,
        unreceipted_cost_upper_bound_usd: 0,
        total_cost_upper_bound_usd: 0,
      },
      attempts: [],
    };
  }
}

function recomputeUsage(report: Report): void {
  const costs = report.attempts.map((attempt) => attempt.receipt.cost_usd);
  const unreceiptedUpperBound = report.attempts.reduce(
    (sum, attempt) =>
      sum +
      (typeof attempt.receipt.cost_usd === "number"
        ? 0
        : UNRECEIPTED_COST_UPPER_BOUND[attempt.engine]),
    0,
  );
  const reportedCost = costs.reduce<number>(
    (sum, cost) => sum + (typeof cost === "number" ? cost : 0),
    0,
  );
  report.usage = {
    provider_requests: report.attempts.length,
    reported_cost_usd: Number(reportedCost.toFixed(8)),
    receipts_missing_cost: costs.filter((cost) => typeof cost !== "number").length,
    unreceipted_cost_upper_bound_usd: Number(unreceiptedUpperBound.toFixed(8)),
    total_cost_upper_bound_usd: Number((reportedCost + unreceiptedUpperBound).toFixed(8)),
  };
}

async function persist(report: Report): Promise<void> {
  recomputeUsage(report);
  report.updated_at = new Date().toISOString();
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function executeProbe(
  report: Report,
  name: Attempt["name"],
  input: WebSearchInput,
  expectedUrl?: string,
): Promise<Attempt> {
  if (report.attempts.length >= LIMITS.provider_requests) {
    throw new Error("Phase 4.1 provider-request cap reached.");
  }
  recomputeUsage(report);
  const nextExposure =
    report.usage.total_cost_upper_bound_usd + UNRECEIPTED_COST_UPPER_BOUND[WEB_SEARCH_PROVIDER.engine];
  if (nextExposure > LIMITS.budget_usd) throw new Error("Phase 4.1 conservative budget cap reached.");

  let diagnostic: Diagnostic | undefined;
  const diagnosticFetch: typeof fetch = async (url, init) => {
    const response = await fetch(url, init);
    if (!response.ok) {
      const body = (await response.clone().text()).slice(0, 4_096);
      diagnostic = sanitizeProviderDiagnostic(response, body);
    }
    return response;
  };

  const startedAt = performance.now();
  const search = await webSearch(input, {
    apiKey: process.env.OPENROUTER_API_KEY,
    liveAuthorized: true,
    fetchImpl: diagnosticFetch,
  });
  const attempt: Attempt = {
    name,
    engine: WEB_SEARCH_PROVIDER.engine,
    created_at: new Date().toISOString(),
    query: input.query,
    search_status: search.status,
    latency_ms: Number((performance.now() - startedAt).toFixed(2)),
    result_count: search.sources.length,
    sources: search.sources.map((source) => ({
      source_id: source.source_id,
      url: source.url,
      title: source.title,
    })),
    receipt: search.receipt,
    failure: search.failure,
    diagnostic,
  };

  const source = expectedUrl
    ? search.sources.find((candidate) => candidate.url === expectedUrl)
    : search.sources[0];
  if (source) {
    const opened = await readUrl({ url: source.url });
    attempt.opened_source = {
      source_id: opened.source_id,
      availability: opened.availability,
      final_url: opened.final_url,
      title: opened.title,
      published_at: opened.published_at,
      receipt: opened.receipt,
      failure: opened.failure,
    };
  }
  if (name === "freshness") {
    attempt.freshness_canary_matched = Boolean(
      search.sources.some((source) => source.url === CANARY.url) &&
        attempt.opened_source?.availability === "complete",
    );
  }
  report.attempts.push(attempt);
  await persist(report);
  return attempt;
}

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
const authority = process.env.PHASE4_1_EXECUTE_LIVE === "approved";
const oneShot = process.argv.includes("--execute-approved-probes");

if (PHASE_4_1_LIVE_CALLS_DISABLED || !apiKey || !authority || !oneShot) {
  console.error("Phase 4.1 live search is locked or missing explicit authority. No request was sent.");
  process.exitCode = 2;
} else {
  const report = await loadReport();
  try {
    const freshnessPassed = report.attempts.some(
      (attempt) =>
        attempt.name === "freshness" &&
        ["complete", "partial"].includes(attempt.search_status) &&
        attempt.receipt.web_search_proof !== undefined &&
        attempt.freshness_canary_matched === true,
    );
    if (!freshnessPassed) {
      const result = await executeProbe(
        report,
        "freshness",
        {
          query:
            'Use live web search now to find the exact official NASA Science page titled "What Lake Bonneville Left Behind", published August 24, 2026. Cite the article page itself, not a section landing page.',
          limit: 5,
          allowed_domains: ["science.nasa.gov"],
        },
        CANARY.url,
      );
      if (!result.freshness_canary_matched) {
        throw new Error("Freshness canary was not found and retrieved.");
      }
    }

    report.status = "passed";
    await persist(report);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.status = "failed";
    await persist(report);
    console.error(
      JSON.stringify(
        {
          ...report,
          error: error instanceof Error ? error.message.slice(0, 300) : "Unknown Phase 4.1 failure.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}
