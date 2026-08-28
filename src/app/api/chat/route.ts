import { randomUUID } from "node:crypto";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { ZodError } from "zod";
import {
  AGENT_LIMITS,
  runResearchTurn,
  type ResearchAgentDependencies,
} from "@/lib/research/agent";
import {
  RESEARCH_LIMITS,
  parseResearchEnvelope,
  researchArtifactEventSchema,
  researchErrorSchema,
  researchReceiptSchema,
  researchRunSchema,
  researchSourceSchema,
  researchThreadStatusSchema,
  type ResearchActivity,
  type ResearchDepth,
  type ResearchUIMessage,
} from "@/lib/research/contracts";
import { createResearchModel, LUNA_MODEL } from "@/lib/research/model";
import {
  createResearchWorkspace,
  getResearchWorkspace,
  putResearchWorkspace,
} from "@/lib/research/session-store";
import { createResearchTools } from "@/lib/research/tools";
import { deriveThreadTitle } from "@/lib/threads/contracts";
import { getThreadStoreBinding, type ThreadStoreBinding } from "@/lib/threads/factory";
import {
  appendPendingUser,
  checkpointThreadSnapshot,
  emptyThreadSnapshot,
  terminalThreadSnapshot,
  workspaceFromThreadSnapshot,
} from "@/lib/threads/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const activeSessions = new Set<string>();

function localLiveAuthorized(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.RESEARCH_LOCAL_LIVE === "approved";
}

function safeError(error: unknown, runId?: string) {
  const code = error instanceof Error && /^research_[a-z0-9_:-]+$/.test(error.message)
    ? error.message
    : "research_request_failed";
  const messages: Record<string, string> = {
    research_invalid_request: "The chat request was invalid.",
    research_request_too_large: "The request exceeded the 24 KB input boundary.",
    research_run_in_progress: "This conversation already has a research turn in progress.",
    research_missing_key: "OpenRouter is not configured for this research agent.",
    research_live_not_authorized: "Local live research is not enabled. Nothing was spent.",
    research_invalid_citation: "The agent attempted to cite evidence it had not retrieved.",
    research_url_not_allowed: "The agent attempted to read a URL that was neither supplied nor discovered.",
    research_chunk_not_allowed: "The agent attempted to open an archive passage that search had not returned.",
    research_repeated_action: "The agent repeated an action without new evidence, so the turn stopped safely.",
    research_budget_exhausted: "The research turn reached its safety ceiling after preserving completed work.",
    research_answer_reserve_protected: "New research stopped so the agent could preserve enough capacity to answer.",
    research_provider_request_limit: "The research turn reached its provider-request safety boundary.",
    research_run_stopped: "The research turn was stopped and completed work was preserved.",
    research_run_timeout: "The research turn reached its elapsed-time safety boundary and preserved completed work.",
    research_answer_not_submitted: "The agent did not submit a structured answer before the turn ended.",
    research_answer_empty: "The agent returned an empty answer.",
  };
  return researchErrorSchema.parse({
    ...(runId ? { run_id: runId } : {}),
    code,
    message: messages[code] ?? "The research turn failed safely. No automatic retry was started.",
    retryable: ["research_request_failed", "research_run_stopped"].includes(code),
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
      code: /^research_[a-z0-9_:-]+$/.test(error.message)
        ? error.message
        : "unclassified_runtime_error",
    };
  }
  return { kind: "unknown" };
}

function liveDependencies(signal: AbortSignal, depth: ResearchDepth): ResearchAgentDependencies {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  if (!apiKey) throw new Error("research_missing_key");
  if (!localLiveAuthorized()) throw new Error("research_live_not_authorized");
  const policy = AGENT_LIMITS[depth];
  const configuredCostCap = Number(process.env.RESEARCH_TURN_COST_CAP_USD ?? policy.ceilingCostUsd);
  const costCapUsd = Number.isFinite(configuredCostCap) && configuredCostCap > 0
    ? Math.min(policy.ceilingCostUsd, configuredCostCap)
    : policy.ceilingCostUsd;
  const configuredRequestCap = Number(process.env.RESEARCH_TURN_REQUEST_CAP ?? policy.maxProviderRequests);
  const providerRequestCap = Number.isFinite(configuredRequestCap) && configuredRequestCap > 0
    ? Math.min(policy.maxProviderRequests, Math.floor(configuredRequestCap))
    : policy.maxProviderRequests;
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(policy.hardDeadlineMs)]);
  const provider = createResearchModel(apiKey);
  return {
    model: provider.chat(LUNA_MODEL.id, {
      extraBody: { reasoning: { effort: LUNA_MODEL.reasoningEffort, exclude: true } },
      usage: { include: true },
    }),
    modelId: LUNA_MODEL.id,
    tools: createResearchTools({
      apiKey,
      exaApiKey: process.env.EXA_API_KEY?.trim(),
      liveAuthorized: true,
      signal: boundedSignal,
    }),
    signal: boundedSignal,
    costCapUsd,
    providerRequestCap,
  };
}

export function createResearchChatRoute(options: {
  dependencies?: (signal: AbortSignal, depth: ResearchDepth) => ResearchAgentDependencies;
  threadStoreBinding?: ThreadStoreBinding;
} = {}) {
  const dependencyFactory = options.dependencies ?? liveDependencies;
  const injected = options.dependencies !== undefined;
  const threadBinding = options.threadStoreBinding ?? getThreadStoreBinding();

  return async function researchPost(request: Request) {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > RESEARCH_LIMITS.maxRequestBytes) {
      return Response.json(safeError(new Error("research_request_too_large")), { status: 413 });
    }

    let parsed;
    try {
      parsed = parseResearchEnvelope(JSON.parse(raw));
    } catch (error) {
      return Response.json(
        safeError(error instanceof ZodError ? new Error("research_invalid_request") : error),
        { status: 400 },
      );
    }

    if (!injected && (!process.env.OPENROUTER_API_KEY?.trim() || !localLiveAuthorized())) {
      const code = !process.env.OPENROUTER_API_KEY?.trim() ? "research_missing_key" : "research_live_not_authorized";
      return Response.json(safeError(new Error(code)), {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (activeSessions.has(parsed.session_id)) {
      return Response.json(safeError(new Error("research_run_in_progress")), { status: 409 });
    }

    activeSessions.add(parsed.session_id);
    const runId = `run_${randomUUID()}`;
    const stream = createUIMessageStream<ResearchUIMessage>({
      execute: async ({ writer }) => {
        try {
          writer.write({
            type: "data-run",
            id: runId,
            data: researchRunSchema.parse({
              session_id: parsed.session_id,
              run_id: runId,
              state: "running",
              summary: "The agent is deciding what to research next",
            }),
          });

          let persistenceWarning = threadBinding.warning;
          let persistedRevision: number | null = null;
          let persistedSnapshot = emptyThreadSnapshot(parsed.session_id);
          let title = deriveThreadTitle(parsed.message);
          let loadedThread = null;
          try {
            loadedThread = await threadBinding.store.load(parsed.session_id);
          } catch {
            persistenceWarning = "History is temporarily unavailable. Current answers remain visible in this browser.";
          }
          if (loadedThread) {
            persistedRevision = loadedThread.revision;
            persistedSnapshot = loadedThread.snapshot;
            title = loadedThread.title;
          }

          const workspace = loadedThread
            ? workspaceFromThreadSnapshot(loadedThread.snapshot)
            : getResearchWorkspace(parsed.session_id) ?? createResearchWorkspace(parsed.session_id);
          const startingArtifactRevision = workspace.artifact_revision;
          const pendingSnapshot = appendPendingUser(persistedSnapshot, {
            runId,
            message: parsed.message,
            depth: parsed.research_depth,
            createdAt: new Date().toISOString(),
          });
          try {
            const saved = loadedThread
              ? await threadBinding.store.save({
                  id: parsed.session_id,
                  expectedRevision: loadedThread.revision,
                  snapshot: pendingSnapshot,
                })
              : await threadBinding.store.create({
                  id: parsed.session_id,
                  title,
                  snapshot: pendingSnapshot,
                });
            persistedRevision = saved.revision;
            persistedSnapshot = saved.snapshot;
          } catch {
            persistedRevision = null;
            persistenceWarning = "History is temporarily unavailable. Current answers remain visible in this browser.";
          }
          writer.write({
            type: "data-thread",
            id: parsed.session_id,
            data: researchThreadStatusSchema.parse({
              thread_id: parsed.session_id,
              title,
              revision: persistedRevision,
              durable: threadBinding.durable && persistedRevision !== null,
              warning: persistenceWarning,
            }),
          });

          let checkpointQueue = Promise.resolve();
          const queueCheckpoint = (checkpoint: Parameters<NonNullable<ResearchAgentDependencies["onCheckpoint"]>>[0]) => {
            putResearchWorkspace(checkpoint);
            base.onCheckpoint?.(checkpoint);
            if (persistedRevision === null) return;
            const frozen = structuredClone(checkpoint);
            checkpointQueue = checkpointQueue.then(async () => {
              if (persistedRevision === null) return;
              const next = checkpointThreadSnapshot(persistedSnapshot, frozen, runId);
              try {
                const saved = await threadBinding.store.save({
                  id: parsed.session_id,
                  expectedRevision: persistedRevision,
                  snapshot: next,
                });
                persistedRevision = saved.revision;
                persistedSnapshot = saved.snapshot;
              } catch {
                persistedRevision = null;
                persistenceWarning = "History is temporarily unavailable. Current answers remain visible in this browser.";
              }
            });
          };

          const base = dependencyFactory(request.signal, parsed.research_depth);
          const result = await runResearchTurn({
            workspace,
            message: parsed.message,
            researchDepth: parsed.research_depth,
            runId,
          }, {
            ...base,
            signal: base.signal ?? request.signal,
            onEvent: (event: ResearchActivity) => {
              if (!request.signal.aborted) {
                writer.write({ type: "data-activity", id: event.id, data: event });
              }
              base.onEvent?.(event);
            },
            onCheckpoint: queueCheckpoint,
          });

          await checkpointQueue;
          putResearchWorkspace(result.workspace);
          for (const source of result.workspace.evidence) {
            writer.write({
              type: "data-source",
              id: source.source_id,
              data: researchSourceSchema.parse({ ...source, content: undefined }),
            });
          }
          if (result.artifact && result.artifact_revision > startingArtifactRevision) {
            writer.write({
              type: "data-artifact",
              id: `${runId}-artifact-${result.artifact_revision}`,
              data: researchArtifactEventSchema.parse({
                run_id: runId,
                revision: result.artifact_revision,
                artifact: result.artifact,
              }),
            });
          }
          if (result.assistant_message) {
            writer.write({
              type: "data-message",
              id: result.assistant_message.message_id,
              data: result.assistant_message,
            });
          }

          const receipt = researchReceiptSchema.parse({
            run_id: runId,
            status: result.status,
            counts: result.counts,
            accounted_cost_usd: result.accounted_cost_usd,
            costs: {
              luna_usd: costFor(result.usage, "agent:luna:"),
              exa_usd: costFor(result.usage, "agent:exa:"),
              retrieval_usd: costFor(result.usage, "agent:transcript_search:"),
              combined_usd: result.accounted_cost_usd,
            },
            elapsed_ms: result.elapsed_ms,
            limitations: [
              ...result.limitations,
              ...(persistenceWarning ? [threadBinding.durable ? "thread_history_unavailable" : "thread_history_not_durable"] : []),
            ].slice(0, 20),
            artifact_revision: result.artifact_revision,
          });
          if (persistedRevision !== null) {
            try {
              const terminal = terminalThreadSnapshot(persistedSnapshot, result, receipt);
              const saved = await threadBinding.store.save({
                id: parsed.session_id,
                expectedRevision: persistedRevision,
                snapshot: terminal,
              });
              persistedRevision = saved.revision;
              persistedSnapshot = saved.snapshot;
            } catch {
              persistedRevision = null;
              persistenceWarning = "History is temporarily unavailable. Current answers remain visible in this browser.";
            }
          }
          writer.write({
            type: "data-thread",
            id: parsed.session_id,
            data: researchThreadStatusSchema.parse({
              thread_id: parsed.session_id,
              title,
              revision: persistedRevision,
              durable: threadBinding.durable && persistedRevision !== null,
              warning: persistenceWarning,
            }),
          });
          writer.write({
            type: "data-receipt",
            id: runId,
            data: receipt,
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
            data: researchRunSchema.parse({
              session_id: parsed.session_id,
              run_id: runId,
              state: result.status,
              summary,
            }),
          });
          if (result.status === "failed") {
            const firstCode = result.limitations.find((item) => /^research_[a-z0-9_]+$/.test(item));
            writer.write({
              type: "data-error",
              id: runId,
              data: safeError(new Error(firstCode ?? "research_request_failed"), runId),
            });
          }

          const text = result.assistant_message?.text ?? summary;
          const textId = `text_${runId}`;
          writer.write({ type: "text-start", id: textId });
          writer.write({ type: "text-delta", id: textId, delta: text });
          writer.write({ type: "text-end", id: textId });
          writer.write({ type: "finish", finishReason: "stop" });
        } catch (error) {
          if (process.env.NODE_ENV === "development") {
            console.error("[nonsense-research-route]", safeDevelopmentDiagnostic(error));
          }
          if (!request.signal.aborted) {
            const safe = safeError(error, runId);
            writer.write({ type: "data-error", id: runId, data: safe });
            writer.write({
              type: "data-run",
              id: runId,
              data: researchRunSchema.parse({
                session_id: parsed.session_id,
                run_id: runId,
                state: "failed",
                summary: safe.message,
              }),
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

function costFor(usage: Array<{ action: string; accounted_cost_usd: number }>, prefix: string): number {
  return Number(usage
    .filter((item) => item.action.startsWith(prefix))
    .reduce((sum, item) => sum + item.accounted_cost_usd, 0)
    .toFixed(8));
}

export const POST = createResearchChatRoute();
