import { randomUUID } from "node:crypto";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { ZodError } from "zod";
import { createLivePhase5Tools } from "@/lib/phase5/live-tools";
import { createOpenRouterPhase5Model } from "@/lib/phase5/model";
import type { Phase7AAgentDependencies } from "@/lib/phase7a/agent";
import {
  PHASE_7A_LIMITS,
  parsePhase7AEnvelope,
  phase7aArtifactSchema,
  phase7aErrorSchema,
  phase7aReceiptSchema,
  phase7aRunSchema,
  phase7aSourceSchema,
  type Phase7AUIMessage,
} from "@/lib/phase7a/contracts";
import { createOpenRouterPhase7AModel, phase7aLocalLiveAuthorized } from "@/lib/phase7a/model";
import { PHASE_7A_ARTIFACT_PROCEDURES } from "@/lib/phase7a/prompts";
import { createPhase7AWorkspace, getPhase7AWorkspace, putPhase7AWorkspace } from "@/lib/phase7a/session-store";
import { runPhase7AWorkflow } from "@/lib/phase7a/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const activeSessions = new Set<string>();

function safeError(error: unknown) {
  const code = error instanceof Error && /^phase7a_[a-z0-9_]+$/.test(error.message)
    ? error.message
    : "phase7a_request_failed";
  const messages: Record<string, string> = {
    phase7a_invalid_request: "The chat request was invalid.",
    phase7a_request_too_large: "The request exceeded the 24 KB input boundary.",
    phase7a_run_in_progress: "This local conversation already has a research turn in progress.",
    phase7a_missing_key: "OpenRouter is not configured for this local research agent.",
    phase7a_live_not_authorized: "Local live research is not enabled. No fixture was substituted and nothing was spent.",
    phase7a_invalid_citation: "The agent attempted to cite evidence it had not retrieved.",
    phase7a_url_not_allowed: "The agent attempted to read a URL that was neither supplied nor discovered.",
    phase7a_chunk_not_allowed: "The agent attempted to open an archive chunk that search had not returned.",
    phase7a_repeated_action: "The agent repeated an action without new evidence, so the turn stopped safely.",
    phase7a_budget_exhausted: "The turn reached its $1.00 cost boundary.",
    phase7a_provider_request_limit: "The turn reached its provider-request boundary.",
    phase7a_run_stopped: "The research turn was stopped.",
  };
  return phase7aErrorSchema.parse({
    code,
    message: messages[code] ?? "The research turn failed safely. No automatic retry was started.",
    retryable: ["phase7a_request_failed", "phase7a_run_stopped"].includes(code),
  });
}

function liveDependencies(signal: AbortSignal): Phase7AAgentDependencies {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  if (!apiKey) throw new Error("phase7a_missing_key");
  if (!phase7aLocalLiveAuthorized()) throw new Error("phase7a_live_not_authorized");
  const configuredCostCap = Number(process.env.PHASE7A_TURN_COST_CAP_USD ?? PHASE_7A_LIMITS.costCapUsd);
  const costCapUsd = Number.isFinite(configuredCostCap) && configuredCostCap > 0
    ? Math.min(PHASE_7A_LIMITS.costCapUsd, configuredCostCap)
    : PHASE_7A_LIMITS.costCapUsd;
  return {
    controller: createOpenRouterPhase7AModel({ apiKey, liveAuthorized: true }),
    composer: createOpenRouterPhase5Model({
      apiKey,
      liveAuthorized: true,
      phase7aLive: true,
      artifactContext: PHASE_7A_ARTIFACT_PROCEDURES,
    }),
    tools: createLivePhase5Tools({ apiKey, liveAuthorized: true, signal }),
    signal,
    costCapUsd,
  };
}

export function createPhase7AChatRoute(options: {
  dependencies?: (signal: AbortSignal) => Phase7AAgentDependencies;
} = {}) {
  const dependencyFactory = options.dependencies ?? liveDependencies;
  const injected = options.dependencies !== undefined;

  return async function phase7aPost(request: Request) {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > PHASE_7A_LIMITS.maxRequestBytes) {
      return Response.json(safeError(new Error("phase7a_request_too_large")), { status: 413 });
    }
    let parsed;
    try {
      parsed = parsePhase7AEnvelope(JSON.parse(raw));
    } catch (error) {
      return Response.json(safeError(error instanceof ZodError ? new Error("phase7a_invalid_request") : error), { status: 400 });
    }
    if (!injected) {
      try {
        if (!process.env.OPENROUTER_API_KEY?.trim()) throw new Error("phase7a_missing_key");
        if (!phase7aLocalLiveAuthorized()) throw new Error("phase7a_live_not_authorized");
      } catch (error) {
        return Response.json(safeError(error), { status: 503, headers: { "Cache-Control": "no-store" } });
      }
    }
    if (activeSessions.has(parsed.session_id)) {
      return Response.json(safeError(new Error("phase7a_run_in_progress")), { status: 409 });
    }
    activeSessions.add(parsed.session_id);
    const runId = `run_${randomUUID()}`;

    const stream = createUIMessageStream<Phase7AUIMessage>({
      execute: async ({ writer }) => {
        try {
          writer.write({
            type: "data-run",
            id: runId,
            data: phase7aRunSchema.parse({
              session_id: parsed.session_id,
              run_id: runId,
              state: "running",
              summary: "The agent is deciding what to research next",
            }),
          });
          const workspace = getPhase7AWorkspace(parsed.session_id) ?? createPhase7AWorkspace(parsed.session_id);
          const base = dependencyFactory(request.signal);
          const result = await runPhase7AWorkflow({ workspace, message: parsed.message, runId }, {
            ...base,
            signal: request.signal,
            onEvent: (event) => {
              if (!request.signal.aborted) writer.write({ type: "data-activity", id: event.id, data: event });
              base.onEvent?.(event);
            },
          });
          putPhase7AWorkspace(result.workspace);
          if (result.assistant_message) {
            writer.write({ type: "data-message", id: result.assistant_message.message_id, data: result.assistant_message });
          }
          for (const source of result.workspace.evidence) {
            writer.write({
              type: "data-source",
              id: source.source_id,
              data: phase7aSourceSchema.parse({ ...source, content: undefined }),
            });
          }
          if (result.artifact && result.artifact_revision > 0) {
            writer.write({
              type: "data-artifact",
              id: `${runId}-artifact-${result.artifact_revision}`,
              data: phase7aArtifactSchema.parse({ run_id: runId, revision: result.artifact_revision, artifact: result.artifact }),
            });
          }
          writer.write({
            type: "data-receipt",
            id: runId,
            data: phase7aReceiptSchema.parse({
              run_id: runId,
              status: result.status,
              counts: result.counts,
              accounted_cost_usd: result.accounted_cost_usd,
              elapsed_ms: result.elapsed_ms,
              limitations: result.limitations,
              artifact_revision: result.artifact_revision,
            }),
          });
          const summary = result.status === "complete"
            ? "Answer ready"
            : result.status === "partial"
              ? "Answer ready with explicit limitations"
              : result.status === "stopped"
                ? "Research turn stopped"
                : "Research turn failed safely";
          writer.write({
            type: "data-run",
            id: runId,
            data: phase7aRunSchema.parse({ session_id: parsed.session_id, run_id: runId, state: result.status, summary }),
          });
          if (result.status === "failed") {
            const firstCode = result.limitations.find((item) => /^phase7a_[a-z0-9_]+$/.test(item));
            writer.write({ type: "data-error", id: runId, data: safeError(new Error(firstCode ?? "phase7a_request_failed")) });
          }
          const text = result.assistant_message?.text ?? summary;
          const textId = `text_${runId}`;
          writer.write({ type: "text-start", id: textId });
          writer.write({ type: "text-delta", id: textId, delta: text });
          writer.write({ type: "text-end", id: textId });
          writer.write({ type: "finish", finishReason: "stop" });
        } catch (error) {
          if (!request.signal.aborted) {
            const safe = safeError(error);
            writer.write({ type: "data-error", id: runId, data: safe });
            writer.write({
              type: "data-run",
              id: runId,
              data: phase7aRunSchema.parse({ session_id: parsed.session_id, run_id: runId, state: "failed", summary: safe.message }),
            });
          }
        } finally {
          activeSessions.delete(parsed.session_id);
        }
      },
      onError: () => "The research turn failed safely. No automatic retry was started.",
    });

    return createUIMessageStreamResponse({
      stream,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  };
}

export const POST = createPhase7AChatRoute();
