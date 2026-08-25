import { afterEach, describe, expect, it, vi } from "vitest";
import {
  embedTexts,
  PHASE_3_PROVIDER_LIMITS,
  rerankDocuments,
} from "../src/lib/transcript-retrieval/providers";

afterEach(() => vi.unstubAllEnvs());

describe("Phase 3 OpenRouter embedding and rerank boundary", () => {
  it("fails before fetch without explicit live authority", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    await expect(embedTexts("test-key", ["synthetic"], fetchSpy)).rejects.toThrow(
      "PHASE3_EXECUTE_LIVE=approved",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("pins the Azure ZDR embedding request and validates its vector", async () => {
    vi.stubEnv("PHASE3_EXECUTE_LIVE", "approved");
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      id: "embed-1",
      model: PHASE_3_PROVIDER_LIMITS.embedding.model,
      provider: "Azure",
      data: [{ index: 0, embedding: [0.25, 0.75] }],
      usage: { prompt_tokens: 4, total_tokens: 4, cost: 0.00000008 },
    }), { status: 200 }));
    const result = await embedTexts("test-key", ["synthetic"], fetchSpy);
    expect(result.vectors).toEqual([[0.25, 0.75]]);
    const call = fetchSpy.mock.calls[0];
    const body = JSON.parse(String(call?.[1]?.body));
    expect(call?.[0]).toBe("https://openrouter.ai/api/v1/embeddings");
    expect(body).toMatchObject({
      model: "openai/text-embedding-3-small",
      provider: {
        order: ["azure"],
        allow_fallbacks: false,
        require_parameters: true,
        data_collection: "deny",
        zdr: true,
        max_price: { prompt: 0.02, completion: 0 },
      },
    });
    expect(String(call?.[1]?.headers)).not.toContain("test-key");
  });

  it("authorizes Phase 7A transcript providers only in explicitly enabled local development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PHASE7A_LOCAL_LIVE", "approved");
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      id: "embed-phase7a",
      model: PHASE_3_PROVIDER_LIMITS.embedding.model,
      provider: "Azure",
      data: [{ index: 0, embedding: [0.5, 0.5] }],
      usage: { total_tokens: 2, cost: 0.00000004 },
    }), { status: 200 }));
    await expect(embedTexts("test-key", ["phase 7a query"], fetchSpy)).resolves.toMatchObject({
      vectors: [[0.5, 0.5]],
    });
    expect(fetchSpy).toHaveBeenCalledOnce();

    vi.stubEnv("NODE_ENV", "production");
    const productionFetch = vi.fn<typeof fetch>();
    await expect(embedTexts("test-key", ["phase 7a query"], productionFetch)).rejects.toThrow(
      "Explicit live authority",
    );
    expect(productionFetch).not.toHaveBeenCalled();
  });

  it("accepts only the exact requested model or its provider-native alias", async () => {
    vi.stubEnv("PHASE3_EXECUTE_LIVE", "approved");
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      id: "embed-alias",
      model: "text-embedding-3-small",
      data: [{ index: 0, embedding: [1, 0] }],
      usage: { total_tokens: 2 },
    }), { status: 200 }));
    await expect(embedTexts("test-key", ["synthetic"], fetchSpy)).resolves.toMatchObject({
      receipt: { model: "text-embedding-3-small" },
    });
  });

  it("pins the Fireworks ZDR reranker and never returns raw HTTP errors", async () => {
    vi.stubEnv("PHASE3_EXECUTE_LIVE", "approved");
    const fetchSpy = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "rerank-1",
        model: PHASE_3_PROVIDER_LIMITS.rerank.model,
        provider: "Fireworks",
        results: [{ index: 1, relevance_score: 0.9 }, { index: 0, relevance_score: 0.2 }],
        usage: { total_tokens: 12, cost: 0.0000024 },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("secret provider detail", { status: 400 }));
    const result = await rerankDocuments("test-key", "clock", ["garden", "clock"], 2, fetchSpy);
    expect(result.results[0]).toEqual({ index: 1, relevanceScore: 0.9 });
    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(body.provider).toMatchObject({
      order: ["fireworks"],
      allow_fallbacks: false,
      data_collection: "deny",
      zdr: true,
      max_price: { prompt: 0.2, completion: 0 },
    });
    const failure = await rerankDocuments("test-key", "clock", ["clock"], 1, fetchSpy).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("HTTP 400");
    expect((failure as Error).message).not.toContain("secret provider detail");
  });

  it("rejects over-limit inputs without calling the provider", async () => {
    vi.stubEnv("PHASE3_EXECUTE_LIVE", "approved");
    const fetchSpy = vi.fn<typeof fetch>();
    await expect(embedTexts("test-key", Array.from({ length: 65 }, () => "x"), fetchSpy)).rejects.toThrow(
      "between 1 and 64",
    );
    await expect(rerankDocuments("test-key", "x", Array.from({ length: 21 }, () => "x"), 20, fetchSpy)).rejects.toThrow(
      "between 1 and 20",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
