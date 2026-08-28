import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  loadRetrievalArtifacts,
  validateRetrievalChunks,
} from "../src/lib/transcript-retrieval/artifacts";
import { loadAndValidateCorpus } from "../src/lib/transcript-retrieval/corpus";

describe("accepted transcript corpus and retrieval evidence", () => {
  it("keeps all generated chunks byte-exact, represented, unique, and speaker-neutral", () => {
    const corpus = loadAndValidateCorpus();
    const artifacts = loadRetrievalArtifacts();
    for (const chunk of artifacts.chunks) {
      const segment = corpus.segmentsById.get(chunk.segment_id);
      expect(segment).toBeDefined();
      expect(segment!.text.slice(chunk.start_char, chunk.end_char)).toBe(chunk.text);
      expect("speaker" in chunk).toBe(false);
    }
    expect(new Set(artifacts.chunks.map((chunk) => chunk.segment_id)).size).toBe(441);
    expect(artifacts.vectors).toHaveLength(1259 * 1536);
    expect(artifacts.vectors!.some((value) => !Number.isFinite(value))).toBe(false);
  });

  it("fails closed on malformed and duplicate chunk records", () => {
    expect(() => validateRetrievalChunks([{}])).toThrow("malformed");
    const valid = loadRetrievalArtifacts().chunks[0]!;
    expect(() => validateRetrievalChunks([valid, valid])).toThrow("duplicate IDs");
  });

  it("freezes the passing quality, budget, reranker, and checkpoint gates", () => {
    const evaluation = JSON.parse(readFileSync("reports/phase-3-evaluation.json", "utf8"));
    const usage = JSON.parse(readFileSync("reports/phase-3-usage.json", "utf8"));
    expect(evaluation.reranker_decision).toBe("retained");
    expect(evaluation.metrics.reranked.exact.recall_at_5).toBe(1);
    expect(evaluation.metrics.reranked.filter.recall_at_5).toBe(1);
    expect(evaluation.metrics.reranked.conceptual.recall_at_5).toBe(1);
    expect(evaluation.metrics.reranked.conceptual.mean_reciprocal_rank).toBeGreaterThan(
      evaluation.metrics.fused.conceptual.mean_reciprocal_rank,
    );
    expect(Object.values(evaluation.acceptance).every(Boolean)).toBe(true);
    expect(usage.provider_requests).toBe(35);
    expect(usage.provider_requests).toBeLessThanOrEqual(usage.maximum_provider_requests);
    expect(usage.cumulative_cost_usd).toBeLessThanOrEqual(usage.approved_budget_usd);
    expect(existsSync("data/retrieval/embeddings.checkpoint.jsonl")).toBe(false);
    expect(existsSync("data/retrieval/evaluation-query-vectors.checkpoint.json")).toBe(false);
  });

  it("keeps the corpus outside public assets", () => {
    expect(existsSync("public/data/retrieval")).toBe(false);
  });
});
