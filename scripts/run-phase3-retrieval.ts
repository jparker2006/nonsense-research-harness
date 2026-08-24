import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { loadRetrievalArtifacts, type RetrievalManifest } from "../src/lib/transcript-retrieval/artifacts.ts";
import { searchBm25 } from "../src/lib/transcript-retrieval/bm25.ts";
import { buildEvaluationCase, summarizeEvaluation } from "../src/lib/transcript-retrieval/evaluation.ts";
import {
  embedTexts,
  PHASE_3_PROVIDER_LIMITS,
  Phase3ProviderError,
  rerankDocuments,
  type EmbeddingBatchResult,
  type RerankBatchResult,
} from "../src/lib/transcript-retrieval/providers.ts";
import { fuseCandidates, RANKING_POLICY, searchVectors } from "../src/lib/transcript-retrieval/ranking.ts";
import type { FusedCandidate, RetrievalChunk, RetrievalEvalCase } from "../src/lib/transcript-retrieval/types.ts";
import { Phase3UsageLedger } from "../src/lib/transcript-retrieval/usage-ledger.ts";

// Set to true after the approved evidence pass. This locks every paid command in this file.
export const PHASE_3_LIVE_SCRIPTS_LOCKED = true;

const root = process.cwd();
const apiKey = process.env.OPENROUTER_API_KEY ?? "";
const ledger = new Phase3UsageLedger(root);

function writeAtomic(path: string, data: string | Buffer) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, data, { mode: 0o600 });
  renameSync(temporary, path);
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertLiveScriptAuthority() {
  if (PHASE_3_LIVE_SCRIPTS_LOCKED) throw new Error("Phase 3 live-call scripts are locked.");
  if (process.env.PHASE3_EXECUTE_LIVE !== "approved") {
    throw new Error("PHASE3_EXECUTE_LIVE=approved is required. No provider request was sent.");
  }
  if (!apiKey.trim()) throw new Error("OPENROUTER_API_KEY is missing. No provider request was sent.");
}

function failureKind(error: unknown): string {
  return error instanceof Phase3ProviderError ? error.kind : "unexpected";
}

async function meteredEmbedding(purpose: string, inputs: string[]): Promise<EmbeddingBatchResult> {
  const config = PHASE_3_PROVIDER_LIMITS.embedding;
  const number = ledger.reserve({ purpose, kind: "embedding", model: config.model, provider: config.provider });
  const startedAt = performance.now();
  let result: EmbeddingBatchResult;
  try {
    result = await embedTexts(apiKey, inputs);
  } catch (error) {
    ledger.fail(number, failureKind(error), performance.now() - startedAt);
    throw error;
  }
  ledger.succeed(number, result.receipt);
  return result;
}

async function meteredRerank(
  purpose: string,
  query: string,
  documents: string[],
): Promise<RerankBatchResult> {
  const config = PHASE_3_PROVIDER_LIMITS.rerank;
  const number = ledger.reserve({ purpose, kind: "rerank", model: config.model, provider: config.provider });
  const startedAt = performance.now();
  let result: RerankBatchResult;
  try {
    result = await rerankDocuments(apiKey, query, documents, documents.length);
  } catch (error) {
    ledger.fail(number, failureKind(error), performance.now() - startedAt);
    throw error;
  }
  ledger.succeed(number, result.receipt);
  return result;
}

async function smoke() {
  const embedding = await meteredEmbedding("synthetic compatibility smoke", [
    "A synthetic sentence that contains no podcast transcript data.",
  ]);
  const rerank = await meteredRerank(
    "synthetic compatibility smoke",
    "Which synthetic note mentions a clock?",
    ["A harmless note about a clock.", "A harmless note about a garden."],
  );
  console.log(JSON.stringify({
    status: "passed",
    embedding_dimensions: embedding.vectors[0]?.length,
    embedding_receipt: embedding.receipt,
    rerank_results: rerank.results,
    rerank_receipt: rerank.receipt,
    cumulative: ledger.snapshot(),
  }, null, 2));
}

type CheckpointBatch = {
  chunk_ids: string[];
  dimensions: number;
  vectors: number[][];
};

type QueryCheckpoint = {
  case_ids: string[];
  dimensions: number;
  vectors: number[][];
  provider_latency_ms: number;
};

function loadCheckpoint(path: string): Map<string, number[]> {
  const byId = new Map<string, number[]>();
  if (!existsSync(path)) return byId;
  const text = readFileSync(path, "utf8").trim();
  if (!text) return byId;
  for (const line of text.split("\n")) {
    const batch = JSON.parse(line) as CheckpointBatch;
    if (batch.chunk_ids.length !== batch.vectors.length || batch.dimensions < 1) {
      throw new Error("Embedding checkpoint is malformed.");
    }
    batch.chunk_ids.forEach((id, index) => {
      const vector = batch.vectors[index];
      if (!vector || vector.length !== batch.dimensions || vector.some((value) => !Number.isFinite(value))) {
        throw new Error("Embedding checkpoint contains an invalid vector.");
      }
      if (byId.has(id)) throw new Error(`Embedding checkpoint contains duplicate chunk ID ${id}.`);
      byId.set(id, vector);
    });
  }
  return byId;
}

async function generateDocuments() {
  const artifacts = loadRetrievalArtifacts(root);
  if (artifacts.manifest.embedding.status === "ready") {
    throw new Error("Document embeddings are already complete; refusing to spend again.");
  }
  const checkpointPath = resolve(root, "data/retrieval/embeddings.checkpoint.jsonl");
  const checkpoint = loadCheckpoint(checkpointPath);
  const unknown = [...checkpoint.keys()].filter((id) => !artifacts.chunksById.has(id));
  if (unknown.length > 0) throw new Error("Embedding checkpoint refers to an unknown chunk ID.");

  const batches: RetrievalChunk[][] = [];
  for (let index = 0; index < artifacts.chunks.length; index += PHASE_3_PROVIDER_LIMITS.embedding.maxInputs) {
    batches.push(artifacts.chunks.slice(index, index + PHASE_3_PROVIDER_LIMITS.embedding.maxInputs));
  }
  const documentRequestStart = ledger.snapshot().provider_requests;
  let expectedDimensions: number | undefined;
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index]!;
    const missing = batch.filter((chunk) => !checkpoint.has(chunk.chunk_id));
    if (missing.length === 0) continue;
    if (missing.length !== batch.length) {
      throw new Error("Embedding checkpoint contains a partial batch; refusing ambiguous resume.");
    }
    const result = await meteredEmbedding(
      `document embedding batch ${index + 1} of ${batches.length}`,
      missing.map((chunk) => chunk.text),
    );
    const dimensions = result.vectors[0]?.length ?? 0;
    if (dimensions < 1 || result.vectors.some((vector) => vector.length !== dimensions)) {
      throw new Error("Provider returned inconsistent document embedding dimensions.");
    }
    if (expectedDimensions !== undefined && dimensions !== expectedDimensions) {
      throw new Error("Embedding dimensions changed between provider batches.");
    }
    expectedDimensions = dimensions;
    const record: CheckpointBatch = {
      chunk_ids: missing.map((chunk) => chunk.chunk_id),
      dimensions,
      vectors: result.vectors,
    };
    appendFileSync(checkpointPath, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    record.chunk_ids.forEach((id, vectorIndex) => checkpoint.set(id, record.vectors[vectorIndex]!));
  }

  if (checkpoint.size !== artifacts.chunks.length) throw new Error("Document embedding output is incomplete.");
  const vectors = artifacts.chunks.map((chunk) => checkpoint.get(chunk.chunk_id));
  if (vectors.some((vector) => !vector)) throw new Error("Document embedding order cannot be reconstructed.");
  const dimensions = vectors[0]?.length ?? 0;
  if (dimensions < 1 || vectors.some((vector) => vector!.length !== dimensions)) {
    throw new Error("Document embedding dimensions are inconsistent.");
  }
  const packed = new Float32Array(artifacts.chunks.length * dimensions);
  vectors.forEach((vector, index) => packed.set(vector!, index * dimensions));
  if (packed.some((value) => !Number.isFinite(value))) throw new Error("Packed embedding contains a non-finite value.");
  const embeddingsBuffer = Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength);
  const embeddingsPath = resolve(root, "data/retrieval/embeddings.f32");
  writeAtomic(embeddingsPath, embeddingsBuffer);

  const after = ledger.snapshot();
  const documentEvents = after.events.slice(documentRequestStart).filter((event) =>
    event.purpose.startsWith("document embedding batch "),
  );
  const manifestPath = resolve(root, "data/retrieval/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as RetrievalManifest;
  manifest.embedding = {
    ...manifest.embedding,
    status: "ready",
    dimensions,
    generation: {
      request_count: documentEvents.length,
      input_count: artifacts.chunks.length,
      total_tokens: documentEvents.every((event) => event.total_tokens !== null)
        ? documentEvents.reduce((sum, event) => sum + event.total_tokens!, 0)
        : null,
      cost_usd: documentEvents.reduce((sum, event) => sum + event.cost_usd, 0),
    },
  };
  manifest.artifacts.embeddings = {
    path: "data/retrieval/embeddings.f32",
    bytes: embeddingsBuffer.byteLength,
    sha256: sha256(embeddingsBuffer),
  };
  writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  unlinkSync(checkpointPath);
  loadRetrievalArtifacts(root);
  console.log(JSON.stringify({
    status: "passed",
    chunks: artifacts.chunks.length,
    requests: documentEvents.length,
    dimensions,
    bytes: embeddingsBuffer.byteLength,
    sha256: manifest.artifacts.embeddings.sha256,
    cumulative: after,
  }, null, 2));
}

function toReranked(fused: FusedCandidate[], results: RerankBatchResult["results"]): FusedCandidate[] {
  return [...results]
    .sort((left, right) => right.relevanceScore - left.relevanceScore || left.index - right.index)
    .filter((item) => item.relevanceScore >= RANKING_POLICY.minimumRerankScore)
    .flatMap((item) => {
      const candidate = fused[item.index];
      return candidate ? [{ ...candidate, rerank_score: item.relevanceScore }] : [];
    });
}

function frozenCases(): RetrievalEvalCase[] {
  const cases = JSON.parse(
    readFileSync(resolve(root, "tests/fixtures/transcript-retrieval-cases.json"), "utf8"),
  ) as RetrievalEvalCase[];
  if (cases.length !== 12) throw new Error("The frozen retrieval evaluation must contain 12 cases.");
  return cases;
}

async function prepareEvaluationQueries() {
  const artifacts = loadRetrievalArtifacts(root);
  if (!artifacts.vectors || !artifacts.dimensions) throw new Error("Generate document embeddings before evaluation.");
  const cases = frozenCases();
  const checkpointPath = resolve(root, "data/retrieval/evaluation-query-vectors.checkpoint.json");
  let checkpoint: QueryCheckpoint;
  if (existsSync(checkpointPath)) {
    checkpoint = JSON.parse(readFileSync(checkpointPath, "utf8")) as QueryCheckpoint;
  } else {
    const queryEmbedding = await meteredEmbedding(
      "frozen 12-case query embedding evaluation",
      cases.map((item) => item.query),
    );
    checkpoint = {
      case_ids: cases.map((item) => item.id),
      dimensions: artifacts.dimensions,
      vectors: queryEmbedding.vectors,
      provider_latency_ms: queryEmbedding.receipt.latencyMs,
    };
    writeAtomic(checkpointPath, `${JSON.stringify(checkpoint)}\n`);
  }
  if (
    checkpoint.dimensions !== artifacts.dimensions ||
    checkpoint.case_ids.join("\0") !== cases.map((item) => item.id).join("\0") ||
    checkpoint.vectors.length !== cases.length ||
    checkpoint.vectors.some((vector) =>
      vector.length !== artifacts.dimensions || vector.some((value) => !Number.isFinite(value)),
    )
  ) throw new Error("Evaluation query-vector checkpoint is malformed or drifted.");

  const diagnostics = cases.map((testCase, index) => {
    const bm25 = searchBm25(artifacts.bm25, testCase.query, artifacts.chunksById, testCase.filters)
      .filter((item) => item.score >= RANKING_POLICY.minimumBm25Score);
    const allVector = searchVectors(
      checkpoint.vectors[index]!,
      artifacts.vectors!,
      artifacts.chunks,
      artifacts.dimensions!,
      testCase.filters,
      25,
      -1,
    );
    const acceptedVector = allVector.filter((item) => item.score >= RANKING_POLICY.minimumVectorScore);
    const fused = fuseCandidates(bm25, acceptedVector);
    const expectedVector = allVector.find((item) =>
      testCase.expected_segment_ids.includes(artifacts.chunksById.get(item.chunk_id)?.segment_id ?? ""),
    );
    return {
      id: testCase.id,
      category: testCase.category,
      bm25_top_score: bm25[0]?.score ?? null,
      vector_top_score: allVector[0]?.score ?? null,
      expected_vector_rank_in_top_25: expectedVector?.rank ?? null,
      expected_vector_score_in_top_25: expectedVector?.score ?? null,
      fused_top_5_segment_ids: fused.slice(0, 5).map((item) => artifacts.chunksById.get(item.chunk_id)?.segment_id),
    };
  });
  const report = {
    schema_version: "1.0",
    ranking_policy: RANKING_POLICY,
    query_embedding_latency_ms: checkpoint.provider_latency_ms,
    diagnostics,
  };
  writeAtomic(resolve(root, "reports/phase-3-local-evaluation.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

async function evaluate() {
  const coldStartAt = performance.now();
  const artifacts = loadRetrievalArtifacts(root);
  const coldStartMs = performance.now() - coldStartAt;
  if (!artifacts.vectors || !artifacts.dimensions) throw new Error("Generate document embeddings before evaluation.");
  const cases = frozenCases();
  const checkpointPath = resolve(root, "data/retrieval/evaluation-query-vectors.checkpoint.json");
  if (!existsSync(checkpointPath)) {
    throw new Error("Run the query-vector checkpoint and local evaluation before reranking.");
  }
  const queryEmbedding = JSON.parse(readFileSync(checkpointPath, "utf8")) as QueryCheckpoint;
  if (
    queryEmbedding.dimensions !== artifacts.dimensions ||
    queryEmbedding.case_ids.join("\0") !== cases.map((item) => item.id).join("\0") ||
    queryEmbedding.vectors.length !== cases.length ||
    queryEmbedding.vectors.some((vector) =>
      vector.length !== artifacts.dimensions || vector.some((value) => !Number.isFinite(value)),
    )
  ) {
    throw new Error("Evaluation query-vector checkpoint is malformed or drifted.");
  }

  const caseResults = [];
  const localStartedAt = performance.now();
  for (let index = 0; index < cases.length; index += 1) {
    const testCase = cases[index]!;
    const bm25 = searchBm25(artifacts.bm25, testCase.query, artifacts.chunksById, testCase.filters)
      .filter((item) => item.score >= RANKING_POLICY.minimumBm25Score);
    const vector = searchVectors(
      queryEmbedding.vectors[index]!,
      artifacts.vectors,
      artifacts.chunks,
      artifacts.dimensions,
      testCase.filters,
    );
    const fused = fuseCandidates(bm25, vector);
    let reranked: FusedCandidate[] = [];
    if (fused.length > 0) {
      const result = await meteredRerank(
        `frozen evaluation case ${testCase.id}`,
        testCase.query,
        fused.map((item) => artifacts.chunksById.get(item.chunk_id)?.text ?? ""),
      );
      reranked = toReranked(fused, result.results);
    }
    caseResults.push(buildEvaluationCase({
      testCase,
      artifacts,
      queryVector: queryEmbedding.vectors[index]!,
      reranked,
    }));
  }
  const localAndProviderLoopMs = performance.now() - localStartedAt;
  const metrics = summarizeEvaluation(caseResults);
  const rerankerRetained =
    (metrics.reranked.conceptual.mean_reciprocal_rank ?? 0) > (metrics.fused.conceptual.mean_reciprocal_rank ?? 0) &&
    metrics.reranked.exact.recall_at_5 === metrics.fused.exact.recall_at_5 &&
    metrics.reranked.filter.recall_at_5 === metrics.fused.filter.recall_at_5;
  const defaultMode = rerankerRetained ? "reranked" : "fused";
  const acceptance = {
    exact_recall_at_5: metrics[defaultMode].exact.recall_at_5 === 1,
    filter_recall_at_5: metrics[defaultMode].filter.recall_at_5 === 1,
    conceptual_recall_at_5: (metrics[defaultMode].conceptual.recall_at_5 ?? 0) >= 0.8,
    fusion_no_exact_filter_regression:
      metrics.fused.exact.recall_at_5 === metrics.bm25.exact.recall_at_5 &&
      metrics.fused.filter.recall_at_5 === metrics.bm25.filter.recall_at_5,
    absent_default_no_match: caseResults
      .filter((item) => item.category === "absent")
      .every((item) => item.modes[defaultMode].segment_ids.length === 0),
  };

  const manifestPath = resolve(root, "data/retrieval/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as RetrievalManifest;
  manifest.reranker.status = rerankerRetained ? "retained" : "removed";
  writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const usage = ledger.snapshot();
  const report = {
    schema_version: "1.0",
    frozen_case_count: cases.length,
    ranking_policy: RANKING_POLICY,
    metrics,
    cases: caseResults,
    reranker_decision: rerankerRetained ? "retained" : "removed",
    reranker_rule: "Retain only for strictly higher conceptual MRR with no exact/filter Recall@5 regression; ties remove.",
    acceptance,
    latency: {
      cold_start_ms: Math.round(coldStartMs * 100) / 100,
      evaluation_loop_including_provider_ms: Math.round(localAndProviderLoopMs * 100) / 100,
      query_embedding_ms: queryEmbedding.provider_latency_ms,
    },
    usage: {
      provider_requests: usage.provider_requests,
      cumulative_cost_usd: usage.cumulative_cost_usd,
    },
  };
  writeAtomic(resolve(root, "reports/phase-3-evaluation.json"), `${JSON.stringify(report, null, 2)}\n`);
  unlinkSync(checkpointPath);
  console.log(JSON.stringify(report, null, 2));
  if (Object.values(acceptance).some((passed) => !passed)) {
    throw new Error("Frozen Phase 3 retrieval acceptance did not pass; inspect the preserved evaluation report.");
  }
}

assertLiveScriptAuthority();
const command = process.argv[2];
if (command === "smoke") await smoke();
else if (command === "documents") await generateDocuments();
else if (command === "queries") await prepareEvaluationQueries();
else if (command === "evaluate") await evaluate();
else throw new Error("Expected one command: smoke, documents, queries, or evaluate.");
