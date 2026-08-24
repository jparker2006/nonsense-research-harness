import {
  artifactSourceSchema,
  type EvidenceSource,
  type Phase5Artifact,
  type Phase5Input,
  type ResearchPlan,
} from "../src/lib/phase5/contracts.ts";
import type {
  Phase5ModelAdapter,
  Phase5ModelOutputStatus,
  Phase5ModelReceipt,
} from "../src/lib/phase5/model.ts";
import type { Phase5ToolAdapter } from "../src/lib/phase5/workflow.ts";
import type { RetrievalChunk, TranscriptSearchResult } from "../src/lib/transcript-retrieval/types.ts";
import type { WebSearchResult, WebSourceRecord } from "../src/lib/web-research/types.ts";

export const FIXTURE_WEB_URL = "https://example.com/current-story";
export const FIXTURE_WEB_SOURCE_ID = "web_fixture_current";
export const FIXTURE_CHUNK_ID = "chunk_fixture_archive";
export const FIXTURE_ARCHIVE_SOURCE_ID = `archive_${FIXTURE_CHUNK_ID}`;

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
  text:
    "Older systems survive because replacement means rebuilding every dependency around them. The useful argument is whether maintenance is wisdom or fear of change.",
};

export function fixturePage(availability: "complete" | "unavailable" = "complete"): WebSourceRecord {
  const usable = availability === "complete";
  return {
    source_id: FIXTURE_WEB_SOURCE_ID,
    source_kind: "retrieved_page",
    availability,
    url: FIXTURE_WEB_URL,
    requested_url: FIXTURE_WEB_URL,
    final_url: FIXTURE_WEB_URL,
    title: usable ? "A current story about old infrastructure" : null,
    excerpt: usable
      ? "A public agency kept an old system because replacement would break compatible equipment."
      : null,
    text: usable
      ? "A public agency kept an old system because replacement would break compatible equipment. The decision is current, documented, and more complicated than simple resistance to change."
      : undefined,
    retrieved_at: "2026-08-24T08:00:00.000Z",
    trust: "untrusted_external_content",
    evidence_usable: usable,
    receipt: usable ? { http_status: 200, http_requests: 1 } : {},
    failure: usable ? undefined : { code: "network_unavailable", message: "Fixture source unavailable." },
  };
}

export function fixtureSearch(): WebSearchResult {
  return {
    status: "complete",
    query: "current old infrastructure replacement",
    sources: [
      {
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
      },
    ],
    retrieved_at: "2026-08-24T08:00:00.000Z",
    receipt: {
      provider_model: "x-ai/grok-4.6",
      provider_name: "xAI",
      prompt_tokens: 200,
      completion_tokens: 50,
      total_tokens: 250,
      cost_usd: 0.01,
      web_search_proof: "citations_and_request_bound",
    },
  };
}

export const fixtureTranscriptSearch: TranscriptSearchResult = {
  retrieval_status: "keyword_only",
  query: "old technology replacement",
  matches: [
    {
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
    },
  ],
  reason: "Fixture uses deterministic keyword retrieval.",
};

export const fixturePlan: ResearchPlan = {
  web_queries: ["current old infrastructure replacement"],
  archive_queries: ["old technology replacement"],
};

function ledger(evidence: EvidenceSource[]) {
  return evidence.map((source) => artifactSourceSchema.parse(source));
}

export function validArtifact(input: Phase5Input, evidence: EvidenceSource[]): Phase5Artifact {
  const usable = evidence.filter((source) => source.evidence_usable);
  const web = usable.find((source) => source.source_type !== "archive") ?? usable[0]!;
  const archive = usable.find((source) => source.source_type === "archive");
  const fixtureQuote = "Older systems survive because replacement means rebuilding every dependency around them.";
  const archiveText = archive?.content ?? archive?.excerpt ?? "";
  const exactArchiveQuote = archiveText.includes(fixtureQuote) ? fixtureQuote : archiveText.slice(0, 400);
  const archiveCoverage = archive
    ? {
        status: "matches" as const,
        items: [
          {
            source_id: archive.source_id,
            episode_id: archive.episode_id!,
            segment_id: archive.segment_id!,
            chunk_id: archive.chunk_id!,
            quote: exactArchiveQuote,
          },
        ],
      }
    : { status: "no_relevant_archive_match" as const, items: [] };
  const sourceIds = [web.source_id];
  const timed = (priority: "must_have" | "use_if_time" | "cut_first", text: string, minutes: number) => ({
    priority,
    text,
    source_ids: sourceIds,
    ...(input.target_minutes === undefined ? {} : { estimated_minutes: minutes }),
  });
  if (input.mode === "headlines") {
    const each = input.target_minutes === undefined ? 1 : input.target_minutes / 3;
    return {
      mode: "headlines",
      working_title: "When old systems refuse to retire",
      what_happened: { text: "A current institution kept an old system because its dependencies remain costly to replace.", source_ids: sourceIds },
      why_it_matters_now: { text: "The case turns replacement into a tradeoff rather than an automatic upgrade.", source_ids: sourceIds },
      verified_facts: [{ text: "Replacement would affect compatible surrounding equipment.", source_ids: sourceIds }],
      tension_or_argument: { text: "Maintenance can look like prudence or institutional fear.", source_ids: sourceIds },
      surprising_details: [{ text: "The surrounding dependencies matter more than the old component itself.", source_ids: sourceIds }],
      past_nonsense_coverage: archiveCoverage,
      conversation_questions: ["When does maintenance become avoidance?", "What would make replacement worth the disruption?"],
      flexible_outline: [
        timed("must_have", "Establish the current case and dependency problem.", each),
        timed("use_if_time", "Connect the case to prior archive discussion.", each),
        timed("cut_first", "List secondary examples only if the clock allows.", each),
      ],
      uncertainties_and_open_checks: ["The long-term replacement cost remains uncertain."],
      source_ledger: ledger(evidence),
    };
  }
  const each = input.target_minutes === undefined ? 1 : input.target_minutes / 4;
  return {
    mode: "big_story",
    working_title: "The systems behind the system",
    core_question: "Why do obsolete systems survive rational attempts to replace them?",
    research_brief: {
      text: "The story connects technical dependencies, institutional incentives, and the cost of transition.",
      source_ids: sourceIds,
    },
    research_cards: [
      { role: "background", text: "The current example follows a longer pattern of dependency-driven survival.", source_ids: sourceIds },
      { role: "key_evidence", text: "Compatible surrounding equipment raises the replacement burden.", source_ids: sourceIds },
      { role: "force", text: "Operators must balance continuity against modernization.", source_ids: sourceIds },
      { role: "interpretation", text: "Continued maintenance can be a rational continuity strategy or a way to defer transition costs.", source_ids: sourceIds },
      { role: "surprise", text: "The allegedly obsolete component may be the least expensive part of the system.", source_ids: sourceIds },
      { role: "recommendation_lead", text: "A documented history of infrastructure transitions could extend the topic.", source_ids: sourceIds },
    ],
    past_nonsense_coverage: archiveCoverage,
    conversation_questions: ["Which dependency actually controls the decision?", "Who bears the transition cost?"],
    modular_outline: [
      timed("must_have", "Orient the listener to the current example.", each),
      timed("must_have", "Map the dependency chain.", each),
      timed("use_if_time", "Compare competing explanations.", each),
      timed("cut_first", "Hold extra examples for time.", each),
    ],
    uncertainties_and_open_checks: ["The total transition cost needs additional verification."],
    source_ledger: ledger(evidence),
  };
}

const modelReceipt = (model: string, cost: number): Phase5ModelReceipt => ({
  model,
  provider: model.startsWith("openai/") ? "OpenAI" : "xAI",
  prompt_tokens: 100,
  completion_tokens: 50,
  total_tokens: 150,
  cost_usd: cost,
  latency_ms: 10,
  generation_id: "gen_fixture",
  finish_reason: "stop",
  response_characters: 100,
  output_status: "parsed",
  reasoning_tokens: 10,
});

export function fixtureModel(options: {
  plan?: ResearchPlan;
  compose?: (input: Phase5Input, evidence: EvidenceSource[]) => unknown;
  repair?: (input: Phase5Input, evidence: EvidenceSource[]) => unknown;
  planCost?: number;
  planStatus?: Phase5ModelOutputStatus;
  composeStatus?: Phase5ModelOutputStatus;
  repairStatus?: Phase5ModelOutputStatus;
} = {}): Phase5ModelAdapter {
  return {
    async plan() {
      return {
        value: options.plan ?? fixturePlan,
        receipt: {
          ...modelReceipt("openai/gpt-5.6-luna", options.planCost ?? 0.001),
          output_status: options.planStatus ?? "parsed",
        },
        output_status: options.planStatus ?? "parsed",
      };
    },
    async compose(input, _plan, evidence) {
      return {
        value: options.compose?.(input, evidence) ?? validArtifact(input, evidence),
        receipt: {
          ...modelReceipt("x-ai/grok-4.6", 0.01),
          output_status: options.composeStatus ?? "parsed",
        },
        output_status: options.composeStatus ?? "parsed",
      };
    },
    async repair(input, _plan, evidence) {
      return {
        value: options.repair?.(input, evidence) ?? validArtifact(input, evidence),
        receipt: {
          ...modelReceipt("x-ai/grok-4.6", 0.01),
          output_status: options.repairStatus ?? "parsed",
        },
        output_status: options.repairStatus ?? "parsed",
      };
    },
  };
}

export function fixtureTools(options: {
  pageAvailability?: "complete" | "unavailable";
  search?: WebSearchResult;
  transcript?: TranscriptSearchResult;
  onCall?: (tool: keyof Phase5ToolAdapter) => void;
} = {}): Phase5ToolAdapter {
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
        ? { status: "complete", chunk: fixtureChunk }
        : { status: "not_found", chunk_id: input.chunk_id };
    },
  };
}
