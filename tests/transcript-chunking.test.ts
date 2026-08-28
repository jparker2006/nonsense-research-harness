import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildBm25Index, searchBm25 } from "../src/lib/transcript-retrieval/bm25";
import {
  assertChunkCoverage,
  CHUNKING_POLICY,
  createChunksForSegment,
} from "../src/lib/transcript-retrieval/chunking";
import { CORPUS_SNAPSHOT, loadAndValidateCorpus } from "../src/lib/transcript-retrieval/corpus";
import type { RetrievalChunk, RetrievalEvalCase } from "../src/lib/transcript-retrieval/types";

describe("Transcript retrieval transcript corpus and chunking", () => {
  it("fails closed against the frozen authoritative corpus snapshot", () => {
    const corpus = loadAndValidateCorpus();
    expect(corpus.episodes).toHaveLength(CORPUS_SNAPSHOT.episodes.count);
    expect(corpus.segments).toHaveLength(CORPUS_SNAPSHOT.segments.count);
    expect(corpus.episodesById.size).toBe(59);
    expect(corpus.segmentsById.size).toBe(441);
  });

  it("creates unique exact-source chunks with gap-free coverage for all 441 segments", () => {
    const corpus = loadAndValidateCorpus();
    const allChunks: RetrievalChunk[] = [];
    for (const segment of corpus.segments) {
      const episode = corpus.episodesById.get(segment.episode_id);
      expect(episode).toBeDefined();
      const chunks = createChunksForSegment(segment, episode!);
      expect(() => assertChunkCoverage(segment, chunks)).not.toThrow();
      expect(chunks[0]?.start_char).toBe(0);
      expect(chunks.at(-1)?.end_char).toBe(segment.text.length);
      allChunks.push(...chunks);
    }
    expect(new Set(allChunks.map((chunk) => chunk.chunk_id)).size).toBe(allChunks.length);
    expect(new Set(allChunks.map((chunk) => chunk.segment_id)).size).toBe(441);
    expect(Math.max(...allChunks.map((chunk) => chunk.word_count))).toBeLessThanOrEqual(
      CHUNKING_POLICY.maximumWords,
    );
  });

  it("freezes 12 human-inspected cases before ranking implementation", () => {
    const cases = JSON.parse(
      readFileSync(resolve("tests/fixtures/transcript-retrieval-cases.json"), "utf8"),
    ) as RetrievalEvalCase[];
    expect(cases).toHaveLength(12);
    expect(cases.filter((item) => item.category === "exact")).toHaveLength(4);
    expect(cases.filter((item) => item.category === "conceptual")).toHaveLength(5);
    expect(cases.filter((item) => item.category === "filter")).toHaveLength(2);
    expect(cases.filter((item) => item.category === "absent")).toHaveLength(1);
    const segmentIds = loadAndValidateCorpus().segmentsById;
    for (const item of cases) {
      for (const segmentId of item.expected_segment_ids) expect(segmentIds.has(segmentId)).toBe(true);
    }
  });

  it("returns exact keyword matches and applies metadata filters without a provider", () => {
    const corpus = loadAndValidateCorpus();
    const chunks = corpus.segments.flatMap((segment) =>
      createChunksForSegment(segment, corpus.episodesById.get(segment.episode_id)!),
    );
    const byId = new Map(chunks.map((chunk) => [chunk.chunk_id, chunk]));
    const index = buildBm25Index(chunks);
    const italian = searchBm25(index, "Italian tune up", byId);
    expect(byId.get(italian[0]?.chunk_id ?? "")?.segment_id).toBe(
      "e58ec754-af0e-4608-8423-6c33a0c56d16:001",
    );
    const filtered = searchBm25(index, "California economy Japan", byId, {
      season: 3,
      episode_format: "headlines",
      segment_role: "headline_topic",
    });
    expect(byId.get(filtered[0]?.chunk_id ?? "")?.segment_id).toBe(
      "e58ec754-af0e-4608-8423-6c33a0c56d16:006",
    );
  });
});
