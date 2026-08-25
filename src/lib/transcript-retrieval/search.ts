import { searchBm25 } from "./bm25.ts";
import { loadRetrievalArtifacts, type RetrievalArtifacts } from "./artifacts.ts";
import { embedTexts, rerankDocuments } from "./providers.ts";
import type { ProviderReceipt } from "./providers.ts";
import { fuseCandidates, RANKING_POLICY, searchVectors } from "./ranking.ts";
import type {
  FusedCandidate,
  OpenTranscriptChunkResult,
  TranscriptSearchFilters,
  TranscriptSearchMatch,
  TranscriptSearchResult,
} from "./types.ts";

export type TranscriptProvider = {
  embedQuery(query: string): Promise<number[]>;
  rerank(query: string, documents: string[]): Promise<Array<{ index: number; relevanceScore: number }>>;
};

export function createOpenRouterTranscriptProvider(
  apiKey: string,
  onReceipt?: (receipt: ProviderReceipt) => void,
  signal?: AbortSignal,
): TranscriptProvider {
  return {
    async embedQuery(query) {
      const result = await embedTexts(apiKey, [query], fetch, signal);
      onReceipt?.(result.receipt);
      return result.vectors[0] ?? [];
    },
    async rerank(query, documents) {
      const result = await rerankDocuments(apiKey, query, documents, documents.length, fetch, signal);
      onReceipt?.(result.receipt);
      return result.results;
    },
  };
}

export const RERANK_RUNTIME_ENABLED = true;

function validateInput(query: string, limit: number) {
  const trimmed = query.trim();
  if (trimmed.length < 2 || trimmed.length > 500) {
    throw new Error("Transcript query must contain between 2 and 500 characters.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new Error("Transcript result limit must be an integer between 1 and 10.");
  }
  return trimmed;
}

function makeMatches(
  candidates: FusedCandidate[],
  artifacts: RetrievalArtifacts,
  limit: number,
  reranked: boolean,
): TranscriptSearchMatch[] {
  return candidates.slice(0, limit).flatMap((candidate, index) => {
    const chunk = artifacts.chunksById.get(candidate.chunk_id);
    if (!chunk) return [];
    return [
      {
        chunk_id: chunk.chunk_id,
        segment_id: chunk.segment_id,
        episode_id: chunk.episode_id,
        title: chunk.title,
        published_at: chunk.published_at,
        season: chunk.season,
        episode_number: chunk.episode_number,
        episode_format: chunk.episode_format,
        corpus_role: chunk.corpus_role,
        segment_role: chunk.segment_role,
        chapter_label_raw: chunk.chapter_label_raw,
        start_seconds: chunk.start_seconds,
        end_seconds: chunk.end_seconds,
        excerpt: chunk.text.slice(0, RANKING_POLICY.maximumExcerptCharacters),
        score_provenance: {
          bm25_rank: candidate.bm25_rank,
          vector_rank: candidate.vector_rank,
          fused_rank: candidate.fused_rank,
          rerank_rank: reranked ? index + 1 : undefined,
        },
      },
    ];
  });
}

function bm25AsFused(
  query: string,
  artifacts: RetrievalArtifacts,
  filters: TranscriptSearchFilters,
): FusedCandidate[] {
  return searchBm25(artifacts.bm25, query, artifacts.chunksById, filters)
    .filter((candidate) => candidate.score >= RANKING_POLICY.minimumBm25Score)
    .map((candidate) => ({
      chunk_id: candidate.chunk_id,
      bm25_rank: candidate.rank,
      bm25_score: candidate.score,
      fused_score: 1 / (RANKING_POLICY.reciprocalRankConstant + candidate.rank),
    }));
}

export class TranscriptRetrievalService {
  readonly artifacts: RetrievalArtifacts;
  readonly provider?: TranscriptProvider;

  constructor(options: { root?: string; provider?: TranscriptProvider; artifacts?: RetrievalArtifacts } = {}) {
    this.artifacts = options.artifacts ?? loadRetrievalArtifacts(options.root);
    this.provider = options.provider;
  }

  openTranscriptChunk(chunkId: string): OpenTranscriptChunkResult {
    const chunk = this.artifacts.chunksById.get(chunkId);
    return chunk ? { status: "complete", chunk } : { status: "not_found", chunk_id: chunkId };
  }

  async searchTranscripts(input: {
    query: string;
    filters?: TranscriptSearchFilters;
    limit?: number;
  }): Promise<TranscriptSearchResult> {
    const limit = input.limit ?? 6;
    const query = validateInput(input.query, limit);
    const filters = input.filters ?? {};
    const bm25 = searchBm25(this.artifacts.bm25, query, this.artifacts.chunksById, filters);
    const keywordCandidates = bm25AsFused(query, this.artifacts, filters);

    if (!this.provider || !this.artifacts.vectors || !this.artifacts.dimensions) {
      if (keywordCandidates.length === 0) {
        return { retrieval_status: "no_match", query, matches: [], reason: "No keyword match cleared the relevance threshold." };
      }
      return {
        retrieval_status: "keyword_only",
        query,
        matches: makeMatches(keywordCandidates, this.artifacts, limit, false),
        reason: "Semantic retrieval was unavailable; results use the local BM25 index.",
      };
    }

    let queryVector: number[];
    try {
      queryVector = await this.provider.embedQuery(query);
    } catch {
      if (keywordCandidates.length === 0) {
        return { retrieval_status: "unavailable", query, matches: [], reason: "Semantic retrieval failed and no keyword match cleared the threshold." };
      }
      return {
        retrieval_status: "keyword_only",
        query,
        matches: makeMatches(keywordCandidates, this.artifacts, limit, false),
        reason: "Semantic retrieval failed; results use the local BM25 index.",
      };
    }

    const vector = searchVectors(
      queryVector,
      this.artifacts.vectors,
      this.artifacts.chunks,
      this.artifacts.dimensions,
      filters,
    );
    const fused = fuseCandidates(bm25, vector);
    if (fused.length === 0) {
      return { retrieval_status: "no_match", query, matches: [], reason: "No archive match cleared the relevance threshold." };
    }
    if (!RERANK_RUNTIME_ENABLED) {
      return {
        retrieval_status: "hybrid_unreranked",
        query,
        matches: makeMatches(fused, this.artifacts, limit, false),
        reason: "The evaluated runtime uses deterministic BM25 and vector rank fusion without reranking.",
      };
    }

    try {
      const reranked = await this.provider.rerank(
        query,
        fused.map((candidate) => this.artifacts.chunksById.get(candidate.chunk_id)?.text ?? ""),
      );
      const ordered = reranked
        .sort((left, right) => right.relevanceScore - left.relevanceScore || left.index - right.index)
        .filter((item) => item.relevanceScore >= RANKING_POLICY.minimumRerankScore)
        .flatMap((item): FusedCandidate[] => {
          const candidate = fused[item.index];
          return candidate ? [{ ...candidate, rerank_score: item.relevanceScore }] : [];
        });
      if (ordered.length === 0) {
        return { retrieval_status: "no_match", query, matches: [], reason: "No reranked archive match cleared the relevance threshold." };
      }
      return {
        retrieval_status: "complete",
        query,
        matches: makeMatches(ordered, this.artifacts, limit, true),
      };
    } catch {
      return {
        retrieval_status: "hybrid_unreranked",
        query,
        matches: makeMatches(fused, this.artifacts, limit, false),
        reason: "Reranking failed; results use deterministic BM25 and vector rank fusion.",
      };
    }
  }
}
