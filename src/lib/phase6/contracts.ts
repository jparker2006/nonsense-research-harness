import type { UIMessage } from "ai";
import { z } from "zod";
import {
  PHASE_5_LIMITS,
  phase5ArtifactSchema,
  phase5CountsSchema,
  phase5InputSchema,
} from "../phase5/contracts.ts";

export const PHASE_6_LIMITS = Object.freeze({
  maxRequestBytes: 24_000,
  maxSessionIdCharacters: 96,
  maxFollowUpCharacters: 1_200,
  maxActivityEvents: 80,
  maxSessions: 8,
  sessionTtlMs: 6 * 60 * 60 * 1_000,
  liveProofCostCapUsd: 0.5,
  liveProofProviderRequests: 6,
});

export const phase6ActionSchema = z.enum(["start", "retry", "follow_up"]);

export const phase6RequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.enum(["start", "retry"]),
    session_id: z.string().trim().min(8).max(PHASE_6_LIMITS.maxSessionIdCharacters),
    input: phase5InputSchema,
  }).strict(),
  z.object({
    action: z.literal("follow_up"),
    session_id: z.string().trim().min(8).max(PHASE_6_LIMITS.maxSessionIdCharacters),
    instruction: z.string().trim().min(3).max(PHASE_6_LIMITS.maxFollowUpCharacters),
  }).strict(),
]);

export const phase6ActivitySchema = z.object({
  id: z.string().max(120),
  run_id: z.string().max(160),
  kind: z.enum(["run", "tool", "validation", "composition", "artifact"]),
  label: z.string().min(1).max(180),
  detail: z.string().max(300),
  status: z.enum(["running", "complete", "partial", "unavailable", "stopped", "failed"]),
  tool: z.enum(["web_search", "read_url", "search_transcripts", "open_transcript_chunk"]).optional(),
  created_at: z.string(),
});

export const phase6RunSchema = z.object({
  session_id: z.string(),
  run_id: z.string(),
  state: z.enum(["running", "complete", "partial", "stopped", "failed"]),
  summary: z.string().min(1).max(300),
  mode: z.enum(["headlines", "big_story"]),
  execution: z.enum(["fixture", "live"]),
});

export const phase6ArtifactSchema = z.object({
  run_id: z.string(),
  revision: z.number().int().positive(),
  artifact: phase5ArtifactSchema,
});

export const phase6ReceiptSchema = z.object({
  run_id: z.string(),
  status: z.enum(["complete", "partial", "stopped", "failed"]),
  counts: phase5CountsSchema,
  accounted_cost_usd: z.number().min(0).max(PHASE_5_LIMITS.costCapUsd),
  elapsed_ms: z.number().nonnegative(),
  limitations: z.array(z.string().max(240)).max(20),
  revision: z.number().int().positive(),
});

export const phase6ErrorSchema = z.object({
  code: z.string().regex(/^phase6_[a-z0-9_]+$/),
  message: z.string().min(1).max(300),
  retryable: z.boolean(),
});

export type Phase6Request = z.infer<typeof phase6RequestSchema>;
export type Phase6Activity = z.infer<typeof phase6ActivitySchema>;
export type Phase6Run = z.infer<typeof phase6RunSchema>;
export type Phase6Artifact = z.infer<typeof phase6ArtifactSchema>;
export type Phase6Receipt = z.infer<typeof phase6ReceiptSchema>;
export type Phase6Error = z.infer<typeof phase6ErrorSchema>;

export type Phase6DataParts = {
  activity: Phase6Activity;
  artifact: Phase6Artifact;
  run: Phase6Run;
  receipt: Phase6Receipt;
  error: Phase6Error;
};

export type Phase6UIMessage = UIMessage<unknown, Phase6DataParts>;

export function parsePhase6Envelope(value: unknown): Phase6Request {
  if (!value || typeof value !== "object") throw new Error("phase6_invalid_request");
  const candidate = value as Record<string, unknown>;
  return phase6RequestSchema.parse(candidate.phase6 ?? candidate);
}
