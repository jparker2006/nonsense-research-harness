import "server-only";

import { randomUUID } from "node:crypto";
import { researchWorkspaceSchema, type ResearchDepth, type ResearchReceipt, type ResearchTurnResult, type ResearchWorkspace } from "../research/contracts.ts";
import type { EvidenceSource } from "../research/content.ts";
import {
  compactReceiptSchema,
  researchThreadSnapshotSchema,
  type ResearchThreadSnapshot,
} from "./contracts.ts";

export function emptyThreadSnapshot(threadId: string): ResearchThreadSnapshot {
  return researchThreadSnapshotSchema.parse({
    version: 1,
    thread_id: threadId,
    conversation: [],
    trusted_sources: [],
    archive_passages: [],
    unresolved_points: [],
    limitations: [],
    artifact: null,
    artifact_revision: 0,
    artifact_run_id: null,
    receipts: [],
    checkpoint: "terminal",
  });
}

export function appendPendingUser(
  snapshot: ResearchThreadSnapshot,
  input: { runId: string; message: string; depth: ResearchDepth; createdAt: string },
): ResearchThreadSnapshot {
  return researchThreadSnapshotSchema.parse({
    ...snapshot,
    conversation: [...snapshot.conversation, {
      turn_id: `turn_${randomUUID()}`,
      role: "user",
      text: input.message,
      research_depth: input.depth,
      run_id: input.runId,
      created_at: input.createdAt,
    }],
    checkpoint: "user",
  });
}

function trustedSources(evidence: EvidenceSource[]) {
  return evidence
    .filter((source) => source.evidence_usable && ["complete", "partial"].includes(source.availability))
    .slice(-64)
    .map((source) => ({
      source_id: source.source_id,
      source_type: source.source_type,
      availability: source.availability,
      evidence_usable: true,
      title: source.title,
      ...(source.url ? { url: source.url } : {}),
      ...(source.retrieved_at ? { retrieved_at: source.retrieved_at } : {}),
      excerpt: (source.content ?? source.excerpt ?? "").slice(0, 2_000) || null,
      ...(source.episode_id ? { episode_id: source.episode_id } : {}),
      ...(source.segment_id ? { segment_id: source.segment_id } : {}),
      ...(source.chunk_id ? { chunk_id: source.chunk_id } : {}),
      ...(source.season === undefined ? {} : { season: source.season }),
      ...(source.episode_number === undefined ? {} : { episode_number: source.episode_number }),
      ...(source.episode_format ? { episode_format: source.episode_format } : {}),
      ...(source.segment_role ? { segment_role: source.segment_role } : {}),
    }));
}

function archivePassages(evidence: EvidenceSource[]) {
  return evidence
    .filter((source) => source.source_type === "archive" && source.evidence_usable && source.content)
    .slice(-16)
    .map((source) => ({
      source_id: source.source_id,
      episode_id: source.episode_id!,
      segment_id: source.segment_id!,
      chunk_id: source.chunk_id!,
      title: source.title,
      season: source.season!,
      episode_number: source.episode_number ?? null,
      exact_text: source.content!.slice(0, 6_000),
    }));
}

export function checkpointThreadSnapshot(
  snapshot: ResearchThreadSnapshot,
  workspace: ResearchWorkspace,
  runId: string,
): ResearchThreadSnapshot {
  const artifactChanged = workspace.artifact_revision > snapshot.artifact_revision;
  return researchThreadSnapshotSchema.parse({
    ...snapshot,
    trusted_sources: trustedSources(workspace.evidence),
    archive_passages: archivePassages(workspace.evidence),
    unresolved_points: workspace.research_state?.evidence_gaps ?? snapshot.unresolved_points,
    artifact: workspace.artifact,
    artifact_revision: workspace.artifact_revision,
    artifact_run_id: artifactChanged ? runId : snapshot.artifact_run_id,
    checkpoint: "evidence",
  });
}

export function terminalThreadSnapshot(
  snapshot: ResearchThreadSnapshot,
  result: ResearchTurnResult,
  receipt: ResearchReceipt,
): ResearchThreadSnapshot {
  const checkpoint = checkpointThreadSnapshot(snapshot, result.workspace, result.run_id);
  const conversation = result.assistant_message
    ? [
        ...checkpoint.conversation.filter((turn) => !(turn.role === "assistant" && turn.run_id === result.run_id)),
        {
          turn_id: result.assistant_message.message_id,
          role: "assistant" as const,
          text: result.assistant_message.text,
          blocks: result.assistant_message.blocks,
          source_ids: result.assistant_message.source_ids,
          run_id: result.run_id,
          created_at: result.assistant_message.created_at,
        },
      ]
    : checkpoint.conversation;
  const compact = compactReceiptSchema.parse({
    run_id: receipt.run_id,
    status: receipt.status,
    counts: receipt.counts,
    accounted_cost_usd: receipt.accounted_cost_usd,
    elapsed_ms: receipt.elapsed_ms,
    limitations: receipt.limitations,
    artifact_revision: receipt.artifact_revision,
  });
  return researchThreadSnapshotSchema.parse({
    ...checkpoint,
    conversation,
    unresolved_points: result.workspace.research_state?.evidence_gaps ?? [],
    limitations: result.limitations,
    receipts: [
      ...checkpoint.receipts.filter((item) => item.run_id !== result.run_id),
      compact,
    ].slice(-32),
    checkpoint: "terminal",
  });
}

export function workspaceFromThreadSnapshot(snapshot: ResearchThreadSnapshot): ResearchWorkspace {
  const archiveBySource = new Map(snapshot.archive_passages.map((passage) => [passage.source_id, passage]));
  const evidence = snapshot.trusted_sources.map((source) => {
    const passage = archiveBySource.get(source.source_id);
    return {
      ...source,
      ...(passage ? { content: passage.exact_text, excerpt: passage.exact_text.slice(0, 2_000) } : {}),
    };
  });
  return researchWorkspaceSchema.parse({
    session_id: snapshot.thread_id,
    turns: snapshot.conversation.map((turn) => ({
      turn_id: turn.turn_id,
      role: turn.role,
      text: turn.text,
      source_ids: turn.role === "assistant" ? turn.source_ids : [],
      created_at: turn.created_at,
    })),
    agent_messages: [],
    evidence,
    candidates: [],
    transcript_matches: [],
    web_queries: [],
    archive_queries: [],
    research_state: snapshot.unresolved_points.length ? {
      objective: snapshot.conversation.filter((turn) => turn.role === "user").at(-1)?.text.slice(0, 500) ?? "Continue the research thread",
      completed_steps: ["Restored durable conversation and trusted evidence"],
      evidence_gaps: snapshot.unresolved_points,
      next_step: "Answer the current follow-up using saved context and tools as needed.",
    } : null,
    run_traces: [],
    artifact: snapshot.artifact,
    artifact_revision: snapshot.artifact_revision,
    updated_at_ms: Date.now(),
  });
}
