import { z } from "zod";

export const PHASE_5_LIMITS = Object.freeze({
  maxLunaTurns: 6,
  maxGrokTurns: 2,
  maxWebSearches: 2,
  maxUrlReads: 6,
  maxTranscriptSearches: 2,
  maxTranscriptOpens: 4,
  maxLinks: 3,
  maxNotesCharacters: 8_000,
  maxEvidenceCharactersPerSource: 6_000,
  maxEvidenceCharactersTotal: 40_000,
  lunaMaxOutputTokens: 1_024,
  grokMaxOutputTokens: 12_000,
  wholeRunTimeoutMs: 300_000,
  costCapUsd: 0.5,
  automaticRetries: 0,
  liveCases: 4,
  liveTotalCostCapUsd: 1.3,
});

export const PHASE_5_MODELS = Object.freeze({
  light: Object.freeze({
    id: "openai/gpt-5.6-luna",
    reasoningEffort: "max" as const,
    zdr: false,
    maxPricePerMillion: Object.freeze({ prompt: 0.2, completion: 1.2 }),
  }),
  heavy: Object.freeze({
    id: "x-ai/grok-4.6",
    reasoningEffort: "medium" as const,
    zdr: true,
    maxPricePerMillion: Object.freeze({ prompt: 2, completion: 6 }),
  }),
});

export const phase5InputSchema = z.object({
  mode: z.enum(["headlines", "big_story"]),
  topic: z.string().trim().min(3).max(300),
  links: z.array(z.string().url()).max(PHASE_5_LIMITS.maxLinks).default([]),
  notes: z.string().max(PHASE_5_LIMITS.maxNotesCharacters).default(""),
  target_minutes: z.number().min(1).max(120).optional(),
});

export const researchPlanSchema = z.object({
  web_queries: z.array(z.string().trim().min(3).max(300)).min(1).max(PHASE_5_LIMITS.maxWebSearches),
  archive_queries: z
    .array(z.string().trim().min(2).max(500))
    .min(1)
    .max(PHASE_5_LIMITS.maxTranscriptSearches),
});

export const evidenceSourceSchema = z.object({
  source_id: z.string().min(3).max(180),
  source_type: z.enum(["provided_link", "web", "archive"]),
  availability: z.enum(["complete", "partial", "candidate", "restricted", "denied", "unavailable"]),
  evidence_usable: z.boolean(),
  title: z.string().max(300).nullable(),
  url: z.string().url().optional(),
  retrieved_at: z.string().optional(),
  excerpt: z.string().max(PHASE_5_LIMITS.maxEvidenceCharactersPerSource).nullable(),
  content: z.string().max(PHASE_5_LIMITS.maxEvidenceCharactersPerSource).optional(),
  episode_id: z.string().optional(),
  segment_id: z.string().optional(),
  chunk_id: z.string().optional(),
  season: z.number().int().optional(),
  episode_number: z.number().int().nullable().optional(),
  episode_format: z.string().optional(),
  segment_role: z.string().optional(),
  failure_code: z.string().optional(),
});

export const artifactSourceSchema = evidenceSourceSchema.omit({ content: true });

export const sourcedTextSchema = z.object({
  text: z.string().trim().min(1).max(4_000),
  source_ids: z.array(z.string()).min(1).max(8),
});

export const outlineBeatSchema = z.object({
  priority: z.enum(["must_have", "use_if_time", "cut_first"]),
  text: z.string().trim().min(1).max(2_000),
  source_ids: z.array(z.string()).max(8),
  estimated_minutes: z.number().positive().max(120).optional(),
});

export const archiveReferenceSchema = z.object({
  source_id: z.string(),
  episode_id: z.string(),
  segment_id: z.string(),
  chunk_id: z.string(),
  quote: z.string().trim().min(1).max(4_000),
});

export const archiveCoverageSchema = z.object({
  status: z.enum(["matches", "no_relevant_archive_match"]),
  items: z.array(archiveReferenceSchema).max(PHASE_5_LIMITS.maxTranscriptOpens),
});

const sharedArtifact = {
  working_title: z.string().trim().min(1).max(300),
  past_nonsense_coverage: archiveCoverageSchema,
  conversation_questions: z.array(z.string().trim().min(1).max(1_000)).min(2).max(12),
  uncertainties_and_open_checks: z.array(z.string().trim().min(1).max(1_000)).max(12),
  source_ledger: z.array(artifactSourceSchema).max(24),
};

export const bigStoryResearchCardSchema = z.object({
  role: z.enum([
    "background",
    "key_evidence",
    "force",
    "interpretation",
    "surprise",
    "recommendation_lead",
  ]),
  text: z.string().trim().min(1).max(1_200),
  source_ids: z.array(z.string()).min(1).max(6),
});

export const headlinesArtifactSchema = z.object({
  mode: z.literal("headlines"),
  ...sharedArtifact,
  what_happened: sourcedTextSchema,
  why_it_matters_now: sourcedTextSchema,
  verified_facts: z.array(sourcedTextSchema).min(1).max(12),
  tension_or_argument: sourcedTextSchema,
  surprising_details: z.array(sourcedTextSchema).max(10),
  flexible_outline: z.array(outlineBeatSchema).min(3).max(12),
});

export const bigStoryArtifactSchema = z.object({
  mode: z.literal("big_story"),
  working_title: z.string().trim().min(1).max(200),
  core_question: z.string().trim().min(1).max(500),
  research_brief: z.object({
    text: z.string().trim().min(1).max(1_200),
    source_ids: z.array(z.string()).min(1).max(8),
  }),
  research_cards: z.array(bigStoryResearchCardSchema).min(4).max(10),
  past_nonsense_coverage: z.object({
    status: z.enum(["matches", "no_relevant_archive_match"]),
    items: z.array(archiveReferenceSchema.extend({ quote: z.string().trim().min(1).max(1_200) })).max(4),
  }),
  conversation_questions: z.array(z.string().trim().min(1).max(500)).min(2).max(8),
  modular_outline: z.array(outlineBeatSchema.extend({ text: z.string().trim().min(1).max(800) })).min(4).max(10),
  uncertainties_and_open_checks: z.array(z.string().trim().min(1).max(500)).max(8),
  source_ledger: z.array(artifactSourceSchema).max(16),
});

export const headlinesGeneratedArtifactSchema = headlinesArtifactSchema.omit({ source_ledger: true });
export const bigStoryGeneratedArtifactSchema = bigStoryArtifactSchema.omit({ source_ledger: true });

export const phase5ArtifactSchema = z.discriminatedUnion("mode", [
  headlinesArtifactSchema,
  bigStoryArtifactSchema,
]);

export const phase5EventTypeSchema = z.enum([
  "run_started",
  "tool_started",
  "tool_completed",
  "tool_failed",
  "validation_started",
  "validation_failed",
  "repair_started",
  "composition_started",
  "artifact_completed",
  "run_stopped",
  "run_failed",
  "run_completed",
]);

export const phase5ActivityEventSchema = z.object({
  event_id: z.string(),
  run_id: z.string(),
  type: phase5EventTypeSchema,
  created_at: z.string(),
  summary: z.string().min(1).max(300),
  tool: z.enum(["web_search", "read_url", "search_transcripts", "open_transcript_chunk"]).optional(),
  status: z.enum(["running", "complete", "partial", "failed"]).optional(),
  detail: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export const phase5UsageSchema = z.object({
  action: z.string(),
  model: z.string().optional(),
  provider: z.string().optional(),
  prompt_tokens: z.number().nonnegative().optional(),
  completion_tokens: z.number().nonnegative().optional(),
  total_tokens: z.number().nonnegative().optional(),
  reported_cost_usd: z.number().nonnegative().optional(),
  accounted_cost_usd: z.number().nonnegative(),
  receipt_missing: z.boolean(),
  generation_id: z.string().max(180).optional(),
  finish_reason: z.string().max(80).optional(),
  response_characters: z.number().int().nonnegative().optional(),
  output_status: z.enum(["parsed", "empty", "invalid_json", "truncated", "incomplete"]).optional(),
  reasoning_tokens: z.number().int().nonnegative().optional(),
});

export const phase5CountsSchema = z.object({
  luna_turns: z.number().int().nonnegative(),
  grok_turns: z.number().int().nonnegative(),
  web_searches: z.number().int().nonnegative(),
  url_reads: z.number().int().nonnegative(),
  transcript_searches: z.number().int().nonnegative(),
  transcript_opens: z.number().int().nonnegative(),
  repairs: z.number().int().nonnegative(),
});

export const phase5RunResultSchema = z.object({
  run_id: z.string(),
  status: z.enum(["complete", "partial", "failed"]),
  input: phase5InputSchema,
  plan: researchPlanSchema.nullable(),
  artifact: phase5ArtifactSchema.nullable(),
  evidence: z.array(evidenceSourceSchema),
  validation_errors: z.array(z.string()),
  events: z.array(phase5ActivityEventSchema),
  usage: z.array(phase5UsageSchema),
  counts: phase5CountsSchema,
  repair_attempted: z.boolean(),
  elapsed_ms: z.number().nonnegative(),
  accounted_cost_usd: z.number().nonnegative(),
});

export type Phase5Input = z.infer<typeof phase5InputSchema>;
export type ResearchPlan = z.infer<typeof researchPlanSchema>;
export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;
export type ArtifactSource = z.infer<typeof artifactSourceSchema>;
export type HeadlinesArtifact = z.infer<typeof headlinesArtifactSchema>;
export type BigStoryArtifact = z.infer<typeof bigStoryArtifactSchema>;
export type Phase5Artifact = z.infer<typeof phase5ArtifactSchema>;
export type Phase5ActivityEvent = z.infer<typeof phase5ActivityEventSchema>;
export type Phase5Usage = z.infer<typeof phase5UsageSchema>;
export type Phase5Counts = z.infer<typeof phase5CountsSchema>;
export type Phase5RunResult = z.infer<typeof phase5RunResultSchema>;
