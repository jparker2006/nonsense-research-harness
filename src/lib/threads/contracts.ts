import { z } from "zod";
import { researchArtifactSchema } from "../research/artifact.ts";
import { artifactSourceSchema } from "../research/content.ts";
import { researchCountsSchema, researchDepthSchema } from "../research/contracts.ts";

export const THREAD_SNAPSHOT_VERSION = 1 as const;
export const threadIdSchema = z.string().uuid();

export const threadUserTurnSchema = z.object({
  turn_id: z.string().max(160),
  role: z.literal("user"),
  text: z.string().trim().min(1).max(12_000),
  research_depth: researchDepthSchema,
  run_id: z.string().max(160).nullable(),
  created_at: z.string(),
}).strict();

export const threadAssistantTurnSchema = z.object({
  turn_id: z.string().max(160),
  role: z.literal("assistant"),
  text: z.string().trim().min(1).max(24_000),
  blocks: z.array(z.object({
    text: z.string().trim().min(1).max(2_000),
    source_ids: z.array(z.string().max(180)).max(12),
  }).strict()).min(1).max(12),
  source_ids: z.array(z.string().max(180)).max(12),
  run_id: z.string().max(160),
  created_at: z.string(),
}).strict();

export const threadConversationTurnSchema = z.discriminatedUnion("role", [
  threadUserTurnSchema,
  threadAssistantTurnSchema,
]);

export const threadTrustedSourceSchema = artifactSourceSchema.extend({
  excerpt: z.string().max(2_000).nullable(),
}).strict();

export const threadArchivePassageSchema = z.object({
  source_id: z.string().max(180),
  episode_id: z.string().max(180),
  segment_id: z.string().max(180),
  chunk_id: z.string().max(180),
  title: z.string().max(300).nullable(),
  season: z.number().int(),
  episode_number: z.number().int().nullable(),
  exact_text: z.string().trim().min(1).max(6_000),
}).strict();

export const compactReceiptSchema = z.object({
  run_id: z.string().max(160),
  status: z.enum(["complete", "partial", "stopped", "failed", "interrupted"]),
  counts: researchCountsSchema,
  accounted_cost_usd: z.number().min(0).max(2),
  elapsed_ms: z.number().nonnegative(),
  limitations: z.array(z.string().max(240)).max(20),
  artifact_revision: z.number().int().nonnegative(),
}).strict();

export const researchThreadSnapshotSchema = z.object({
  version: z.literal(THREAD_SNAPSHOT_VERSION),
  thread_id: threadIdSchema,
  conversation: z.array(threadConversationTurnSchema).max(128),
  trusted_sources: z.array(threadTrustedSourceSchema).max(64),
  archive_passages: z.array(threadArchivePassageSchema).max(16),
  unresolved_points: z.array(z.string().max(240)).max(20),
  limitations: z.array(z.string().max(240)).max(20),
  artifact: researchArtifactSchema.nullable(),
  artifact_revision: z.number().int().nonnegative(),
  artifact_run_id: z.string().max(160).nullable(),
  receipts: z.array(compactReceiptSchema).max(32),
  checkpoint: z.enum(["user", "evidence", "terminal"]),
}).strict();

export const researchThreadMetadataSchema = z.object({
  id: threadIdSchema,
  title: z.string().trim().min(1).max(120),
  revision: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
}).strict();

export const researchThreadRecordSchema = researchThreadMetadataSchema.extend({
  snapshot: researchThreadSnapshotSchema,
}).strict();

export type ThreadConversationTurn = z.infer<typeof threadConversationTurnSchema>;
export type ResearchThreadSnapshot = z.infer<typeof researchThreadSnapshotSchema>;
export type ResearchThreadMetadata = z.infer<typeof researchThreadMetadataSchema>;
export type ResearchThreadRecord = z.infer<typeof researchThreadRecordSchema>;

export function deriveThreadTitle(message: string): string {
  const compact = message.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
  const title = compact || "Untitled research";
  return title.length <= 72 ? title : `${title.slice(0, 69).trimEnd()}…`;
}
