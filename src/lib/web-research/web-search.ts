import { z } from "zod";
import {
  WEB_RESEARCH_LIMITS,
  normalizeWebUrl,
  sanitizedFailure,
  sourceId,
  truncate,
} from "./contracts.ts";
import type { WebSearchInput, WebSearchResult, WebSourceReceipt, WebSourceRecord } from "./types.ts";

export const WEB_SEARCH_PROVIDER = Object.freeze({
  endpoint: "https://api.exa.ai/search",
  model: "direct-exa-search",
  engine: "exa",
  transport: "direct_exa" as const,
  searchType: "auto" as const,
});

class SearchProviderHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("provider_http_error");
    this.status = status;
  }
}

const exaResultSchema = z.object({
  url: z.string().url().max(WEB_RESEARCH_LIMITS.urlCharacters),
  title: z.string().max(2_000).nullable().optional(),
  publishedDate: z.string().max(100).nullable().optional(),
  author: z.string().max(1_000).nullable().optional(),
  highlights: z.array(z.string().max(20_000)).max(20).optional(),
}).passthrough();

const exaResponseSchema = z.object({
  requestId: z.string().min(1).max(300),
  searchType: z.string().max(100).optional(),
  resolvedSearchType: z.string().max(100).optional(),
  results: z.array(z.unknown()).max(100),
  costDollars: z.object({ total: z.number().nonnegative().max(100) }).passthrough().optional(),
  searchTime: z.number().nonnegative().max(3_600_000).optional(),
}).passthrough();

function validateDomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const wildcard = trimmed.startsWith("*.");
  const hostAndPath = wildcard ? trimmed.slice(2) : trimmed;
  if (!hostAndPath || hostAndPath.length > 253 || hostAndPath.includes(":") || hostAndPath.includes("@")) {
    throw new Error("Invalid domain filter.");
  }
  const [host, ...path] = hostAndPath.split("/");
  if (!host) throw new Error("Invalid domain filter.");
  const normalized = new URL(`http://${host}`).hostname;
  if (normalized !== host || !normalized.includes(".") || normalized.startsWith(".") || normalized.endsWith(".")) {
    throw new Error("Invalid domain filter.");
  }
  const suffix = path.length ? `/${path.join("/")}` : "";
  return `${wildcard ? "*." : ""}${normalized}${suffix}`;
}

export function validateWebSearchInput(input: WebSearchInput) {
  const query = input.query.trim();
  if (query.length < 3 || query.length > 300) throw new Error("Query must contain 3 to 300 characters.");
  const limit = input.limit ?? WEB_RESEARCH_LIMITS.searchMaxResults;
  if (!Number.isInteger(limit) || limit < 1 || limit > WEB_RESEARCH_LIMITS.searchMaxResults) {
    throw new Error("Result limit must be an integer from 1 to 10.");
  }
  if (input.allowed_domains?.length && input.excluded_domains?.length) {
    throw new Error("Allowed and excluded domains cannot be combined.");
  }
  const normalizeDomains = (values?: string[]) => {
    if (!values) return undefined;
    if (values.length < 1 || values.length > 5) throw new Error("Domain filters must contain 1 to 5 entries.");
    const normalized = values.map(validateDomain);
    if (new Set(normalized).size !== normalized.length) throw new Error("Domain filters cannot contain duplicates.");
    return normalized;
  };
  return {
    query,
    limit,
    allowed_domains: normalizeDomains(input.allowed_domains),
    excluded_domains: normalizeDomains(input.excluded_domains),
    freshness: input.freshness ?? "default",
  } as const;
}

export function buildWebSearchRequest(input: ReturnType<typeof validateWebSearchInput>) {
  return {
    query: input.query,
    type: WEB_SEARCH_PROVIDER.searchType,
    numResults: input.limit,
    ...(input.allowed_domains ? { includeDomains: input.allowed_domains } : {}),
    ...(input.excluded_domains ? { excludeDomains: input.excluded_domains } : {}),
    contents: {
      highlights: { maxCharacters: WEB_RESEARCH_LIMITS.searchMaxCharactersPerResult },
      ...(input.freshness === "live" ? { maxAgeHours: 0 } : {}),
    },
  };
}

function failureCode(error: unknown, controller: AbortController, signal?: AbortSignal): string {
  if (signal?.aborted) return "stopped";
  if (controller.signal.aborted) return "timeout";
  if (error instanceof SearchProviderHttpError) {
    if (error.status === 401 || error.status === 403) return "unauthorized";
    if (error.status === 429) return "rate_limited";
    return "provider_http_error";
  }
  if (error instanceof z.ZodError || (error instanceof Error && error.message === "malformed_response")) {
    return "malformed_response";
  }
  return "provider_unavailable";
}

export async function parseWebSearchResponse(response: Response, retrievedAt = new Date().toISOString()): Promise<{
  records: WebSourceRecord[];
  rejected: number;
  receipt: WebSourceReceipt;
}> {
  if (!response.ok) throw new SearchProviderHttpError(response.status);
  const raw = await response.text();
  if (!raw || raw.length > 2 * 1024 * 1024) throw new Error("malformed_response");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("malformed_response");
  }
  const parsed = exaResponseSchema.parse(json);
  const receipt: WebSourceReceipt = {
    provider_name: "Exa",
    cost_usd: parsed.costDollars?.total,
    web_search_requests: 1,
    web_search_proof: "direct_exa_response",
    request_id: parsed.requestId,
    resolved_search_type: parsed.resolvedSearchType ?? parsed.searchType,
    search_time_ms: parsed.searchTime,
  };
  const records: WebSourceRecord[] = [];
  let rejected = 0;
  for (const rawResult of parsed.results) {
    const result = exaResultSchema.safeParse(rawResult);
    if (!result.success) {
      rejected += 1;
      continue;
    }
    try {
      const url = normalizeWebUrl(result.data.url);
      if (!["http:", "https:"].includes(new URL(url).protocol)) {
        rejected += 1;
        continue;
      }
      const highlights = result.data.highlights?.join("\n\n") ?? null;
      const record: WebSourceRecord = {
        source_id: sourceId(url),
        source_kind: "search_candidate",
        availability: "candidate",
        url,
        title: truncate(result.data.title, WEB_RESEARCH_LIMITS.titleCharacters),
        byline: truncate(result.data.author, WEB_RESEARCH_LIMITS.titleCharacters),
        published_at: truncate(result.data.publishedDate, 100),
        excerpt: truncate(highlights, WEB_RESEARCH_LIMITS.excerptCharacters),
        retrieved_at: retrievedAt,
        trust: "untrusted_external_content",
        evidence_usable: false,
        receipt,
      };
      if (!records.some((item) => item.url === record.url)) records.push(record);
    } catch {
      rejected += 1;
    }
  }
  return { records, rejected, receipt };
}

export async function webSearch(
  input: WebSearchInput,
  options: {
    apiKey?: string;
    liveAuthorized?: boolean;
    fetchImpl?: typeof fetch;
    now?: () => Date;
    signal?: AbortSignal;
  } = {},
): Promise<WebSearchResult> {
  const retrievedAt = (options.now?.() ?? new Date()).toISOString();
  let validated: ReturnType<typeof validateWebSearchInput>;
  try {
    validated = validateWebSearchInput(input);
  } catch {
    return {
      status: "unavailable",
      query: input.query.trim().slice(0, 300),
      sources: [],
      retrieved_at: retrievedAt,
      receipt: {},
      failure: sanitizedFailure("invalid_input", "The search input is invalid."),
    };
  }
  if (!options.apiKey?.trim()) {
    return {
      status: "unavailable",
      query: validated.query,
      sources: [],
      retrieved_at: retrievedAt,
      receipt: {},
      failure: sanitizedFailure("missing_key", "Direct Exa search is not configured."),
    };
  }
  if (!options.liveAuthorized) {
    return {
      status: "unavailable",
      query: validated.query,
      sources: [],
      retrieved_at: retrievedAt,
      receipt: {},
      failure: sanitizedFailure("live_not_authorized", "Direct Exa search is not authorized for this runtime."),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEB_RESEARCH_LIMITS.searchTimeoutMs);
  try {
    const response = await (options.fetchImpl ?? fetch)(WEB_SEARCH_PROVIDER.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": options.apiKey.trim(),
      },
      body: JSON.stringify(buildWebSearchRequest(validated)),
      signal: options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal,
    });
    const parsed = await parseWebSearchResponse(response, retrievedAt);
    const sources = parsed.records.slice(0, validated.limit);
    if (!sources.length) {
      return { status: "no_match", query: validated.query, sources, retrieved_at: retrievedAt, receipt: parsed.receipt };
    }
    return {
      status: parsed.rejected > 0 ? "partial" : "complete",
      query: validated.query,
      sources,
      retrieved_at: retrievedAt,
      receipt: parsed.receipt,
    };
  } catch (error) {
    const code = failureCode(error, controller, options.signal);
    return {
      status: "unavailable",
      query: validated.query,
      sources: [],
      retrieved_at: retrievedAt,
      receipt: error instanceof SearchProviderHttpError ? { http_status: error.status } : {},
      failure: sanitizedFailure(code, "The bounded direct Exa search did not complete."),
    };
  } finally {
    clearTimeout(timeout);
  }
}
