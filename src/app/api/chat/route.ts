import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { phase5RunResultSchema, type Phase5RunResult } from "@/lib/phase5/contracts";
import { createLivePhase5Tools } from "@/lib/phase5/live-tools";
import { createOpenRouterPhase5Model } from "@/lib/phase5/model";
import { runPhase5Workflow } from "@/lib/phase5/workflow";
import {
  PHASE_6_LIMITS,
  parsePhase6Envelope,
  phase6ErrorSchema,
  type Phase6UIMessage,
} from "@/lib/phase6/contracts";
import { createPhase6FixtureDependencies } from "@/lib/phase6/fixture";
import { claimPhase6LiveProof, phase6LiveProofAuthorized, writePhase6LiveReport } from "@/lib/phase6/live-proof";
import { projectActivity, projectArtifact, projectReceipt } from "@/lib/phase6/projection";
import { getPhase6Session, putPhase6Session } from "@/lib/phase6/session-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const activeSessions = new Set<string>();

function safeError(error: unknown) {
  const code = error instanceof Error && /^phase6_[a-z0-9_]+$/.test(error.message)
    ? error.message
    : "phase6_request_failed";
  const messages: Record<string, string> = {
    phase6_invalid_request: "The request was invalid. Check the topic, links, and notes.",
    phase6_request_too_large: "The request exceeded the 24 KB input boundary.",
    phase6_run_in_progress: "This session already has a run in progress.",
    phase6_session_missing: "The prior artifact is no longer in this local server session.",
    phase6_live_attempt_consumed: "The single Phase 6 live proof has already been used.",
    phase6_live_not_authorized: "Live provider access is locked.",
  };
  return phase6ErrorSchema.parse({
    code,
    message: messages[code] ?? "The run failed safely. No automatic retry was started.",
    retryable: ["phase6_request_failed", "phase6_session_missing"].includes(code),
  });
}

function refinedResult(previous: Phase5RunResult, instruction: string): Phase5RunResult {
  if (!previous.artifact) throw new Error("phase6_session_missing");
  const note = `Requested refinement (not independently researched): ${instruction}`.slice(0, 500);
  return phase5RunResultSchema.parse({
    ...previous,
    run_id: `run_${randomUUID()}`,
    artifact: {
      ...previous.artifact,
      uncertainties_and_open_checks: [note, ...previous.artifact.uncertainties_and_open_checks].slice(0, 8),
    },
    status: previous.status === "failed" || previous.status === "stopped" ? "partial" : previous.status,
    events: [],
    usage: [],
    counts: { luna_turns: 0, grok_turns: 0, web_searches: 0, url_reads: 0, transcript_searches: 0, transcript_opens: 0, repairs: 0 },
    repair_attempted: false,
    accounted_cost_usd: 0,
    elapsed_ms: 0,
    validation_errors: [...previous.validation_errors, "phase6_follow_up_not_researched"],
  });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > PHASE_6_LIMITS.maxRequestBytes) {
    return Response.json(safeError(new Error("phase6_request_too_large")), { status: 413 });
  }
  let parsed;
  try {
    parsed = parsePhase6Envelope(JSON.parse(raw));
  } catch (error) {
    return Response.json(safeError(error instanceof ZodError ? new Error("phase6_invalid_request") : error), { status: 400 });
  }
  if (activeSessions.has(parsed.session_id)) {
    return Response.json(safeError(new Error("phase6_run_in_progress")), { status: 409 });
  }

  const routeStartedAt = new Date().toISOString();
  const execution = parsed.action !== "follow_up" && phase6LiveProofAuthorized() ? "live" : "fixture";
  if (execution === "live") {
    try {
      claimPhase6LiveProof();
    } catch (error) {
      return Response.json(safeError(error), { status: 409 });
    }
  }
  activeSessions.add(parsed.session_id);

  const stream = createUIMessageStream<Phase6UIMessage>({
    execute: async ({ writer }) => {
      let revision = 1;
      const runId = `run_${randomUUID()}`;
      try {
        let finalResult: Phase5RunResult;
        if (parsed.action === "follow_up") {
          const current = getPhase6Session(parsed.session_id);
          if (!current) throw new Error("phase6_session_missing");
          revision = current.revision + 1;
          writer.write({
            type: "data-run",
            id: runId,
            data: { session_id: parsed.session_id, run_id: runId, state: "running", summary: "Applying a local follow-up", mode: current.result.input.mode, execution: "fixture" },
          });
          writer.write({
            type: "data-activity",
            id: `${runId}-follow-up`,
            data: {
              id: `${runId}-follow-up`,
              run_id: runId,
              kind: "composition",
              label: "Refining the existing packet",
              detail: "Using the current validated evidence without new research",
              status: "running",
              created_at: new Date().toISOString(),
            },
          });
          finalResult = refinedResult(current.result, parsed.instruction);
          writer.write({
            type: "data-activity",
            id: `${runId}-follow-up`,
            data: {
              id: `${runId}-follow-up`,
              run_id: runId,
              kind: "composition",
              label: "Existing packet refined",
              detail: "No new web or archive research was performed",
              status: "complete",
              created_at: new Date().toISOString(),
            },
          });
        } else {
          writer.write({
            type: "data-run",
            id: runId,
            data: { session_id: parsed.session_id, run_id: runId, state: "running", summary: "Research run started", mode: parsed.input.mode, execution },
          });
          const onEvent = (event: Parameters<typeof projectActivity>[0]) => {
            if (request.signal.aborted) return;
            const projected = projectActivity(event);
            writer.write({ type: "data-activity", id: projected.id, data: projected });
          };
          const deps = execution === "live"
            ? {
                model: createOpenRouterPhase5Model({ apiKey: process.env.OPENROUTER_API_KEY, liveAuthorized: true, phase6LiveProof: true }),
                tools: createLivePhase5Tools({ apiKey: process.env.OPENROUTER_API_KEY, liveAuthorized: true, signal: request.signal }),
                signal: request.signal,
                onEvent,
              }
            : { ...createPhase6FixtureDependencies(request.signal), onEvent };
          finalResult = await runPhase5Workflow(parsed.input, deps, { runId });
        }

        const artifact = projectArtifact(finalResult, revision);
        if (artifact) writer.write({ type: "data-artifact", id: `${finalResult.run_id}-r${revision}`, data: artifact });
        writer.write({ type: "data-receipt", id: finalResult.run_id, data: projectReceipt(finalResult, revision) });
        writer.write({
          type: "data-run",
          id: finalResult.run_id,
          data: {
            session_id: parsed.session_id,
            run_id: finalResult.run_id,
            state: finalResult.status,
            summary: finalResult.status === "complete" ? "Preparation packet ready" : finalResult.status === "partial" ? "Packet ready with explicit limitations" : finalResult.status === "stopped" ? "Run stopped" : "Run failed safely",
            mode: finalResult.input.mode,
            execution,
          },
        });
        const textId = `summary-${finalResult.run_id}`;
        writer.write({ type: "text-start", id: textId });
        writer.write({ type: "text-delta", id: textId, delta: finalResult.artifact ? "The validated preparation packet is ready in the artifact workspace." : "No validated artifact was produced." });
        writer.write({ type: "text-end", id: textId });
        putPhase6Session({ session_id: parsed.session_id, result: finalResult, revision, updated_at_ms: Date.now() });
        if (execution === "live") writePhase6LiveReport(finalResult, routeStartedAt);
        writer.write({ type: "finish", finishReason: "stop" });
      } catch (error) {
        if (!request.signal.aborted) {
          const safe = safeError(error);
          writer.write({ type: "data-error", id: runId, data: safe });
          writer.write({
            type: "data-run",
            id: runId,
            data: { session_id: parsed.session_id, run_id: runId, state: "failed", summary: safe.message, mode: parsed.action === "follow_up" ? "headlines" : parsed.input.mode, execution },
          });
        }
      } finally {
        activeSessions.delete(parsed.session_id);
      }
    },
    onError: () => "The run failed safely. No automatic retry was started.",
  });

  return createUIMessageStreamResponse({
    stream,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Nonsense-Execution": execution },
  });
}
