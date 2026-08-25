import { z } from "zod";
import { readOpenRouterStream, type Phase2Request } from "../openrouter-phase2.ts";
import {
  PHASE_5_LIMITS,
  PHASE_5_MODELS,
  bigStoryGeneratedArtifactSchema,
  headlinesGeneratedArtifactSchema,
  researchPlanSchema,
  type EvidenceSource,
  type Phase5Artifact,
  type Phase5Input,
  type ResearchPlan,
} from "./contracts.ts";

export const PHASE_5_LIVE_CALLS_DISABLED = true;
export const PHASE_5_MODEL_REQUEST_TIMEOUT_MS = 120_000;

export type Phase5ModelCallOptions = { timeoutMs?: number; signal?: AbortSignal };

export type Phase5ModelReceipt = {
  model: string;
  provider?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost_usd?: number;
  latency_ms: number;
  generation_id?: string;
  finish_reason?: string;
  response_characters: number;
  output_status: Phase5ModelOutputStatus;
  reasoning_tokens?: number;
};

export type Phase5ModelOutputStatus =
  | "parsed"
  | "empty"
  | "invalid_json"
  | "truncated"
  | "incomplete";

export type Phase5ModelResult<T> = {
  value: T;
  receipt: Phase5ModelReceipt;
  output_status: Phase5ModelOutputStatus;
};

export type Phase5ModelAdapter = {
  plan(input: Phase5Input, options?: Phase5ModelCallOptions): Promise<Phase5ModelResult<ResearchPlan>>;
  compose(
    input: Phase5Input,
    plan: ResearchPlan,
    evidence: EvidenceSource[],
    options?: Phase5ModelCallOptions,
  ): Promise<Phase5ModelResult<unknown>>;
  repair(
    input: Phase5Input,
    plan: ResearchPlan,
    evidence: EvidenceSource[],
    artifact: unknown,
    validationErrors: string[],
    options?: Phase5ModelCallOptions,
  ): Promise<Phase5ModelResult<unknown>>;
};

function evidenceForPrompt(evidence: EvidenceSource[]): string {
  let remaining = PHASE_5_LIMITS.maxEvidenceCharactersTotal;
  const records: Array<Record<string, unknown>> = [];
  for (const source of evidence) {
    const raw = source.content ?? source.excerpt ?? "";
    const content = raw.slice(0, Math.min(PHASE_5_LIMITS.maxEvidenceCharactersPerSource, remaining));
    remaining -= content.length;
    records.push({
      source_id: source.source_id,
      source_type: source.source_type,
      availability: source.availability,
      evidence_usable: source.evidence_usable,
      title: source.title,
      url: source.url,
      episode_id: source.episode_id,
      segment_id: source.segment_id,
      chunk_id: source.chunk_id,
      season: source.season,
      episode_number: source.episode_number,
      evidence_text: content,
    });
    if (remaining <= 0) break;
  }
  return JSON.stringify(records);
}

function artifactInstructions(mode: Phase5Input["mode"]): string {
  return `Return the strict ${mode} artifact without source_ledger; code constructs that ledger from cited evidence IDs. Be concise. Use only supplied evidence. Every sourced field must cite real source_ids. Search candidates and unavailable sources cannot support claims. Archive quotes must be exact substrings with exact episode_id, segment_id, and chunk_id. Never attribute unlabeled archive words to CJ or Jeff, invent dialogue, choose the final show topic, or write a finished on-air script. Use no timing estimates unless target_minutes exists; when it exists, every outline beat needs estimated_minutes and the total must not exceed the target. Include must_have and cut_first beats. For Big Story, use compact research_cards and include at least one key_evidence card and one interpretation card.`;
}

function modelFailureFor(status: Phase5ModelOutputStatus): string | undefined {
  if (status === "parsed") return undefined;
  return `phase5_model_${status}_output`;
}

export function phase5ModelOutputFailure(status: Phase5ModelOutputStatus): string | undefined {
  return modelFailureFor(status);
}

function requestFor(options: {
  tier: keyof typeof PHASE_5_MODELS;
  prompt: string;
  schema: z.ZodType;
  schemaName: string;
  maxTokens: number;
}): Phase2Request {
  const model = PHASE_5_MODELS[options.tier];
  return {
    model: model.id,
    messages: [{ role: "user", content: options.prompt }],
    stream: true,
    max_tokens: options.maxTokens,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: options.schemaName,
        strict: true,
        schema: z.toJSONSchema(options.schema, { target: "draft-07", unrepresentable: "any" }),
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

async function runStructured(options: {
  apiKey: string;
  liveAuthorized: boolean;
  fetchImpl: typeof fetch;
  tier: keyof typeof PHASE_5_MODELS;
  prompt: string;
  schema: z.ZodType;
  schemaName: string;
  maxTokens: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  testOnlyLockedBypass: boolean;
}): Promise<Phase5ModelResult<unknown>> {
  if (!options.apiKey.trim()) throw new Error("phase5_missing_key");
  if (!options.liveAuthorized || (PHASE_5_LIVE_CALLS_DISABLED && !options.testOnlyLockedBypass)) {
    throw new Error("phase5_live_not_authorized");
  }
  const request = requestFor(options);
  const startedAt = performance.now();
  try {
    const response = await options.fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.apiKey.trim()}`,
        "content-type": "application/json",
        "x-title": "Nonsense Research Harness Phase 5",
      },
      body: JSON.stringify(request),
      signal: options.signal
        ? AbortSignal.any([
            options.signal,
            AbortSignal.timeout(Math.max(1, Math.min(options.timeoutMs ?? PHASE_5_MODEL_REQUEST_TIMEOUT_MS, PHASE_5_MODEL_REQUEST_TIMEOUT_MS))),
          ])
        : AbortSignal.timeout(
            Math.max(1, Math.min(options.timeoutMs ?? PHASE_5_MODEL_REQUEST_TIMEOUT_MS, PHASE_5_MODEL_REQUEST_TIMEOUT_MS)),
          ),
    });
    const result = await readOpenRouterStream(response, startedAt);
    const expected = PHASE_5_MODELS[options.tier].id;
    if (!result.model || (result.model !== expected && !result.model.startsWith(`${expected}-`))) {
      throw new Error("phase5_route_mismatch");
    }
    if (!result.done) throw new Error("phase5_incomplete_stream");
    let value: unknown = null;
    let outputStatus: Phase5ModelOutputStatus;
    if (result.finishReason && result.finishReason !== "stop") {
      outputStatus = result.finishReason === "length" ? "truncated" : "incomplete";
    } else if (result.text.length === 0) {
      outputStatus = "empty";
    } else {
      try {
        value = JSON.parse(result.text);
        outputStatus = "parsed";
      } catch {
        outputStatus = "invalid_json";
      }
    }
    return {
      value,
      output_status: outputStatus,
      receipt: {
        model: result.model,
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
      },
    };
  } catch (error) {
    if (options.signal?.aborted) throw new Error("phase5_run_stopped");
    if (error instanceof Error && error.message.startsWith("phase5_")) throw error;
    throw new Error(error instanceof DOMException && error.name === "TimeoutError" ? "phase5_model_timeout" : "phase5_model_unavailable");
  }
}

export function createOpenRouterPhase5Model(options: {
  apiKey?: string;
  liveAuthorized?: boolean;
  fetchImpl?: typeof fetch;
  phase6LiveProof?: boolean;
  phase7aLive?: boolean;
  artifactContext?: Partial<Record<Phase5Input["mode"], string>>;
}): Phase5ModelAdapter {
  const apiKey = options.apiKey?.trim() ?? "";
  const liveAuthorized = options.liveAuthorized === true;
  const fetchImpl = options.fetchImpl ?? fetch;
  const testOnlyLockedBypass =
    (process.env.NODE_ENV === "test" && options.fetchImpl !== undefined) ||
    (options.phase6LiveProof === true &&
      process.env.NODE_ENV !== "production" &&
      process.env.PHASE6_EXECUTE_LIVE === "approved" &&
      process.env.PHASE6_LIVE_PROOF === "approved") ||
    (options.phase7aLive === true &&
      process.env.NODE_ENV !== "production" &&
      process.env.PHASE7A_LOCAL_LIVE === "approved");
  return {
    async plan(input, callOptions) {
      const result = await runStructured({
        apiKey,
        liveAuthorized,
        fetchImpl,
        tier: "light",
        schema: researchPlanSchema,
        schemaName: "phase5_research_plan",
        maxTokens: PHASE_5_LIMITS.lunaMaxOutputTokens,
        timeoutMs: callOptions?.timeoutMs,
        signal: callOptions?.signal,
        testOnlyLockedBypass,
        prompt: `Plan research for one podcast preparation packet. Return one or two precise current-web queries and one or two concise transcript-archive queries. Prefer exact names, claims, dates, and domains from the input. Archive queries must contain only content/topic terms; omit the show name and generic words such as podcast or transcript. The two hosts are equal; do not choose a host or invent dialogue.\n\nINPUT:\n${JSON.stringify(input)}`,
      });
      return {
        value: result.value as ResearchPlan,
        receipt: result.receipt,
        output_status: result.output_status,
      };
    },
    async compose(input, plan, evidence, callOptions) {
      const schema = input.mode === "headlines" ? headlinesGeneratedArtifactSchema : bigStoryGeneratedArtifactSchema;
      return runStructured({
        apiKey,
        liveAuthorized,
        fetchImpl,
        tier: "heavy",
        schema,
        schemaName: `phase5_${input.mode}_artifact`,
        maxTokens: PHASE_5_LIMITS.grokMaxOutputTokens,
        timeoutMs: callOptions?.timeoutMs,
        signal: callOptions?.signal,
        testOnlyLockedBypass,
        prompt: `${artifactInstructions(input.mode)}${options.artifactContext?.[input.mode] ? `\n\n${options.artifactContext[input.mode]}` : ""}\n\nINPUT:\n${JSON.stringify(input)}\n\nRESEARCH PLAN:\n${JSON.stringify(plan)}\n\nEVIDENCE:\n${evidenceForPrompt(evidence)}`,
      });
    },
    async repair(input, plan, evidence, artifact, validationErrors, callOptions) {
      const schema = input.mode === "headlines" ? headlinesGeneratedArtifactSchema : bigStoryGeneratedArtifactSchema;
      return runStructured({
        apiKey,
        liveAuthorized,
        fetchImpl,
        tier: "heavy",
        schema,
        schemaName: `phase5_${input.mode}_artifact_repair`,
        maxTokens: PHASE_5_LIMITS.grokMaxOutputTokens,
        timeoutMs: callOptions?.timeoutMs,
        signal: callOptions?.signal,
        testOnlyLockedBypass,
        prompt: `${artifactInstructions(input.mode)}${options.artifactContext?.[input.mode] ? `\n\n${options.artifactContext[input.mode]}` : ""} Repair the parseable artifact exactly once using the validation errors. Do not add evidence or IDs.\n\nINPUT:\n${JSON.stringify(input)}\n\nPLAN:\n${JSON.stringify(plan)}\n\nEVIDENCE:\n${evidenceForPrompt(evidence)}\n\nINVALID ARTIFACT:\n${JSON.stringify(artifact)}\n\nVALIDATION ERRORS:\n${JSON.stringify(validationErrors)}`,
      });
    },
  };
}

export function assertArtifactValue(value: unknown): Phase5Artifact {
  return value as Phase5Artifact;
}
