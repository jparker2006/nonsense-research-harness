import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadRetrievalArtifacts } from "../src/lib/transcript-retrieval/artifacts.ts";
import { searchBm25 } from "../src/lib/transcript-retrieval/bm25.ts";
import { fuseCandidates, searchVectors } from "../src/lib/transcript-retrieval/ranking.ts";
import type { RetrievalEvalCase } from "../src/lib/transcript-retrieval/types.ts";

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

const root = process.cwd();
const coldStartAt = performance.now();
const artifacts = loadRetrievalArtifacts(root);
const coldStartMs = performance.now() - coldStartAt;
if (!artifacts.vectors || !artifacts.dimensions) throw new Error("Transcript retrieval embeddings are unavailable.");
const cases = JSON.parse(
  readFileSync(resolve(root, "tests/fixtures/transcript-retrieval-cases.json"), "utf8"),
) as RetrievalEvalCase[];
const measurements: number[] = [];
for (let iteration = 0; iteration < 5; iteration += 1) {
  cases.forEach((testCase, index) => {
    const queryOffset = ((iteration * cases.length + index) % artifacts.chunks.length) * artifacts.dimensions!;
    const queryVector = artifacts.vectors!.subarray(queryOffset, queryOffset + artifacts.dimensions!);
    const startedAt = performance.now();
    const bm25 = searchBm25(artifacts.bm25, testCase.query, artifacts.chunksById, testCase.filters);
    const vector = searchVectors(
      queryVector,
      artifacts.vectors!,
      artifacts.chunks,
      artifacts.dimensions!,
      testCase.filters,
    );
    fuseCandidates(bm25, vector);
    measurements.push(performance.now() - startedAt);
  });
}
const report = {
  schema_version: "1.0",
  method: "Five local passes over the 12 frozen queries; document vectors stand in for query vectors so no provider is contacted.",
  cold_start_ms: Math.round(coldStartMs * 100) / 100,
  local_search_samples: measurements.length,
  local_search_latency_ms: {
    minimum: Math.round(Math.min(...measurements) * 100) / 100,
    median: Math.round(percentile(measurements, 0.5) * 100) / 100,
    p95: Math.round(percentile(measurements, 0.95) * 100) / 100,
    maximum: Math.round(Math.max(...measurements) * 100) / 100,
  },
};
const output = resolve(root, "reports/phase-3-latency.json");
const temporary = `${output}.tmp`;
writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
renameSync(temporary, output);
console.log(JSON.stringify(report, null, 2));
