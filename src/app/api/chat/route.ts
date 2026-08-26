import { randomUUID } from "node:crypto";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { ZodError } from "zod";
import { createLivePhase5Tools } from "@/lib/phase5/live-tools";
import { createOpenRouterPhase5Model } from "@/lib/phase5/model";
import type { Phase7AAgentDependencies } from "@/lib/phase7a/agent";
import {
  phase7aBigStoryGeneratedArtifactSchema,
  phase7aHeadlinesGeneratedArtifactSchema,
} from "@/lib/phase7a/artifact";
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
import { phase7aLocalLiveAuthorized } from "@/lib/phase7a/model";
import { PHASE_7A_ARTIFACT_PROCEDURES, phase7aArtifactInstructions } from "@/lib/phase7a/prompts";
import { createPhase7AWorkspace, getPhase7AWorkspace, putPhase7AWorkspace } from "@/lib/phase7a/session-store";
import { runPhase7AWorkflow } from "@/lib/phase7a/workflow";
import { RESEARCH_AGENT_LIMITS } from "@/lib/research-agent/contracts";
import { createOpenRouterManager, createOpenRouterResearchModel } from "@/lib/research-agent/model";
import { requestedArtifactMode, runResearchTurn, type ResearchRuntimeDependencies } from "@/lib/research-agent/runtime";
import {
  runStandardResearchTurn,
  STANDARD_RESEARCH_LIMITS,
  type StandardRuntimeDependencies,
} from "@/lib/research-agent/standard";
import { createOpenRouterResearchWorker } from "@/lib/research-agent/worker";
import { PHASE_5_MODELS } from "@/lib/phase5/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const activeSessions = new Set<string>();

function safeError(error: unknown, runId?: string) {
  const code = error instanceof Error && /^(?:phase7a|research)_[a-z0-9_:-]+$/.test(error.message)
    ? error.message
    : "phase7a_request_failed";
  const messages: Record<string, string> = {
    phase7a_invalid_request: "The chat request was invalid.",
    phase7a_request_too_large: "The request exceeded the 24 KB input boundary.",
    phase7a_run_in_progress: "This local conversation already has a research turn in progress.",
    phase7a_missing_key: "OpenRouter is not configured for this local research agent.",
    phase7a_live_not_authorized: "Local live research is not enabled. No fixture was substituted and nothing was spent.",
    phase7a_invalid_citation: "The agent attempted to cite evidence it had not retrieved.",
    phase7a_artifact_not_requested: "A preparation brief can only be created or revised when the current message explicitly requests it.",
    phase7a_url_not_allowed: "The agent attempted to read a URL that was neither supplied nor discovered.",
    phase7a_chunk_not_allowed: "The agent attempted to open an archive chunk that search had not returned.",
    phase7a_repeated_action: "The agent repeated an action without new evidence, so the turn stopped safely.",
    phase7a_controller_empty_output: "The planning model returned no next step. Collected research was preserved and no automatic retry was started.",
    phase7a_controller_truncated_output: "The planning model's next step was cut off. Collected research was preserved and no automatic retry was started.",
    phase7a_controller_incomplete_output: "The planning model did not finish its next step. Collected research was preserved and no automatic retry was started.",
    phase7a_controller_invalid_json: "The planning model returned unreadable next-step data. Collected research was preserved and no automatic retry was started.",
    phase7a_controller_transport_invalid: "The planning model returned an invalid next-step packet. Collected research was preserved and no automatic retry was started.",
    phase7a_controller_action_invalid: "The planning model selected an invalid research action. Collected research was preserved and no automatic retry was started.",
    phase7a_budget_exhausted: "The turn reached its $1.00 cost boundary.",
    phase7a_provider_request_limit: "The turn reached its provider-request boundary.",
    phase7a_run_stopped: "The research turn was stopped.",
    research_budget_exhausted: "The research turn reached its safety ceiling after preserving the latest checkpoint.",
    research_answer_reserve_protected: "New research stopped so the agent could preserve enough capacity to answer.",
    research_provider_request_limit: "The research turn reached its provider-request safety boundary.",
    research_run_stopped: "The research turn was stopped and completed checkpoints were preserved.",
    research_run_timeout: "The research turn reached its elapsed-time safety boundary and preserved completed work.",
    research_manager_plan_invalid: "The research manager returned an invalid plan. No unsupported research was started.",
    research_manager_review_invalid: "The research manager returned an invalid coverage review. Completed research was preserved.",
    research_manager_answer_invalid: "The research manager returned an invalid final answer. Completed research was preserved.",
  };
  return phase7aErrorSchema.parse({
    ...(runId ? { run_id: runId } : {}),
    code,
    message: messages[code] ?? "The research turn failed safely. No automatic retry was started.",
    retryable: ["phase7a_request_failed", "phase7a_run_stopped"].includes(code),
  });
}

function safeDevelopmentDiagnostic(error: unknown) {
  if (error instanceof ZodError) {
    return {
      kind: "validation",
      issues: error.issues.slice(0, 12).map((issue) => ({
        code: issue.code,
        path: issue.path.map(String).join("."),
      })),
    };
  }
  if (error instanceof Error) {
    return {
      kind: "error",
      name: error.name.slice(0, 80),
      code: /^(?:phase7a|research)_[a-z0-9_:-]+$/.test(error.message)
        ? error.message
        : "unclassified_runtime_error",
    };
  }
  return { kind: "unknown" };
}

type ChatRuntimeDependencies = Phase7AAgentDependencies | ResearchRuntimeDependencies | StandardRuntimeDependencies;

function liveDependencies(
  signal: AbortSignal,
  depth: "standard" | "deep" = "standard",
  explicitBrief = false,
): ResearchRuntimeDependencies | StandardRuntimeDependencies {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  if (!apiKey) throw new Error("phase7a_missing_key");
  if (!phase7aLocalLiveAuthorized()) throw new Error("phase7a_live_not_authorized");
  const policy = depth === "standard" && !explicitBrief
    ? { ceilingUsd: STANDARD_RESEARCH_LIMITS.ceilingCostUsd }
    : RESEARCH_AGENT_LIMITS.budgets[depth];
  const configuredCostCap = Number(process.env.RESEARCH_TURN_COST_CAP_USD ?? process.env.PHASE7A_TURN_COST_CAP_USD ?? policy.ceilingUsd);
  const costCapUsd = Number.isFinite(configuredCostCap) && configuredCostCap > 0
    ? Math.min(policy.ceilingUsd, configuredCostCap)
    : policy.ceilingUsd;
  const maximumRequests = depth === "standard" && !explicitBrief
    ? STANDARD_RESEARCH_LIMITS.maxProviderRequests
    : RESEARCH_AGENT_LIMITS.maxProviderRequests;
  const configuredRequestCap = Number(process.env.RESEARCH_TURN_REQUEST_CAP ?? process.env.PHASE7A_TURN_REQUEST_CAP ?? maximumRequests);
  const providerRequestCap = Number.isFinite(configuredRequestCap) && configuredRequestCap > 0
    ? Math.min(maximumRequests, Math.floor(configuredRequestCap))
    : maximumRequests;
  const deadlineSignal = AbortSignal.timeout(depth === "standard" && !explicitBrief
    ? STANDARD_RESEARCH_LIMITS.hardDeadlineMs
    : RESEARCH_AGENT_LIMITS.maxElapsedMs[depth]);
  const boundedSignal = AbortSignal.any([signal, deadlineSignal]);
  const tools = createLivePhase5Tools({ apiKey, liveAuthorized: true, signal: boundedSignal });
  if (depth === "standard" && !explicitBrief) {
    const model = PHASE_5_MODELS.light;
    const provider = createOpenRouterResearchModel(apiKey, model);
    return {
      standardModel: provider.chat(model.id, {
        extraBody: { reasoning: { effort: model.reasoningEffort, exclude: true } },
        usage: { include: true },
      }),
      modelId: model.id,
      tools,
      signal: boundedSignal,
      costCapUsd,
      providerRequestCap,
    };
  }
  return {
    manager: createOpenRouterManager({ apiKey }),
    fallbackManager: createOpenRouterManager({ apiKey, fallback: true }),
    worker: createOpenRouterResearchWorker({ apiKey }),
    composer: createOpenRouterPhase5Model({
      apiKey,
      liveAuthorized: true,
      phase7aLive: true,
      artifactContext: PHASE_7A_ARTIFACT_PROCEDURES,
      artifactSchemas: {
        headlines: phase7aHeadlinesGeneratedArtifactSchema,
        big_story: phase7aBigStoryGeneratedArtifactSchema,
      },
      artifactInstructions: phase7aArtifactInstructions,
      artifactSchemaNamePrefix: "phase7a_v2",
    }),
    tools,
    signal: boundedSignal,
    costCapUsd,
    providerRequestCap,
  };
}

export function createPhase7AChatRoute(options: {
  /** Legacy injected dependencies remain only for frozen route regression fixtures. */
  dependencies?: (signal: AbortSignal, depth?: "standard" | "deep", explicitBrief?: boolean) => ChatRuntimeDependencies;
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
          const startingArtifactRevision = workspace.artifact_revision;
          const explicitBrief = requestedArtifactMode(parsed.message, workspace.artifact) !== null;
          const base = dependencyFactory(request.signal, parsed.research_depth, explicitBrief);
          const shared = {
            signal: base.signal ?? request.signal,
            onEvent: (event: Parameters<NonNullable<ResearchRuntimeDependencies["onEvent"]>>[0]) => {
              if (!request.signal.aborted) writer.write({ type: "data-activity", id: event.id, data: event });
              base.onEvent?.(event);
            },
          };
          const result = "controller" in base
            ? await runPhase7AWorkflow({
                workspace,
                message: parsed.message,
                researchDepth: parsed.research_depth,
                runId,
              }, { ...base, ...shared })
            : "standardModel" in base
              ? await runStandardResearchTurn({
                  workspace,
                  message: parsed.message,
                  runId,
                }, {
                  ...base,
                  ...shared,
                  onCheckpoint: (checkpoint) => {
                    putPhase7AWorkspace(checkpoint);
                    base.onCheckpoint?.(checkpoint);
                  },
                })
              : await runResearchTurn({
                workspace,
                message: parsed.message,
                researchDepth: parsed.research_depth,
                runId,
              }, {
                ...base,
                ...shared,
                onCheckpoint: (checkpoint) => {
                  putPhase7AWorkspace(checkpoint);
                  base.onCheckpoint?.(checkpoint);
                },
              });
          putPhase7AWorkspace(result.workspace);
          for (const source of result.workspace.evidence) {
            writer.write({
              type: "data-source",
              id: source.source_id,
              data: phase7aSourceSchema.parse({ ...source, content: undefined }),
            });
          }
          if (result.artifact && result.artifact_revision > startingArtifactRevision) {
            writer.write({
              type: "data-artifact",
              id: `${runId}-artifact-${result.artifact_revision}`,
              data: phase7aArtifactSchema.parse({ run_id: runId, revision: result.artifact_revision, artifact: result.artifact }),
            });
          }
          if (result.assistant_message) {
            writer.write({ type: "data-message", id: result.assistant_message.message_id, data: result.assistant_message });
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
            const firstCode = result.limitations.find((item) => /^(?:phase7a|research)_[a-z0-9_]+$/.test(item));
            writer.write({ type: "data-error", id: runId, data: safeError(new Error(firstCode ?? "phase7a_request_failed"), runId) });
          }
          const text = result.assistant_message?.text ?? summary;
          const textId = `text_${runId}`;
          writer.write({ type: "text-start", id: textId });
          writer.write({ type: "text-delta", id: textId, delta: text });
          writer.write({ type: "text-end", id: textId });
          writer.write({ type: "finish", finishReason: "stop" });
        } catch (error) {
          if (process.env.NODE_ENV === "development") {
            // This diagnostic deliberately excludes prompts, model output,
            // provider payloads, URLs, and secrets. It is only a typed path/code
            // breadcrumb for failures that occur after a checkpointed runtime.
            console.error("[nonsense-research-route]", safeDevelopmentDiagnostic(error));
          }
          if (!request.signal.aborted) {
            const safe = safeError(error, runId);
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
