import { randomUUID } from "node:crypto";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { failedPageRecord, normalizeWebUrl } from "../web-research/contracts.ts";
import type { WebSearchInput, WebSearchResult, WebSourceRecord } from "../web-research/types.ts";
import type {
  OpenTranscriptChunkResult,
  TranscriptSearchFilters,
  TranscriptSearchResult,
} from "../transcript-retrieval/types.ts";
import type { ProviderReceipt } from "../transcript-retrieval/providers.ts";
import {
  PHASE_5_LIMITS,
  evidenceSourceSchema,
  phase5ActivityEventSchema,
  phase5CountsSchema,
  phase5InputSchema,
  phase5RunResultSchema,
  phase5UsageSchema,
  researchPlanSchema,
  type EvidenceSource,
  type Phase5ActivityEvent,
  type Phase5Artifact,
  type Phase5Counts,
  type Phase5Input,
  type Phase5RunResult,
  type Phase5Usage,
} from "./contracts.ts";
import {
  phase5ModelOutputFailure,
  type Phase5ModelAdapter,
  type Phase5ModelReceipt,
} from "./model.ts";
import {
  canonicalizeArtifactSourceLedger,
  hydrateArtifactSourceLedger,
  validatePhase5Artifact,
} from "./validation.ts";

export type Phase5ToolAdapter = {
  webSearch(input: WebSearchInput): Promise<WebSearchResult>;
  readUrl(input: { url: string }): Promise<WebSourceRecord>;
  searchTranscripts(input: {
    query: string;
    filters?: TranscriptSearchFilters;
    limit?: number;
  }): Promise<{ result: TranscriptSearchResult; receipts?: ProviderReceipt[] }>;
  openTranscriptChunk(input: { chunk_id: string }): Promise<OpenTranscriptChunkResult> | OpenTranscriptChunkResult;
};

export type Phase5WorkflowDependencies = {
  model: Phase5ModelAdapter;
  tools: Phase5ToolAdapter;
  now?: () => Date;
  clockMs?: () => number;
  signal?: AbortSignal;
  onEvent?: (event: Phase5ActivityEvent) => void;
};

const internalStateSchema = z.object({
  run_id: z.string(),
  status: z.enum(["running", "complete", "partial", "stopped", "failed"]),
  input: phase5InputSchema,
  plan: researchPlanSchema.nullable(),
  raw_artifact: z.unknown().nullable(),
  artifact: z.unknown().nullable(),
  evidence: z.array(evidenceSourceSchema),
  validation_errors: z.array(z.string()),
  events: z.array(phase5ActivityEventSchema),
  usage: z.array(phase5UsageSchema),
  counts: phase5CountsSchema,
  repair_attempted: z.boolean(),
  started_at_ms: z.number(),
  accounted_cost_usd: z.number().nonnegative(),
});

type InternalState = z.infer<typeof internalStateSchema>;
type CountKey = keyof Phase5Counts;

const RESERVATIONS = Object.freeze({
  luna: 0.02,
  grok: 0.2,
  webSearch: 0.08,
  transcriptSearch: 0.02,
});

function normalizeInput(value: Phase5Input): Phase5Input {
  const parsed = phase5InputSchema.parse(value);
  const links: string[] = [];
  for (const raw of parsed.links) {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("phase5_invalid_link");
    }
    const normalized = normalizeWebUrl(url.toString());
    if (!links.includes(normalized)) links.push(normalized);
  }
  return { ...parsed, links };
}

function newCounts(): Phase5Counts {
  return {
    luna_turns: 0,
    grok_turns: 0,
    web_searches: 0,
    url_reads: 0,
    transcript_searches: 0,
    transcript_opens: 0,
    repairs: 0,
  };
}

function elapsed(state: InternalState, deps: Phase5WorkflowDependencies): number {
  return Math.max(0, (deps.clockMs?.() ?? performance.now()) - state.started_at_ms);
}

function assertTime(state: InternalState, deps: Phase5WorkflowDependencies) {
  if (deps.signal?.aborted) throw new Error("phase5_run_stopped");
  if (elapsed(state, deps) > PHASE_5_LIMITS.wholeRunTimeoutMs) throw new Error("phase5_run_timeout");
}

function remainingTime(state: InternalState, deps: Phase5WorkflowDependencies): number {
  const remaining = PHASE_5_LIMITS.wholeRunTimeoutMs - elapsed(state, deps) - 250;
  if (remaining <= 0) throw new Error("phase5_run_timeout");
  return remaining;
}

function safeFailureCode(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  return /^phase5_[a-z0-9_]+$/.test(message) ? message : fallback;
}

function stopped(error: unknown): boolean {
  return error instanceof Error && error.message === "phase5_run_stopped";
}

function failState(
  state: InternalState,
  deps: Phase5WorkflowDependencies,
  code: string,
  summary: string,
) {
  state.status = "failed";
  if (!state.validation_errors.includes(code)) state.validation_errors.push(code);
  if (!state.events.some((item) => item.type === "run_failed" && item.detail?.code === code)) {
    event(state, deps, "run_failed", summary, { status: "failed", detail: { code } });
  }
}

function stopState(state: InternalState, deps: Phase5WorkflowDependencies) {
  state.status = "stopped";
  if (!state.validation_errors.includes("phase5_run_stopped")) state.validation_errors.push("phase5_run_stopped");
  if (!state.events.some((item) => item.type === "run_stopped")) {
    event(state, deps, "run_stopped", "Research run stopped by the user", { status: "stopped" });
  }
}

function event(
  state: InternalState,
  deps: Phase5WorkflowDependencies,
  type: Phase5ActivityEvent["type"],
  summary: string,
  options: Pick<Phase5ActivityEvent, "tool" | "status" | "detail"> = {},
) {
  const next = phase5ActivityEventSchema.parse({
    event_id: `evt_${String(state.events.length + 1).padStart(3, "0")}`,
    run_id: state.run_id,
    type,
    created_at: (deps.now?.() ?? new Date()).toISOString(),
    summary: summary.slice(0, 300),
    ...options,
  });
  state.events.push(next);
  deps.onEvent?.(next);
}

function reserve(state: InternalState, amount: number) {
  if (state.accounted_cost_usd + amount > PHASE_5_LIMITS.costCapUsd + 1e-9) {
    throw new Error("phase5_budget_exhausted");
  }
}

function increment(state: InternalState, key: CountKey, maximum: number) {
  if (state.counts[key] >= maximum) throw new Error(`phase5_limit_${key}`);
  state.counts[key] += 1;
}

function addUsage(
  state: InternalState,
  action: string,
  reservation: number,
  receipt?: {
    model?: string;
    provider?: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost_usd?: number;
    generation_id?: string;
    finish_reason?: string;
    response_characters?: number;
    output_status?: Phase5ModelReceipt["output_status"];
    reasoning_tokens?: number;
  },
) {
  const accounted = receipt?.cost_usd ?? reservation;
  const usage: Phase5Usage = {
    action,
    model: receipt?.model,
    provider: receipt?.provider,
    prompt_tokens: receipt?.prompt_tokens,
    completion_tokens: receipt?.completion_tokens,
    total_tokens: receipt?.total_tokens,
    reported_cost_usd: receipt?.cost_usd,
    accounted_cost_usd: Number(accounted.toFixed(8)),
    receipt_missing: receipt?.cost_usd === undefined,
    generation_id: receipt?.generation_id,
    finish_reason: receipt?.finish_reason,
    response_characters: receipt?.response_characters,
    output_status: receipt?.output_status,
    reasoning_tokens: receipt?.reasoning_tokens,
  };
  state.usage.push(usage);
  state.accounted_cost_usd = Number((state.accounted_cost_usd + accounted).toFixed(8));
  if (state.accounted_cost_usd > PHASE_5_LIMITS.costCapUsd + 1e-9) {
    throw new Error("phase5_budget_crossed");
  }
}

function modelUsage(state: InternalState, action: string, reservation: number, receipt?: Phase5ModelReceipt) {
  addUsage(state, action, reservation, receipt ? {
    model: receipt.model,
    provider: receipt.provider,
    prompt_tokens: receipt.prompt_tokens,
    completion_tokens: receipt.completion_tokens,
    total_tokens: receipt.total_tokens,
    cost_usd: receipt.cost_usd,
    generation_id: receipt.generation_id,
    finish_reason: receipt.finish_reason,
    response_characters: receipt.response_characters,
    output_status: receipt.output_status,
    reasoning_tokens: receipt.reasoning_tokens,
  } : undefined);
}

function transcriptUsage(state: InternalState, action: string, receipts: ProviderReceipt[] | undefined) {
  if (!receipts?.length) {
    addUsage(state, action, RESERVATIONS.transcriptSearch);
    return;
  }
  for (const receipt of receipts) {
    addUsage(state, action, 0, {
      model: receipt.model,
      provider: receipt.provider,
      prompt_tokens: receipt.usage.prompt_tokens,
      total_tokens: receipt.usage.total_tokens,
      cost_usd: receipt.reportedCostUsd ?? receipt.calculatedCostUsd,
    });
  }
}

function pageEvidence(page: WebSourceRecord, sourceType: "provided_link" | "web"): EvidenceSource {
  const content = page.text?.slice(0, PHASE_5_LIMITS.maxEvidenceCharactersPerSource);
  return {
    source_id: page.source_id,
    source_type: sourceType,
    availability: page.availability,
    evidence_usable: page.evidence_usable,
    title: page.title,
    url: page.final_url ?? page.url,
    retrieved_at: page.retrieved_at,
    excerpt: page.excerpt,
    content,
    failure_code: page.failure?.code,
  };
}

function archiveEvidence(result: Extract<OpenTranscriptChunkResult, { status: "complete" }>): EvidenceSource {
  const chunk = result.chunk;
  const content = chunk.text.slice(0, PHASE_5_LIMITS.maxEvidenceCharactersPerSource);
  return {
    source_id: `archive_${chunk.chunk_id}`,
    source_type: "archive",
    availability: "complete",
    evidence_usable: true,
    title: chunk.title,
    excerpt: content,
    content,
    episode_id: chunk.episode_id,
    segment_id: chunk.segment_id,
    chunk_id: chunk.chunk_id,
    season: chunk.season,
    episode_number: chunk.episode_number,
    episode_format: chunk.episode_format,
    segment_role: chunk.segment_role,
  };
}

function upsertEvidence(state: InternalState, source: EvidenceSource) {
  const index = state.evidence.findIndex((item) => item.source_id === source.source_id);
  if (index === -1) state.evidence.push(source);
  else state.evidence[index] = source;
}

function alreadyRetrieved(state: InternalState, sourceId: string): boolean {
  return state.evidence.some((source) => source.source_id === sourceId && source.evidence_usable);
}

function withoutMachineLedger(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const generated = { ...(value as Record<string, unknown>) };
  delete generated.source_ledger;
  return generated;
}

async function readOne(
  state: InternalState,
  deps: Phase5WorkflowDependencies,
  url: string,
  sourceType: "provided_link" | "web",
) {
  try {
    assertTime(state, deps);
    increment(state, "url_reads", PHASE_5_LIMITS.maxUrlReads);
    event(state, deps, "tool_started", `Reading ${sourceType === "provided_link" ? "supplied" : "discovered"} source`, {
      tool: "read_url",
      status: "running",
      detail: { url },
    });
    const page = await deps.tools.readUrl({ url });
    assertTime(state, deps);
    upsertEvidence(state, pageEvidence(page, sourceType));
    event(
      state,
      deps,
      page.evidence_usable ? "tool_completed" : "tool_failed",
      page.evidence_usable ? "Source retrieved" : "Source could not be used as evidence",
      {
        tool: "read_url",
        status: page.evidence_usable ? "complete" : "failed",
        detail: {
          source_id: page.source_id,
          availability: page.availability,
          ...(page.failure?.code ? { code: page.failure.code } : {}),
        },
      },
    );
  } catch (error) {
    if (stopped(error)) {
      stopState(state, deps);
      return;
    }
    const code = safeFailureCode(error, "read_unavailable");
    upsertEvidence(
      state,
      pageEvidence(
        failedPageRecord({
          requested: url,
          availability: "unavailable",
          code,
          message: "Source retrieval failed safely.",
          retrievedAt: (deps.now?.() ?? new Date()).toISOString(),
        }),
        sourceType,
      ),
    );
    if (code === "phase5_run_timeout") {
      failState(state, deps, "phase5_run_timeout", "Research run exceeded its time boundary");
    }
    event(state, deps, "tool_failed", "Source retrieval failed safely", {
      tool: "read_url",
      status: "failed",
      detail: {
        code,
      },
    });
  }
}

async function research(state: InternalState, deps: Phase5WorkflowDependencies): Promise<InternalState> {
  try {
    assertTime(state, deps);
  } catch (error) {
    if (stopped(error)) stopState(state, deps);
    else {
      state.status = "failed";
      state.validation_errors = [error instanceof Error ? error.message : "phase5_run_timeout"];
      event(state, deps, "run_failed", "Research run exceeded its time boundary", { status: "failed" });
    }
    return state;
  }
  reserve(state, RESERVATIONS.luna);
  increment(state, "luna_turns", PHASE_5_LIMITS.maxLunaTurns);
  let planResult;
  try {
    planResult = await deps.model.plan(state.input, { timeoutMs: remainingTime(state, deps), signal: deps.signal });
    modelUsage(state, "luna_research_plan", RESERVATIONS.luna, planResult.receipt);
    const outputFailure = phase5ModelOutputFailure(planResult.output_status);
    if (outputFailure) throw new Error(outputFailure);
    assertTime(state, deps);
    state.plan = researchPlanSchema.parse({
      web_queries: [...new Set(planResult.value.web_queries)],
      archive_queries: [...new Set(planResult.value.archive_queries)],
    });
  } catch (error) {
    if (!planResult) modelUsage(state, "luna_research_plan", RESERVATIONS.luna);
    if (stopped(error)) stopState(state, deps);
    else {
      state.status = "failed";
      state.validation_errors = [safeFailureCode(error, planResult ? "phase5_planner_invalid" : "phase5_planner_failed")];
      event(state, deps, "run_failed", "Research planning failed safely", { status: "failed" });
    }
    return state;
  }

  for (const url of state.input.links) {
    if (state.counts.url_reads >= PHASE_5_LIMITS.maxUrlReads) break;
    await readOne(state, deps, url, "provided_link");
    if (["failed", "stopped"].includes(state.status)) return state;
  }

  const webQueries = state.plan.web_queries.slice(0, state.input.mode === "big_story" ? 2 : 1);
  for (const query of webQueries) {
    if (state.counts.web_searches >= PHASE_5_LIMITS.maxWebSearches) break;
    let usageRecorded = false;
    try {
      assertTime(state, deps);
      reserve(state, RESERVATIONS.webSearch);
      increment(state, "web_searches", PHASE_5_LIMITS.maxWebSearches);
      event(state, deps, "tool_started", "Searching the current web", {
        tool: "web_search",
        status: "running",
        detail: { query },
      });
      const search = await deps.tools.webSearch({ query, limit: 3 });
      usageRecorded = true;
      addUsage(state, "web_search", RESERVATIONS.webSearch, {
        model: search.receipt.provider_model,
        provider: search.receipt.provider_name,
        prompt_tokens: search.receipt.prompt_tokens,
        completion_tokens: search.receipt.completion_tokens,
        total_tokens: search.receipt.total_tokens,
        cost_usd: search.receipt.cost_usd,
      });
      assertTime(state, deps);
      event(
        state,
        deps,
        ["complete", "partial"].includes(search.status) ? "tool_completed" : "tool_failed",
        ["complete", "partial"].includes(search.status) ? "Current sources found" : "Current search returned no usable candidates",
        {
          tool: "web_search",
          status: ["complete", "partial"].includes(search.status) ? "complete" : "failed",
          detail: {
            query,
            result_count: search.sources.length,
            search_status: search.status,
            ...(search.failure?.code ? { code: search.failure.code } : {}),
          },
        },
      );
      for (const candidate of search.sources) {
        if (state.counts.url_reads >= PHASE_5_LIMITS.maxUrlReads) break;
        if (alreadyRetrieved(state, candidate.source_id)) continue;
        await readOne(state, deps, candidate.url, "web");
      }
    } catch (error) {
      if (stopped(error)) {
        stopState(state, deps);
        return state;
      }
      const code = safeFailureCode(error, "web_search_unavailable");
      if (!usageRecorded && state.counts.web_searches > 0) addUsage(state, "web_search", RESERVATIONS.webSearch);
      event(state, deps, "tool_failed", "Current search failed safely", {
        tool: "web_search",
        status: "failed",
        detail: { code },
      });
      if (code === "phase5_run_timeout") {
        failState(state, deps, code, "Research run exceeded its time boundary");
        return state;
      }
      if (["phase5_budget_exhausted", "phase5_budget_crossed"].includes(code)) {
        failState(state, deps, code, "Research run reached its cost boundary");
        return state;
      }
    }
  }

  const archiveQueries = state.plan.archive_queries.slice(0, state.input.mode === "headlines" ? 1 : 2);
  const archiveFilters: TranscriptSearchFilters | undefined = state.input.mode === "big_story"
    ? { episode_format: "big_story", segment_role: "story_section" }
    : undefined;
  const maximumOpensPerArchiveQuery = state.input.mode === "big_story" ? 2 : PHASE_5_LIMITS.maxTranscriptOpens;
  for (const query of archiveQueries) {
    if (state.counts.transcript_searches >= PHASE_5_LIMITS.maxTranscriptSearches) break;
    let usageRecorded = false;
    try {
      assertTime(state, deps);
      reserve(state, RESERVATIONS.transcriptSearch);
      increment(state, "transcript_searches", PHASE_5_LIMITS.maxTranscriptSearches);
      event(state, deps, "tool_started", "Searching prior Nonsense coverage", {
        tool: "search_transcripts",
        status: "running",
        detail: { query },
      });
      const envelope = await deps.tools.searchTranscripts({
        query,
        filters: archiveFilters,
        limit: state.input.mode === "big_story" ? 4 : 3,
      });
      usageRecorded = true;
      transcriptUsage(state, "transcript_search", envelope.receipts);
      assertTime(state, deps);
      event(state, deps, "tool_completed", "Archive search completed", {
        tool: "search_transcripts",
        status: envelope.result.retrieval_status === "unavailable" ? "partial" : "complete",
        detail: {
          query,
          result_count: envelope.result.matches.length,
          retrieval_status: envelope.result.retrieval_status,
        },
      });
      let openedForQuery = 0;
      for (const match of envelope.result.matches) {
        if (state.counts.transcript_opens >= PHASE_5_LIMITS.maxTranscriptOpens) break;
        const sourceId = `archive_${match.chunk_id}`;
        if (alreadyRetrieved(state, sourceId)) continue;
        if (openedForQuery >= maximumOpensPerArchiveQuery) break;
        increment(state, "transcript_opens", PHASE_5_LIMITS.maxTranscriptOpens);
        openedForQuery += 1;
        event(state, deps, "tool_started", "Opening an exact archive chunk", {
          tool: "open_transcript_chunk",
          status: "running",
          detail: { chunk_id: match.chunk_id },
        });
        const opened = await deps.tools.openTranscriptChunk({ chunk_id: match.chunk_id });
        assertTime(state, deps);
        if (opened.status === "complete") {
          const source = archiveEvidence(opened);
          upsertEvidence(state, source);
          event(state, deps, "tool_completed", "Exact archive chunk opened", {
            tool: "open_transcript_chunk",
            status: "complete",
            detail: { source_id: source.source_id, chunk_id: opened.chunk.chunk_id },
          });
        } else {
          event(state, deps, "tool_failed", "Archive chunk was not found", {
            tool: "open_transcript_chunk",
            status: "failed",
            detail: { chunk_id: opened.chunk_id },
          });
        }
      }
    } catch (error) {
      if (stopped(error)) {
        stopState(state, deps);
        return state;
      }
      const code = safeFailureCode(error, "transcript_search_unavailable");
      if (!usageRecorded && state.counts.transcript_searches > 0) {
        addUsage(state, "transcript_search", RESERVATIONS.transcriptSearch);
      }
      event(state, deps, "tool_failed", "Archive search failed safely", {
        tool: "search_transcripts",
        status: "failed",
        detail: { code },
      });
      if (code === "phase5_run_timeout") {
        failState(state, deps, code, "Research run exceeded its time boundary");
        return state;
      }
      if (["phase5_budget_exhausted", "phase5_budget_crossed"].includes(code)) {
        failState(state, deps, code, "Research run reached its cost boundary");
        return state;
      }
    }
  }
  return state;
}

async function compose(state: InternalState, deps: Phase5WorkflowDependencies): Promise<InternalState> {
  if (["failed", "stopped"].includes(state.status) || !state.plan) return state;
  if (!state.evidence.some((source) => source.evidence_usable)) {
    state.status = "failed";
    state.validation_errors.push("evidence:no_usable_sources");
    event(state, deps, "run_failed", "No usable evidence was collected", { status: "failed" });
    return state;
  }
  let callStarted = false;
  try {
    assertTime(state, deps);
    reserve(state, RESERVATIONS.grok);
    increment(state, "grok_turns", PHASE_5_LIMITS.maxGrokTurns);
    callStarted = true;
    event(state, deps, "composition_started", "Composing the preparation artifact", { status: "running" });
    const result = await deps.model.compose(state.input, state.plan, state.evidence, {
      timeoutMs: remainingTime(state, deps),
      signal: deps.signal,
    });
    modelUsage(state, "grok_composition", RESERVATIONS.grok, result.receipt);
    const outputFailure = phase5ModelOutputFailure(result.output_status);
    if (outputFailure) {
      failState(state, deps, outputFailure, "Artifact composition returned no usable structured output");
      return state;
    }
    assertTime(state, deps);
    state.raw_artifact = result.value;
  } catch (error) {
    if (callStarted && !state.usage.some((item) => item.action === "grok_composition")) {
      modelUsage(state, "grok_composition", RESERVATIONS.grok);
    }
    if (stopped(error)) stopState(state, deps);
    else {
      state.status = "failed";
      state.validation_errors = [safeFailureCode(error, "phase5_composition_failed")];
      event(state, deps, "run_failed", "Artifact composition failed safely", { status: "failed" });
    }
  }
  return state;
}

async function validateAndRepair(state: InternalState, deps: Phase5WorkflowDependencies): Promise<InternalState> {
  if (["failed", "stopped"].includes(state.status) || !state.plan) return state;
  event(state, deps, "validation_started", "Validating artifact evidence and structure", { status: "running" });
  state.raw_artifact = canonicalizeArtifactSourceLedger(
    hydrateArtifactSourceLedger(state.raw_artifact, state.evidence),
    state.evidence,
  );
  let validation = validatePhase5Artifact(state.input, state.raw_artifact, state.evidence);
  state.validation_errors = validation.errors;
  state.artifact = validation.artifact;
  if (validation.errors.length > 0) {
    event(state, deps, "validation_failed", "Artifact validation found repairable errors", {
      status: "failed",
      detail: { error_count: validation.errors.length },
    });
    let repairCallStarted = false;
    try {
      assertTime(state, deps);
      reserve(state, RESERVATIONS.grok);
      increment(state, "grok_turns", PHASE_5_LIMITS.maxGrokTurns);
      increment(state, "repairs", 1);
      repairCallStarted = true;
      state.repair_attempted = true;
      event(state, deps, "repair_started", "Running the single allowed artifact repair", { status: "running" });
      const repaired = await deps.model.repair(
        state.input,
        state.plan,
        state.evidence,
        withoutMachineLedger(state.raw_artifact),
        validation.errors,
        { timeoutMs: remainingTime(state, deps), signal: deps.signal },
      );
      modelUsage(state, "grok_repair", RESERVATIONS.grok, repaired.receipt);
      const outputFailure = phase5ModelOutputFailure(repaired.output_status);
      if (outputFailure) throw new Error(outputFailure);
      assertTime(state, deps);
      state.raw_artifact = canonicalizeArtifactSourceLedger(
        hydrateArtifactSourceLedger(repaired.value, state.evidence),
        state.evidence,
      );
      validation = validatePhase5Artifact(state.input, state.raw_artifact, state.evidence);
      state.validation_errors = validation.errors;
      state.artifact = validation.artifact;
    } catch (error) {
      if (repairCallStarted && !state.usage.some((item) => item.action === "grok_repair")) {
        modelUsage(state, "grok_repair", RESERVATIONS.grok);
      }
      if (stopped(error)) {
        stopState(state, deps);
        return state;
      }
      state.validation_errors.push(safeFailureCode(error, "phase5_repair_failed"));
    }
  }

  if (!state.artifact || state.validation_errors.length > 0) {
    state.status = state.artifact ? "partial" : "failed";
    event(
      state,
      deps,
      state.status === "failed" ? "run_failed" : "run_completed",
      state.status === "failed" ? "Artifact remained invalid after one repair" : "Partial artifact preserved with validation errors",
      { status: state.status === "failed" ? "failed" : "partial" },
    );
    return state;
  }

  const hadToolFailure = state.events.some((item) => item.type === "tool_failed");
  state.status = hadToolFailure ? "partial" : "complete";
  const completedArtifact = state.artifact as Phase5Artifact;
  event(state, deps, "artifact_completed", "Validated preparation artifact ready", {
    status: state.status,
    detail: { source_count: completedArtifact.source_ledger.length },
  });
  event(state, deps, "run_completed", state.status === "complete" ? "Research run completed" : "Research run completed with explicit limitations", {
    status: state.status,
  });
  return state;
}

function finalResult(state: InternalState, deps: Phase5WorkflowDependencies): Phase5RunResult {
  const evidence = state.evidence.map((source) => ({ ...source, content: undefined }));
  return phase5RunResultSchema.parse({
    run_id: state.run_id,
    status: state.status === "running" ? "failed" : state.status,
    input: state.input,
    plan: state.plan,
    artifact: state.artifact as Phase5Artifact | null,
    evidence,
    validation_errors: state.validation_errors,
    events: state.events,
    usage: state.usage,
    counts: state.counts,
    repair_attempted: state.repair_attempted,
    elapsed_ms: Number(elapsed(state, deps).toFixed(2)),
    accounted_cost_usd: state.accounted_cost_usd,
  });
}

export function createPhase5Workflow(deps: Phase5WorkflowDependencies) {
  const intakeStep = createStep({
    id: "phase5-intake",
    inputSchema: phase5InputSchema,
    outputSchema: internalStateSchema,
    execute: async ({ inputData, runId }) => {
      const input = normalizeInput(inputData);
      const state: InternalState = {
        run_id: runId,
        status: "running",
        input,
        plan: null,
        raw_artifact: null,
        artifact: null,
        evidence: [],
        validation_errors: [],
        events: [],
        usage: [],
        counts: newCounts(),
        repair_attempted: false,
        started_at_ms: deps.clockMs?.() ?? performance.now(),
        accounted_cost_usd: 0,
      };
      event(state, deps, "run_started", "Research run started", {
        status: "running",
        detail: { mode: input.mode },
      });
      return state;
    },
  });
  const researchStep = createStep({
    id: "phase5-research",
    inputSchema: internalStateSchema,
    outputSchema: internalStateSchema,
    execute: async ({ inputData }) => research(inputData, deps),
  });
  const compositionStep = createStep({
    id: "phase5-compose",
    inputSchema: internalStateSchema,
    outputSchema: internalStateSchema,
    execute: async ({ inputData }) => compose(inputData, deps),
  });
  const validationStep = createStep({
    id: "phase5-validate-repair",
    inputSchema: internalStateSchema,
    outputSchema: internalStateSchema,
    execute: async ({ inputData }) => validateAndRepair(inputData, deps),
  });
  const finalStep = createStep({
    id: "phase5-finalize",
    inputSchema: internalStateSchema,
    outputSchema: phase5RunResultSchema,
    execute: async ({ inputData }) => finalResult(inputData, deps),
  });
  return createWorkflow({
    id: "nonsense-phase5-agent",
    inputSchema: phase5InputSchema,
    outputSchema: phase5RunResultSchema,
    steps: [intakeStep, researchStep, compositionStep, validationStep, finalStep],
    options: { validateInputs: true },
  })
    .then(intakeStep)
    .then(researchStep)
    .then(compositionStep)
    .then(validationStep)
    .then(finalStep)
    .commit();
}

export async function runPhase5Workflow(
  input: Phase5Input,
  deps: Phase5WorkflowDependencies,
  options: { runId?: string } = {},
): Promise<Phase5RunResult> {
  const workflow = createPhase5Workflow(deps);
  const run = await workflow.createRun({ runId: options.runId ?? `run_${randomUUID()}` });
  const result = await run.start({ inputData: input });
  if (result.status !== "success" || !result.result) throw new Error("phase5_workflow_failed");
  return phase5RunResultSchema.parse(result.result);
}
