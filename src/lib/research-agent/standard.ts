import { randomUUID } from "node:crypto";
import { ToolLoopAgent, isStepCount, tool, type LanguageModel } from "ai";
import { z } from "zod";
import {
  PHASE_5_LIMITS,
  phase5UsageSchema,
  type EvidenceSource,
  type Phase5Usage,
} from "../phase5/contracts.ts";
import type { Phase5ToolAdapter } from "../phase5/workflow.ts";
import {
  PHASE_7A_LIMITS,
  phase7aActivitySchema,
  phase7aAssistantMessageSchema,
  phase7aCountsSchema,
  phase7aRunTraceSchema,
  phase7aTraceStepSchema,
  phase7aTurnResultSchema,
  phase7aWorkspaceSchema,
  type Phase7AActivity,
  type Phase7AAssistantMessage,
  type Phase7ACounts,
  type Phase7ARunTrace,
  type Phase7ATurnResult,
  type Phase7AWorkspace,
} from "../phase7a/contracts.ts";
import { normalizeWebUrl } from "../web-research/contracts.ts";
import type { WebSourceRecord } from "../web-research/types.ts";
import { createEmptyResearchNotebook, researchNotebookSchema } from "./contracts.ts";
import { isTransientResearchError } from "./model.ts";
import { STANDARD_AGENT_PROMPT } from "./prompts.ts";

export const STANDARD_RESEARCH_LIMITS = Object.freeze({
  maxSearches: 6,
  maxResultsPerSearch: 10,
  maxCandidates: 60,
  maxCandidatesPerQueryForModel: 4,
  maxCandidateExcerptCharactersForModel: 320,
  maxOpenedEvidenceCharactersForModel: 3_500,
  maxUrlReads: 5,
  maxTranscriptSearches: 1,
  maxTranscriptOpens: 3,
  maxAgentSteps: 12,
  maxProviderRequests: 24,
  researchCutoffMs: 50_000,
  searchStartReserveMs: 15_000,
  urlReadStartReserveMs: 10_000,
  transcriptSearchStartReserveMs: 12_000,
  transcriptOpenStartReserveMs: 3_000,
  hardDeadlineMs: 90_000,
  targetCostUsd: 0.2,
  ceilingCostUsd: 0.5,
  answerReserveUsd: 0.05,
  missingModelReceiptUsd: 0.025,
  missingSearchReceiptUsd: 0.02,
  missingTranscriptReceiptUsd: 0.02,
  maxTransientRetries: 1,
});

export type StandardRuntimeDependencies = {
  standardModel: LanguageModel;
  modelId: string;
  tools: Phase5ToolAdapter;
  now?: () => Date;
  clockMs?: () => number;
  signal?: AbortSignal;
  onEvent?: (event: Phase7AActivity) => void;
  onCheckpoint?: (workspace: Phase7AWorkspace) => void;
  costCapUsd?: number;
  providerRequestCap?: number;
};

type StandardState = {
  runId: string;
  workspace: Phase7AWorkspace;
  message: string;
  events: Phase7AActivity[];
  traceSteps: Phase7ARunTrace["steps"];
  limitations: string[];
  usage: Phase5Usage[];
  counts: Phase7ACounts;
  startedAtMs: number;
  startedAtIso: string;
  accountedCostUsd: number;
  providerRequests: number;
  transientRetries: number;
  stoppingReason: string;
};

type CitationAliases = {
  aliasBySourceId: Map<string, string>;
  sourceIdByAlias: Map<string, string>;
};

function nowIso(deps: StandardRuntimeDependencies): string {
  return (deps.now?.() ?? new Date()).toISOString();
}

function elapsed(state: StandardState, deps: StandardRuntimeDependencies): number {
  return Math.max(0, (deps.clockMs?.() ?? performance.now()) - state.startedAtMs);
}

function addLimitation(state: StandardState, value: string): void {
  const safe = value.slice(0, 240);
  if (!state.limitations.includes(safe) && state.limitations.length < 20) state.limitations.push(safe);
}

function safeCode(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  return /^[a-z][a-z0-9_:-]{2,239}$/.test(message) ? message : fallback;
}

function abortCode(signal: AbortSignal | undefined): "research_run_stopped" | "research_run_timeout" | null {
  if (!signal?.aborted) return null;
  return signal.reason instanceof DOMException && signal.reason.name === "TimeoutError"
    ? "research_run_timeout"
    : "research_run_stopped";
}

function emit(
  state: StandardState,
  deps: StandardRuntimeDependencies,
  value: Omit<Phase7AActivity, "id" | "run_id" | "created_at"> & { id?: string },
): void {
  const event = phase7aActivitySchema.parse({
    id: value.id ?? `evt_${state.runId}_${String(state.events.length + 1).padStart(3, "0")}`,
    run_id: state.runId,
    created_at: nowIso(deps),
    ...value,
    label: value.label.slice(0, 180),
    detail: value.detail.slice(0, 300),
  });
  const index = state.events.findIndex((item) => item.id === event.id);
  if (index === -1) state.events.push(event);
  else state.events[index] = event;
  deps.onEvent?.(event);
}

function trace(state: StandardState, value: {
  action: Phase7ARunTrace["steps"][number]["action"];
  summary: string;
  target: string;
  observation: string;
  status: "complete" | "partial" | "failed";
}): void {
  state.traceSteps.push(phase7aTraceStepSchema.parse({
    sequence: state.traceSteps.length + 1,
    action: value.action,
    public_summary: value.summary.slice(0, 180),
    target: value.target.slice(0, 500),
    observation: value.observation.slice(0, 500),
    status: value.status,
  }));
}

function appendTurn(
  state: StandardState,
  deps: StandardRuntimeDependencies,
  role: "user" | "assistant",
  text: string,
  sourceIds: string[],
): void {
  state.workspace.turns.push({
    turn_id: `turn_${randomUUID()}`,
    role,
    text: text.slice(0, PHASE_7A_LIMITS.maxMessageCharacters),
    source_ids: sourceIds.slice(0, 12),
    created_at: nowIso(deps),
  });
  state.workspace.turns = state.workspace.turns.slice(-PHASE_7A_LIMITS.maxConversationTurns);
}

function checkpoint(state: StandardState, deps: StandardRuntimeDependencies): void {
  state.workspace.updated_at_ms = Date.now();
  deps.onCheckpoint?.(structuredClone(state.workspace));
}

function aliasesFor(workspace: Phase7AWorkspace): CitationAliases {
  const aliasBySourceId = new Map<string, string>();
  const sourceIdByAlias = new Map<string, string>();
  for (const source of workspace.evidence) {
    if (!source.evidence_usable || aliasBySourceId.has(source.source_id)) continue;
    const alias = `evidence_${aliasBySourceId.size + 1}`;
    aliasBySourceId.set(source.source_id, alias);
    sourceIdByAlias.set(alias, source.source_id);
  }
  return { aliasBySourceId, sourceIdByAlias };
}

function assignAlias(aliases: CitationAliases, sourceId: string): string {
  const existing = aliases.aliasBySourceId.get(sourceId);
  if (existing) return existing;
  const alias = `evidence_${aliases.aliasBySourceId.size + 1}`;
  aliases.aliasBySourceId.set(sourceId, alias);
  aliases.sourceIdByAlias.set(alias, sourceId);
  return alias;
}

function suppliedUrls(workspace: Phase7AWorkspace): Set<string> {
  const urls = new Set<string>();
  for (const turn of workspace.turns.filter((item) => item.role === "user")) {
    for (const match of turn.text.matchAll(/https?:\/\/[^\s<>()"']+/gi)) {
      try {
        urls.add(normalizeWebUrl(match[0].replace(/[.,;!?\])}]+$/, "")));
      } catch {
        // Invalid user text never authorizes a URL.
      }
    }
  }
  return urls;
}

function pageEvidence(page: WebSourceRecord, sourceType: "provided_link" | "web"): EvidenceSource {
  const content = page.text?.slice(0, PHASE_5_LIMITS.maxEvidenceCharactersPerSource);
  return {
    source_id: page.source_id,
    source_type: sourceType,
    availability: page.availability,
    evidence_usable: page.evidence_usable,
    title: page.title,
    url: page.canonical_url ?? page.final_url ?? page.url,
    retrieved_at: page.retrieved_at,
    excerpt: page.excerpt,
    content,
    failure_code: page.failure?.code,
  };
}

function upsertEvidence(state: StandardState, source: EvidenceSource): void {
  const index = state.workspace.evidence.findIndex((item) => item.source_id === source.source_id);
  if (index === -1) state.workspace.evidence.push(source);
  else state.workspace.evidence[index] = source;
  state.workspace.evidence = state.workspace.evidence.slice(-PHASE_7A_LIMITS.maxEvidenceSources);
}

function recordUsage(
  state: StandardState,
  deps: StandardRuntimeDependencies,
  value: Omit<Phase5Usage, "accounted_cost_usd" | "receipt_missing"> & {
    requests?: number;
    fallbackCostUsd: number;
  },
): void {
  const requests = Math.max(1, value.requests ?? 1);
  const requestCap = Math.min(STANDARD_RESEARCH_LIMITS.maxProviderRequests, deps.providerRequestCap ?? STANDARD_RESEARCH_LIMITS.maxProviderRequests);
  if (state.providerRequests + requests > requestCap) throw new Error("research_provider_request_limit");
  const reported = typeof value.reported_cost_usd === "number" && Number.isFinite(value.reported_cost_usd)
    ? value.reported_cost_usd
    : undefined;
  const accounted = reported ?? value.fallbackCostUsd;
  const costCap = Math.min(STANDARD_RESEARCH_LIMITS.ceilingCostUsd, deps.costCapUsd ?? STANDARD_RESEARCH_LIMITS.ceilingCostUsd);
  if (state.accountedCostUsd + accounted > costCap + 1e-9) throw new Error("research_budget_exhausted");
  const usage = Object.fromEntries(
    Object.entries(value).filter(([key, item]) => (
      key !== "requests"
      && key !== "fallbackCostUsd"
      && (typeof item !== "number" || (Number.isFinite(item) && item >= 0))
    )),
  );
  state.usage.push(phase5UsageSchema.parse({
    ...usage,
    ...(reported === undefined ? {} : { reported_cost_usd: reported }),
    accounted_cost_usd: Number(accounted.toFixed(8)),
    receipt_missing: reported === undefined,
  }));
  state.accountedCostUsd = Number((state.accountedCostUsd + accounted).toFixed(8));
  state.providerRequests += requests;
  state.counts.provider_requests = state.providerRequests;
}

function openRouterReceipt(metadata: unknown): { provider?: string; cost?: number } {
  if (!metadata || typeof metadata !== "object") return {};
  const openrouter = (metadata as { openrouter?: unknown }).openrouter;
  if (!openrouter || typeof openrouter !== "object") return {};
  const value = openrouter as { provider?: unknown; usage?: { cost?: unknown } };
  return {
    provider: typeof value.provider === "string" ? value.provider : undefined,
    cost: typeof value.usage?.cost === "number" ? value.usage.cost : undefined,
  };
}

function promptContext(state: StandardState, aliases: CitationAliases, deps: StandardRuntimeDependencies): string {
  let evidenceCharacters = 40_000;
  const evidence = state.workspace.evidence.flatMap((source) => {
    if (!source.evidence_usable) return [];
    const alias = assignAlias(aliases, source.source_id);
    const raw = source.content ?? source.excerpt ?? "";
    const excerpt = raw.slice(0, Math.min(4_000, Math.max(0, evidenceCharacters)));
    evidenceCharacters -= excerpt.length;
    return [{
      citation_alias: alias,
      source_type: source.source_type,
      title: source.title,
      url: source.url,
      season: source.season,
      episode_number: source.episode_number,
      evidence_text: excerpt,
    }];
  });
  const conversation = state.workspace.turns.slice(-16).map((turn) => ({
    role: turn.role,
    text: turn.text,
    citation_aliases: turn.source_ids.flatMap((id) => aliases.aliasBySourceId.get(id) ?? []),
  }));
  return [
    STANDARD_AGENT_PROMPT,
    "",
    `CURRENT DATE: ${nowIso(deps).slice(0, 10)}`,
    "",
    "RECENT CONVERSATION (untrusted user and prior-answer data):",
    JSON.stringify(conversation),
    "",
    "SAVED USABLE EVIDENCE:",
    JSON.stringify(evidence),
    "",
    `CURRENT LIMITS: ${JSON.stringify({
      searches: STANDARD_RESEARCH_LIMITS.maxSearches,
      candidates: STANDARD_RESEARCH_LIMITS.maxCandidates,
      research_cutoff_ms: STANDARD_RESEARCH_LIMITS.researchCutoffMs,
      hard_deadline_ms: STANDARD_RESEARCH_LIMITS.hardDeadlineMs,
      target_cost_usd: STANDARD_RESEARCH_LIMITS.targetCostUsd,
      ceiling_cost_usd: Math.min(STANDARD_RESEARCH_LIMITS.ceilingCostUsd, STANDARD_RESEARCH_LIMITS.ceilingCostUsd),
    })}`,
  ].join("\n");
}

function finalizeAnswer(
  state: StandardState,
  deps: StandardRuntimeDependencies,
  aliases: CitationAliases,
  raw: string,
): Phase7AAssistantMessage {
  const text = raw.trim();
  if (!text) throw new Error("research_answer_empty");
  if (text.length > 5_000) throw new Error("research_answer_too_long");
  if (/\bto=functions\.[a-z0-9_-]+\s+code\s*:/i.test(text) || /<\|(?:tool|function)[^>]*>/i.test(text)) {
    throw new Error("research_answer_exposed_tool_protocol");
  }
  if (/\b(?:web|archive)_[a-z0-9:_-]+\b/i.test(text)) throw new Error("research_answer_exposed_internal_id");
  const usable = new Set(state.workspace.evidence.filter((source) => source.evidence_usable).map((source) => source.source_id));
  const blocks = text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean).map((paragraph) => {
    const sourceIds: string[] = [];
    const clean = paragraph.replace(/\[\[(evidence_\d+)\]\]/g, (_match, alias: string) => {
      const sourceId = aliases.sourceIdByAlias.get(alias);
      if (!sourceId || !usable.has(sourceId)) throw new Error("research_invalid_citation");
      if (!sourceIds.includes(sourceId)) sourceIds.push(sourceId);
      return "";
    }).replace(/[ \t]+\n/g, "\n").replace(/ {2,}/g, " ").trim();
    if (/\bevidence_\d+\b/.test(clean)) throw new Error("research_invalid_citation");
    return { text: clean, source_ids: sourceIds };
  });
  if (!blocks.length || blocks.length > 12 || blocks.some((block) => !block.text || block.text.length > 2_000)) {
    throw new Error("research_answer_shape_invalid");
  }
  const cited = [...new Set(blocks.flatMap((block) => block.source_ids))];
  if (state.workspace.evidence.some((source) => source.evidence_usable) && cited.length === 0) {
    throw new Error("research_answer_missing_citations");
  }
  if (cited.length > 12) throw new Error("research_answer_source_limit");
  return phase7aAssistantMessageSchema.parse({
    message_id: `msg_${randomUUID()}`,
    run_id: state.runId,
    text: blocks.map((block) => block.text).join("\n\n"),
    source_ids: cited,
    blocks,
    created_at: nowIso(deps),
  });
}

function incompleteAnswer(
  state: StandardState,
  deps: StandardRuntimeDependencies,
): Phase7AAssistantMessage {
  const usable = state.workspace.evidence.filter((source) => source.evidence_usable).slice(0, 3);
  const text = usable.length
    ? "I found usable evidence, but the Luna research loop stopped before it could produce a safely cited synthesis. The evidence is preserved. Run Deep Research if you want a broader replacement pass."
    : "I couldn't complete this research turn reliably, so I didn't substitute an unsupported answer. Run Deep Research or try the question again when the provider is available.";
  return phase7aAssistantMessageSchema.parse({
    message_id: `msg_${randomUUID()}`,
    run_id: state.runId,
    text,
    source_ids: usable.map((source) => source.source_id),
    blocks: [{ text, source_ids: usable.map((source) => source.source_id) }],
    created_at: nowIso(deps),
  });
}

export async function runStandardResearchTurn(options: {
  workspace: Phase7AWorkspace;
  message: string;
  runId?: string;
}, deps: StandardRuntimeDependencies): Promise<Phase7ATurnResult> {
  const workspace = structuredClone(phase7aWorkspaceSchema.parse(options.workspace));
  const state: StandardState = {
    runId: options.runId ?? `run_${randomUUID()}`,
    workspace,
    message: options.message.trim(),
    events: [],
    traceSteps: [],
    limitations: [],
    usage: [],
    counts: phase7aCountsSchema.parse({
      controller_turns: 0,
      provider_requests: 0,
      grok_turns: 0,
      web_searches: 0,
      web_candidates: 0,
      url_reads: 0,
      transcript_searches: 0,
      transcript_opens: 0,
      compositions: 0,
      repairs: 0,
    }),
    startedAtMs: deps.clockMs?.() ?? performance.now(),
    startedAtIso: nowIso(deps),
    accountedCostUsd: 0,
    providerRequests: 0,
    transientRetries: 0,
    stoppingReason: "model_satisfied",
  };
  appendTurn(state, deps, "user", state.message, []);
  const aliases = aliasesFor(state.workspace);
  const supplied = suppliedUrls(state.workspace);
  const candidates = new Map(state.workspace.candidates.map((candidate) => [normalizeWebUrl(candidate.url), candidate]));
  const turnCandidates = new Set<string>();
  const transcriptMatches = new Map(state.workspace.transcript_matches.map((match) => [match.chunk_id, match]));
  let searches = 0;
  let urlReads = 0;
  let transcriptSearches = 0;
  let transcriptOpens = 0;
  let synthesisEventStarted = false;
  let assistant: Phase7AAssistantMessage | null = null;
  let status: "complete" | "partial" | "stopped" | "failed" = "complete";

  const costCap = Math.min(STANDARD_RESEARCH_LIMITS.ceilingCostUsd, deps.costCapUsd ?? STANDARD_RESEARCH_LIMITS.ceilingCostUsd);
  const researchAllowed = (reserveMs = 0) => (
    elapsed(state, deps) + reserveMs < STANDARD_RESEARCH_LIMITS.researchCutoffMs
    && state.accountedCostUsd + STANDARD_RESEARCH_LIMITS.answerReserveUsd < costCap
    && !deps.signal?.aborted
  );
  const isAllowedUrl = (raw: string): string => {
    const normalized = normalizeWebUrl(raw);
    if (supplied.has(normalized) || candidates.has(normalized)) return normalized;
    if (state.workspace.evidence.some((source) => source.url && normalizeWebUrl(source.url) === normalized)) return normalized;
    throw new Error("research_url_not_allowed");
  };
  const modelTools = {
    search_web: tool({
      description: "Search the current web with OpenRouter Exa. Send one to six independent queries together so they can run concurrently; each query returns up to ten orientation candidates. Then open the important sources before citing material claims.",
      inputSchema: z.object({
        queries: z.array(z.string().trim().min(3).max(300)).min(1).max(STANDARD_RESEARCH_LIMITS.maxSearches),
      }).strict(),
      execute: async ({ queries }) => {
        const uniqueQueries = [...new Set(queries.map((query) => query.trim()))];
        const eventId = `evt_${state.runId}_search_${searches + 1}`;
        emit(state, deps, {
          id: eventId,
          kind: "tool",
          label: uniqueQueries.length === 1 ? "Searching the web" : `Searching ${uniqueQueries.length} web queries`,
          detail: uniqueQueries.join(" · "),
          status: "running",
          tool: "web_search",
        });
        if (!researchAllowed(STANDARD_RESEARCH_LIMITS.searchStartReserveMs)) {
          state.stoppingReason = "research_cutoff";
          emit(state, deps, { id: eventId, kind: "tool", label: "Web search boundary reached", detail: "Synthesizing from preserved evidence", status: "unavailable", tool: "web_search" });
          return { status: "unavailable", searches: [], limitation: "research_cutoff" };
        }
        const remainingSearches = STANDARD_RESEARCH_LIMITS.maxSearches - searches;
        const candidateRoom = STANDARD_RESEARCH_LIMITS.maxCandidates - turnCandidates.size;
        const usefulSearchSlots = Math.ceil(candidateRoom / STANDARD_RESEARCH_LIMITS.maxResultsPerSearch);
        const selectedQueries = uniqueQueries.slice(0, Math.min(remainingSearches, usefulSearchSlots));
        if (!selectedQueries.length) {
          state.stoppingReason = "search_boundary";
          addLimitation(state, "research_web_search_limit");
          emit(state, deps, { id: eventId, kind: "tool", label: "Web search boundary reached", detail: "Six searches or sixty candidates were reached", status: "unavailable", tool: "web_search" });
          return { status: "unavailable", searches: [], limitation: "research_web_search_limit" };
        }
        const firstOrdinal = searches + 1;
        searches += selectedQueries.length;
        state.counts.web_searches = searches;
        const callSearch = async (query: string, ordinal: number) => {
          const result = await deps.tools.webSearch({ query, limit: STANDARD_RESEARCH_LIMITS.maxResultsPerSearch });
          recordUsage(state, deps, {
            action: `standard:web_search:${ordinal}`,
            model: result.receipt.provider_model,
            provider: result.receipt.provider_name,
            prompt_tokens: result.receipt.prompt_tokens,
            completion_tokens: result.receipt.completion_tokens,
            total_tokens: result.receipt.total_tokens,
            reported_cost_usd: result.receipt.cost_usd,
            requests: 1,
            fallbackCostUsd: STANDARD_RESEARCH_LIMITS.missingSearchReceiptUsd,
          });
          return { query, result };
        };
        const batch = await Promise.all(selectedQueries.map((query, index) => callSearch(query, firstOrdinal + index)));
        const retryTarget = batch.find(({ result }) => result.status === "unavailable"
          && ["timeout", "provider_http_error", "provider_unavailable"].includes(result.failure?.code ?? ""));
        if (
          retryTarget
          && state.transientRetries < STANDARD_RESEARCH_LIMITS.maxTransientRetries
          && searches < STANDARD_RESEARCH_LIMITS.maxSearches
          && researchAllowed(STANDARD_RESEARCH_LIMITS.searchStartReserveMs)
        ) {
          state.transientRetries += 1;
          addLimitation(state, "standard_search_transient_retry");
          emit(state, deps, { id: `${eventId}_retry`, kind: "tool", label: "Retrying web search once", detail: `${retryTarget.query} · transient provider failure`, status: "partial", tool: "web_search" });
          searches += 1;
          state.counts.web_searches = searches;
          const replacement = await callSearch(retryTarget.query, searches);
          const targetIndex = batch.indexOf(retryTarget);
          batch[targetIndex] = replacement;
        }
        state.workspace.web_queries = [...new Set([...state.workspace.web_queries, ...selectedQueries])].slice(-12);
        const searchesForModel = [];
        let acceptedTotal = 0;
        for (const { query, result } of batch) {
          const accepted = [];
          for (const source of result.sources) {
            const normalized = normalizeWebUrl(source.url);
            if (!turnCandidates.has(normalized) && turnCandidates.size >= STANDARD_RESEARCH_LIMITS.maxCandidates) break;
            turnCandidates.add(normalized);
            const candidate = {
              source_id: source.source_id,
              url: source.url,
              title: source.title,
              excerpt: source.excerpt?.slice(0, 1_200) ?? null,
              query,
            };
            candidates.set(normalized, candidate);
            accepted.push({ url: candidate.url, title: candidate.title, excerpt: candidate.excerpt });
          }
          acceptedTotal += accepted.length;
          if (result.status === "unavailable") addLimitation(state, `web_search:${result.failure?.code ?? "unavailable"}`);
          searchesForModel.push({
            query,
            status: result.status,
            candidate_count: accepted.length,
            candidates: accepted.slice(0, STANDARD_RESEARCH_LIMITS.maxCandidatesPerQueryForModel).map((candidate) => ({
              ...candidate,
              excerpt: candidate.excerpt?.slice(0, STANDARD_RESEARCH_LIMITS.maxCandidateExcerptCharactersForModel) ?? null,
            })),
            limitation: result.failure?.code ?? null,
          });
        }
        state.counts.web_candidates = turnCandidates.size;
        state.workspace.candidates = [...candidates.values()].slice(-PHASE_7A_LIMITS.maxCandidates);
        const unavailableCount = batch.filter(({ result }) => result.status === "unavailable").length;
        const partialCount = batch.filter(({ result }) => result.status === "partial").length;
        const eventStatus = unavailableCount === batch.length && acceptedTotal === 0
          ? "unavailable"
          : unavailableCount || partialCount
            ? "partial"
            : "complete";
        emit(state, deps, {
          id: eventId,
          kind: "tool",
          label: acceptedTotal ? "Searched the web" : "No useful web results",
          detail: `${selectedQueries.length} quer${selectedQueries.length === 1 ? "y" : "ies"} · ${acceptedTotal} candidates`,
          status: eventStatus,
          tool: "web_search",
        });
        trace(state, {
          action: "web_search",
          summary: `Ran ${selectedQueries.length} web quer${selectedQueries.length === 1 ? "y" : "ies"}`,
          target: selectedQueries.join(" · "),
          observation: `${acceptedTotal} candidates · ${unavailableCount} unavailable`,
          status: eventStatus === "unavailable" ? "partial" : eventStatus,
        });
        checkpoint(state, deps);
        return { status: eventStatus, searches: searchesForModel };
      },
    }),
    read_urls: tool({
      description: "Open one to three supplied or discovered URLs concurrently. Returns citeable evidence aliases for usable pages. For regulatory questions, include a relevant official government source in the first read batch whenever one appeared in search candidates.",
      inputSchema: z.object({ urls: z.array(z.string().url().max(2_000)).min(1).max(PHASE_7A_LIMITS.maxBatchTargets) }).strict(),
      execute: async ({ urls }) => {
        const unique = [...new Set(urls.map(isAllowedUrl))];
        const eventId = `evt_${state.runId}_read_${urlReads + 1}`;
        emit(state, deps, { id: eventId, kind: "tool", label: unique.length === 1 ? "Reading a source" : `Reading ${unique.length} sources`, detail: unique.map((url) => new URL(url).hostname).join(", "), status: "running", tool: "read_url" });
        if (!researchAllowed(STANDARD_RESEARCH_LIMITS.urlReadStartReserveMs) || urlReads + unique.length > STANDARD_RESEARCH_LIMITS.maxUrlReads) {
          state.stoppingReason = "research_cutoff";
          addLimitation(state, "research_url_read_limit");
          emit(state, deps, { id: eventId, kind: "tool", label: "Source-reading boundary reached", detail: "Synthesizing from preserved evidence", status: "unavailable", tool: "read_url" });
          return { results: unique.map((url) => ({ url, status: "unavailable" })) };
        }
        urlReads += unique.length;
        state.counts.url_reads = urlReads;
        const settled = await Promise.allSettled(unique.map((url) => deps.tools.readUrl({ url })));
        const results = settled.map((item, index) => {
          const url = unique[index]!;
          const candidate = candidates.get(url);
          if (item.status === "rejected") {
            addLimitation(state, `read_url:${safeCode(item.reason, "unavailable")}`);
            if (candidate?.excerpt) {
              const fallbackSource: EvidenceSource = {
                source_id: candidate.source_id,
                source_type: supplied.has(url) ? "provided_link" : "web",
                availability: "partial",
                evidence_usable: true,
                title: candidate.title,
                url: candidate.url,
                excerpt: candidate.excerpt,
                content: candidate.excerpt,
                failure_code: "search_excerpt_fallback",
              };
              upsertEvidence(state, fallbackSource);
              addLimitation(state, "read_url:search_excerpt_fallback");
              return {
                url,
                status: "partial",
                title: fallbackSource.title,
                citation_alias: assignAlias(aliases, fallbackSource.source_id),
                evidence_basis: "exa_search_excerpt",
                evidence_text: fallbackSource.content,
              };
            }
            return { url, status: "unavailable" };
          }
          const source = pageEvidence(item.value, supplied.has(url) ? "provided_link" : "web");
          upsertEvidence(state, source);
          if (!source.evidence_usable) {
            addLimitation(state, `read_url:${source.failure_code ?? source.availability}`);
            if (candidate?.excerpt) {
              const fallbackSource: EvidenceSource = {
                source_id: candidate.source_id,
                source_type: supplied.has(url) ? "provided_link" : "web",
                availability: "partial",
                evidence_usable: true,
                title: candidate.title,
                url: candidate.url,
                excerpt: candidate.excerpt,
                content: candidate.excerpt,
                failure_code: "search_excerpt_fallback",
              };
              upsertEvidence(state, fallbackSource);
              addLimitation(state, "read_url:search_excerpt_fallback");
              return {
                url,
                status: "partial",
                title: fallbackSource.title,
                citation_alias: assignAlias(aliases, fallbackSource.source_id),
                evidence_basis: "exa_search_excerpt",
                evidence_text: fallbackSource.content,
              };
            }
            return { url, status: source.availability, title: source.title };
          }
          return {
            url,
            status: source.availability,
            title: source.title,
            citation_alias: assignAlias(aliases, source.source_id),
            evidence_basis: "opened_page",
            evidence_text: (source.content ?? source.excerpt ?? "").slice(0, STANDARD_RESEARCH_LIMITS.maxOpenedEvidenceCharactersForModel),
          };
        });
        const usable = results.filter((item) => "citation_alias" in item).length;
        const fallbackCount = results.filter((item) => "evidence_basis" in item && item.evidence_basis === "exa_search_excerpt").length;
        const openedCount = results.filter((item) => "evidence_basis" in item && item.evidence_basis === "opened_page").length;
        const eventStatus = fallbackCount || usable < results.length ? usable ? "partial" : "unavailable" : "complete";
        emit(state, deps, {
          id: eventId,
          kind: "tool",
          label: fallbackCount ? `Collected ${usable} source${usable === 1 ? "" : "s"}` : usable === 1 ? "Read 1 source" : `Read ${usable} sources`,
          detail: fallbackCount ? `${openedCount} opened pages · ${fallbackCount} Exa excerpt${fallbackCount === 1 ? "" : "s"}` : `${usable}/${results.length} became citeable evidence`,
          status: eventStatus,
          tool: "read_url",
        });
        trace(state, { action: "read_urls", summary: `Opened ${usable} usable source${usable === 1 ? "" : "s"}`, target: unique.join(", "), observation: `${usable}/${results.length} usable`, status: eventStatus === "unavailable" ? "partial" : eventStatus });
        checkpoint(state, deps);
        return { results };
      },
    }),
    search_transcripts: tool({
      description: "Optionally search the S3-S4 Nonsense transcript archive with concise topic terms. Returned chunks must be opened before citation.",
      inputSchema: z.object({ query: z.string().trim().min(2).max(500) }).strict(),
      execute: async ({ query }) => {
        const eventId = `evt_${state.runId}_archive_search_${transcriptSearches + 1}`;
        emit(state, deps, { id: eventId, kind: "tool", label: "Checking the Nonsense archive", detail: query, status: "running", tool: "search_transcripts" });
        if (!researchAllowed(STANDARD_RESEARCH_LIMITS.transcriptSearchStartReserveMs) || transcriptSearches >= STANDARD_RESEARCH_LIMITS.maxTranscriptSearches) {
          addLimitation(state, "research_transcript_search_limit");
          emit(state, deps, { id: eventId, kind: "tool", label: "Archive-search boundary reached", detail: "Synthesizing from preserved evidence", status: "unavailable", tool: "search_transcripts" });
          return { status: "unavailable", matches: [], limitation: "research_transcript_search_limit" };
        }
        transcriptSearches += 1;
        state.counts.transcript_searches = transcriptSearches;
        const envelope = await deps.tools.searchTranscripts({ query, limit: 5 });
        const receipts = envelope.receipts ?? [];
        if (receipts.length) {
          for (const [index, receipt] of receipts.entries()) {
            recordUsage(state, deps, {
              action: `standard:transcript_search:${transcriptSearches}:${index + 1}`,
              model: receipt.model,
              provider: receipt.provider,
              prompt_tokens: receipt.usage.prompt_tokens,
              total_tokens: receipt.usage.total_tokens,
              reported_cost_usd: receipt.reportedCostUsd ?? receipt.calculatedCostUsd,
              requests: 1,
              fallbackCostUsd: STANDARD_RESEARCH_LIMITS.missingTranscriptReceiptUsd / receipts.length,
            });
          }
        } else {
          recordUsage(state, deps, {
            action: `standard:transcript_search:${transcriptSearches}`,
            requests: 1,
            fallbackCostUsd: STANDARD_RESEARCH_LIMITS.missingTranscriptReceiptUsd,
          });
        }
        state.workspace.archive_queries = [...new Set([...state.workspace.archive_queries, query])].slice(-8);
        for (const match of envelope.result.matches) {
          transcriptMatches.set(match.chunk_id, {
            chunk_id: match.chunk_id,
            episode_id: match.episode_id,
            segment_id: match.segment_id,
            title: match.title,
            season: match.season,
            episode_number: match.episode_number,
            excerpt: match.excerpt.slice(0, 1_200),
            query,
          });
        }
        state.workspace.transcript_matches = [...transcriptMatches.values()].slice(-PHASE_7A_LIMITS.maxTranscriptMatches);
        const retrieval = envelope.result.retrieval_status;
        if (["keyword_only", "hybrid_unreranked", "unavailable"].includes(retrieval)) addLimitation(state, `archive:${retrieval}`);
        const eventStatus = retrieval === "unavailable" ? "unavailable" : ["keyword_only", "hybrid_unreranked"].includes(retrieval) ? "partial" : "complete";
        emit(state, deps, { id: eventId, kind: "tool", label: retrieval === "no_match" ? "No relevant archive match" : "Checked the Nonsense archive", detail: `${query} · ${envelope.result.matches.length} matches · ${retrieval}`, status: eventStatus, tool: "search_transcripts" });
        trace(state, { action: "search_transcripts", summary: "Checked the Nonsense archive", target: query, observation: `${envelope.result.matches.length} matches · ${retrieval}`, status: eventStatus === "unavailable" ? "partial" : eventStatus });
        checkpoint(state, deps);
        return {
          status: retrieval,
          reason: envelope.result.reason ?? null,
          matches: envelope.result.matches.map((match) => ({
            chunk_id: match.chunk_id,
            title: match.title,
            season: match.season,
            episode_number: match.episode_number,
            excerpt: match.excerpt,
          })),
        };
      },
    }),
    open_transcript_chunks: tool({
      description: "Open one to three exact chunk IDs returned by archive search. Returns citeable exact text and bounded adjacent conversational context.",
      inputSchema: z.object({ chunk_ids: z.array(z.string().trim().min(3).max(160)).min(1).max(PHASE_7A_LIMITS.maxBatchTargets) }).strict(),
      execute: async ({ chunk_ids }) => {
        const unique = [...new Set(chunk_ids)];
        if (unique.some((id) => !transcriptMatches.has(id))) throw new Error("research_chunk_not_allowed");
        const eventId = `evt_${state.runId}_archive_open_${transcriptOpens + 1}`;
        emit(state, deps, { id: eventId, kind: "tool", label: unique.length === 1 ? "Opening a past episode passage" : `Opening ${unique.length} past episode passages`, detail: `${unique.length} exact archive chunks`, status: "running", tool: "open_transcript_chunk" });
        if (!researchAllowed(STANDARD_RESEARCH_LIMITS.transcriptOpenStartReserveMs) || transcriptOpens + unique.length > STANDARD_RESEARCH_LIMITS.maxTranscriptOpens) {
          addLimitation(state, "research_transcript_open_limit");
          emit(state, deps, { id: eventId, kind: "tool", label: "Archive-opening boundary reached", detail: "Synthesizing from preserved evidence", status: "unavailable", tool: "open_transcript_chunk" });
          return { results: unique.map((chunk_id) => ({ chunk_id, status: "unavailable" })) };
        }
        transcriptOpens += unique.length;
        state.counts.transcript_opens = transcriptOpens;
        const results = await Promise.all(unique.map(async (chunkId) => {
          const opened = await deps.tools.openTranscriptChunk({ chunk_id: chunkId });
          if (opened.status !== "complete") return { chunk_id: chunkId, status: opened.status };
          const chunk = opened.chunk;
          const source: EvidenceSource = {
            source_id: `archive_${chunk.chunk_id}`,
            source_type: "archive",
            availability: "complete",
            evidence_usable: true,
            title: chunk.title,
            excerpt: chunk.text.slice(0, PHASE_5_LIMITS.maxEvidenceCharactersPerSource),
            content: chunk.text.slice(0, PHASE_5_LIMITS.maxEvidenceCharactersPerSource),
            episode_id: chunk.episode_id,
            segment_id: chunk.segment_id,
            chunk_id: chunk.chunk_id,
            season: chunk.season,
            episode_number: chunk.episode_number,
            episode_format: chunk.episode_format,
            segment_role: chunk.segment_role,
          };
          upsertEvidence(state, source);
          return {
            chunk_id: chunkId,
            status: "complete",
            title: chunk.title,
            citation_alias: assignAlias(aliases, source.source_id),
            exact_text: chunk.text,
            adjacent_context: opened.adjacent_chunks.map((adjacent) => ({
              chunk_id: adjacent.chunk_id,
              position: adjacent.chunk_index < chunk.chunk_index ? "before" : "after",
              text: adjacent.text.slice(0, 2_000),
            })),
          };
        }));
        const usable = results.filter((item) => "citation_alias" in item).length;
        const eventStatus = usable === results.length ? "complete" : usable ? "partial" : "unavailable";
        emit(state, deps, { id: eventId, kind: "tool", label: usable === 1 ? "Opened 1 past episode passage" : `Opened ${usable} past episode passages`, detail: `${usable}/${results.length} exact passages opened with adjacent context`, status: eventStatus, tool: "open_transcript_chunk" });
        trace(state, { action: "open_transcript_chunks", summary: `Opened ${usable} archive passage${usable === 1 ? "" : "s"}`, target: unique.join(", "), observation: `${usable}/${results.length} usable`, status: eventStatus === "unavailable" ? "partial" : eventStatus });
        checkpoint(state, deps);
        return { results };
      },
    }),
  };

  emit(state, deps, { kind: "run", label: "Research turn started", detail: "Luna is reading the conversation and deciding which tools are useful", status: "running" });
  state.workspace.research_state = {
    objective: state.message.slice(0, 500),
    completed_steps: [],
    evidence_gaps: [],
    next_step: "Luna is choosing the next useful research action.",
  };
  const notebook = state.workspace.research_notebook
    ? structuredClone(researchNotebookSchema.parse(state.workspace.research_notebook))
    : createEmptyResearchNotebook(state.startedAtIso);
  const goalId = `goal_${randomUUID()}`;
  notebook.current_goal = {
    goal_id: goalId,
    user_message: state.message,
    objective: state.message.slice(0, 600),
    depth: "standard",
    status: "researching",
    artifact_mode: null,
    plan_revision: 0,
    started_at: state.startedAtIso,
    completed_at: null,
    completion_reason: null,
  };
  if (/^(?:correction\b|actually[, :]|to correct\b)/i.test(state.message)) {
    const turn = state.workspace.turns.at(-1)!;
    notebook.user_corrections.push({ turn_id: turn.turn_id, text: state.message.slice(0, 1_000), created_at: turn.created_at });
    notebook.user_corrections = notebook.user_corrections.slice(-32);
  }
  state.workspace.research_notebook = notebook;
  checkpoint(state, deps);

  const createAgent = () => new ToolLoopAgent({
    model: deps.standardModel,
    instructions: promptContext(state, aliases, deps),
    tools: modelTools,
    toolOrder: ["search_web", "read_urls", "search_transcripts", "open_transcript_chunks"],
    stopWhen: isStepCount(STANDARD_RESEARCH_LIMITS.maxAgentSteps),
    prepareStep: ({ stepNumber, initialMessages }) => {
      const forceSynthesis = !researchAllowed() || stepNumber >= STANDARD_RESEARCH_LIMITS.maxAgentSteps - 2;
      if (forceSynthesis) {
        if (!synthesisEventStarted) {
          synthesisEventStarted = true;
          if (elapsed(state, deps) >= STANDARD_RESEARCH_LIMITS.researchCutoffMs) state.stoppingReason = "time_cutoff";
          else if (stepNumber >= STANDARD_RESEARCH_LIMITS.maxAgentSteps - 2) state.stoppingReason = "step_cutoff";
          emit(state, deps, { id: `evt_${state.runId}_synthesis`, kind: "agent", label: "Writing the answer", detail: "Synthesizing the strongest supported answer from preserved evidence", status: "running" });
        }
        const validAliases = state.workspace.evidence.flatMap((source) => {
          if (!source.evidence_usable) return [];
          return [{ citation_alias: assignAlias(aliases, source.source_id), title: source.title, source_type: source.source_type }];
        });
        return {
          activeTools: [],
          toolChoice: "none" as const,
          messages: initialMessages,
          maxOutputTokens: 2_500,
          instructions: [
            promptContext(state, aliases, deps),
            "",
            "FINAL SYNTHESIS STEP: Answer the user's current question now. Do not request or describe another tool call.",
            `VALID CITATION ALIASES: ${JSON.stringify(validAliases)}`,
            validAliases.length
              ? "End every material factual paragraph with one or more of those exact [[evidence_N]] aliases. An answer with no valid alias will be rejected."
              : "No citeable evidence is available. State the unresolved point briefly without inventing facts, and offer Run Deep Research.",
          ].join("\n"),
        };
      }
      const activeTools: Array<keyof typeof modelTools> = [];
      if (searches < STANDARD_RESEARCH_LIMITS.maxSearches && turnCandidates.size < STANDARD_RESEARCH_LIMITS.maxCandidates) activeTools.push("search_web");
      if (urlReads < STANDARD_RESEARCH_LIMITS.maxUrlReads) activeTools.push("read_urls");
      if (transcriptSearches < STANDARD_RESEARCH_LIMITS.maxTranscriptSearches) activeTools.push("search_transcripts");
      if (transcriptOpens < STANDARD_RESEARCH_LIMITS.maxTranscriptOpens) activeTools.push("open_transcript_chunks");
      return { activeTools };
    },
    maxRetries: 0,
    maxOutputTokens: 3_000,
  });

  try {
    let rawAnswer = "";
    for (let attempt = 0; attempt <= STANDARD_RESEARCH_LIMITS.maxTransientRetries; attempt += 1) {
      try {
        const agent = createAgent();
        const result = await agent.generate({
          prompt: state.message,
          abortSignal: deps.signal,
          onStepStart: () => {
            const code = abortCode(deps.signal);
            if (code) throw new Error(code);
            if (elapsed(state, deps) >= STANDARD_RESEARCH_LIMITS.hardDeadlineMs) throw new Error("research_run_timeout");
            const requestCap = Math.min(STANDARD_RESEARCH_LIMITS.maxProviderRequests, deps.providerRequestCap ?? STANDARD_RESEARCH_LIMITS.maxProviderRequests);
            if (state.providerRequests >= requestCap) throw new Error("research_provider_request_limit");
          },
          onStepEnd: ({ providerMetadata, usage, finishReason }) => {
            const receipt = openRouterReceipt(providerMetadata);
            recordUsage(state, deps, {
              action: `standard:luna:${state.counts.controller_turns + 1}`,
              model: deps.modelId,
              provider: receipt.provider,
              prompt_tokens: usage.inputTokens,
              completion_tokens: usage.outputTokens,
              total_tokens: usage.totalTokens,
              reported_cost_usd: receipt.cost,
              finish_reason: finishReason,
              requests: 1,
              fallbackCostUsd: STANDARD_RESEARCH_LIMITS.missingModelReceiptUsd,
            });
            state.counts.controller_turns += 1;
          },
        });
        rawAnswer = result.text;
        break;
      } catch (error) {
        const code = abortCode(deps.signal);
        if (code) throw new Error(code);
        if (attempt >= STANDARD_RESEARCH_LIMITS.maxTransientRetries || !isTransientResearchError(error)) throw error;
        state.transientRetries += 1;
        addLimitation(state, "standard_luna_transient_retry");
        emit(state, deps, { kind: "agent", label: "Retrying Luna once", detail: "A transient provider failure occurred; preserved evidence remains available", status: "partial" });
        checkpoint(state, deps);
      }
    }
    if (!synthesisEventStarted) {
      synthesisEventStarted = true;
      emit(state, deps, { id: `evt_${state.runId}_synthesis`, kind: "agent", label: "Writing the answer", detail: "Synthesizing the strongest supported answer", status: "running" });
    }
    assistant = finalizeAnswer(state, deps, aliases, rawAnswer);
    emit(state, deps, { id: `evt_${state.runId}_synthesis`, kind: "agent", label: "Answer ready", detail: "The final citations resolved to usable server-side evidence", status: "complete" });
    trace(state, { action: "submit_answer", summary: "Answered the research question", target: state.message, observation: `${assistant.source_ids.length} validated sources · ${state.stoppingReason}`, status: "complete" });
    status = state.limitations.some((item) => ![
      "standard_luna_transient_retry",
      "standard_search_transient_retry",
    ].includes(item)) ? "partial" : "complete";
  } catch (error) {
    const code = abortCode(deps.signal) ?? safeCode(error, "research_standard_runtime_failed");
    addLimitation(state, code);
    state.stoppingReason = code;
    status = code === "research_run_stopped" ? "stopped" : state.workspace.evidence.some((source) => source.evidence_usable) ? "partial" : "failed";
    assistant = incompleteAnswer(state, deps);
    for (const event of state.events.filter((item) => item.status === "running")) {
      emit(state, deps, { id: event.id, kind: event.kind, label: event.label, detail: code, status: status === "stopped" ? "stopped" : status === "partial" ? "partial" : "failed", ...(event.tool ? { tool: event.tool } : {}) });
    }
    trace(state, { action: "submit_answer", summary: "Returned an honest incomplete result", target: state.message, observation: code, status: status === "failed" ? "failed" : "partial" });
  }

  appendTurn(state, deps, "assistant", assistant.text, assistant.source_ids);
  const updatedNotebook = state.workspace.research_notebook
    ? structuredClone(researchNotebookSchema.parse(state.workspace.research_notebook))
    : createEmptyResearchNotebook(state.startedAtIso);
  if (updatedNotebook.current_goal?.goal_id === goalId) {
    updatedNotebook.current_goal.status = status === "complete" ? "satisfied" : status === "partial" ? "partial" : status === "stopped" ? "stopped" : "failed";
    updatedNotebook.current_goal.completed_at = nowIso(deps);
    updatedNotebook.current_goal.completion_reason = state.stoppingReason.slice(0, 800);
  }
  updatedNotebook.prior_answers.push({
    message_id: assistant.message_id,
    goal_id: goalId,
    text: assistant.text,
    source_ids: assistant.source_ids,
    created_at: assistant.created_at,
  });
  updatedNotebook.prior_answers = updatedNotebook.prior_answers.slice(-24);
  updatedNotebook.updated_at = nowIso(deps);
  state.workspace.research_notebook = updatedNotebook;
  state.workspace.research_state = {
    objective: state.message.slice(0, 500),
    completed_steps: [
      ...(searches ? [`Searched the web ${searches} time${searches === 1 ? "" : "s"}`] : []),
      ...(urlReads ? [`Opened ${urlReads} web source${urlReads === 1 ? "" : "s"}`] : []),
      ...(transcriptSearches ? ["Checked the Nonsense archive"] : []),
      "Answered from the strongest supported evidence",
    ].slice(0, PHASE_7A_LIMITS.maxNotebookCompletedSteps),
    evidence_gaps: status === "complete" ? [] : state.limitations.slice(0, PHASE_7A_LIMITS.maxNotebookEvidenceGaps),
    next_step: status === "complete" ? "Ready for a follow-up." : "Run Deep Research if the unresolved point matters.",
  };
  emit(state, deps, {
    kind: "run",
    label: status === "complete" ? "Answer ready" : status === "partial" ? "Answer ready with limitations" : status === "stopped" ? "Research stopped" : "Research failed safely",
    detail: state.stoppingReason,
    status,
  });
  const traceValue = phase7aRunTraceSchema.parse({
    run_id: state.runId,
    research_depth: "standard",
    started_at: state.startedAtIso,
    completed_at: nowIso(deps),
    status,
    steps: state.traceSteps,
    counts: state.counts,
    accounted_cost_usd: state.accountedCostUsd,
    source_ids: state.workspace.evidence.map((source) => source.source_id),
    artifact_revision: state.workspace.artifact_revision,
    limitations: state.limitations,
    controller_failure: null,
  });
  state.workspace.run_traces.push(traceValue);
  state.workspace.run_traces = state.workspace.run_traces.slice(-PHASE_7A_LIMITS.maxRunTraces);
  checkpoint(state, deps);
  return phase7aTurnResultSchema.parse({
    run_id: state.runId,
    status,
    assistant_message: assistant,
    artifact: state.workspace.artifact,
    artifact_revision: state.workspace.artifact_revision,
    events: state.events,
    usage: state.usage,
    counts: state.counts,
    accounted_cost_usd: state.accountedCostUsd,
    elapsed_ms: Number(elapsed(state, deps).toFixed(2)),
    limitations: state.limitations,
    trace: traceValue,
    workspace: state.workspace,
  });
}
