import { describe, expect, it } from "vitest";
import { loadRetrievalArtifacts, type RetrievalArtifacts } from "../src/lib/transcript-retrieval/artifacts";
import { buildBm25Index } from "../src/lib/transcript-retrieval/bm25";
import { TranscriptRetrievalService, type TranscriptProvider } from "../src/lib/transcript-retrieval/search";
import type { RetrievalChunk } from "../src/lib/transcript-retrieval/types";

function chunk(id: string, text: string, season = 3): RetrievalChunk {
  return {
    schema_version: "1.0",
    chunk_id: id,
    chunk_index: 1,
    segment_id: `${id}:segment`,
    episode_id: `${id}:episode`,
    season,
    episode_number: 1,
    title: "Synthetic fixture",
    published_at: "2026-01-01",
    episode_format: "headlines",
    corpus_role: "primary",
    segment_role: "headline_topic",
    chapter_label_raw: null,
    start_seconds: 0,
    end_seconds: 10,
    start_char: 0,
    end_char: text.length,
    word_count: text.split(/\s+/).length,
    text,
  };
}

function syntheticArtifacts(): RetrievalArtifacts {
  const chunks = [
    chunk("alpha:c001", "clock clock clock clock clock clock clock clock clock clock clock clock"),
    chunk("beta:c001", "garden garden garden garden garden garden garden garden garden garden garden garden", 4),
  ];
  return {
    manifest: {
      schema_version: "1.0",
      counts: { episodes: 2, segments: 2, chunks: 2 },
      embedding: { status: "ready", model: "openai/text-embedding-3-small", provider: "azure", dimensions: 2 },
      reranker: { status: "removed", model: "qwen/qwen3-reranker-8b", provider: "fireworks" },
      artifacts: {
        chunks: { path: "unused", bytes: 0, sha256: "unused" },
        bm25: { path: "unused", bytes: 0, sha256: "unused" },
        embeddings: { path: "unused", bytes: 0, sha256: "unused" },
      },
    },
    chunks,
    chunksById: new Map(chunks.map((item) => [item.chunk_id, item])),
    bm25: buildBm25Index(chunks),
    vectors: new Float32Array([1, 0, 0, 1]),
    dimensions: 2,
  };
}

const provider: TranscriptProvider = {
  async embedQuery(query) {
    return query.includes("garden") ? [0, 1] : [1, 0];
  },
  async rerank(_query, documents) {
    return documents.map((_document, index) => ({ index, relevanceScore: 1 - index * 0.01 }));
  },
};

describe("Transcript retrieval server-side transcript retrieval service", () => {
  it("opens an exact stored chunk and returns typed not_found", () => {
    const service = new TranscriptRetrievalService({ artifacts: syntheticArtifacts() });
    expect(service.openTranscriptChunk("alpha:c001")).toMatchObject({
      status: "complete",
      chunk: { chunk_id: "alpha:c001", text: expect.stringContaining("clock") },
      adjacent_chunks: [],
    });
    expect(service.openTranscriptChunk("missing")).toEqual({ status: "not_found", chunk_id: "missing" });
  });

  it("opens bounded adjacent context without changing the exact selected chunk", () => {
    const chunks = [
      { ...chunk("context:c000", "before words"), chunk_index: 0, segment_id: "shared:segment", episode_id: "shared:episode" },
      { ...chunk("context:c001", "selected exact words"), chunk_index: 1, segment_id: "shared:segment", episode_id: "shared:episode" },
      { ...chunk("context:c002", "after words"), chunk_index: 2, segment_id: "shared:segment", episode_id: "shared:episode" },
      { ...chunk("other:c001", "different segment"), chunk_index: 1, segment_id: "other:segment", episode_id: "shared:episode" },
    ];
    const artifacts: RetrievalArtifacts = {
      ...syntheticArtifacts(),
      chunks,
      chunksById: new Map(chunks.map((item) => [item.chunk_id, item])),
      bm25: buildBm25Index(chunks),
      vectors: undefined,
      dimensions: undefined,
    };
    const opened = new TranscriptRetrievalService({ artifacts }).openTranscriptChunk("context:c001");
    expect(opened).toMatchObject({
      status: "complete",
      chunk: { chunk_id: "context:c001", text: "selected exact words" },
      adjacent_chunks: [{ chunk_id: "context:c000" }, { chunk_id: "context:c002" }],
    });
  });

  it("returns bounded hybrid results with filters and exact excerpts", async () => {
    const artifacts = syntheticArtifacts();
    const service = new TranscriptRetrievalService({ artifacts, provider });
    const result = await service.searchTranscripts({ query: "garden concept", filters: { season: 4 }, limit: 1 });
    expect(result.retrieval_status).toBe("complete");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ chunk_id: "beta:c001", season: 4 });
    expect(result.matches[0]?.excerpt).toBe(artifacts.chunks[1]?.text);
  });

  it("keeps fused hybrid results when the retained reranker is unavailable", async () => {
    const rerankFailure: TranscriptProvider = {
      async embedQuery() { return [1, 0]; },
      async rerank() { throw new Error("private reranker failure"); },
    };
    const service = new TranscriptRetrievalService({ artifacts: syntheticArtifacts(), provider: rerankFailure });
    const result = await service.searchTranscripts({ query: "clock concept" });
    expect(result.retrieval_status).toBe("hybrid_unreranked");
    expect(result.matches[0]?.chunk_id).toBe("alpha:c001");
    expect(JSON.stringify(result)).not.toContain("private reranker failure");
  });

  it("keeps fused hybrid results when reranking rejects every plausible candidate", async () => {
    const emptyReranker: TranscriptProvider = {
      async embedQuery() { return [1, 0]; },
      async rerank() { return []; },
    };
    const result = await new TranscriptRetrievalService({ artifacts: syntheticArtifacts(), provider: emptyReranker })
      .searchTranscripts({ query: "clock concept" });
    expect(result).toMatchObject({
      retrieval_status: "hybrid_unreranked",
      matches: [{ chunk_id: "alpha:c001" }],
      reason: expect.stringContaining("retained"),
    });
  });

  it("degrades to honest keyword-only, unavailable, and no-match states", async () => {
    const local = new TranscriptRetrievalService({ artifacts: loadRetrievalArtifacts() });
    expect((await local.searchTranscripts({ query: "Italian tune up" })).retrieval_status).toBe("keyword_only");

    const brokenProvider: TranscriptProvider = {
      async embedQuery() { throw new Error("private provider failure"); },
      async rerank() { throw new Error("private provider failure"); },
    };
    const broken = new TranscriptRetrievalService({ artifacts: syntheticArtifacts(), provider: brokenProvider });
    const unavailable = await broken.searchTranscripts({ query: "zzzzzzzzzz" });
    expect(unavailable).toMatchObject({ retrieval_status: "unavailable", matches: [] });
    expect(JSON.stringify(unavailable)).not.toContain("private provider failure");

    const noProviderArtifacts = syntheticArtifacts();
    noProviderArtifacts.vectors = undefined;
    noProviderArtifacts.dimensions = undefined;
    const noMatch = await new TranscriptRetrievalService({ artifacts: noProviderArtifacts })
      .searchTranscripts({ query: "zzzzzzzzzz" });
    expect(noMatch).toMatchObject({ retrieval_status: "no_match", matches: [] });
  });

  it("enforces query and result bounds", async () => {
    const service = new TranscriptRetrievalService({ artifacts: syntheticArtifacts() });
    await expect(service.searchTranscripts({ query: " ", limit: 6 })).rejects.toThrow("between 2 and 500");
    await expect(service.searchTranscripts({ query: "clock", limit: 11 })).rejects.toThrow("between 1 and 10");
  });

  it("loads and checksum-validates the generated private artifacts", () => {
    const artifacts = loadRetrievalArtifacts();
    expect(artifacts.chunks).toHaveLength(1259);
    expect(artifacts.chunksById.size).toBe(1259);
  });
});
