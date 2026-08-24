import { matchesFilters } from "./bm25.ts";
import type {
  CandidateScore,
  FusedCandidate,
  RetrievalChunk,
  TranscriptSearchFilters,
} from "./types.ts";

export const RANKING_POLICY = Object.freeze({
  vectorCandidateLimit: 25,
  fusionCandidateLimit: 20,
  reciprocalRankConstant: 60,
  minimumBm25Score: 12,
  minimumVectorScore: 0.3,
  minimumRerankScore: 0.1,
  maximumExcerptCharacters: 1_600,
});

function cosineAt(query: ArrayLike<number>, vectors: Float32Array, offset: number, dimensions: number) {
  let dot = 0;
  let queryNorm = 0;
  let documentNorm = 0;
  for (let dimension = 0; dimension < dimensions; dimension += 1) {
    const queryValue = query[dimension] ?? 0;
    const documentValue = vectors[offset + dimension] ?? 0;
    dot += queryValue * documentValue;
    queryNorm += queryValue * queryValue;
    documentNorm += documentValue * documentValue;
  }
  if (queryNorm === 0 || documentNorm === 0) return -1;
  return dot / (Math.sqrt(queryNorm) * Math.sqrt(documentNorm));
}

export function searchVectors(
  queryVector: ArrayLike<number>,
  vectors: Float32Array,
  chunks: RetrievalChunk[],
  dimensions: number,
  filters: TranscriptSearchFilters = {},
  limit = RANKING_POLICY.vectorCandidateLimit,
  minimumScore = RANKING_POLICY.minimumVectorScore,
): CandidateScore[] {
  if (queryVector.length !== dimensions) throw new Error("Query embedding dimension mismatch.");
  if (vectors.length !== chunks.length * dimensions) throw new Error("Document embedding artifact is incomplete.");
  return chunks
    .map((chunk, index) => ({
      chunk_id: chunk.chunk_id,
      score: matchesFilters(chunk, filters)
        ? cosineAt(queryVector, vectors, index * dimensions, dimensions)
        : -1,
    }))
    .filter((candidate) => candidate.score >= minimumScore)
    .sort((left, right) => right.score - left.score || left.chunk_id.localeCompare(right.chunk_id))
    .slice(0, Math.min(limit, RANKING_POLICY.vectorCandidateLimit))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

export function fuseCandidates(
  bm25: CandidateScore[],
  vector: CandidateScore[],
  limit = RANKING_POLICY.fusionCandidateLimit,
): FusedCandidate[] {
  const byId = new Map<string, FusedCandidate>();
  for (const candidate of bm25) {
    const item = byId.get(candidate.chunk_id) ?? { chunk_id: candidate.chunk_id, fused_score: 0 };
    item.bm25_rank = candidate.rank;
    item.bm25_score = candidate.score;
    item.fused_score += 1 / (RANKING_POLICY.reciprocalRankConstant + candidate.rank);
    byId.set(candidate.chunk_id, item);
  }
  for (const candidate of vector) {
    const item = byId.get(candidate.chunk_id) ?? { chunk_id: candidate.chunk_id, fused_score: 0 };
    item.vector_rank = candidate.rank;
    item.vector_score = candidate.score;
    item.fused_score += 1 / (RANKING_POLICY.reciprocalRankConstant + candidate.rank);
    byId.set(candidate.chunk_id, item);
  }
  return [...byId.values()]
    .sort(
      (left, right) =>
        right.fused_score - left.fused_score || left.chunk_id.localeCompare(right.chunk_id),
    )
    .slice(0, Math.min(limit, RANKING_POLICY.fusionCandidateLimit))
    .map((candidate, index) => ({ ...candidate, fused_rank: index + 1 }));
}
