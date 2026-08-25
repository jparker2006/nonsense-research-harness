import {
  artifactSourceSchema,
  type EvidenceSource,
  type Phase5Artifact,
  type Phase5Input,
} from "../phase5/contracts.ts";
import type { Phase5ModelAdapter, Phase5ModelReceipt } from "../phase5/model.ts";
import type { Phase5ToolAdapter, Phase5WorkflowDependencies } from "../phase5/workflow.ts";
import type { RetrievalChunk } from "../transcript-retrieval/types.ts";
import { PHASE_6_FROZEN_HEADLINES_CASE } from "./frozen-case.ts";

const WEB_URL = PHASE_6_FROZEN_HEADLINES_CASE.links[0];
const WEB_ID = "web_fixture_bonneville";
const CHUNK_ID = "chunk_fixture_archive";

const chunk: RetrievalChunk = {
  schema_version: "1.0",
  chunk_id: CHUNK_ID,
  chunk_index: 0,
  segment_id: "segment_fixture_archive",
  episode_id: "episode_fixture_archive",
  season: 4,
  episode_number: 12,
  title: "Fixture archive segment about landscapes and memory",
  published_at: "2026-01-01T00:00:00.000Z",
  episode_format: "headlines",
  corpus_role: "core",
  segment_role: "headline_item",
  chapter_label_raw: "Headline",
  start_seconds: 120,
  end_seconds: 180,
  start_char: 0,
  end_char: 151,
  word_count: 23,
  text: "A vanished thing can still dictate the shape of everything around it. The landscape remembers what disappeared long after the water is gone.",
};

function receipt(model: string, cost: number): Phase5ModelReceipt {
  return {
    model,
    provider: model.startsWith("openai/") ? "OpenAI" : "xAI",
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
    cost_usd: cost,
    latency_ms: 12,
    generation_id: "gen_phase6_fixture",
    finish_reason: "stop",
    response_characters: 400,
    output_status: "parsed",
    reasoning_tokens: 0,
  };
}

async function pause(signal?: AbortSignal, milliseconds = 90) {
  if (signal?.aborted) throw new Error("phase5_run_stopped");
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new Error("phase5_run_stopped"));
    }, { once: true });
  });
}

function artifact(input: Phase5Input, evidence: EvidenceSource[]): Phase5Artifact {
  const usable = evidence.filter((source) => source.evidence_usable);
  const web = usable.find((source) => source.source_type !== "archive") ?? usable[0]!;
  const archive = usable.find((source) => source.source_type === "archive");
  const sourceIds = [web.source_id];
  const timed = (priority: "must_have" | "use_if_time" | "cut_first", text: string, minutes: number) => ({
    priority,
    text,
    source_ids: sourceIds,
    ...(input.target_minutes === undefined ? {} : { estimated_minutes: minutes }),
  });
  const past = archive
    ? {
        status: "matches" as const,
        items: [{
          source_id: archive.source_id,
          episode_id: archive.episode_id!,
          segment_id: archive.segment_id!,
          chunk_id: archive.chunk_id!,
          quote: "A vanished thing can still dictate the shape of everything around it.",
        }],
      }
    : { status: "no_relevant_archive_match" as const, items: [] };
  const ledger = usable.map((source) => artifactSourceSchema.parse(source));
  if (input.mode === "headlines") {
    const each = input.target_minutes === undefined ? 1 : input.target_minutes / 3;
    return {
      mode: "headlines",
      working_title: "The lake that vanished but never really left",
      what_happened: { text: "Lake Bonneville disappeared thousands of years ago, but its shorelines still mark mountains across the Great Basin.", source_ids: sourceIds },
      why_it_matters_now: { text: "The old lake makes a huge geological story visible in ordinary modern landscapes.", source_ids: sourceIds },
      verified_facts: [{ text: "Visible shoreline terraces preserve the former lake levels.", source_ids: sourceIds }],
      tension_or_argument: { text: "Is the vanished lake a relic, or is it still the main character shaping how the region works?", source_ids: sourceIds },
      surprising_details: [{ text: "A missing body of water can remain legible at the scale of an entire mountain range.", source_ids: sourceIds }],
      past_nonsense_coverage: past,
      conversation_questions: ["What other absent thing still controls the present?", "Does seeing the old shoreline change how permanent a landscape feels?"],
      flexible_outline: [
        timed("must_have", "Start with the absurd visual: a bathtub ring across mountains.", each),
        timed("use_if_time", "Explain how the shoreline survived after the lake did not.", each),
        timed("cut_first", "Save secondary Great Basin examples if the clock gets tight.", each),
      ],
      uncertainties_and_open_checks: ["Fixture facts are illustrative; use live mode for current research."],
      source_ledger: ledger,
    };
  }
  const each = input.target_minutes === undefined ? 1 : input.target_minutes / 4;
  return {
    mode: "big_story",
    working_title: "The landscape that remembers a vanished lake",
    core_question: "How can something absent remain the organizing force of a place?",
    research_brief: { text: "Lake Bonneville connects geological time, climate, and the evidence hidden in familiar landscapes.", source_ids: sourceIds },
    research_cards: [
      { role: "background", text: "The Great Basin held a much larger lake in the past.", source_ids: sourceIds },
      { role: "key_evidence", text: "Shoreline terraces remain visible on surrounding mountains.", source_ids: sourceIds },
      { role: "force", text: "Climate and drainage changes transformed the lake.", source_ids: sourceIds },
      { role: "interpretation", text: "Absence can be physically legible rather than merely historical.", source_ids: sourceIds },
      { role: "surprise", text: "A bathtub-ring analogy explains a regional geological feature.", source_ids: sourceIds },
      { role: "recommendation_lead", text: "A visual geology documentary could extend the subject.", source_ids: sourceIds },
    ],
    past_nonsense_coverage: past,
    conversation_questions: ["What counts as gone if the evidence is everywhere?", "Which modern choices still follow the old lake?"],
    modular_outline: [
      timed("must_have", "Orient the listener to the old lake.", each),
      timed("must_have", "Read the shoreline evidence in the landscape.", each),
      timed("use_if_time", "Connect absence to regional identity.", each),
      timed("cut_first", "Hold extra geological examples for time.", each),
    ],
    uncertainties_and_open_checks: ["Fixture facts are illustrative; use live mode for current research."],
    source_ledger: ledger,
  };
}

export function createPhase6FixtureDependencies(signal?: AbortSignal): Phase5WorkflowDependencies {
  const model: Phase5ModelAdapter = {
    async plan(_input, options) {
      await pause(options?.signal, 100);
      return {
        value: { web_queries: ["NASA Lake Bonneville ancient shoreline"], archive_queries: ["vanished lake landscape memory"] },
        receipt: receipt("openai/gpt-5.6-luna", 0),
        output_status: "parsed",
      };
    },
    async compose(input, _plan, evidence, options) {
      await pause(options?.signal, 130);
      return { value: artifact(input, evidence), receipt: receipt("x-ai/grok-4.6", 0), output_status: "parsed" };
    },
    async repair(input, _plan, evidence, _artifact, _errors, options) {
      await pause(options?.signal, 80);
      return { value: artifact(input, evidence), receipt: receipt("x-ai/grok-4.6", 0), output_status: "parsed" };
    },
  };
  const tools: Phase5ToolAdapter = {
    async webSearch() {
      await pause(signal);
      return {
        status: "complete",
        query: "NASA Lake Bonneville ancient shoreline",
        sources: [{
          source_id: WEB_ID,
          source_kind: "search_candidate",
          availability: "candidate",
          url: WEB_URL,
          title: "Lake Bonneville: A Lake That Was",
          excerpt: "A fixture candidate for the interface proof.",
          retrieved_at: "2026-08-24T08:00:00.000Z",
          trust: "untrusted_external_content",
          evidence_usable: false,
          receipt: {},
        }],
        retrieved_at: "2026-08-24T08:00:00.000Z",
        receipt: { provider_model: "fixture", provider_name: "fixture", total_tokens: 0, cost_usd: 0, web_search_proof: "citations_and_request_bound" },
      };
    },
    async readUrl() {
      await pause(signal);
      return {
        source_id: WEB_ID,
        source_kind: "retrieved_page",
        availability: "complete",
        url: WEB_URL,
        requested_url: WEB_URL,
        final_url: WEB_URL,
        title: "Lake Bonneville: A Lake That Was",
        excerpt: "Lake Bonneville once covered much of the Great Basin; former shorelines remain visible on mountains.",
        text: "Lake Bonneville once covered much of the Great Basin. Former shorelines remain visible as terraces on mountains, preserving evidence of vanished water levels.",
        retrieved_at: "2026-08-24T08:00:00.000Z",
        trust: "untrusted_external_content",
        evidence_usable: true,
        receipt: { http_status: 200, http_requests: 1 },
      };
    },
    async searchTranscripts() {
      await pause(signal);
      return {
        result: {
          retrieval_status: "keyword_only",
          query: "vanished lake landscape memory",
          matches: [{
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
            excerpt: chunk.text,
            score_provenance: { bm25_rank: 1 },
          }],
          reason: "Fixture uses deterministic keyword retrieval.",
        },
        receipts: [{
          model: "fixture/keyword-only",
          provider: "fixture",
          latencyMs: 0,
          usage: { prompt_tokens: 0, total_tokens: 0 },
          reportedCostUsd: 0,
          calculatedCostUsd: 0,
        }],
      };
    },
    openTranscriptChunk(input) {
      return input.chunk_id === CHUNK_ID ? { status: "complete", chunk } : { status: "not_found", chunk_id: input.chunk_id };
    },
  };
  return { model, tools, signal };
}
