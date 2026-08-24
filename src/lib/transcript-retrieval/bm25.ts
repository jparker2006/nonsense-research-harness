import MiniSearch, { type Options, type SearchOptions } from "minisearch";
import type {
  CandidateScore,
  RetrievalChunk,
  TranscriptSearchFilters,
} from "./types.ts";

type IndexedChunk = {
  chunk_id: string;
  text: string;
  title: string;
  chapter_label_raw: string;
  segment_role: string;
};

export const BM25_CANDIDATE_LIMIT = 25;

export const MINI_SEARCH_OPTIONS: Options<IndexedChunk> = {
  idField: "chunk_id",
  fields: ["text", "title", "chapter_label_raw", "segment_role"],
  storeFields: ["chunk_id"],
  searchOptions: {
    boost: { title: 3, chapter_label_raw: 2, segment_role: 1.5, text: 1 },
    prefix: true,
    fuzzy: 0.15,
    weights: { fuzzy: 0.25, prefix: 0.6 },
  },
};

export function buildBm25Index(chunks: RetrievalChunk[]): MiniSearch<IndexedChunk> {
  const index = new MiniSearch<IndexedChunk>(MINI_SEARCH_OPTIONS);
  index.addAll(
    chunks.map((chunk) => ({
      chunk_id: chunk.chunk_id,
      text: chunk.text,
      title: chunk.title,
      chapter_label_raw: chunk.chapter_label_raw ?? "",
      segment_role: chunk.segment_role,
    })),
  );
  return index;
}

export function loadBm25Index(serialized: string): MiniSearch<IndexedChunk> {
  return MiniSearch.loadJSON<IndexedChunk>(serialized, MINI_SEARCH_OPTIONS);
}

export function matchesFilters(chunk: RetrievalChunk, filters: TranscriptSearchFilters = {}): boolean {
  return (
    (filters.season === undefined || chunk.season === filters.season) &&
    (filters.episode_format === undefined || chunk.episode_format === filters.episode_format) &&
    (filters.corpus_role === undefined || chunk.corpus_role === filters.corpus_role) &&
    (filters.segment_role === undefined || chunk.segment_role === filters.segment_role)
  );
}

export function searchBm25(
  index: MiniSearch<IndexedChunk>,
  query: string,
  chunksById: Map<string, RetrievalChunk>,
  filters: TranscriptSearchFilters = {},
  limit = BM25_CANDIDATE_LIMIT,
): CandidateScore[] {
  const searchOptions: SearchOptions = {
    filter: (result) => {
      const chunk = chunksById.get(String(result.id));
      return chunk ? matchesFilters(chunk, filters) : false;
    },
  };
  return index
    .search(query, searchOptions)
    .slice(0, Math.min(limit, BM25_CANDIDATE_LIMIT))
    .map((result, index_) => ({
      chunk_id: String(result.id),
      rank: index_ + 1,
      score: result.score,
    }));
}
