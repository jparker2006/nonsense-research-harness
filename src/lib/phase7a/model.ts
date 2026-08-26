import { z } from "zod";
import { readOpenRouterStream, type Phase2Request } from "../openrouter-phase2.ts";
import { PHASE_5_MODELS } from "../phase5/contracts.ts";
import type { Phase5ModelReceipt, Phase5ModelResult } from "../phase5/model.ts";
import {
  phase7aControllerOutputSchemaForAliases,
  phase7aControllerOutputToDecision,
  type Phase7AControllerDecision,
  type Phase7AControllerFailure,
  type Phase7AResearchDepth,
  type Phase7AWorkspace,
} from "./contracts.ts";
import { PHASE_7A_SYSTEM_PROMPT, phase7aCitationAliases, phase7aDecisionPrompt } from "./prompts.ts";

export const PHASE_7A_MODEL_REQUEST_TIMEOUT_MS = 120_000;
export const PHASE_7A_CONTROLLER_MAX_OUTPUT_TOKENS = 8_000;

export type Phase7AModelAdapter = {
  decide(input: {
    workspace: Phase7AWorkspace;
    currentMessage: string;
    researchDepth: Phase7AResearchDepth;
    remaining: Record<string, number>;
    lastObservation?: string;
  }, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<Phase5ModelResult<Phase7AControllerDecision>>;
};

export class Phase7AControllerOutputError extends Error {
  readonly failure: Phase7AControllerFailure;
  readonly receipt: Phase5ModelReceipt;

  constructor(failure: Phase7AControllerFailure, receipt: Phase5ModelReceipt) {
    super(failure.code);
    this.name = "Phase7AControllerOutputError";
    this.failure = failure;
    this.receipt = receipt;
  }
}

function safeZodIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 8).map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "$";
    return `${path}:${issue.code}`.slice(0, 160);
  });
}

function receiptFor(
  result: Awaited<ReturnType<typeof readOpenRouterStream>>,
  outputStatus: Phase5ModelReceipt["output_status"],
): Phase5ModelReceipt {
  return {
    model: result.model!,
    provider: result.provider,
    prompt_tokens: result.usage?.prompt_tokens,
    completion_tokens: result.usage?.completion_tokens,
    total_tokens: result.usage?.total_tokens,
    cost_usd: result.usage?.cost,
    latency_ms: Number(result.elapsedMs.toFixed(2)),
    generation_id: result.id,
    finish_reason: result.finishReason,
    response_characters: result.text.length,
    output_status: outputStatus,
    reasoning_tokens: result.usage?.completion_tokens_details?.reasoning_tokens,
  };
}

function controllerOutputError(
  code: Phase7AControllerFailure["code"],
  stage: Phase7AControllerFailure["stage"],
  receipt: Phase5ModelReceipt,
  issues: string[] = [],
): Phase7AControllerOutputError {
  return new Phase7AControllerOutputError({
    code,
    stage,
    issues,
    generation_id: receipt.generation_id,
    provider: receipt.provider,
    finish_reason: receipt.finish_reason,
    response_characters: receipt.response_characters,
  }, receipt);
}

function controllerRequest(prompt: string, outputSchema: z.ZodType): Phase2Request {
  const model = PHASE_5_MODELS.light;
  return {
    model: model.id,
    messages: [
      { role: "system", content: PHASE_7A_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    stream: true,
    max_tokens: PHASE_7A_CONTROLLER_MAX_OUTPUT_TOKENS,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "phase7a_controller_action",
        strict: true,
        schema: z.toJSONSchema(outputSchema, { target: "draft-07", unrepresentable: "any" }),
      },
    },
    provider: {
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: "deny",
      zdr: model.zdr,
      max_price: model.maxPricePerMillion,
    },
    reasoning: { effort: model.reasoningEffort, exclude: true },
  };
}

export function phase7aLocalLiveAuthorized(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.PHASE7A_LOCAL_LIVE === "approved";
}

export function createOpenRouterPhase7AModel(options: {
  apiKey?: string;
  liveAuthorized?: boolean;
  fetchImpl?: typeof fetch;
}): Phase7AModelAdapter {
  const apiKey = options.apiKey?.trim() ?? "";
  const liveAuthorized = options.liveAuthorized === true;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async decide(input, callOptions) {
      if (!apiKey) throw new Error("phase7a_missing_key");
      if (!liveAuthorized) throw new Error("phase7a_live_not_authorized");
      const startedAt = performance.now();
      try {
        const aliases = phase7aCitationAliases(input.workspace);
        const outputSchema = phase7aControllerOutputSchemaForAliases([...aliases.sourceIdByAlias.keys()]);
        const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            "x-title": "Nonsense Research Harness Phase 7A",
          },
          body: JSON.stringify(controllerRequest(phase7aDecisionPrompt(input), outputSchema)),
          signal: callOptions?.signal
            ? AbortSignal.any([
                callOptions.signal,
                AbortSignal.timeout(Math.max(1, Math.min(callOptions.timeoutMs ?? PHASE_7A_MODEL_REQUEST_TIMEOUT_MS, PHASE_7A_MODEL_REQUEST_TIMEOUT_MS))),
              ])
            : AbortSignal.timeout(Math.max(1, Math.min(callOptions?.timeoutMs ?? PHASE_7A_MODEL_REQUEST_TIMEOUT_MS, PHASE_7A_MODEL_REQUEST_TIMEOUT_MS))),
        });
        const result = await readOpenRouterStream(response, startedAt);
        const expected = PHASE_5_MODELS.light.id;
        if (!result.model || (result.model !== expected && !result.model.startsWith(`${expected}-`))) {
          throw new Error("phase7a_route_mismatch");
        }
        if (!result.done) throw new Error("phase7a_incomplete_stream");
        if (result.finishReason && result.finishReason !== "stop") {
          const outputStatus = result.finishReason === "length" ? "truncated" : "incomplete";
          const receipt = receiptFor(result, outputStatus);
          throw controllerOutputError(
            outputStatus === "truncated" ? "phase7a_controller_truncated_output" : "phase7a_controller_incomplete_output",
            "completion",
            receipt,
          );
        }
        if (result.text.length === 0) {
          throw controllerOutputError("phase7a_controller_empty_output", "completion", receiptFor(result, "empty"));
        }
        let json: unknown;
        try {
          json = JSON.parse(result.text);
        } catch {
          throw controllerOutputError("phase7a_controller_invalid_json", "json", receiptFor(result, "invalid_json"));
        }
        const transport = outputSchema.safeParse(json);
        if (!transport.success) {
          throw controllerOutputError(
            "phase7a_controller_transport_invalid",
            "transport",
            receiptFor(result, "parsed"),
            safeZodIssues(transport.error),
          );
        }
        let parsed: Phase7AControllerDecision;
        try {
          const resolvedTransport = transport.data.action === "respond"
            ? {
                ...transport.data,
                response_blocks: transport.data.response_blocks.map((block) => ({
                  ...block,
                  source_ids: block.source_ids.map((sourceId) => {
                    const resolved = aliases.sourceIdByAlias.get(sourceId);
                    if (!resolved) throw new Error("phase7a_citation_alias_invalid");
                    return resolved;
                  }),
                })),
              }
            : transport.data;
          parsed = phase7aControllerOutputToDecision(resolvedTransport);
        } catch (error) {
          throw controllerOutputError(
            "phase7a_controller_action_invalid",
            "action",
            receiptFor(result, "parsed"),
            error instanceof z.ZodError ? safeZodIssues(error) : [],
          );
        }
        const receipt = receiptFor(result, "parsed");
        return {
          value: parsed,
          output_status: "parsed",
          receipt,
        };
      } catch (error) {
        if (callOptions?.signal?.aborted) throw new Error("phase7a_run_stopped");
        if (error instanceof Error && error.message.startsWith("phase7a_")) throw error;
        if (error instanceof DOMException && error.name === "TimeoutError") throw new Error("phase7a_model_timeout");
        throw new Error("phase7a_model_unavailable");
      }
    },
  };
}
