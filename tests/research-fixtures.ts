import type { ResearchTools } from "../src/lib/research/tools.ts";
import type { RetrievalChunk, TranscriptSearchResult } from "../src/lib/transcript-retrieval/types.ts";
import type { WebSearchResult, WebSourceRecord } from "../src/lib/web-research/types.ts";

export const FIXTURE_WEB_URL = "https://example.com/current-story";
export const FIXTURE_WEB_SOURCE_ID = "web_fixture_current";
export const FIXTURE_CHUNK_ID = "chunk_fixture_archive";

export const fixtureChunk: RetrievalChunk = {
  schema_version: "1.0",
  chunk_id: FIXTURE_CHUNK_ID,
  chunk_index: 0,
  segment_id: "segment_fixture_archive",
  episode_id: "episode_fixture_archive",
  season: 4,
  episode_number: 12,
  title: "Fixture episode about stubborn systems",
  published_at: "2026-01-01T00:00:00.000Z",
  episode_format: "big_story",
  corpus_role: "core",
  segment_role: "main_story",
  chapter_label_raw: "Main Story",
  start_seconds: 120,
  end_seconds: 180,
  start_char: 0,
  end_char: 176,
  word_count: 27,
  text: "Older systems survive because replacement means rebuilding every dependency around them. The useful argument is whether maintenance is wisdom or fear of change.",
};

function fixturePage(availability: "complete" | "unavailable" = "complete"): WebSourceRecord {
  const usable = availability === "complete";
  return {
    source_id: FIXTURE_WEB_SOURCE_ID,
    source_kind: "retrieved_page",
    availability,
    url: FIXTURE_WEB_URL,
    requested_url: FIXTURE_WEB_URL,
    final_url: FIXTURE_WEB_URL,
    title: usable ? "A current story about old infrastructure" : null,
    excerpt: usable ? "A public agency kept an old system because replacement would break compatible equipment." : null,
    text: usable ? "A public agency kept an old system because replacement would break compatible equipment. The decision is current, documented, and more complicated than simple resistance to change." : undefined,
    retrieved_at: "2026-08-24T08:00:00.000Z",
    trust: "untrusted_external_content",
    evidence_usable: usable,
    receipt: usable ? { http_status: 200, http_requests: 1 } : {},
    failure: usable ? undefined : { code: "network_unavailable", message: "Fixture source unavailable." },
  };
}

function fixtureSearch(): WebSearchResult {
  return {
    status: "complete",
    query: "current old infrastructure replacement",
    sources: [{
      source_id: FIXTURE_WEB_SOURCE_ID,
      source_kind: "search_candidate",
      availability: "candidate",
      url: FIXTURE_WEB_URL,
      title: "A current story about old infrastructure",
      excerpt: "A current public example.",
      retrieved_at: "2026-08-24T08:00:00.000Z",
      trust: "untrusted_external_content",
      evidence_usable: false,
      receipt: {},
    }],
    retrieved_at: "2026-08-24T08:00:00.000Z",
    receipt: { provider_name: "Exa", web_search_requests: 1, attempts: 1, cost_usd: 0.01 },
  };
}

const fixtureTranscriptSearch: TranscriptSearchResult = {
  retrieval_status: "keyword_only",
  query: "old technology replacement",
  matches: [{
    chunk_id: fixtureChunk.chunk_id,
    segment_id: fixtureChunk.segment_id,
    episode_id: fixtureChunk.episode_id,
    title: fixtureChunk.title,
    published_at: fixtureChunk.published_at,
    season: fixtureChunk.season,
    episode_number: fixtureChunk.episode_number,
    episode_format: fixtureChunk.episode_format,
    corpus_role: fixtureChunk.corpus_role,
    segment_role: fixtureChunk.segment_role,
    chapter_label_raw: fixtureChunk.chapter_label_raw,
    start_seconds: fixtureChunk.start_seconds,
    end_seconds: fixtureChunk.end_seconds,
    excerpt: fixtureChunk.text,
    score_provenance: { bm25_rank: 1 },
  }],
  reason: "Fixture uses deterministic keyword retrieval.",
};

export function fixtureTools(options: {
  pageAvailability?: "complete" | "unavailable";
  search?: WebSearchResult;
  transcript?: TranscriptSearchResult;
  onCall?: (tool: keyof ResearchTools) => void;
} = {}): ResearchTools {
  return {
    async webSearch() {
      options.onCall?.("webSearch");
      return options.search ?? fixtureSearch();
    },
    async readUrl() {
      options.onCall?.("readUrl");
      return fixturePage(options.pageAvailability);
    },
    async searchTranscripts() {
      options.onCall?.("searchTranscripts");
      return { result: options.transcript ?? fixtureTranscriptSearch };
    },
    openTranscriptChunk(input) {
      options.onCall?.("openTranscriptChunk");
      return input.chunk_id === FIXTURE_CHUNK_ID
        ? { status: "complete", chunk: fixtureChunk, adjacent_chunks: [] }
        : { status: "not_found", chunk_id: input.chunk_id };
    },
  };
}
