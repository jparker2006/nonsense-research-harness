import { z } from "zod";
import type { BrowserSource, ResearchReceipt, ResearchRun, ResearchThreadStatus } from "../research/client.ts";
import type { ResearchConversationState, ResearchExchange } from "../research/client-state.ts";
import {
  researchThreadMetadataSchema,
  researchThreadRecordSchema,
  type ResearchThreadMetadata,
  type ResearchThreadRecord,
} from "./contracts.ts";

export const threadListResponseSchema = z.object({
  durable: z.boolean(),
  warning: z.string().max(240).nullable(),
  threads: z.array(researchThreadMetadataSchema).max(50),
}).strict();

export const threadLoadResponseSchema = z.object({
  durable: z.boolean(),
  warning: z.string().max(240).nullable(),
  thread: researchThreadRecordSchema,
}).strict();

export type ThreadListResponse = z.infer<typeof threadListResponseSchema>;
export type ThreadLoadResponse = z.infer<typeof threadLoadResponseSchema>;

function runState(status: ResearchThreadRecord["snapshot"]["receipts"][number]["status"]): ResearchRun["state"] {
  return status === "interrupted" ? "stopped" : status;
}

function runSummary(status: ResearchRun["state"]): string {
  if (status === "complete") return "Answer ready";
  if (status === "partial") return "Best supported answer ready";
  if (status === "failed") return "Research stopped before completion";
  return "Research was interrupted before completion";
}

function receiptForClient(
  receipt: ResearchThreadRecord["snapshot"]["receipts"][number],
): ResearchReceipt {
  return {
    run_id: receipt.run_id,
    status: receipt.status === "interrupted" ? "stopped" : receipt.status,
    counts: receipt.counts,
    accounted_cost_usd: receipt.accounted_cost_usd,
    elapsed_ms: receipt.elapsed_ms,
    limitations: receipt.limitations,
    artifact_revision: receipt.artifact_revision,
  };
}

export function projectThreadRecord(
  record: ResearchThreadRecord,
  options: { durable: boolean; warning: string | null },
): ResearchConversationState {
  const parsed = researchThreadRecordSchema.parse(record);
  const assistants = new Map(
    parsed.snapshot.conversation
      .filter((turn) => turn.role === "assistant")
      .map((turn) => [turn.run_id, turn]),
  );
  const receipts = new Map(parsed.snapshot.receipts.map((receipt) => [receipt.run_id, receipt]));
  const exchanges: ResearchExchange[] = [];

  for (const user of parsed.snapshot.conversation.filter((turn) => turn.role === "user")) {
    const runId = user.run_id;
    const assistant = runId ? assistants.get(runId) : undefined;
    const compactReceipt = runId ? receipts.get(runId) : undefined;
    const interrupted = Boolean(runId && !assistant && !compactReceipt);
    const state = interrupted
      ? "stopped"
      : compactReceipt
        ? runState(compactReceipt.status)
        : assistant ? "complete" : "stopped";
    const run = runId ? {
      session_id: parsed.id,
      run_id: runId,
      state,
      summary: runSummary(state),
    } satisfies ResearchRun : null;
    const artifact = runId && parsed.snapshot.artifact && parsed.snapshot.artifact_run_id === runId
      ? { run_id: runId, revision: parsed.snapshot.artifact_revision, artifact: parsed.snapshot.artifact }
      : null;

    exchanges.push({
      local_id: `persisted_${user.turn_id}`,
      run_id: runId,
      user: {
        id: user.turn_id,
        text: user.text,
        research_depth: user.research_depth,
        created_at: user.created_at,
      },
      run,
      activities: [],
      assistant: assistant ? {
        message_id: assistant.turn_id,
        run_id: assistant.run_id,
        text: assistant.text,
        blocks: assistant.blocks,
        source_ids: assistant.source_ids,
        created_at: assistant.created_at,
      } : null,
      artifact,
      receipt: compactReceipt ? receiptForClient(compactReceipt) : null,
      error: interrupted ? {
        run_id: runId!,
        code: "research_run_interrupted",
        message: "This turn was interrupted before completion. Saved research from earlier turns is still available.",
        retryable: true,
      } : null,
    });
  }

  const sources: Record<string, BrowserSource> = {};
  for (const source of parsed.snapshot.trusted_sources) sources[source.source_id] = source;
  for (const source of parsed.snapshot.artifact?.source_ledger ?? []) sources[source.source_id] ??= source;

  const thread: ResearchThreadStatus = {
    thread_id: parsed.id,
    title: parsed.title,
    revision: parsed.revision,
    durable: options.durable,
    warning: options.warning,
  };
  return { exchanges, sources, active_exchange_id: null, thread };
}

export function mergeThreadMetadata(
  threads: ResearchThreadMetadata[],
  status: ResearchThreadStatus,
): ResearchThreadMetadata[] {
  if (status.revision === null) return threads;
  const existing = threads.find((thread) => thread.id === status.thread_id);
  const now = new Date().toISOString();
  const next: ResearchThreadMetadata = {
    id: status.thread_id,
    title: status.title,
    revision: status.revision,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  return [next, ...threads.filter((thread) => thread.id !== next.id)].slice(0, 50);
}
