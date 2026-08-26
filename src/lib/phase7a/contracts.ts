import type { UIMessage } from "ai";
import { z } from "zod";
import {
  artifactSourceSchema,
  evidenceSourceSchema,
  phase5UsageSchema,
} from "../phase5/contracts.ts";
import { phase7aArtifactSchema as phase7aPreparationArtifactSchema, type Phase7AArtifact } from "./artifact.ts";

export const PHASE_7A_LIMITS = Object.freeze({
  maxRequestBytes: 24_000,
  maxSessionIdCharacters: 96,
  maxMessageCharacters: 12_000,
  maxControllerTurns: 10,
  maxProviderRequests: 20,
  maxWebSearches: 3,
  maxUrlReads: 8,
  maxTranscriptSearches: 2,
  maxTranscriptOpens: 6,
  maxGrokTurns: 2,
  maxCompositions: 1,
  maxRepairs: 1,
  maxEvidenceSources: 24,
  maxCandidates: 18,
  maxTranscriptMatches: 18,
  maxConversationTurns: 24,
  maxActivityEvents: 100,
  maxBatchTargets: 3,
  maxNotebookCompletedSteps: 12,
  maxNotebookEvidenceGaps: 8,
  maxRunTraces: 8,
  maxSessions: 8,
  sessionTtlMs: 6 * 60 * 60 * 1_000,
  wholeTurnTimeoutMs: 300_000,
  costCapUsd: 1,
  liveProofTotalCostCapUsd: 2,
  automaticRetries: 0,
});

export const phase7aRequestSchema = z.object({
  action: z.literal("message"),
  session_id: z.string().trim().min(8).max(PHASE_7A_LIMITS.maxSessionIdCharacters),
  message: z.string().trim().min(1).max(PHASE_7A_LIMITS.maxMessageCharacters),
  research_depth: z.enum(["standard", "deep"]),
}).strict();

const publicSummary = z.string().trim().min(1).max(180);

export const phase7aActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("web_search"),
    public_summary: publicSummary,
    query: z.string().trim().min(3).max(300),
  }).strict(),
  z.object({
    action: z.literal("read_url"),
    public_summary: publicSummary,
    url: z.string().url().max(2_000),
  }).strict(),
  z.object({
    action: z.literal("read_urls"),
    public_summary: publicSummary,
    urls: z.array(z.string().url().max(2_000)).min(1).max(PHASE_7A_LIMITS.maxBatchTargets),
  }).strict(),
  z.object({
    action: z.literal("search_transcripts"),
    public_summary: publicSummary,
    query: z.string().trim().min(2).max(500),
  }).strict(),
  z.object({
    action: z.literal("open_transcript_chunk"),
    public_summary: publicSummary,
    chunk_id: z.string().trim().min(3).max(160),
  }).strict(),
  z.object({
    action: z.literal("open_transcript_chunks"),
    public_summary: publicSummary,
    chunk_ids: z.array(z.string().trim().min(3).max(160)).min(1).max(PHASE_7A_LIMITS.maxBatchTargets),
  }).strict(),
  z.object({
    action: z.literal("create_artifact"),
    public_summary: publicSummary,
    mode: z.enum(["headlines", "big_story"]),
    topic: z.string().trim().min(3).max(300),
    instruction: z.string().trim().max(1_200).default(""),
  }).strict(),
  z.object({
    action: z.literal("respond"),
    public_summary: publicSummary,
    blocks: z.array(z.object({
      text: z.string().trim().min(1).max(2_000),
      source_ids: z.array(z.string().trim().min(3).max(180)).max(8),
    }).strict()).min(1).max(12),
  }).strict(),
]);

export const phase7aResearchStateSchema = z.object({
  objective: z.string().trim().min(1).max(500),
  completed_steps: z.array(z.string().trim().min(1).max(240)).max(PHASE_7A_LIMITS.maxNotebookCompletedSteps),
  evidence_gaps: z.array(z.string().trim().min(1).max(240)).max(PHASE_7A_LIMITS.maxNotebookEvidenceGaps),
  next_step: z.string().trim().min(1).max(300),
}).strict();

// Provider structured-output schemas are most portable when the root is one
// strict object with every key present. The conditional action contract is
// enforced after parsing this transport shape.
export const phase7aControllerOutputSchema = z.object({
  action: z.enum(["web_search", "read_url", "read_urls", "search_transcripts", "open_transcript_chunk", "open_transcript_chunks", "create_artifact", "respond"])
    .describe("Exactly one allowed controller action."),
  public_summary: publicSummary.describe("A short user-visible description of the selected action."),
  argument: z.string().max(5_000)
    .describe("The query, single URL, single chunk ID, artifact topic, or response. Use an empty string for batch actions."),
  arguments: z.array(z.string().trim().min(1).max(2_000)).max(PHASE_7A_LIMITS.maxBatchTargets)
    .describe("One to three URLs or chunk IDs for a batch action. Use an empty array otherwise."),
  mode: z.enum(["headlines", "big_story"]).nullable()
    .describe("Artifact mode for create_artifact; null otherwise."),
  instruction: z.string().max(1_200)
    .describe("Extra artifact instructions for create_artifact; an empty string otherwise."),
  response_blocks: z.array(z.object({
    text: z.string().trim().min(1).max(2_000),
    source_ids: z.array(z.string().trim().min(3).max(180)).max(8),
  }).strict()).max(12)
    .describe("Natural answer paragraphs with claim-level retrieved citations for respond; an empty array otherwise."),
  research_state: phase7aResearchStateSchema.describe("Concise public operational research state, never private reasoning."),
}).strict();

export const phase7aControllerDecisionSchema = z.object({
  action: phase7aActionSchema,
  research_state: phase7aResearchStateSchema,
}).strict();

export function phase7aControllerOutputToDecision(value: z.infer<typeof phase7aControllerOutputSchema>): Phase7AControllerDecision {
  const common = { action: value.action, public_summary: value.public_summary };
  let action: Phase7AAction;
  if (value.action === "web_search" || value.action === "search_transcripts") {
    action = phase7aActionSchema.parse({ ...common, query: value.argument });
  } else if (value.action === "read_url") {
    action = phase7aActionSchema.parse({ ...common, url: value.argument });
  } else if (value.action === "read_urls") {
    action = phase7aActionSchema.parse({ ...common, urls: value.arguments });
  } else if (value.action === "open_transcript_chunk") {
    action = phase7aActionSchema.parse({ ...common, chunk_id: value.argument });
  } else if (value.action === "open_transcript_chunks") {
    action = phase7aActionSchema.parse({ ...common, chunk_ids: value.arguments });
  } else if (value.action === "create_artifact") {
    action = phase7aActionSchema.parse({
      ...common,
      mode: value.mode,
      topic: value.argument,
      instruction: value.instruction,
    });
  } else {
    action = phase7aActionSchema.parse({ ...common, blocks: value.response_blocks });
  }
  return phase7aControllerDecisionSchema.parse({ action, research_state: value.research_state });
}

export const phase7aConversationTurnSchema = z.object({
  turn_id: z.string().max(160),
  role: z.enum(["user", "assistant"]),
  text: z.string().max(PHASE_7A_LIMITS.maxMessageCharacters),
  source_ids: z.array(z.string().max(180)).max(8).default([]),
  created_at: z.string(),
});

export const phase7aCandidateSchema = z.object({
  source_id: z.string().max(180),
  url: z.string().url(),
  title: z.string().max(300).nullable(),
  excerpt: z.string().max(1_200).nullable(),
  query: z.string().max(300),
});

export const phase7aTranscriptMatchSchema = z.object({
  chunk_id: z.string().max(160),
  episode_id: z.string().max(160),
  segment_id: z.string().max(160),
  title: z.string().max(300),
  season: z.number().int(),
  episode_number: z.number().int().nullable(),
  excerpt: z.string().max(1_200),
  query: z.string().max(500),
});

export const phase7aCountsSchema = z.object({
  controller_turns: z.number().int().nonnegative(),
  provider_requests: z.number().int().nonnegative(),
  grok_turns: z.number().int().nonnegative(),
  web_searches: z.number().int().nonnegative(),
  url_reads: z.number().int().nonnegative(),
  transcript_searches: z.number().int().nonnegative(),
  transcript_opens: z.number().int().nonnegative(),
  compositions: z.number().int().nonnegative(),
  repairs: z.number().int().nonnegative(),
});

export const phase7aActivitySchema = z.object({
  id: z.string().max(160),
  run_id: z.string().max(160),
  kind: z.enum(["run", "agent", "tool", "composition", "validation", "artifact"]),
  label: z.string().trim().min(1).max(180),
  detail: z.string().max(300),
  status: z.enum(["running", "complete", "partial", "unavailable", "stopped", "failed"]),
  tool: z.enum(["web_search", "read_url", "search_transcripts", "open_transcript_chunk"]).optional(),
  created_at: z.string(),
});

export const phase7aTraceStepSchema = z.object({
  sequence: z.number().int().positive(),
  action: z.enum(["web_search", "read_url", "read_urls", "search_transcripts", "open_transcript_chunk", "open_transcript_chunks", "create_artifact", "respond"]),
  public_summary: publicSummary,
  target: z.string().max(500),
  observation: z.string().max(500),
  status: z.enum(["complete", "partial", "failed"]),
}).strict();

export const phase7aControllerFailureSchema = z.object({
  code: z.string().regex(/^phase7a_controller_[a-z0-9_]+$/),
  stage: z.enum(["completion", "json", "transport", "action"]),
  issues: z.array(z.string().max(160)).max(8),
  generation_id: z.string().max(180).optional(),
  provider: z.string().max(180).optional(),
  finish_reason: z.string().max(80).optional(),
  response_characters: z.number().int().nonnegative(),
}).strict();

export const phase7aRunTraceSchema = z.object({
  run_id: z.string().max(160),
  research_depth: z.enum(["standard", "deep"]),
  started_at: z.string(),
  completed_at: z.string(),
  status: z.enum(["complete", "partial", "stopped", "failed"]),
  steps: z.array(phase7aTraceStepSchema).max(PHASE_7A_LIMITS.maxControllerTurns),
  counts: phase7aCountsSchema,
  accounted_cost_usd: z.number().min(0).max(PHASE_7A_LIMITS.costCapUsd),
  source_ids: z.array(z.string().max(180)).max(PHASE_7A_LIMITS.maxEvidenceSources),
  artifact_revision: z.number().int().nonnegative(),
  limitations: z.array(z.string().max(240)).max(20),
  controller_failure: phase7aControllerFailureSchema.nullable().default(null),
}).strict();

export const phase7aWorkspaceSchema = z.object({
  session_id: z.string().min(8).max(PHASE_7A_LIMITS.maxSessionIdCharacters),
  turns: z.array(phase7aConversationTurnSchema).max(PHASE_7A_LIMITS.maxConversationTurns),
  evidence: z.array(evidenceSourceSchema).max(PHASE_7A_LIMITS.maxEvidenceSources),
  candidates: z.array(phase7aCandidateSchema).max(PHASE_7A_LIMITS.maxCandidates),
  transcript_matches: z.array(phase7aTranscriptMatchSchema).max(PHASE_7A_LIMITS.maxTranscriptMatches),
  web_queries: z.array(z.string().max(300)).max(12),
  archive_queries: z.array(z.string().max(500)).max(8),
  research_state: phase7aResearchStateSchema.nullable(),
  run_traces: z.array(phase7aRunTraceSchema).max(PHASE_7A_LIMITS.maxRunTraces),
  artifact: phase7aPreparationArtifactSchema.nullable(),
  artifact_revision: z.number().int().nonnegative(),
  updated_at_ms: z.number().nonnegative(),
});

export const phase7aAssistantMessageSchema = z.object({
  message_id: z.string().max(160),
  run_id: z.string().max(160),
  text: z.string().trim().min(1).max(5_000),
  source_ids: z.array(z.string().max(180)).max(8),
  blocks: z.array(z.object({
    text: z.string().trim().min(1).max(2_000),
    source_ids: z.array(z.string().max(180)).max(8),
  }).strict()).min(1).max(12),
  created_at: z.string(),
});

export const phase7aSourceSchema = artifactSourceSchema;

export const phase7aRunSchema = z.object({
  session_id: z.string(),
  run_id: z.string(),
  state: z.enum(["running", "complete", "partial", "stopped", "failed"]),
  summary: z.string().trim().min(1).max(300),
});

export const phase7aArtifactSchema = z.object({
  run_id: z.string(),
  revision: z.number().int().positive(),
  artifact: phase7aPreparationArtifactSchema,
});

export const phase7aReceiptSchema = z.object({
  run_id: z.string(),
  status: z.enum(["complete", "partial", "stopped", "failed"]),
  counts: phase7aCountsSchema,
  accounted_cost_usd: z.number().min(0).max(PHASE_7A_LIMITS.costCapUsd),
  elapsed_ms: z.number().nonnegative(),
  limitations: z.array(z.string().max(240)).max(20),
  artifact_revision: z.number().int().nonnegative(),
});

export const phase7aErrorSchema = z.object({
  run_id: z.string().max(160).optional(),
  code: z.string().regex(/^phase7a_[a-z0-9_]+$/),
  message: z.string().min(1).max(300),
  retryable: z.boolean(),
});

export const phase7aTurnResultSchema = z.object({
  run_id: z.string(),
  status: z.enum(["complete", "partial", "stopped", "failed"]),
  assistant_message: phase7aAssistantMessageSchema.nullable(),
  artifact: phase7aPreparationArtifactSchema.nullable(),
  artifact_revision: z.number().int().nonnegative(),
  events: z.array(phase7aActivitySchema).max(PHASE_7A_LIMITS.maxActivityEvents),
  usage: z.array(phase5UsageSchema).max(PHASE_7A_LIMITS.maxProviderRequests),
  counts: phase7aCountsSchema,
  accounted_cost_usd: z.number().min(0).max(PHASE_7A_LIMITS.costCapUsd),
  elapsed_ms: z.number().nonnegative(),
  limitations: z.array(z.string().max(240)).max(20),
  trace: phase7aRunTraceSchema,
  workspace: phase7aWorkspaceSchema,
});

export type Phase7ARequest = z.infer<typeof phase7aRequestSchema>;
export type Phase7AResearchDepth = Phase7ARequest["research_depth"];
export type Phase7AAction = z.infer<typeof phase7aActionSchema>;
export type Phase7AResearchState = z.infer<typeof phase7aResearchStateSchema>;
export type Phase7AControllerDecision = z.infer<typeof phase7aControllerDecisionSchema>;
export type Phase7AConversationTurn = z.infer<typeof phase7aConversationTurnSchema>;
export type Phase7ACandidate = z.infer<typeof phase7aCandidateSchema>;
export type Phase7ATranscriptMatch = z.infer<typeof phase7aTranscriptMatchSchema>;
export type Phase7ACounts = z.infer<typeof phase7aCountsSchema>;
export type Phase7AActivity = z.infer<typeof phase7aActivitySchema>;
export type Phase7ARunTrace = z.infer<typeof phase7aRunTraceSchema>;
export type Phase7AControllerFailure = z.infer<typeof phase7aControllerFailureSchema>;
export type Phase7AWorkspace = z.infer<typeof phase7aWorkspaceSchema>;
export type Phase7AAssistantMessage = z.infer<typeof phase7aAssistantMessageSchema>;
export type Phase7ASource = z.infer<typeof phase7aSourceSchema>;
export type Phase7ARun = z.infer<typeof phase7aRunSchema>;
export type Phase7AReceipt = z.infer<typeof phase7aReceiptSchema>;
export type Phase7AError = z.infer<typeof phase7aErrorSchema>;
export type Phase7ATurnResult = z.infer<typeof phase7aTurnResultSchema>;
export type { Phase7AArtifact };

export type Phase7ADataParts = {
  activity: Phase7AActivity;
  artifact: z.infer<typeof phase7aArtifactSchema>;
  run: Phase7ARun;
  receipt: Phase7AReceipt;
  error: Phase7AError;
  message: Phase7AAssistantMessage;
  source: Phase7ASource;
};

export type Phase7AUIMessage = UIMessage<unknown, Phase7ADataParts>;

export function parsePhase7AEnvelope(value: unknown): Phase7ARequest {
  if (!value || typeof value !== "object") throw new Error("phase7a_invalid_request");
  const candidate = value as Record<string, unknown>;
  return phase7aRequestSchema.parse(candidate.phase7a ?? candidate);
}
