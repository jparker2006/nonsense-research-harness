import {
  WEB_RESEARCH_LIMITS,
  normalizeWebUrl,
  sanitizedFailure,
  sourceId,
  truncate,
} from "./contracts.ts";
import type { WebSearchInput, WebSearchResult, WebSourceReceipt, WebSourceRecord } from "./types.ts";

export const WEB_SEARCH_PROVIDER = Object.freeze({
  endpoint: "https://openrouter.ai/api/v1/chat/completions",
  model: "x-ai/grok-4.6",
  engine: "native",
  reasoningEffort: "medium" as const,
  maxPricePerMillion: Object.freeze({ prompt: 2, completion: 6 }),
});

type SearchAnnotation = { url: string; title?: string; content?: string };

type SearchStream = {
  annotations: SearchAnnotation[];
  invalidAnnotations: number;
  receipt: WebSourceReceipt;
  done: boolean;
};

class SearchProviderHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("provider_http_error");
    this.status = status;
  }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function validateDomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const wildcard = trimmed.startsWith("*.");
  const host = wildcard ? trimmed.slice(2) : trimmed;
  if (!host || host.length > 253 || host.includes(":") || host.includes("/") || host.includes("@")) {
    throw new Error("Invalid domain filter.");
  }
  const normalized = new URL(`http://${host}`).hostname;
  if (normalized !== host || !normalized.includes(".") || normalized.startsWith(".") || normalized.endsWith(".")) {
    throw new Error("Invalid domain filter.");
  }
  return wildcard ? `*.${normalized}` : normalized;
}

export function validateWebSearchInput(input: WebSearchInput) {
  const query = input.query.trim();
  if (query.length < 3 || query.length > 300) throw new Error("Query must contain 3 to 300 characters.");
  const limit = input.limit ?? WEB_RESEARCH_LIMITS.searchMaxResults;
  if (!Number.isInteger(limit) || limit < 1 || limit > WEB_RESEARCH_LIMITS.searchMaxResults) {
    throw new Error("Result limit must be an integer from 1 to 5.");
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
  };
}

export function buildWebSearchRequest(input: ReturnType<typeof validateWebSearchInput>) {
  const parameters: Record<string, unknown> = {
    engine: WEB_SEARCH_PROVIDER.engine,
    max_uses: 1,
  };
  if (input.allowed_domains) parameters.allowed_domains = input.allowed_domains;
  if (input.excluded_domains) parameters.excluded_domains = input.excluded_domains;
  return {
    model: WEB_SEARCH_PROVIDER.model,
    messages: [
      {
        role: "user",
        content: `Use the web-search server tool exactly once for this query. Return no uncited claims.\n\n${input.query}`,
      },
    ],
    stream: true,
    max_tokens: WEB_RESEARCH_LIMITS.searchMaxOutputTokens,
    max_tool_calls: WEB_RESEARCH_LIMITS.searchMaxToolCalls,
    tools: [{ type: "openrouter:web_search", parameters }],
    provider: {
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: "deny",
      zdr: true,
      max_price: WEB_SEARCH_PROVIDER.maxPricePerMillion,
    },
    reasoning: { effort: WEB_SEARCH_PROVIDER.reasoningEffort, exclude: true },
  };
}

function parseUsage(value: unknown): WebSourceReceipt | undefined {
  const usage = objectValue(value);
  if (!usage) return undefined;
  const toolUse = objectValue(usage.server_tool_use);
  return {
    prompt_tokens: numberValue(usage.prompt_tokens) ?? numberValue(usage.input_tokens),
    completion_tokens: numberValue(usage.completion_tokens) ?? numberValue(usage.output_tokens),
    total_tokens: numberValue(usage.total_tokens),
    cost_usd: numberValue(usage.cost),
    web_search_requests: numberValue(toolUse?.web_search_requests),
  };
}

export async function parseWebSearchStream(response: Response): Promise<SearchStream> {
  if (!response.ok) throw new SearchProviderHttpError(response.status);
  if (!response.body) throw new Error("provider_unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventData: string[] = [];
  let done = false;
  let invalidAnnotations = 0;
  let receipt: WebSourceReceipt = {};
  const annotations: SearchAnnotation[] = [];

  const consume = () => {
    if (!eventData.length) return;
    const payload = eventData.join("\n");
    eventData = [];
    if (payload === "[DONE]") {
      done = true;
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new Error("malformed_stream");
    }
    const chunk = objectValue(parsed);
    if (!chunk) throw new Error("malformed_stream");
    receipt = { ...receipt, ...(parseUsage(chunk.usage) ?? {}) };
    receipt.provider_model = stringValue(chunk.model) ?? receipt.provider_model;
    receipt.provider_name = stringValue(chunk.provider) ?? receipt.provider_name;
    const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
    for (const rawChoice of choices) {
      const choice = objectValue(rawChoice);
      const delta = objectValue(choice?.delta);
      const rawAnnotations = Array.isArray(delta?.annotations) ? delta.annotations : [];
      for (const rawAnnotation of rawAnnotations) {
        const annotation = objectValue(rawAnnotation);
        const citation = objectValue(annotation?.url_citation);
        const url = stringValue(citation?.url);
        if (annotation?.type !== "url_citation" || !url) {
          invalidAnnotations += 1;
          continue;
        }
        if (!citation) continue;
        annotations.push({
          url,
          title: stringValue(citation.title),
          content: stringValue(citation.content),
        });
      }
    }
  };

  const line = (raw: string) => {
    const value = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (!value) consume();
    else if (value.startsWith("data:")) eventData.push(value.slice(5).trimStart());
  };

  while (true) {
    const part = await reader.read();
    if (part.done) break;
    buffer += decoder.decode(part.value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      line(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  if (buffer) line(buffer);
  consume();
  return { annotations, invalidAnnotations, receipt, done };
}

function candidateFromAnnotation(
  citation: SearchAnnotation,
  retrievedAt: string,
  receipt: WebSourceReceipt,
): WebSourceRecord | null {
  try {
    const url = normalizeWebUrl(citation.url);
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return {
      source_id: sourceId(url),
      source_kind: "search_candidate",
      availability: "candidate",
      url,
      title: truncate(citation.title, WEB_RESEARCH_LIMITS.titleCharacters),
      excerpt: truncate(citation.content, WEB_RESEARCH_LIMITS.excerptCharacters),
      retrieved_at: retrievedAt,
      trust: "untrusted_external_content",
      evidence_usable: false,
      receipt,
    };
  } catch {
    return null;
  }
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
      failure: sanitizedFailure("missing_key", "Web search is unavailable because provider access is not configured."),
    };
  }
  if (!options.liveAuthorized) {
    return {
      status: "unavailable",
      query: validated.query,
      sources: [],
      retrieved_at: retrievedAt,
      receipt: {},
      failure: sanitizedFailure("live_not_authorized", "Web search provider access is not authorized for this runtime."),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEB_RESEARCH_LIMITS.searchTimeoutMs);
  let observedReceipt: WebSourceReceipt = {};
  try {
    const response = await (options.fetchImpl ?? fetch)(WEB_SEARCH_PROVIDER.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.apiKey.trim()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(buildWebSearchRequest(validated)),
      signal: options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal,
    });
    const stream = await parseWebSearchStream(response);
    observedReceipt = stream.receipt;
    if (!stream.done) throw new Error("malformed_stream");
    if (stream.receipt.provider_model && !stream.receipt.provider_model.startsWith(WEB_SEARCH_PROVIDER.model)) {
      throw new Error("route_mismatch");
    }
    const candidates: WebSourceRecord[] = [];
    let rejected = stream.invalidAnnotations;
    for (const annotation of stream.annotations) {
      const candidate = candidateFromAnnotation(annotation, retrievedAt, stream.receipt);
      if (!candidate) {
        rejected += 1;
        continue;
      }
      if (!candidates.some((existing) => existing.url === candidate.url)) candidates.push(candidate);
    }
    const sources = candidates.slice(0, validated.limit);
    if (stream.receipt.web_search_requests !== undefined && stream.receipt.web_search_requests !== 1) {
      throw new Error("search_not_proven");
    }
    if (stream.receipt.web_search_requests === 1) {
      stream.receipt.web_search_proof = "usage";
    } else if (WEB_SEARCH_PROVIDER.engine === "native" && sources.length > 0) {
      stream.receipt.web_search_proof = "citations_and_request_bound";
    } else {
      throw new Error("search_not_proven");
    }
    if (!sources.length) {
      return {
        status: "no_match",
        query: validated.query,
        sources,
        retrieved_at: retrievedAt,
        receipt: stream.receipt,
      };
    }
    return {
      status: rejected > 0 ? "partial" : "complete",
      query: validated.query,
      sources,
      retrieved_at: retrievedAt,
      receipt: stream.receipt,
    };
  } catch (error) {
    const code = options.signal?.aborted
      ? "stopped"
      : controller.signal.aborted
      ? "timeout"
      : error instanceof SearchProviderHttpError
        ? "provider_http_error"
      : error instanceof Error && ["malformed_stream", "search_not_proven", "route_mismatch"].includes(error.message)
        ? error.message
        : "provider_unavailable";
    return {
      status: "unavailable",
      query: validated.query,
      sources: [],
      retrieved_at: retrievedAt,
      receipt:
        error instanceof SearchProviderHttpError
          ? { ...observedReceipt, http_status: error.status }
          : observedReceipt,
      failure: sanitizedFailure(code, "The bounded web search did not complete with verified citations."),
    };
  } finally {
    clearTimeout(timeout);
  }
}
