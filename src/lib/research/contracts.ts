import type { UIMessage } from "ai";
import { z } from "zod";
import { artifactSourceSchema, evidenceSourceSchema, usageReceiptSchema } from "./content.ts";
import { researchArtifactSchema as preparationArtifactSchema, type ResearchArtifact } from "./artifact.ts";

export const RESEARCH_LIMITS = Object.freeze({
  maxRequestBytes: 24_000,
  maxSessionIdCharacters: 96,
  maxMessageCharacters: 12_000,
  maxProviderRequests: 120,
  maxEvidenceSources: 64,
  maxCandidates: 120,
  maxTranscriptMatches: 18,
  maxConversationTurns: 64,
  maxActivityEvents: 240,
  maxRunTraces: 8,
  maxSessions: 8,
  sessionTtlMs: 6 * 60 * 60 * 1_000,
  costCapUsd: 2,
});

export const researchDepthSchema = z.enum(["standard", "deep"]);

export const researchRequestSchema = z.object({
  action: z.literal("message"),
  session_id: z.string().trim().min(8).max(RESEARCH_LIMITS.maxSessionIdCharacters),
  message: z.string().trim().min(1).max(RESEARCH_LIMITS.maxMessageCharacters),
  research_depth: researchDepthSchema,
}).strict();

export const researchStateSchema = z.object({
  objective: z.string().trim().min(1).max(500),
  completed_steps: z.array(z.string().trim().min(1).max(240)).max(12),
  evidence_gaps: z.array(z.string().trim().min(1).max(240)).max(8),
  next_step: z.string().trim().min(1).max(300),
}).strict();

export const researchConversationTurnSchema = z.object({
  turn_id: z.string().max(160),
  role: z.enum(["user", "assistant"]),
  text: z.string().max(RESEARCH_LIMITS.maxMessageCharacters),
  source_ids: z.array(z.string().max(180)).max(12).default([]),
  created_at: z.string(),
});

export const researchCandidateSchema = z.object({
  source_id: z.string().max(180),
  url: z.string().url(),
  title: z.string().max(300).nullable(),
  excerpt: z.string().max(1_200).nullable(),
  byline: z.string().max(300).nullable().optional(),
  published_at: z.string().max(100).nullable().optional(),
  query: z.string().max(300),
});

export const researchTranscriptMatchSchema = z.object({
  chunk_id: z.string().max(160),
  episode_id: z.string().max(160),
  segment_id: z.string().max(160),
  title: z.string().max(300),
  season: z.number().int(),
  episode_number: z.number().int().nullable(),
  excerpt: z.string().max(1_200),
  query: z.string().max(500),
});

export const researchCountsSchema = z.object({
  agent_steps: z.number().int().nonnegative(),
  provider_requests: z.number().int().nonnegative(),
  model_requests: z.number().int().nonnegative().default(0),
  exa_search_requests: z.number().int().nonnegative().default(0),
  web_searches: z.number().int().nonnegative(),
  web_candidates: z.number().int().nonnegative().optional(),
  url_reads: z.number().int().nonnegative(),
  transcript_searches: z.number().int().nonnegative(),
  transcript_opens: z.number().int().nonnegative(),
  artifact_completions: z.number().int().nonnegative(),
  artifact_calls: z.number().int().nonnegative().default(0),
  repairs: z.number().int().nonnegative(),
});

export const researchActivitySchema = z.object({
  id: z.string().max(160),
  run_id: z.string().max(160),
  kind: z.enum(["run", "agent", "tool", "validation", "artifact"]),
  label: z.string().trim().min(1).max(180),
  detail: z.string().max(300),
  status: z.enum(["running", "complete", "limited", "no_match", "partial", "unavailable", "stopped", "failed"]),
  tool: z.enum(["web_search", "read_url", "search_transcripts", "open_transcript_chunk"]).optional(),
  created_at: z.string(),
});

const publicSummary = z.string().trim().min(1).max(180);

export const researchTraceStepSchema = z.object({
  sequence: z.number().int().positive(),
  action: z.enum([
    "set_research_goal",
    "web_search",
    "read_url",
    "read_urls",
    "search_transcripts",
    "open_transcript_chunk",
    "open_transcript_chunks",
    "create_artifact",
    "submit_answer",
  ]),
  public_summary: publicSummary,
  target: z.string().max(500),
  observation: z.string().max(500),
  status: z.enum(["complete", "partial", "failed"]),
}).strict();

export const researchRunTraceSchema = z.object({
  run_id: z.string().max(160),
  research_depth: researchDepthSchema,
  started_at: z.string(),
  completed_at: z.string(),
  status: z.enum(["complete", "partial", "stopped", "failed"]),
  steps: z.array(researchTraceStepSchema).max(24),
  counts: researchCountsSchema,
  accounted_cost_usd: z.number().min(0).max(RESEARCH_LIMITS.costCapUsd),
  source_ids: z.array(z.string().max(180)).max(RESEARCH_LIMITS.maxEvidenceSources),
  artifact_revision: z.number().int().nonnegative(),
  limitations: z.array(z.string().max(240)).max(20),
}).strict();

export const researchWorkspaceSchema = z.object({
  session_id: z.string().min(8).max(RESEARCH_LIMITS.maxSessionIdCharacters),
  turns: z.array(researchConversationTurnSchema).max(RESEARCH_LIMITS.maxConversationTurns),
  agent_messages: z.array(z.record(z.string(), z.unknown())).max(64).default([]),
  evidence: z.array(evidenceSourceSchema).max(RESEARCH_LIMITS.maxEvidenceSources),
  candidates: z.array(researchCandidateSchema).max(RESEARCH_LIMITS.maxCandidates),
  transcript_matches: z.array(researchTranscriptMatchSchema).max(RESEARCH_LIMITS.maxTranscriptMatches),
  web_queries: z.array(z.string().max(300)).max(24),
  archive_queries: z.array(z.string().max(500)).max(16),
  research_state: researchStateSchema.nullable(),
  run_traces: z.array(researchRunTraceSchema).max(RESEARCH_LIMITS.maxRunTraces),
  artifact: preparationArtifactSchema.nullable(),
  artifact_revision: z.number().int().nonnegative(),
  updated_at_ms: z.number().nonnegative(),
});

export const researchAssistantMessageSchema = z.object({
  message_id: z.string().max(160),
  run_id: z.string().max(160),
  text: z.string().trim().min(1).max(24_000),
  source_ids: z.array(z.string().max(180)).max(12),
  blocks: z.array(z.object({
    text: z.string().trim().min(1).max(2_000),
    source_ids: z.array(z.string().max(180)).max(12),
  }).strict()).min(1).max(12),
  created_at: z.string(),
});

export const researchSourceSchema = artifactSourceSchema;

export const researchRunSchema = z.object({
  session_id: z.string(),
  run_id: z.string(),
  state: z.enum(["running", "complete", "partial", "stopped", "failed"]),
  summary: z.string().trim().min(1).max(300),
});

export const researchArtifactEventSchema = z.object({
  run_id: z.string(),
  revision: z.number().int().positive(),
  artifact: preparationArtifactSchema,
});

export const researchReceiptSchema = z.object({
  run_id: z.string(),
  status: z.enum(["complete", "partial", "stopped", "failed"]),
  counts: researchCountsSchema,
  accounted_cost_usd: z.number().min(0).max(RESEARCH_LIMITS.costCapUsd),
  costs: z.object({
    luna_usd: z.number().min(0).max(RESEARCH_LIMITS.costCapUsd),
    exa_usd: z.number().min(0).max(RESEARCH_LIMITS.costCapUsd),
    retrieval_usd: z.number().min(0).max(RESEARCH_LIMITS.costCapUsd),
    combined_usd: z.number().min(0).max(RESEARCH_LIMITS.costCapUsd),
  }).strict().optional(),
  elapsed_ms: z.number().nonnegative(),
  limitations: z.array(z.string().max(240)).max(20),
  artifact_revision: z.number().int().nonnegative(),
});

export const researchErrorSchema = z.object({
  run_id: z.string().max(160).optional(),
  code: z.string().regex(/^research_[a-z0-9_:-]+$/),
  message: z.string().min(1).max(300),
  retryable: z.boolean(),
});

export const researchThreadStatusSchema = z.object({
  thread_id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  revision: z.number().int().positive().nullable(),
  durable: z.boolean(),
  warning: z.string().max(240).nullable(),
}).strict();

export const researchTurnResultSchema = z.object({
  run_id: z.string(),
  status: z.enum(["complete", "partial", "stopped", "failed"]),
  assistant_message: researchAssistantMessageSchema.nullable(),
  artifact: preparationArtifactSchema.nullable(),
  artifact_revision: z.number().int().nonnegative(),
  events: z.array(researchActivitySchema).max(RESEARCH_LIMITS.maxActivityEvents),
  usage: z.array(usageReceiptSchema).max(RESEARCH_LIMITS.maxProviderRequests),
  counts: researchCountsSchema,
  accounted_cost_usd: z.number().min(0).max(RESEARCH_LIMITS.costCapUsd),
  elapsed_ms: z.number().nonnegative(),
  limitations: z.array(z.string().max(240)).max(20),
  trace: researchRunTraceSchema,
  workspace: researchWorkspaceSchema,
});

export type ResearchRequest = z.infer<typeof researchRequestSchema>;
export type ResearchDepth = z.infer<typeof researchDepthSchema>;
export type ResearchState = z.infer<typeof researchStateSchema>;
export type ResearchConversationTurn = z.infer<typeof researchConversationTurnSchema>;
export type ResearchCandidate = z.infer<typeof researchCandidateSchema>;
export type ResearchTranscriptMatch = z.infer<typeof researchTranscriptMatchSchema>;
export type ResearchCounts = z.infer<typeof researchCountsSchema>;
export type ResearchActivity = z.infer<typeof researchActivitySchema>;
export type ResearchRunTrace = z.infer<typeof researchRunTraceSchema>;
export type ResearchWorkspace = z.infer<typeof researchWorkspaceSchema>;
export type ResearchAssistantMessage = z.infer<typeof researchAssistantMessageSchema>;
export type ResearchSource = z.infer<typeof researchSourceSchema>;
export type ResearchRun = z.infer<typeof researchRunSchema>;
export type ResearchReceipt = z.infer<typeof researchReceiptSchema>;
export type ResearchError = z.infer<typeof researchErrorSchema>;
export type ResearchThreadStatus = z.infer<typeof researchThreadStatusSchema>;
export type ResearchTurnResult = z.infer<typeof researchTurnResultSchema>;
export type { ResearchArtifact };

export type ResearchDataParts = {
  activity: ResearchActivity;
  artifact: z.infer<typeof researchArtifactEventSchema>;
  run: ResearchRun;
  receipt: ResearchReceipt;
  error: ResearchError;
  message: ResearchAssistantMessage;
  source: ResearchSource;
  thread: ResearchThreadStatus;
};

export type ResearchUIMessage = UIMessage<unknown, ResearchDataParts>;

export function parseResearchEnvelope(value: unknown): ResearchRequest {
  if (!value || typeof value !== "object") throw new Error("research_invalid_request");
  const candidate = value as Record<string, unknown>;
  return researchRequestSchema.parse(candidate.research ?? candidate);
}
