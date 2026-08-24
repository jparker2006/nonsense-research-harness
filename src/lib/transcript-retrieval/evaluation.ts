import { searchBm25 } from "./bm25.ts";
import type { RetrievalArtifacts } from "./artifacts.ts";
import { fuseCandidates, RANKING_POLICY, searchVectors } from "./ranking.ts";
import type { FusedCandidate, RetrievalEvalCase } from "./types.ts";

export type EvaluationMode = "bm25" | "vector" | "fused" | "reranked";

export type EvaluationCaseResult = {
  id: string;
  category: RetrievalEvalCase["category"];
  expected_segment_ids: string[];
  modes: Record<EvaluationMode, { segment_ids: string[]; reciprocal_rank: number }>;
};

function segmentIds(candidates: FusedCandidate[], artifacts: RetrievalArtifacts): string[] {
  return candidates.slice(0, 5).flatMap((item) => {
    const segmentId = artifacts.chunksById.get(item.chunk_id)?.segment_id;
    return segmentId ? [segmentId] : [];
  });
}

function reciprocalRank(expected: string[], returned: string[]): number {
  const index = returned.findIndex((segmentId) => expected.includes(segmentId));
  return index < 0 ? 0 : 1 / (index + 1);
}

function asFused(
  candidates: Array<{ chunk_id: string; rank: number; score: number }>,
  mode: "bm25" | "vector",
): FusedCandidate[] {
  return candidates.map((item) => ({
    chunk_id: item.chunk_id,
    fused_score: item.score,
    ...(mode === "bm25"
      ? { bm25_rank: item.rank, bm25_score: item.score }
      : { vector_rank: item.rank, vector_score: item.score }),
  }));
}

export function buildEvaluationCase(input: {
  testCase: RetrievalEvalCase;
  artifacts: RetrievalArtifacts;
  queryVector: number[];
  reranked: FusedCandidate[];
}): EvaluationCaseResult {
  const { testCase, artifacts, queryVector, reranked } = input;
  if (!artifacts.vectors || !artifacts.dimensions) throw new Error("Evaluation requires embeddings.");
  const bm25Raw = searchBm25(
    artifacts.bm25,
    testCase.query,
    artifacts.chunksById,
    testCase.filters,
  ).filter((item) => item.score >= RANKING_POLICY.minimumBm25Score);
  const vectorRaw = searchVectors(
    queryVector,
    artifacts.vectors,
    artifacts.chunks,
    artifacts.dimensions,
    testCase.filters,
  );
  const fused = fuseCandidates(bm25Raw, vectorRaw);
  const candidates: Record<EvaluationMode, FusedCandidate[]> = {
    bm25: asFused(bm25Raw, "bm25"),
    vector: asFused(vectorRaw, "vector"),
    fused,
    reranked,
  };
  return {
    id: testCase.id,
    category: testCase.category,
    expected_segment_ids: testCase.expected_segment_ids,
    modes: Object.fromEntries(
      (Object.entries(candidates) as Array<[EvaluationMode, FusedCandidate[]]>).map(([mode, items]) => {
        const returned = segmentIds(items, artifacts);
        return [mode, { segment_ids: returned, reciprocal_rank: reciprocalRank(testCase.expected_segment_ids, returned) }];
      }),
    ) as EvaluationCaseResult["modes"],
  };
}

export function summarizeEvaluation(cases: EvaluationCaseResult[]) {
  const categories = ["exact", "conceptual", "filter", "absent"] as const;
  const modes = ["bm25", "vector", "fused", "reranked"] as const;
  return Object.fromEntries(
    modes.map((mode) => [
      mode,
      Object.fromEntries(
        categories.map((category) => {
          const selected = cases.filter((item) => item.category === category);
          const reciprocalRanks = selected.map((item) => item.modes[mode].reciprocal_rank);
          return [category, {
            cases: selected.length,
            recall_at_5: selected.length === 0 ? null : reciprocalRanks.filter((rank) => rank > 0).length / selected.length,
            mean_reciprocal_rank: selected.length === 0 ? null : reciprocalRanks.reduce((sum, rank) => sum + rank, 0) / selected.length,
          }];
        }),
      ),
    ]),
  ) as Record<EvaluationMode, Record<(typeof categories)[number], { cases: number; recall_at_5: number | null; mean_reciprocal_rank: number | null }>>;
}
