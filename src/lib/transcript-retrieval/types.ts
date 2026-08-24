export type EpisodeRecord = {
  schema_version: string;
  episode_id: string;
  season: number;
  episode_number: number | null;
  title: string;
  published_at: string;
  duration_seconds: number;
  episode_format: string;
  corpus_role: string;
};

export type SegmentRecord = {
  schema_version: string;
  segment_id: string;
  episode_id: string;
  season: number;
  episode_number: number | null;
  title: string;
  episode_format: string;
  corpus_role: string;
  segment_index: number;
  start_seconds: number;
  end_seconds: number;
  chapter_label_raw: string | null;
  segment_role: string;
  boundary_source: string;
  cue_count: number;
  word_count: number;
  text: string;
  speaker_labels_present?: boolean;
};

export type RetrievalChunk = {
  schema_version: "1.0";
  chunk_id: string;
  chunk_index: number;
  segment_id: string;
  episode_id: string;
  season: number;
  episode_number: number | null;
  title: string;
  published_at: string;
  episode_format: string;
  corpus_role: string;
  segment_role: string;
  chapter_label_raw: string | null;
  start_seconds: number;
  end_seconds: number;
  start_char: number;
  end_char: number;
  word_count: number;
  text: string;
};

export type TranscriptSearchFilters = {
  season?: number;
  episode_format?: string;
  corpus_role?: string;
  segment_role?: string;
};

export type RetrievalStatus =
  | "complete"
  | "hybrid_unreranked"
  | "keyword_only"
  | "no_match"
  | "unavailable";

export type CandidateScore = {
  chunk_id: string;
  rank: number;
  score: number;
};

export type FusedCandidate = {
  chunk_id: string;
  bm25_rank?: number;
  bm25_score?: number;
  vector_rank?: number;
  vector_score?: number;
  fused_score: number;
  fused_rank?: number;
  rerank_score?: number;
};

export type TranscriptSearchMatch = {
  chunk_id: string;
  segment_id: string;
  episode_id: string;
  title: string;
  published_at: string;
  season: number;
  episode_number: number | null;
  episode_format: string;
  corpus_role: string;
  segment_role: string;
  chapter_label_raw: string | null;
  start_seconds: number;
  end_seconds: number;
  excerpt: string;
  score_provenance: {
    bm25_rank?: number;
    vector_rank?: number;
    fused_rank?: number;
    rerank_rank?: number;
  };
};

export type TranscriptSearchResult = {
  retrieval_status: RetrievalStatus;
  query: string;
  matches: TranscriptSearchMatch[];
  reason?: string;
};

export type OpenTranscriptChunkResult =
  | {
      status: "complete";
      chunk: RetrievalChunk;
    }
  | {
      status: "not_found";
      chunk_id: string;
    };

export type RetrievalEvalCase = {
  id: string;
  category: "exact" | "conceptual" | "filter" | "absent";
  query: string;
  filters?: TranscriptSearchFilters;
  expected_segment_ids: string[];
};
