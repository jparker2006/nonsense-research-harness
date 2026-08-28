import { describe, expect, it, vi } from "vitest";
import { WEB_RESEARCH_LIMITS } from "../src/lib/web-research/contracts.ts";
import {
  WEB_SEARCH_PROVIDER,
  buildWebSearchRequest,
  validateWebSearchInput,
  webSearch,
} from "../src/lib/web-research/web-search.ts";

function exaResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    requestId: "exa-request-1",
    resolvedSearchType: "neural",
    results: [
      {
        url: "https://Example.com:443/story#section",
        title: "Official story",
        author: "Reporter",
        publishedDate: "2026-08-26T00:00:00.000Z",
        highlights: ["Retrieved orientation highlight."],
      },
    ],
    costDollars: { total: 0.008 },
    searchTime: 312.4,
    ...overrides,
  });
}

describe("bounded direct Exa search", () => {
  it("builds the frozen direct request without an Exa answer model", () => {
    const validated = validateWebSearchInput({
      query: " current food rules ",
      limit: 3,
    });
    expect(buildWebSearchRequest(validated)).toEqual({
      query: "current food rules",
      type: "auto",
      numResults: 3,
      contents: { highlights: { maxCharacters: 1_200 }, maxAgeHours: 0 },
    });
    expect(WEB_SEARCH_PROVIDER).toMatchObject({
      endpoint: "https://api.exa.ai/search",
      transport: "direct_exa",
      searchType: "auto",
    });
    expect(WEB_RESEARCH_LIMITS.searchTimeoutMs).toBe(20_000);
  });

  it("rejects only invalid queries and limits before fetch", async () => {
    const invalid = [
      { query: "a" },
      { query: "x".repeat(301) },
      { query: "valid", limit: 0 },
      { query: "valid", limit: 11 },
    ];
    const fetchSpy = vi.fn<typeof fetch>();
    for (const input of invalid) {
      await expect(webSearch(input, { apiKey: "synthetic", liveAuthorized: true, fetchImpl: fetchSpy }))
        .resolves.toMatchObject({ status: "failed", failure: { code: "invalid_input" } });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses only the server Exa key and returns normalized discovery-only candidates", async () => {
    const fetchSpy = vi.fn<typeof fetch>(async (url, init) => {
      expect(url).toBe("https://api.exa.ai/search");
      expect(init?.headers).toEqual({ "content-type": "application/json", "x-api-key": "exa-secret" });
      expect(JSON.parse(String(init?.body))).toMatchObject({ query: "current food rules", type: "auto", numResults: 10 });
      expect(String(init?.body)).not.toContain("exa-secret");
      return exaResponse();
    });
    const result = await webSearch(
      { query: "current food rules" },
      { apiKey: "exa-secret", liveAuthorized: true, fetchImpl: fetchSpy, now: () => new Date("2026-08-26T12:00:00Z") },
    );
    expect(result).toMatchObject({
      status: "complete",
      retrieved_at: "2026-08-26T12:00:00.000Z",
      receipt: {
        provider_name: "Exa",
        request_id: "exa-request-1",
        resolved_search_type: "neural",
        web_search_requests: 1,
        web_search_proof: "direct_exa_response",
        cost_usd: 0.008,
        search_time_ms: 312.4,
      },
      sources: [{
        source_kind: "search_candidate",
        availability: "candidate",
        evidence_usable: false,
        url: "https://example.com/story",
        title: "Official story",
        byline: "Reporter",
        published_at: "2026-08-26T00:00:00.000Z",
        excerpt: "Retrieved orientation highlight.",
      }],
    });
    expect(JSON.stringify(result)).not.toContain("exa-secret");
  });

  it("deduplicates normalized URLs and marks malformed neighbors partial", async () => {
    const result = await webSearch(
      { query: "bounded candidates" },
      {
        apiKey: "synthetic",
        liveAuthorized: true,
        fetchImpl: async () => exaResponse({
          results: [
            { url: "https://example.com/a", highlights: [] },
            { url: "https://example.com/a#duplicate", title: "Duplicate" },
            { url: "javascript:alert(1)", title: "Bad" },
            { title: "Missing URL" },
          ],
        }),
      },
    );
    expect(result.status).toBe("limited");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({ url: "https://example.com/a", evidence_usable: false });
  });

  it("returns no_match for a proved empty direct response", async () => {
    await expect(webSearch(
      { query: "nothing useful" },
      { apiKey: "synthetic", liveAuthorized: true, fetchImpl: async () => exaResponse({ results: [] }) },
    )).resolves.toMatchObject({
      status: "no_match",
      sources: [],
      receipt: { request_id: "exa-request-1", web_search_requests: 1 },
    });
  });

  it("retries one transient provider failure and reports both attempts", async () => {
    const fetchSpy = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockResolvedValueOnce(exaResponse());
    const result = await webSearch(
      { query: "current food rules" },
      { apiKey: "synthetic", liveAuthorized: true, fetchImpl: fetchSpy, sleep: async () => undefined },
    );
    expect(result).toMatchObject({ status: "complete", receipt: { attempts: 2, web_search_requests: 2 } });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it.each([
    [401, "unauthorized", 1],
    [403, "unauthorized", 1],
    [429, "rate_limited", 2],
    [500, "provider_http_error", 2],
  ])("classifies HTTP %i without leaking its body", async (status, code, attempts) => {
    const fetchSpy = vi.fn<typeof fetch>(async () => new Response("SECRET provider body", { status }));
    const result = await webSearch(
      { query: "provider failure" },
      {
        apiKey: "synthetic",
        liveAuthorized: true,
        fetchImpl: fetchSpy,
        sleep: async () => undefined,
      },
    );
    expect(result).toMatchObject({ status: "unavailable", receipt: { http_status: status, attempts }, failure: { code } });
    expect(fetchSpy).toHaveBeenCalledTimes(attempts);
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it.each([
    ["bad json", new Response("{bad", { status: 200 })],
    ["missing request id", Response.json({ results: [] })],
    ["oversized body", new Response("x".repeat(2 * 1024 * 1024 + 1))],
  ])("returns a sanitized malformed response for %s", async (_label, fixture) => {
    await expect(webSearch(
      { query: "malformed response" },
      { apiKey: "synthetic", liveAuthorized: true, fetchImpl: async () => fixture },
    )).resolves.toMatchObject({ status: "unavailable", failure: { code: "malformed_response" } });
  });

  it("fails before fetch when the key or live authority is missing", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    await expect(webSearch({ query: "disabled search" }, { liveAuthorized: true, fetchImpl: fetchSpy }))
      .resolves.toMatchObject({ failure: { code: "missing_key" } });
    await expect(webSearch({ query: "disabled search" }, { apiKey: "synthetic", liveAuthorized: false, fetchImpl: fetchSpy }))
      .resolves.toMatchObject({ failure: { code: "live_not_authorized" } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("retries one timeout and then returns unavailable", async () => {
    vi.useFakeTimers();
    try {
      const fetchSpy = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }));
      const pending = webSearch(
        { query: "slow direct Exa" },
        { apiKey: "synthetic", liveAuthorized: true, fetchImpl: fetchSpy, sleep: async () => undefined },
      );
      await vi.advanceTimersByTimeAsync(WEB_RESEARCH_LIMITS.searchTimeoutMs + 1);
      await vi.advanceTimersByTimeAsync(WEB_RESEARCH_LIMITS.searchTimeoutMs + 1);
      await expect(pending).resolves.toMatchObject({ failure: { code: "timeout" } });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
