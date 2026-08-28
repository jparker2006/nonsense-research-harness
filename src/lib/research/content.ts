import { z } from "zod";

export const RESEARCH_CONTENT_LIMITS = Object.freeze({
  maxEvidenceCharactersPerSource: 6_000,
});

export const evidenceSourceSchema = z.object({
  source_id: z.string().min(3).max(180),
  source_type: z.enum(["provided_link", "web", "archive"]),
  availability: z.enum(["complete", "partial", "candidate", "restricted", "denied", "unavailable"]),
  evidence_usable: z.boolean(),
  title: z.string().max(300).nullable(),
  url: z.string().url().optional(),
  retrieved_at: z.string().optional(),
  excerpt: z.string().max(RESEARCH_CONTENT_LIMITS.maxEvidenceCharactersPerSource).nullable(),
  content: z.string().max(RESEARCH_CONTENT_LIMITS.maxEvidenceCharactersPerSource).optional(),
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

export const archiveReferenceSchema = z.object({
  source_id: z.string(),
  episode_id: z.string(),
  segment_id: z.string(),
  chunk_id: z.string(),
  quote: z.string().trim().min(1).max(4_000),
});

export const bigStoryResearchCardSchema = z.object({
  role: z.enum(["background", "key_evidence", "force", "interpretation", "surprise", "recommendation_lead"]),
  text: z.string().trim().min(1).max(1_200),
  source_ids: z.array(z.string()).min(1).max(6),
});

export const usageReceiptSchema = z.object({
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

export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;
export type ArtifactSource = z.infer<typeof artifactSourceSchema>;
export type UsageReceipt = z.infer<typeof usageReceiptSchema>;
