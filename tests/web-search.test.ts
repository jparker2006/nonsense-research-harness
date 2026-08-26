import { describe, expect, it, vi } from "vitest";
import {
  WEB_SEARCH_PROVIDER,
  buildWebSearchRequest,
  validateWebSearchInput,
  webSearch,
} from "../src/lib/web-research/web-search.ts";
import { WEB_RESEARCH_LIMITS } from "../src/lib/web-research/contracts.ts";

function streamResponse(events: unknown[], includeDone = true): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") +
    (includeDone ? "data: [DONE]\n\n" : "");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function usage(overrides: Record<string, unknown> = {}) {
  return {
    prompt_tokens: 50,
    completion_tokens: 10,
    total_tokens: 60,
    cost: 0.0052,
    server_tool_use: { web_search_requests: 1 },
    ...overrides,
  };
}

function citationEvent(annotations: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    id: "generation-phase4",
    model: WEB_SEARCH_PROVIDER.model,
    provider: "OpenAI",
    choices: [{ delta: { content: "discard this prose", reasoning: "discard this too", annotations } }],
    usage: usage(),
    ...overrides,
  };
}

describe("bounded OpenRouter search", () => {
  it("freezes Luna Exa routing and every enforceable request-side ceiling", () => {
    const validated = validateWebSearchInput({
      query: " OpenRouter web search docs ",
      limit: 3,
      allowed_domains: ["openrouter.ai", "*.openrouter.ai"],
    });
    const request = buildWebSearchRequest(validated);
    expect(request).toMatchObject({
      model: "openai/gpt-5.6-luna",
      stream: true,
      max_tokens: 768,
      reasoning: { effort: "max", exclude: true },
      provider: {
        allow_fallbacks: false,
        require_parameters: true,
        data_collection: "deny",
        zdr: false,
        max_price: { prompt: 0.2, completion: 1.2 },
      },
    });
    expect(request).not.toHaveProperty("tool_choice");
    expect(request).not.toHaveProperty("tools");
    expect(request.plugins).toEqual([
      {
        id: "web",
        engine: "exa",
        max_results: 3,
        include_domains: ["openrouter.ai", "*.openrouter.ai"],
      },
    ]);
    expect(WEB_RESEARCH_LIMITS.searchTimeoutMs).toBe(45_000);
    expect(WEB_RESEARCH_LIMITS.providerRequests).toBe(1);
    expect(WEB_RESEARCH_LIMITS.phaseBudgetUsd).toBe(0.1);
  });

  it("rejects invalid queries, limits, domains, duplicates, and mixed allow/exclude rules", async () => {
    const invalid = [
      { query: "a" },
      { query: "x".repeat(301) },
      { query: "valid", limit: 0 },
      { query: "valid", limit: 11 },
      { query: "valid", limit: 1.5 },
      { query: "valid", allowed_domains: ["https://example.com"] },
      { query: "valid", allowed_domains: ["example.com/path"] },
      { query: "valid", allowed_domains: ["example.com", "example.com"] },
      { query: "valid", allowed_domains: ["example.com"], excluded_domains: ["other.com"] },
      { query: "valid", excluded_domains: ["a.com", "b.com", "c.com", "d.com", "e.com", "f.com"] },
    ];
    const fetchSpy = vi.fn<typeof fetch>();
    for (const input of invalid) {
      const result = await webSearch(input, {
        apiKey: "synthetic",
        liveAuthorized: true,
        fetchImpl: fetchSpy,
      });
      expect(result).toMatchObject({ status: "unavailable", failure: { code: "invalid_input" } });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns normalized candidates, sanitized usage, and discards all model prose/reasoning", async () => {
    const fetchSpy = vi.fn<typeof fetch>(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      expect(request.plugins[0]).toEqual({ id: "web", engine: "exa", max_results: 2 });
      return streamResponse([
        citationEvent([
          {
            type: "url_citation",
            url_citation: {
              url: "https://OpenRouter.ai:443/docs/page#section",
              title: "Official docs",
              content: "Documented result excerpt",
            },
          },
        ]),
      ]);
    });
    const result = await webSearch(
      { query: "OpenRouter search docs", limit: 2 },
      {
        apiKey: "synthetic",
        liveAuthorized: true,
        fetchImpl: fetchSpy,
        now: () => new Date("2026-08-23T02:00:00Z"),
      },
    );
    expect(result).toMatchObject({
      status: "complete",
      retrieved_at: "2026-08-23T02:00:00.000Z",
      receipt: {
        provider_model: "openai/gpt-5.6-luna",
        provider_name: "OpenAI",
        prompt_tokens: 50,
        completion_tokens: 10,
        total_tokens: 60,
        cost_usd: 0.0052,
        web_search_requests: 1,
        web_search_proof: "usage",
      },
      sources: [
        {
          source_kind: "search_candidate",
          availability: "candidate",
          url: "https://openrouter.ai/docs/page",
          title: "Official docs",
          excerpt: "Documented result excerpt",
          trust: "untrusted_external_content",
          evidence_usable: false,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("discard this prose");
    expect(JSON.stringify(result)).not.toContain("discard this too");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("accepts Exa citations plus the one-tool request bound when the provider omits the usage counter", async () => {
    const result = await webSearch(
      { query: "fresh native search" },
      {
        apiKey: "synthetic",
        liveAuthorized: true,
        fetchImpl: async () =>
          streamResponse([
            citationEvent(
              [
                {
                  type: "url_citation",
                  url_citation: { url: "https://example.com/fresh", title: "Fresh" },
                },
              ],
              { usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12, cost: 0.01 } },
            ),
          ]),
      },
    );
    expect(result).toMatchObject({
      status: "complete",
      sources: [{ url: "https://example.com/fresh" }],
      receipt: { web_search_proof: "citations_and_request_bound" },
    });
  });

  it("rejects a provider usage receipt proving more than one search", async () => {
    const result = await webSearch(
      { query: "too many searches" },
      {
        apiKey: "synthetic",
        liveAuthorized: true,
        fetchImpl: async () =>
          streamResponse([
            citationEvent(
              [
                {
                  type: "url_citation",
                  url_citation: { url: "https://example.com/excess", title: "Excess" },
                },
              ],
              { usage: usage({ server_tool_use: { web_search_requests: 2 } }) },
            ),
          ]),
      },
    );
    expect(result).toMatchObject({ status: "unavailable", failure: { code: "search_not_proven" } });
  });

  it("accepts the current input/output token usage aliases", async () => {
    const result = await webSearch(
      { query: "current usage aliases" },
      {
        apiKey: "synthetic",
        liveAuthorized: true,
        fetchImpl: async () =>
          streamResponse([
            citationEvent(
              [
                {
                  type: "url_citation",
                  url_citation: { url: "https://example.com/current", title: "Current" },
                },
              ],
              {
                usage: {
                  input_tokens: 77,
                  output_tokens: 12,
                  total_tokens: 89,
                  cost: 0.0054,
                  server_tool_use: { web_search_requests: 1 },
                },
              },
            ),
          ]),
      },
    );
    expect(result.receipt).toMatchObject({
      prompt_tokens: 77,
      completion_tokens: 12,
      total_tokens: 89,
      web_search_requests: 1,
    });
  });

  it("deduplicates valid citations, keeps content-less candidates, and marks malformed neighbors partial", async () => {
    const result = await webSearch(
      { query: "bounded search" },
      {
        apiKey: "synthetic",
        liveAuthorized: true,
        fetchImpl: async () =>
          streamResponse([
            citationEvent([
              { type: "url_citation", url_citation: { url: "https://example.com/a", title: "A" } },
              { type: "url_citation", url_citation: { url: "https://example.com/a#dup", title: "Duplicate" } },
              { type: "url_citation", url_citation: { url: "javascript:alert(1)", title: "Bad" } },
              { type: "unsupported", data: "bad" },
            ]),
          ]),
      },
    );
    expect(result.status).toBe("partial");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.excerpt).toBeNull();
  });

  it("returns no_match only when one server search is proven and no citation survives", async () => {
    const result = await webSearch(
      { query: "nothing useful" },
      {
        apiKey: "synthetic",
        liveAuthorized: true,
        fetchImpl: async () => streamResponse([citationEvent([])]),
      },
    );
    expect(result).toMatchObject({ status: "no_match", sources: [], receipt: { web_search_requests: 1 } });
  });

  it.each([
    ["missing usage", streamResponse([citationEvent([], { usage: undefined })]), "search_not_proven"],
    ["unclosed stream", streamResponse([citationEvent([])], false), "malformed_stream"],
    ["wrong route", streamResponse([citationEvent([], { model: "other/model" })]), "route_mismatch"],
    ["provider error", new Response("SECRET provider body", { status: 500 }), "provider_http_error"],
    ["malformed event", new Response("data: {bad json}\n\ndata: [DONE]\n\n"), "malformed_stream"],
  ])("returns sanitized unavailable for %s", async (_label, fixture, code) => {
    const result = await webSearch(
      { query: "provider failure" },
      { apiKey: "synthetic", liveAuthorized: true, fetchImpl: async () => fixture as Response },
    );
    expect(result).toMatchObject({ status: "unavailable", failure: { code } });
    if (code === "provider_http_error") expect(result.receipt.http_status).toBe(500);
    expect(JSON.stringify(result)).not.toContain("SECRET provider body");
  });

  it("preserves sanitized provider usage when citation proof is unavailable", async () => {
    const result = await webSearch(
      { query: "provider diagnostic receipt" },
      {
        apiKey: "synthetic",
        liveAuthorized: true,
        fetchImpl: async () =>
          streamResponse([
            citationEvent([], {
              usage: {
                input_tokens: 101,
                output_tokens: 4,
                total_tokens: 105,
                cost: 0.0123,
              },
            }),
          ]),
      },
    );
    expect(result).toMatchObject({
      status: "unavailable",
      receipt: {
        provider_model: "openai/gpt-5.6-luna",
        provider_name: "OpenAI",
        prompt_tokens: 101,
        completion_tokens: 4,
        total_tokens: 105,
        cost_usd: 0.0123,
      },
      failure: { code: "search_not_proven" },
    });
  });

  it("fails before fetch when the key or explicit live authority is missing", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    const noKey = await webSearch(
      { query: "provider disabled" },
      { liveAuthorized: true, fetchImpl: fetchSpy },
    );
    expect(noKey.failure?.code).toBe("missing_key");
    const noAuthority = await webSearch(
      { query: "provider disabled" },
      { apiKey: "synthetic", liveAuthorized: false, fetchImpl: fetchSpy },
    );
    expect(noAuthority.failure?.code).toBe("live_not_authorized");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns a timeout without retrying", async () => {
    vi.useFakeTimers();
    try {
      const fetchSpy = vi.fn<typeof fetch>((_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
      );
      const pending = webSearch(
        { query: "slow provider" },
        { apiKey: "synthetic", liveAuthorized: true, fetchImpl: fetchSpy },
      );
      await vi.advanceTimersByTimeAsync(WEB_RESEARCH_LIMITS.searchTimeoutMs + 1);
      await expect(pending).resolves.toMatchObject({ failure: { code: "timeout" } });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
