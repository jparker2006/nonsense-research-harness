import { randomUUID } from "node:crypto";
import { normalizeWebUrl } from "../web-research/contracts.ts";
import type { WebSourceRecord } from "../web-research/types.ts";
import {
  PHASE_5_LIMITS,
  phase5ArtifactSchema,
  phase5InputSchema,
  researchPlanSchema,
  type EvidenceSource,
  type Phase5Artifact,
  type Phase5Input,
  type Phase5Usage,
} from "../phase5/contracts.ts";
import {
  phase5ModelOutputFailure,
  type Phase5ModelAdapter,
  type Phase5ModelReceipt,
} from "../phase5/model.ts";
import type { Phase5ToolAdapter } from "../phase5/workflow.ts";
import {
  canonicalizeArtifactSourceLedger,
  hydrateArtifactSourceLedger,
  validatePhase5Artifact,
} from "../phase5/validation.ts";
import type { ProviderReceipt } from "../transcript-retrieval/providers.ts";
import {
  PHASE_7A_LIMITS,
  phase7aActivitySchema,
  phase7aAssistantMessageSchema,
  phase7aCountsSchema,
  phase7aRunTraceSchema,
  phase7aTraceStepSchema,
  phase7aTurnResultSchema,
  phase7aWorkspaceSchema,
  type Phase7AAction,
  type Phase7AActivity,
  type Phase7AAssistantMessage,
  type Phase7ACounts,
  type Phase7ARunTrace,
  type Phase7ATurnResult,
  type Phase7AWorkspace,
} from "./contracts.ts";
import type { Phase7AModelAdapter } from "./model.ts";

export type Phase7AAgentDependencies = {
  controller: Phase7AModelAdapter;
  composer: Phase5ModelAdapter;
  tools: Phase5ToolAdapter;
  now?: () => Date;
  clockMs?: () => number;
  signal?: AbortSignal;
  onEvent?: (event: Phase7AActivity) => void;
  costCapUsd?: number;
};

type AgentState = {
  runId: string;
  workspace: Phase7AWorkspace;
  currentMessage: string;
  status: "running" | "complete" | "partial" | "stopped" | "failed";
  events: Phase7AActivity[];
  usage: Phase5Usage[];
  counts: Phase7ACounts;
  accountedCostUsd: number;
  limitations: string[];
  assistantMessage: Phase7AAssistantMessage | null;
  startedAtMs: number;
  startedAtIso: string;
  traceSteps: Phase7ARunTrace["steps"];
  seenWebQueries: Set<string>;
  seenReadUrls: Set<string>;
  seenArchiveQueries: Set<string>;
  seenTranscriptChunks: Set<string>;
  costCapUsd: number;
};

const RESERVATIONS = Object.freeze({ controller: 0.03, webSearch: 0.1, transcriptSearch: 0.03, grok: 0.25 });

function newCounts(): Phase7ACounts {
  return phase7aCountsSchema.parse({
    controller_turns: 0,
    provider_requests: 0,
    grok_turns: 0,
    web_searches: 0,
    url_reads: 0,
    transcript_searches: 0,
    transcript_opens: 0,
    compositions: 0,
    repairs: 0,
  });
}

function nowIso(deps: Phase7AAgentDependencies): string {
  return (deps.now?.() ?? new Date()).toISOString();
}

function elapsed(state: AgentState, deps: Phase7AAgentDependencies): number {
  return Math.max(0, (deps.clockMs?.() ?? performance.now()) - state.startedAtMs);
}

function assertActive(state: AgentState, deps: Phase7AAgentDependencies): void {
  if (deps.signal?.aborted) throw new Error("phase7a_run_stopped");
  if (elapsed(state, deps) > PHASE_7A_LIMITS.wholeTurnTimeoutMs) throw new Error("phase7a_run_timeout");
}

function remainingTime(state: AgentState, deps: Phase7AAgentDependencies): number {
  const remaining = PHASE_7A_LIMITS.wholeTurnTimeoutMs - elapsed(state, deps) - 250;
  if (remaining <= 0) throw new Error("phase7a_run_timeout");
  return remaining;
}

function safeCode(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  return /^phase7a_[a-z0-9_]+$/.test(message) ? message : fallback;
}

function addLimitation(state: AgentState, code: string): void {
  if (!state.limitations.includes(code)) state.limitations.push(code.slice(0, 240));
}

function queryKey(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function appendRecentUniqueQuery(history: string[], query: string, limit: number): string[] {
  const key = queryKey(query);
  return [...history.filter((item) => queryKey(item) !== key), query].slice(-limit);
}

function emit(
  state: AgentState,
  deps: Phase7AAgentDependencies,
  value: Omit<Phase7AActivity, "id" | "run_id" | "created_at"> & { id?: string },
): Phase7AActivity {
  const parsed = phase7aActivitySchema.parse({
    id: value.id ?? `evt_${state.runId}_${String(state.events.length + 1).padStart(3, "0")}`,
    run_id: state.runId,
    created_at: nowIso(deps),
    ...value,
  });
  const index = state.events.findIndex((event) => event.id === parsed.id);
  if (index === -1) state.events.push(parsed);
  else state.events[index] = parsed;
  deps.onEvent?.(parsed);
  return parsed;
}

function reserveProvider(state: AgentState, requests: number, amount: number): void {
  if (state.counts.provider_requests + requests > PHASE_7A_LIMITS.maxProviderRequests) {
    throw new Error("phase7a_provider_request_limit");
  }
  if (state.accountedCostUsd + amount > state.costCapUsd + 1e-9) {
    throw new Error("phase7a_budget_exhausted");
  }
  state.counts.provider_requests += requests;
}

function addUsage(
  state: AgentState,
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
): void {
  const accounted = receipt?.cost_usd ?? reservation;
  state.usage.push({
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
  });
  state.accountedCostUsd = Number((state.accountedCostUsd + accounted).toFixed(8));
  if (state.accountedCostUsd > state.costCapUsd + 1e-9) throw new Error("phase7a_budget_crossed");
}

function addModelUsage(state: AgentState, action: string, reservation: number, receipt: Phase5ModelReceipt): void {
  addUsage(state, action, reservation, receipt);
}

function addTranscriptUsage(state: AgentState, receipts: ProviderReceipt[] | undefined): void {
  if (!receipts?.length) {
    addUsage(state, "transcript_search", RESERVATIONS.transcriptSearch);
    return;
  }
  for (const receipt of receipts) {
    addUsage(state, "transcript_search", 0, {
      model: receipt.model,
      provider: receipt.provider,
      prompt_tokens: receipt.usage.prompt_tokens,
      total_tokens: receipt.usage.total_tokens,
      cost_usd: receipt.reportedCostUsd ?? receipt.calculatedCostUsd,
    });
  }
}

function appendTurn(state: AgentState, role: "user" | "assistant", text: string, sourceIds: string[], deps: Phase7AAgentDependencies): void {
  state.workspace.turns.push({
    turn_id: `turn_${randomUUID()}`,
    role,
    text,
    source_ids: sourceIds,
    created_at: nowIso(deps),
  });
  state.workspace.turns = state.workspace.turns.slice(-PHASE_7A_LIMITS.maxConversationTurns);
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

function archiveEvidence(opened: Awaited<ReturnType<Phase5ToolAdapter["openTranscriptChunk"]>>): EvidenceSource | null {
  if (opened.status !== "complete") return null;
  const { chunk } = opened;
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

function upsertEvidence(state: AgentState, source: EvidenceSource): void {
  const index = state.workspace.evidence.findIndex((item) => item.source_id === source.source_id);
  if (index >= 0) state.workspace.evidence[index] = source;
  else {
    if (state.workspace.evidence.length >= PHASE_7A_LIMITS.maxEvidenceSources) throw new Error("phase7a_evidence_limit");
    state.workspace.evidence.push(source);
  }
}

function suppliedUrls(workspace: Phase7AWorkspace): Set<string> {
  const urls = new Set<string>();
  for (const turn of workspace.turns.filter((item) => item.role === "user")) {
    for (const match of turn.text.matchAll(/https?:\/\/[^\s<>()"']+/gi)) {
      try {
        const cleaned = match[0].replace(/[.,;!?\])}]+$/, "");
        urls.add(normalizeWebUrl(cleaned));
      } catch {
        // Invalid user text never becomes an allowed URL.
      }
    }
  }
  return urls;
}

function allowedReadUrl(state: AgentState, raw: string): { url: string; sourceType: "provided_link" | "web" } {
  const parsed = new URL(raw);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("phase7a_url_not_allowed");
  const url = normalizeWebUrl(parsed.toString());
  const supplied = suppliedUrls(state.workspace);
  if (supplied.has(url)) return { url, sourceType: "provided_link" };
  if (state.workspace.candidates.some((candidate) => normalizeWebUrl(candidate.url) === url)) return { url, sourceType: "web" };
  throw new Error("phase7a_url_not_allowed");
}

function remaining(state: AgentState): Record<string, number> {
  return {
    controller_turns: PHASE_7A_LIMITS.maxControllerTurns - state.counts.controller_turns,
    provider_requests: PHASE_7A_LIMITS.maxProviderRequests - state.counts.provider_requests,
    web_searches: PHASE_7A_LIMITS.maxWebSearches - state.counts.web_searches,
    url_reads: PHASE_7A_LIMITS.maxUrlReads - state.counts.url_reads,
    transcript_searches: PHASE_7A_LIMITS.maxTranscriptSearches - state.counts.transcript_searches,
    transcript_opens: PHASE_7A_LIMITS.maxTranscriptOpens - state.counts.transcript_opens,
    compositions: PHASE_7A_LIMITS.maxCompositions - state.counts.compositions,
    repairs: PHASE_7A_LIMITS.maxRepairs - state.counts.repairs,
    cost_microusd: Math.max(0, Math.floor((state.costCapUsd - state.accountedCostUsd) * 1_000_000)),
  };
}

function actionArgument(action: Phase7AAction): string {
  if (action.action === "web_search" || action.action === "search_transcripts") return action.query;
  if (action.action === "read_url") return new URL(action.url).hostname;
  if (action.action === "read_urls") return action.urls.map((url) => new URL(url).hostname).join(", ");
  if (action.action === "open_transcript_chunk") return action.chunk_id;
  if (action.action === "open_transcript_chunks") return action.chunk_ids.join(", ");
  if (action.action === "create_artifact") return `${action.mode}: ${action.topic}`;
  return action.source_ids.join(", ");
}

function withoutMachineLedger(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const copy = { ...(value as Record<string, unknown>) };
  delete copy.source_ledger;
  return copy;
}

function compositionInput(state: AgentState, action: Extract<Phase7AAction, { action: "create_artifact" }>): Phase5Input {
  const recentConversation = state.workspace.turns.slice(-10).map((turn) => `${turn.role.toUpperCase()}: ${turn.text}`).join("\n");
  return phase5InputSchema.parse({
    mode: action.mode,
    topic: action.topic,
    links: state.workspace.evidence.filter((item) => item.evidence_usable && item.url).map((item) => item.url!).slice(0, 3),
    notes: `${action.instruction ? `${action.instruction}\n\n` : ""}RELEVANT CONVERSATION:\n${recentConversation}`.slice(0, PHASE_5_LIMITS.maxNotesCharacters),
    target_minutes: action.target_minutes,
  });
}

async function createArtifact(
  state: AgentState,
  deps: Phase7AAgentDependencies,
  action: Extract<Phase7AAction, { action: "create_artifact" }>,
): Promise<string> {
  if (state.counts.compositions >= PHASE_7A_LIMITS.maxCompositions) throw new Error("phase7a_composition_limit");
  if (!state.workspace.evidence.some((source) => source.evidence_usable)) throw new Error("phase7a_artifact_no_evidence");
  if (state.workspace.archive_queries.length === 0) throw new Error("phase7a_artifact_archive_required");

  const input = compositionInput(state, action);
  const plan = researchPlanSchema.parse({
    web_queries: (state.workspace.web_queries.length ? state.workspace.web_queries : [action.topic]).slice(-2),
    archive_queries: state.workspace.archive_queries.slice(-2),
  });
  const eventId = `evt_${state.runId}_artifact`;
  emit(state, deps, { id: eventId, kind: "composition", label: "Writing the preparation packet", detail: action.public_summary, status: "running" });
  reserveProvider(state, 1, RESERVATIONS.grok);
  state.counts.compositions += 1;
  state.counts.grok_turns += 1;
  let composeReceiptRecorded = false;
  try {
    const composed = await deps.composer.compose(input, plan, state.workspace.evidence, {
      timeoutMs: remainingTime(state, deps),
      signal: deps.signal,
    });
    addModelUsage(state, "grok_composition", RESERVATIONS.grok, composed.receipt);
    composeReceiptRecorded = true;
    const outputFailure = phase5ModelOutputFailure(composed.output_status);
    if (outputFailure) throw new Error(`phase7a_${outputFailure.replace(/^phase5_/, "")}`);
    let raw = canonicalizeArtifactSourceLedger(
      hydrateArtifactSourceLedger(composed.value, state.workspace.evidence),
      state.workspace.evidence,
    );
    let validation = validatePhase5Artifact(input, raw, state.workspace.evidence);
    if (validation.errors.length && state.counts.repairs < PHASE_7A_LIMITS.maxRepairs) {
      emit(state, deps, { kind: "validation", label: "Repairing the structured packet", detail: `${validation.errors.length} validation issue${validation.errors.length === 1 ? "" : "s"}`, status: "running" });
      reserveProvider(state, 1, RESERVATIONS.grok);
      state.counts.repairs += 1;
      state.counts.grok_turns += 1;
      let repairReceiptRecorded = false;
      try {
        const repaired = await deps.composer.repair(input, plan, state.workspace.evidence, withoutMachineLedger(raw), validation.errors, {
          timeoutMs: remainingTime(state, deps),
          signal: deps.signal,
        });
        addModelUsage(state, "grok_repair", RESERVATIONS.grok, repaired.receipt);
        repairReceiptRecorded = true;
        const repairFailure = phase5ModelOutputFailure(repaired.output_status);
        if (repairFailure) throw new Error(`phase7a_${repairFailure.replace(/^phase5_/, "")}`);
        raw = canonicalizeArtifactSourceLedger(
          hydrateArtifactSourceLedger(repaired.value, state.workspace.evidence),
          state.workspace.evidence,
        );
        validation = validatePhase5Artifact(input, raw, state.workspace.evidence);
      } catch (error) {
        if (!repairReceiptRecorded) addUsage(state, "grok_repair", RESERVATIONS.grok);
        throw error;
      }
    }
    if (!validation.artifact || validation.errors.length) {
      for (const error of validation.errors) addLimitation(state, `artifact:${error}`);
      emit(state, deps, { id: eventId, kind: "composition", label: "Packet did not pass validation", detail: "The previous valid packet was preserved", status: "failed" });
      return `Artifact validation failed with ${validation.errors.length} issue${validation.errors.length === 1 ? "" : "s"}; the prior artifact was preserved.`;
    }
    state.workspace.artifact = phase5ArtifactSchema.parse(validation.artifact) as Phase5Artifact;
    state.workspace.artifact_revision += 1;
    emit(state, deps, { id: eventId, kind: "artifact", label: "Preparation packet ready", detail: `${action.mode === "headlines" ? "Headlines" : "Big Story"} · revision ${state.workspace.artifact_revision}`, status: "complete" });
    return `${action.mode === "headlines" ? "Headlines" : "Big Story"} artifact revision ${state.workspace.artifact_revision} passed deterministic validation.`;
  } catch (error) {
    if (!composeReceiptRecorded) addUsage(state, "grok_composition", RESERVATIONS.grok);
    throw error;
  }
}

async function readUrls(
  state: AgentState,
  deps: Phase7AAgentDependencies,
  rawUrls: string[],
): Promise<{ done: false; observation: string }> {
  const allowed = rawUrls.map((url) => allowedReadUrl(state, url));
  const normalized = allowed.map((item) => item.url);
  if (new Set(normalized).size !== normalized.length) throw new Error("phase7a_repeated_action");
  if (normalized.some((url) => state.seenReadUrls.has(url))) throw new Error("phase7a_repeated_action");
  if (state.counts.url_reads + allowed.length > PHASE_7A_LIMITS.maxUrlReads) throw new Error("phase7a_url_read_limit");
  const existingUrls = new Set(state.workspace.evidence.flatMap((source) => source.url ? [normalizeWebUrl(source.url)] : []));
  const newEvidenceCount = normalized.filter((url) => !existingUrls.has(url)).length;
  if (state.workspace.evidence.length + newEvidenceCount > PHASE_7A_LIMITS.maxEvidenceSources) throw new Error("phase7a_evidence_limit");
  normalized.forEach((url) => state.seenReadUrls.add(url));

  const pending = allowed.map((item, index) => {
    const ordinal = state.counts.url_reads + index + 1;
    const eventId = `evt_${state.runId}_read_${ordinal}`;
    emit(state, deps, { id: eventId, kind: "tool", label: "Read source", detail: new URL(item.url).hostname, status: "running", tool: "read_url" });
    return { item, eventId, promise: Promise.resolve().then(() => deps.tools.readUrl({ url: item.url })) };
  });
  state.counts.url_reads += allowed.length;
  const settled = await Promise.allSettled(pending.map((item) => item.promise));
  let usableCount = 0;
  let unavailableCount = 0;
  for (const [index, result] of settled.entries()) {
    const pendingItem = pending[index]!;
    if (result.status === "rejected") {
      unavailableCount += 1;
      addLimitation(state, "read_url:tool_error");
      emit(state, deps, { id: pendingItem.eventId, kind: "tool", label: "Source unavailable", detail: `${new URL(pendingItem.item.url).hostname} · tool_error`, status: "unavailable", tool: "read_url" });
      continue;
    }
    const page = result.value;
    const evidence = pageEvidence(page, pendingItem.item.sourceType);
    upsertEvidence(state, evidence);
    if (page.evidence_usable) usableCount += 1;
    else {
      unavailableCount += 1;
      addLimitation(state, `read_url:${page.failure?.code ?? page.availability}`);
    }
    emit(state, deps, {
      id: pendingItem.eventId,
      kind: "tool",
      label: page.evidence_usable ? "Source retrieved" : "Source unavailable",
      detail: `${page.title ?? new URL(pendingItem.item.url).hostname} · ${page.availability}`.slice(0, 300),
      status: page.evidence_usable ? "complete" : "unavailable",
      tool: "read_url",
    });
  }
  return {
    done: false,
    observation: `${usableCount} source${usableCount === 1 ? "" : "s"} became usable evidence; ${unavailableCount} unavailable.`,
  };
}

async function openTranscriptChunks(
  state: AgentState,
  deps: Phase7AAgentDependencies,
  chunkIds: string[],
): Promise<{ done: false; observation: string }> {
  if (new Set(chunkIds).size !== chunkIds.length) throw new Error("phase7a_repeated_action");
  if (chunkIds.some((chunkId) => state.seenTranscriptChunks.has(chunkId))) throw new Error("phase7a_repeated_action");
  if (state.counts.transcript_opens + chunkIds.length > PHASE_7A_LIMITS.maxTranscriptOpens) throw new Error("phase7a_transcript_open_limit");
  const existingChunks = new Set(state.workspace.evidence.flatMap((source) => source.chunk_id ? [source.chunk_id] : []));
  const newEvidenceCount = chunkIds.filter((chunkId) => !existingChunks.has(chunkId)).length;
  if (state.workspace.evidence.length + newEvidenceCount > PHASE_7A_LIMITS.maxEvidenceSources) throw new Error("phase7a_evidence_limit");
  if (chunkIds.some((chunkId) => !state.workspace.transcript_matches.some((match) => match.chunk_id === chunkId))) {
    throw new Error("phase7a_chunk_not_allowed");
  }
  chunkIds.forEach((chunkId) => state.seenTranscriptChunks.add(chunkId));

  const pending = chunkIds.map((chunkId, index) => {
    const ordinal = state.counts.transcript_opens + index + 1;
    const eventId = `evt_${state.runId}_chunk_${ordinal}`;
    emit(state, deps, { id: eventId, kind: "tool", label: "Open archive passage", detail: chunkId, status: "running", tool: "open_transcript_chunk" });
    return {
      chunkId,
      eventId,
      promise: Promise.resolve().then(() => deps.tools.openTranscriptChunk({ chunk_id: chunkId })),
    };
  });
  state.counts.transcript_opens += chunkIds.length;
  const settled = await Promise.allSettled(pending.map((item) => item.promise));
  let openedCount = 0;
  let unavailableCount = 0;
  for (const [index, result] of settled.entries()) {
    const pendingItem = pending[index]!;
    const evidence = result.status === "fulfilled" ? archiveEvidence(result.value) : null;
    if (!evidence) {
      unavailableCount += 1;
      addLimitation(state, "archive:chunk_not_found");
      emit(state, deps, { id: pendingItem.eventId, kind: "tool", label: "Archive passage unavailable", detail: pendingItem.chunkId, status: "unavailable", tool: "open_transcript_chunk" });
      continue;
    }
    openedCount += 1;
    upsertEvidence(state, evidence);
    emit(state, deps, { id: pendingItem.eventId, kind: "tool", label: "Archive passage opened", detail: `${evidence.title ?? pendingItem.chunkId} · ${evidence.source_id}`.slice(0, 300), status: "complete", tool: "open_transcript_chunk" });
  }
  return {
    done: false,
    observation: `${openedCount} archive passage${openedCount === 1 ? "" : "s"} became usable evidence; ${unavailableCount} unavailable. No speaker labels were inferred.`,
  };
}

async function executeAction(state: AgentState, deps: Phase7AAgentDependencies, action: Phase7AAction): Promise<{ done: boolean; observation: string }> {
  assertActive(state, deps);
  const detail = actionArgument(action).slice(0, 300);
  if (action.action === "respond") {
    const usable = new Set(state.workspace.evidence.filter((item) => item.evidence_usable).map((item) => item.source_id));
    if (new Set(action.source_ids).size !== action.source_ids.length || action.source_ids.some((id) => !usable.has(id))) {
      throw new Error("phase7a_invalid_citation");
    }
    const message = phase7aAssistantMessageSchema.parse({
      message_id: `msg_${randomUUID()}`,
      run_id: state.runId,
      text: action.message,
      source_ids: action.source_ids,
      created_at: nowIso(deps),
    });
    state.assistantMessage = message;
    appendTurn(state, "assistant", message.text, message.source_ids, deps);
    state.status = state.limitations.length ? "partial" : "complete";
    emit(state, deps, { kind: "run", label: "Answer ready", detail: action.public_summary, status: state.status });
    return { done: true, observation: "Assistant response delivered." };
  }

  if (action.action === "web_search") {
    if (state.counts.web_searches >= PHASE_7A_LIMITS.maxWebSearches) throw new Error("phase7a_web_search_limit");
    const key = queryKey(action.query);
    if (state.seenWebQueries.has(key)) throw new Error("phase7a_repeated_action");
    state.seenWebQueries.add(key);
    const eventId = `evt_${state.runId}_web_${state.counts.web_searches + 1}`;
    emit(state, deps, { id: eventId, kind: "tool", label: "Search current web", detail, status: "running", tool: "web_search" });
    reserveProvider(state, 1, RESERVATIONS.webSearch);
    state.counts.web_searches += 1;
    state.workspace.web_queries = appendRecentUniqueQuery(state.workspace.web_queries, action.query, 12);
    let usageRecorded = false;
    try {
      const result = await deps.tools.webSearch({ query: action.query, limit: 5 });
      addUsage(state, "web_search", RESERVATIONS.webSearch, {
        model: result.receipt.provider_model,
        provider: result.receipt.provider_name,
        prompt_tokens: result.receipt.prompt_tokens,
        completion_tokens: result.receipt.completion_tokens,
        total_tokens: result.receipt.total_tokens,
        cost_usd: result.receipt.cost_usd,
      });
      usageRecorded = true;
      for (const candidate of result.sources) {
        if (state.workspace.candidates.some((item) => item.url === candidate.url)) continue;
        state.workspace.candidates.push({
          source_id: candidate.source_id,
          url: candidate.url,
          title: candidate.title,
          excerpt: candidate.excerpt,
          query: action.query,
        });
      }
      state.workspace.candidates = state.workspace.candidates.slice(-PHASE_7A_LIMITS.maxCandidates);
      const usableStatus = result.status === "complete" || result.status === "partial";
      if (!usableStatus) addLimitation(state, `web_search:${result.failure?.code ?? result.status}`);
      emit(state, deps, { id: eventId, kind: "tool", label: usableStatus ? "Web candidates found" : "Web search unavailable", detail: `${result.sources.length} candidate${result.sources.length === 1 ? "" : "s"} · ${result.status}`, status: usableStatus ? "complete" : "unavailable", tool: "web_search" });
      return { done: false, observation: `Web search status ${result.status}; ${result.sources.length} unread candidates are available.` };
    } catch (error) {
      if (!usageRecorded) addUsage(state, "web_search", RESERVATIONS.webSearch);
      throw error;
    }
  }

  if (action.action === "read_url") return readUrls(state, deps, [action.url]);
  if (action.action === "read_urls") return readUrls(state, deps, action.urls);

  if (action.action === "search_transcripts") {
    if (state.counts.transcript_searches >= PHASE_7A_LIMITS.maxTranscriptSearches) throw new Error("phase7a_transcript_search_limit");
    const key = queryKey(action.query);
    if (state.seenArchiveQueries.has(key)) throw new Error("phase7a_repeated_action");
    state.seenArchiveQueries.add(key);
    const eventId = `evt_${state.runId}_archive_${state.counts.transcript_searches + 1}`;
    emit(state, deps, { id: eventId, kind: "tool", label: "Search Nonsense archive", detail, status: "running", tool: "search_transcripts" });
    reserveProvider(state, 2, RESERVATIONS.transcriptSearch);
    state.counts.transcript_searches += 1;
    state.workspace.archive_queries = appendRecentUniqueQuery(state.workspace.archive_queries, action.query, 8);
    let usageRecorded = false;
    try {
      const envelope = await deps.tools.searchTranscripts({ query: action.query, limit: 5 });
      addTranscriptUsage(state, envelope.receipts);
      usageRecorded = true;
      for (const match of envelope.result.matches) {
        const next = {
          chunk_id: match.chunk_id,
          episode_id: match.episode_id,
          segment_id: match.segment_id,
          title: match.title,
          season: match.season,
          episode_number: match.episode_number,
          excerpt: match.excerpt.slice(0, 1_200),
          query: action.query,
        };
        const index = state.workspace.transcript_matches.findIndex((item) => item.chunk_id === match.chunk_id);
        if (index === -1) state.workspace.transcript_matches.push(next);
        else state.workspace.transcript_matches[index] = next;
      }
      state.workspace.transcript_matches = state.workspace.transcript_matches.slice(-PHASE_7A_LIMITS.maxTranscriptMatches);
      if (["unavailable", "keyword_only"].includes(envelope.result.retrieval_status)) addLimitation(state, `archive:${envelope.result.retrieval_status}`);
      emit(state, deps, { id: eventId, kind: "tool", label: "Archive search complete", detail: `${envelope.result.matches.length} match${envelope.result.matches.length === 1 ? "" : "es"} · ${envelope.result.retrieval_status}`, status: envelope.result.retrieval_status === "unavailable" ? "unavailable" : envelope.result.retrieval_status === "keyword_only" ? "partial" : "complete", tool: "search_transcripts" });
      return { done: false, observation: `Archive retrieval is ${envelope.result.retrieval_status}; ${envelope.result.matches.length} chunks can be opened.` };
    } catch (error) {
      if (!usageRecorded) addUsage(state, "transcript_search", RESERVATIONS.transcriptSearch);
      throw error;
    }
  }

  if (action.action === "open_transcript_chunk") return openTranscriptChunks(state, deps, [action.chunk_id]);
  if (action.action === "open_transcript_chunks") return openTranscriptChunks(state, deps, action.chunk_ids);

  const priorRevision = state.workspace.artifact_revision;
  const observation = await createArtifact(state, deps, action);
  if (state.workspace.artifact && state.workspace.artifact_revision > priorRevision) {
    const sourceIds = state.workspace.artifact.source_ledger.filter((source) => source.evidence_usable).map((source) => source.source_id).slice(0, 8);
    const message = phase7aAssistantMessageSchema.parse({
      message_id: `msg_${randomUUID()}`,
      run_id: state.runId,
      text: `The validated ${action.mode === "headlines" ? "Headlines" : "Big Story"} preparation packet “${state.workspace.artifact.working_title}” is ready in the artifact panel.`,
      source_ids: sourceIds,
      created_at: nowIso(deps),
    });
    state.assistantMessage = message;
    appendTurn(state, "assistant", message.text, message.source_ids, deps);
    state.status = state.limitations.length ? "partial" : "complete";
    emit(state, deps, { kind: "run", label: "Answer and artifact ready", detail: action.public_summary, status: state.status });
    return { done: true, observation };
  }
  return { done: false, observation };
}

function terminalMessage(state: AgentState, deps: Phase7AAgentDependencies, text: string): void {
  const message = phase7aAssistantMessageSchema.parse({
    message_id: `msg_${randomUUID()}`,
    run_id: state.runId,
    text,
    source_ids: [],
    created_at: nowIso(deps),
  });
  state.assistantMessage = message;
  appendTurn(state, "assistant", message.text, [], deps);
}

export async function runPhase7AAgentTurn(options: {
  workspace: Phase7AWorkspace;
  message: string;
  runId?: string;
}, deps: Phase7AAgentDependencies): Promise<Phase7ATurnResult> {
  const startedAtIso = nowIso(deps);
  const state: AgentState = {
    runId: options.runId ?? `run_${randomUUID()}`,
    workspace: structuredClone(phase7aWorkspaceSchema.parse(options.workspace)),
    currentMessage: options.message.trim(),
    status: "running",
    events: [],
    usage: [],
    counts: newCounts(),
    accountedCostUsd: 0,
    limitations: [],
    assistantMessage: null,
    startedAtMs: deps.clockMs?.() ?? performance.now(),
    startedAtIso,
    traceSteps: [],
    seenWebQueries: new Set(),
    seenReadUrls: new Set(),
    seenArchiveQueries: new Set(),
    seenTranscriptChunks: new Set(),
    costCapUsd: Math.min(PHASE_7A_LIMITS.costCapUsd, Math.max(0, deps.costCapUsd ?? PHASE_7A_LIMITS.costCapUsd)),
  };
  appendTurn(state, "user", state.currentMessage, [], deps);
  emit(state, deps, { kind: "run", label: "Research turn started", detail: "The agent is reading the conversation and evidence workspace", status: "running" });

  let lastObservation: string | undefined;
  try {
    while (state.counts.controller_turns < PHASE_7A_LIMITS.maxControllerTurns) {
      assertActive(state, deps);
      const decisionId = `evt_${state.runId}_decision_${state.counts.controller_turns + 1}`;
      emit(state, deps, { id: decisionId, kind: "agent", label: "Choosing the next research step", detail: lastObservation ?? "Reviewing the request and saved evidence", status: "running" });
      reserveProvider(state, 1, RESERVATIONS.controller);
      state.counts.controller_turns += 1;
      let usageRecorded = false;
      let decision;
      try {
        decision = await deps.controller.decide({
          workspace: state.workspace,
          currentMessage: state.currentMessage,
          remaining: remaining(state),
          lastObservation,
        }, { timeoutMs: remainingTime(state, deps), signal: deps.signal });
        addModelUsage(state, "luna_controller", RESERVATIONS.controller, decision.receipt);
        usageRecorded = true;
      } catch (error) {
        if (!usageRecorded) addUsage(state, "luna_controller", RESERVATIONS.controller);
        throw error;
      }
      state.workspace.research_state = decision.value.research_state;
      const action = decision.value.action;
      emit(state, deps, { id: decisionId, kind: "agent", label: "Next step chosen", detail: action.public_summary, status: "complete" });
      const limitationCount = state.limitations.length;
      try {
        const outcome = await executeAction(state, deps, action);
        lastObservation = outcome.observation;
        state.traceSteps.push(phase7aTraceStepSchema.parse({
          sequence: state.traceSteps.length + 1,
          action: action.action,
          public_summary: action.public_summary,
          target: actionArgument(action).slice(0, 500),
          observation: outcome.observation.slice(0, 500),
          status: state.limitations.length > limitationCount ? "partial" : "complete",
        }));
        if (outcome.done) break;
      } catch (error) {
        state.traceSteps.push(phase7aTraceStepSchema.parse({
          sequence: state.traceSteps.length + 1,
          action: action.action,
          public_summary: action.public_summary,
          target: actionArgument(action).slice(0, 500),
          observation: safeCode(error, "phase7a_action_failed"),
          status: "failed",
        }));
        throw error;
      }
    }
    if (state.status === "running") {
      addLimitation(state, "phase7a_controller_turn_limit");
      state.status = "partial";
      terminalMessage(state, deps, "I reached the bounded research-turn limit before I could finish this answer. The evidence and any valid artifact are preserved; ask a narrower follow-up to continue.");
      emit(state, deps, { kind: "run", label: "Turn limit reached", detail: "Saved evidence was preserved without an automatic continuation", status: "partial" });
    }
  } catch (error) {
    const code = safeCode(error, "phase7a_agent_failed");
    addLimitation(state, code);
    if (code === "phase7a_run_stopped") {
      state.status = "stopped";
      terminalMessage(state, deps, "You stopped this research turn. Evidence and the last valid artifact collected before the stop are preserved in this local session.");
      emit(state, deps, { kind: "run", label: "Research turn stopped", detail: "No automatic retry was started", status: "stopped" });
    } else {
      state.status = "failed";
      emit(state, deps, { kind: "run", label: "Research turn failed safely", detail: code, status: "failed" });
    }
  }

  const terminalStatus = state.status;
  const trace = phase7aRunTraceSchema.parse({
    run_id: state.runId,
    started_at: state.startedAtIso,
    completed_at: nowIso(deps),
    status: terminalStatus,
    steps: state.traceSteps,
    counts: state.counts,
    accounted_cost_usd: state.accountedCostUsd,
    source_ids: state.workspace.evidence.map((item) => item.source_id),
    artifact_revision: state.workspace.artifact_revision,
    limitations: state.limitations,
  });
  state.workspace.run_traces.push(trace);
  state.workspace.run_traces = state.workspace.run_traces.slice(-PHASE_7A_LIMITS.maxRunTraces);
  state.workspace.updated_at_ms = Date.now();
  return phase7aTurnResultSchema.parse({
    run_id: state.runId,
    status: state.status,
    assistant_message: state.assistantMessage,
    artifact: state.workspace.artifact,
    artifact_revision: state.workspace.artifact_revision,
    events: state.events,
    usage: state.usage,
    counts: state.counts,
    accounted_cost_usd: state.accountedCostUsd,
    elapsed_ms: Number(elapsed(state, deps).toFixed(2)),
    limitations: state.limitations,
    trace,
    workspace: state.workspace,
  });
}
