import { randomUUID } from "node:crypto";
import {
  ToolLoopAgent,
  isStepCount,
  tool,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import { z } from "zod";
import {
  RESEARCH_CONTENT_LIMITS,
  usageReceiptSchema,
  type EvidenceSource,
  type UsageReceipt,
} from "./content.ts";
import type { ResearchTools } from "./tools.ts";
import {
  hydrateResearchArtifactSourceLedger,
  researchGeneratedArtifactSchema,
  validateResearchArtifact,
} from "./artifact.ts";
import {
  RESEARCH_LIMITS,
  researchActivitySchema,
  researchAssistantMessageSchema,
  researchCountsSchema,
  researchRunTraceSchema,
  researchTraceStepSchema,
  researchTurnResultSchema,
  researchWorkspaceSchema,
  type ResearchActivity,
  type ResearchAssistantMessage,
  type ResearchCounts,
  type ResearchDepth,
  type ResearchRunTrace,
  type ResearchTurnResult,
  type ResearchWorkspace,
} from "./contracts.ts";
import { normalizeWebUrl } from "../web-research/contracts.ts";
import type { WebSourceRecord } from "../web-research/types.ts";
import { RESEARCH_AGENT_PROMPT } from "./prompt.ts";

const DEPTH_LIMITS = Object.freeze({
  standard: Object.freeze({
    maxSearches: 6,
    maxCandidates: 60,
    maxUrlReads: 12,
    maxTranscriptSearches: 3,
    maxTranscriptOpens: 4,
    maxAgentSteps: 10,
    maxProviderRequests: 32,
    researchCutoffMs: 50_000,
    hardDeadlineMs: 120_000,
    targetCostUsd: 0.25,
    ceilingCostUsd: 0.5,
    answerReserveUsd: 0.05,
  }),
  deep: Object.freeze({
    maxSearches: 18,
    maxCandidates: 120,
    maxUrlReads: 30,
    maxTranscriptSearches: 3,
    maxTranscriptOpens: 4,
    maxAgentSteps: 18,
    maxProviderRequests: 80,
    researchCutoffMs: 330_000,
    hardDeadlineMs: 360_000,
    targetCostUsd: 1,
    ceilingCostUsd: 2,
    answerReserveUsd: 0.15,
  }),
});

export const AGENT_LIMITS = Object.freeze({
  ...DEPTH_LIMITS,
  maxResultsPerSearch: 10,
  maxCandidatesPerQueryForModel: 4,
  maxCandidateExcerptCharactersForModel: 240,
  maxOpenedEvidenceCharactersForModel: 3_000,
  maxBatchReads: 4,
  maxHistoryMessages: 64,
  maxHistoryCharacters: 180_000,
  maxArtifactAttempts: 2,
  maxAnswerAttempts: 2,
  maxAnswerRecoveryCalls: 2,
  exaRequestReserveUsd: 0.02,
  transcriptSearchReserveUsd: 0.03,
  missingModelReceiptUsd: 0.03,
  missingExaReceiptUsd: 0.02,
  searchStartReserveMs: 22_000,
  urlReadStartReserveMs: 10_000,
  transcriptSearchStartReserveMs: 15_000,
  transcriptOpenStartReserveMs: 4_000,
});

export type ResearchAgentDependencies = {
  model: LanguageModel;
  modelId: string;
  tools: ResearchTools;
  now?: () => Date;
  clockMs?: () => number;
  signal?: AbortSignal;
  onEvent?: (event: ResearchActivity) => void;
  onCheckpoint?: (workspace: ResearchWorkspace) => void;
  costCapUsd?: number;
  providerRequestCap?: number;
};

type DepthLimits = (typeof DEPTH_LIMITS)[ResearchDepth];

type CitationAliases = {
  aliasBySourceId: Map<string, string>;
  sourceIdByAlias: Map<string, string>;
  sourceIdByReference: Map<string, string>;
};

type ResearchDeliverable = "answer" | "headlines_brief" | "big_story_brief";

type AgentState = {
  runId: string;
  workspace: ResearchWorkspace;
  message: string;
  depth: ResearchDepth;
  limits: DepthLimits;
  events: ResearchActivity[];
  traceSteps: ResearchRunTrace["steps"];
  limitations: string[];
  usage: UsageReceipt[];
  counts: ResearchCounts;
  startedAtMs: number;
  startedAtIso: string;
  accountedCostUsd: number;
  providerRequests: number;
  stoppingReason: string;
  artifactAttempts: number;
  artifactCreated: boolean;
  goalDeclared: boolean;
  deliverable: ResearchDeliverable;
  declaredObjective: string;
};

const researchGoalSchema = z.object({
  objective: z.string().trim().min(3).max(500),
  deliverable: z.enum(["answer", "headlines_brief", "big_story_brief"]),
  plan: z.array(z.string().trim().min(3).max(180)).min(1).max(4),
}).strict();

const answerSubmissionSchema = z.object({
  paragraphs: z.array(z.object({
    markdown: z.string().trim().min(1).max(2_000).describe("Readable Markdown only. Do not put bracketed citation numbers in this text; attach every source through citations."),
    citations: z.array(z.number().int().min(1).max(12)).max(12),
  }).strict()).min(1).max(12),
}).strict();

function nowIso(deps: ResearchAgentDependencies): string {
  return (deps.now?.() ?? new Date()).toISOString();
}

function elapsed(state: AgentState, deps: ResearchAgentDependencies): number {
  return Math.max(0, (deps.clockMs?.() ?? performance.now()) - state.startedAtMs);
}

function safeCode(error: unknown, defaultCode: string): string {
  const message = error instanceof Error ? error.message : "";
  return /^[a-z][a-z0-9_:-]{2,239}$/.test(message) ? message : defaultCode;
}

function abortCode(signal: AbortSignal | undefined): "research_run_stopped" | "research_run_timeout" | null {
  if (!signal?.aborted) return null;
  return signal.reason instanceof DOMException && signal.reason.name === "TimeoutError"
    ? "research_run_timeout"
    : "research_run_stopped";
}

function addLimitation(state: AgentState, value: string): void {
  const safe = value.slice(0, 240);
  if (!state.limitations.includes(safe) && state.limitations.length < 20) state.limitations.push(safe);
}

function emit(
  state: AgentState,
  deps: ResearchAgentDependencies,
  value: Omit<ResearchActivity, "id" | "run_id" | "created_at"> & { id?: string },
): void {
  const event = researchActivitySchema.parse({
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

function trace(state: AgentState, value: {
  action: ResearchRunTrace["steps"][number]["action"];
  summary: string;
  target: string;
  observation: string;
  status: "complete" | "partial" | "failed";
}): void {
  state.traceSteps.push(researchTraceStepSchema.parse({
    sequence: state.traceSteps.length + 1,
    action: value.action,
    public_summary: value.summary.slice(0, 180),
    target: value.target.slice(0, 500),
    observation: value.observation.slice(0, 500),
    status: value.status,
  }));
}

function appendTurn(
  state: AgentState,
  deps: ResearchAgentDependencies,
  role: "user" | "assistant",
  text: string,
  sourceIds: string[],
): void {
  state.workspace.turns.push({
    turn_id: `turn_${randomUUID()}`,
    role,
    text: text.slice(0, RESEARCH_LIMITS.maxMessageCharacters),
    source_ids: sourceIds.slice(0, 12),
    created_at: nowIso(deps),
  });
  state.workspace.turns = state.workspace.turns.slice(-RESEARCH_LIMITS.maxConversationTurns);
}

function checkpoint(state: AgentState, deps: ResearchAgentDependencies): void {
  state.workspace.updated_at_ms = Date.now();
  deps.onCheckpoint?.(structuredClone(state.workspace));
}

function aliasesFor(workspace: ResearchWorkspace): CitationAliases {
  const aliasBySourceId = new Map<string, string>();
  const sourceIdByAlias = new Map<string, string>();
  const sourceIdByReference = new Map<string, string>();
  for (const source of workspace.evidence) {
    if (!source.evidence_usable || aliasBySourceId.has(source.source_id)) continue;
    const alias = `evidence_${aliasBySourceId.size + 1}`;
    aliasBySourceId.set(source.source_id, alias);
    sourceIdByAlias.set(alias, source.source_id);
    sourceIdByReference.set(source.source_id, source.source_id);
    if (source.url) sourceIdByReference.set(source.url, source.source_id);
  }
  return { aliasBySourceId, sourceIdByAlias, sourceIdByReference };
}

function assignAlias(aliases: CitationAliases, sourceId: string): string {
  const existing = aliases.aliasBySourceId.get(sourceId);
  if (existing) return existing;
  const alias = `evidence_${aliases.aliasBySourceId.size + 1}`;
  aliases.aliasBySourceId.set(sourceId, alias);
  aliases.sourceIdByAlias.set(alias, sourceId);
  aliases.sourceIdByReference.set(sourceId, sourceId);
  return alias;
}

function citationToken(alias: string): string {
  const number = Number(alias.slice("evidence_".length));
  if (!Number.isInteger(number) || number < 1) throw new Error("research_invalid_citation");
  return `[${number}]`;
}

function suppliedUrls(workspace: ResearchWorkspace): Set<string> {
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
  const content = page.text?.slice(0, RESEARCH_CONTENT_LIMITS.maxEvidenceCharactersPerSource);
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

function upsertEvidence(state: AgentState, source: EvidenceSource): void {
  const index = state.workspace.evidence.findIndex((item) => item.source_id === source.source_id);
  if (index === -1) state.workspace.evidence.push(source);
  else state.workspace.evidence[index] = source;
  state.workspace.evidence = state.workspace.evidence.slice(-RESEARCH_LIMITS.maxEvidenceSources);
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

function recordUsage(
  state: AgentState,
  deps: ResearchAgentDependencies,
  value: Omit<UsageReceipt, "accounted_cost_usd" | "receipt_missing"> & {
    requests?: number;
    estimatedCostUsd: number;
    kind: "model" | "exa" | "retrieval";
  },
): void {
  const requests = Math.max(1, value.requests ?? 1);
  const requestCap = Math.min(state.limits.maxProviderRequests, deps.providerRequestCap ?? state.limits.maxProviderRequests);
  if (state.providerRequests + requests > requestCap) throw new Error("research_provider_request_limit");
  const reported = typeof value.reported_cost_usd === "number" && Number.isFinite(value.reported_cost_usd)
    ? value.reported_cost_usd
    : undefined;
  const accounted = reported ?? value.estimatedCostUsd;
  const costCap = Math.min(state.limits.ceilingCostUsd, deps.costCapUsd ?? state.limits.ceilingCostUsd);
  if (state.accountedCostUsd + accounted > costCap + 1e-9) throw new Error("research_budget_exhausted");
  const usage = Object.fromEntries(Object.entries(value).filter(([key, item]) => (
    !["requests", "estimatedCostUsd", "kind"].includes(key)
    && (typeof item !== "number" || (Number.isFinite(item) && item >= 0))
  )));
  state.usage.push(usageReceiptSchema.parse({
    ...usage,
    ...(reported === undefined ? {} : { reported_cost_usd: reported }),
    accounted_cost_usd: Number(accounted.toFixed(8)),
    receipt_missing: reported === undefined,
  }));
  state.accountedCostUsd = Number((state.accountedCostUsd + accounted).toFixed(8));
  state.providerRequests += requests;
  state.counts.provider_requests = state.providerRequests;
  if (value.kind === "model") state.counts.model_requests += requests;
  if (value.kind === "exa") state.counts.exa_search_requests += requests;
}

function boundedHistory(messages: ModelMessage[]): ModelMessage[] {
  const bounded = [...messages];
  const dropOldestCompleteUnit = () => {
    bounded.shift();
    // Tool-result messages are only valid when their preceding assistant tool
    // call is still present. If that call was compacted, drop its results too.
    while (bounded[0]?.role === "tool") bounded.shift();
  };
  while (bounded.length > AGENT_LIMITS.maxHistoryMessages) dropOldestCompleteUnit();
  while (bounded.length > 2 && JSON.stringify(bounded).length > AGENT_LIMITS.maxHistoryCharacters) {
    dropOldestCompleteUnit();
  }
  while (bounded[0]?.role === "tool") bounded.shift();
  return bounded;
}

function promptContext(
  state: AgentState,
  aliases: CitationAliases,
  deps: ResearchAgentDependencies,
): string {
  let evidenceCharacters = 16_000;
  const evidence = state.workspace.evidence.flatMap((source) => {
    if (!source.evidence_usable) return [];
    const alias = assignAlias(aliases, source.source_id);
    const raw = source.content ?? source.excerpt ?? "";
    const excerpt = raw.slice(0, Math.min(1_500, Math.max(0, evidenceCharacters)));
    evidenceCharacters -= excerpt.length;
    return [{
      citation_alias: alias,
      citation: citationToken(alias),
      source_type: source.source_type,
      title: source.title,
      url: source.url,
      season: source.season,
      episode_number: source.episode_number,
      evidence_text: excerpt,
    }];
  });
  const depthInstruction = state.depth === "deep"
    ? "DEEP RESEARCH is explicitly active. Investigate broadly within the larger ceilings, show a compact observable plan, and then proceed automatically."
    : "STANDARD RESEARCH is active. Stop as soon as the central question and material factual claims are sufficiently supported.";
  const artifactInstruction = "The Working Artifact tool is always available. Use it only when the current user request asks for a Preparation Brief, outline, artifact, packet, or revision. Interpret that request semantically; do not require particular verbs. Preserve current artifact material unless the user asks to replace it.";
  let conversationCharacters = 24_000;
  const conversation = [...state.workspace.turns].reverse().flatMap((turn) => {
    if (conversationCharacters <= 0) return [];
    const text = turn.text.slice(0, conversationCharacters);
    conversationCharacters -= text.length;
    return [{ role: turn.role, text }];
  }).reverse();
  return [
    RESEARCH_AGENT_PROMPT,
    "",
    `CURRENT USER REQUEST: ${JSON.stringify(state.message)}`,
    `DECLARED RESEARCH GOAL: ${JSON.stringify(state.goalDeclared ? { objective: state.declaredObjective, deliverable: state.deliverable } : null)}`,
    depthInstruction,
    artifactInstruction,
    `CURRENT DATE: ${nowIso(deps).slice(0, 10)}`,
    "When the answer is ready, call submit_answer with readable paragraphs and their exact numbered citations. Do not write final prose outside submit_answer.",
    "Use the exact numbered citation tokens provided with usable evidence. Never cite candidates or machine source IDs.",
    "ANSWER CITATION CONTRACT: Whenever you produce a final answer, every paragraph containing a material factual claim MUST attach at least one exact numbered citation through submit_answer's citations array. Do not type citation markers into markdown; the interface renders them. Do not invent a number or substitute raw URLs, machine source IDs, or a separate source list.",
    `CURRENT VALID CITATIONS: ${JSON.stringify(evidence.map((item) => ({ citation: item.citation, title: item.title })))}`,
    "",
    "RECENT PRODUCT CONVERSATION:",
    JSON.stringify(conversation),
    "",
    "SAVED USABLE EVIDENCE:",
    JSON.stringify(evidence),
    "",
    "CURRENT WORKING ARTIFACT:",
    JSON.stringify(state.workspace.artifact ? {
      revision: state.workspace.artifact_revision,
      artifact: state.workspace.artifact,
    } : null).slice(0, 24_000),
  ].join("\n");
}

function finalAnswerPrompt(
  state: AgentState,
  aliases: CitationAliases,
  deps: ResearchAgentDependencies,
): string {
  const available = state.workspace.evidence.flatMap((source) => {
    if (!source.evidence_usable) return [];
    const alias = assignAlias(aliases, source.source_id);
    return [{ citation: citationToken(alias), title: source.title ?? "Untitled source" }];
  });
  const citationContract = available.length
    ? [
      "FINAL ANSWER CONTRACT:",
      "Call submit_answer now. Every paragraph containing a material factual claim MUST include at least one exact numbered citation in its citations array.",
      "Use only the numbered citations listed below in the citations array. Do not type [1], [2], or any other citation marker into markdown; the interface renders and numbers sources from the array.",
      "Do not invent a number or substitute raw URLs, machine source IDs, or a separate source list.",
      `VALID CITATIONS: ${JSON.stringify(available)}`,
    ]
    : [
      "FINAL ANSWER CONTRACT:",
      "Call submit_answer now. No usable evidence is available, so do not assert current or otherwise verifiable factual claims. State the unresolved limitation briefly and naturally.",
    ];
  const deliveryInstruction = state.artifactCreated
    ? "The requested Preparation Brief is already validated and will render inline. Submit only a short one-to-three-paragraph acknowledgment that leads with its Central Story; do not duplicate the full packet."
    : "Submit the complete natural answer now.";
  return [promptContext(state, aliases, deps), "", deliveryInstruction, ...citationContract].join("\n");
}

function exactQuotedPassages(markdown: string): string[] {
  return [...markdown.matchAll(/["“]([^"”\n]+)["”]/g)]
    .map((match) => match[1]!.replace(/\s+/g, " ").trim())
    // Short scare-quoted labels and named terms are not reliable signals of a
    // direct quotation. Substantial quoted prose still receives exact-source
    // validation, while archive quotes have their own stricter artifact gate.
    .filter((quote) => quote.split(/\s+/).length >= 6);
}

function comparableQuote(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

class AnswerQuoteValidationError extends Error {
  constructor(readonly quote: string) {
    super("research_answer_quote_not_in_source");
    this.name = "AnswerQuoteValidationError";
  }
}

function finalizeAnswer(
  state: AgentState,
  deps: ResearchAgentDependencies,
  aliases: CitationAliases,
  paragraphs: z.infer<typeof answerSubmissionSchema>["paragraphs"],
): ResearchAssistantMessage {
  const usable = new Set(state.workspace.evidence.filter((source) => source.evidence_usable).map((source) => source.source_id));
  const evidenceById = new Map(state.workspace.evidence.map((source) => [source.source_id, source]));
  const blocks = paragraphs.map((paragraph) => {
    const clean = paragraph.markdown.trim();
    if (/\bto=functions\.[a-z0-9_-]+\s+code\s*:/i.test(clean) || /<\|(?:tool|function)[^>]*>/i.test(clean)) {
      throw new Error("research_answer_exposed_tool_protocol");
    }
    if (/\b(?:web|archive)_[a-z0-9:_-]+\b/i.test(clean) || /\bevidence_\d+\b/.test(clean)) {
      throw new Error("research_answer_exposed_internal_id");
    }
    if (/\[\s*\d+(?:\s*[,;]\s*\d+)*\s*\]/.test(clean)) {
      throw new Error("research_answer_citation_marker_in_markdown");
    }
    const sourceIds = [...new Set(paragraph.citations)].map((number) => {
      const sourceId = aliases.sourceIdByAlias.get(`evidence_${number}`);
      if (!sourceId || !usable.has(sourceId)) throw new Error("research_invalid_citation");
      return sourceId;
    });
    for (const quote of exactQuotedPassages(clean)) {
      const found = sourceIds.some((sourceId) => {
        const source = evidenceById.get(sourceId);
        return comparableQuote(source?.content ?? source?.excerpt ?? "").includes(comparableQuote(quote));
      });
      if (!found) throw new AnswerQuoteValidationError(quote);
    }
    return { text: clean, source_ids: sourceIds };
  });
  const text = blocks.map((block) => block.text).join("\n\n");
  if (!text) throw new Error("research_answer_empty");
  if (text.length > 24_000) throw new Error("research_answer_too_long");
  const cited = [...new Set(blocks.flatMap((block) => block.source_ids))];
  if (
    !state.artifactCreated
    && usable.size === 0
    && state.limitations.some((limitation) => limitation.startsWith("web_search:"))
  ) {
    throw new Error("research_answer_missing_evidence");
  }
  if (!state.artifactCreated && state.workspace.evidence.some((source) => source.evidence_usable) && cited.length === 0) {
    throw new Error("research_answer_missing_citations");
  }
  if (cited.length > 12) throw new Error("research_answer_source_limit");
  return researchAssistantMessageSchema.parse({
    message_id: `msg_${randomUUID()}`,
    run_id: state.runId,
    text,
    source_ids: cited,
    blocks,
    created_at: nowIso(deps),
  });
}

function incompleteAnswer(state: AgentState, deps: ResearchAgentDependencies): ResearchAssistantMessage {
  const text = state.workspace.evidence.some((source) => source.evidence_usable)
    ? "I found usable evidence, but this turn stopped before I could produce a safely cited answer. The evidence is preserved. Run Deep Research if the unresolved point matters."
    : "I couldn't complete this research turn reliably, so I didn't substitute an unsupported answer. Try again when the unavailable research capability is restored.";
  return researchAssistantMessageSchema.parse({
    message_id: `msg_${randomUUID()}`,
    run_id: state.runId,
    text,
    source_ids: [],
    blocks: [{ text, source_ids: [] }],
    created_at: nowIso(deps),
  });
}

function resolveCitationReference(value: string, aliases: CitationAliases): string {
  const trimmed = value.trim();
  const numeric = trimmed.match(/^\[?(\d{1,3})\]?(?:\s+.+)?$/);
  const alias = numeric ? `evidence_${Number(numeric[1])}` : trimmed;
  const sourceId = aliases.sourceIdByAlias.get(alias) ?? aliases.sourceIdByReference.get(trimmed);
  if (!sourceId) throw new Error("artifact_invalid_citation");
  return sourceId;
}

function resolveArtifactAliases(value: unknown, aliases: CitationAliases, key = ""): unknown {
  if (Array.isArray(value)) {
    if (key === "source_ids") {
      return value.map((item) => {
        if (typeof item !== "string") throw new Error("artifact_invalid_citation");
        return resolveCitationReference(item, aliases);
      });
    }
    return value.map((item) => resolveArtifactAliases(item, aliases));
  }
  if (!value || typeof value !== "object") {
    if (key === "source_id") {
      if (typeof value !== "string") throw new Error("artifact_invalid_citation");
      return resolveCitationReference(value, aliases);
    }
    return value;
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
    childKey,
    resolveArtifactAliases(child, aliases, childKey),
  ]));
}

export async function runResearchTurn(options: {
  workspace: ResearchWorkspace;
  message: string;
  researchDepth?: ResearchDepth;
  runId?: string;
}, deps: ResearchAgentDependencies): Promise<ResearchTurnResult> {
  const workspace = structuredClone(researchWorkspaceSchema.parse(options.workspace));
  const depth = options.researchDepth ?? "standard";
  const limits = DEPTH_LIMITS[depth];
  const state: AgentState = {
    runId: options.runId ?? `run_${randomUUID()}`,
    workspace,
    message: options.message.trim(),
    depth,
    limits,
    events: [],
    traceSteps: [],
    limitations: [],
    usage: [],
    counts: researchCountsSchema.parse({
      agent_steps: 0,
      provider_requests: 0,
      model_requests: 0,
      exa_search_requests: 0,
            web_searches: 0,
      web_candidates: 0,
      url_reads: 0,
      transcript_searches: 0,
      transcript_opens: 0,
      artifact_completions: 0,
      artifact_calls: 0,
      repairs: 0,
    }),
    startedAtMs: deps.clockMs?.() ?? performance.now(),
    startedAtIso: nowIso(deps),
    accountedCostUsd: 0,
    providerRequests: 0,
    stoppingReason: "model_satisfied",
    artifactAttempts: 0,
    artifactCreated: false,
    goalDeclared: false,
    deliverable: "answer",
    declaredObjective: options.message.trim(),
  };
  appendTurn(state, deps, "user", state.message, []);
  const aliases = aliasesFor(state.workspace);
  const supplied = suppliedUrls(state.workspace);
  const candidates = new Map(state.workspace.candidates.map((candidate) => [normalizeWebUrl(candidate.url), candidate]));
  const transcriptMatches = new Map(state.workspace.transcript_matches.map((match) => [match.chunk_id, match]));
  const turnCandidates = new Set<string>();
  const searchedWebQueries = new Set<string>();
  const openedWebUrls = new Set<string>();
  const searchedArchiveQueries = new Set<string>();
  const openedArchiveChunks = new Set<string>();
  let searches = 0;
  let urlReads = 0;
  let transcriptSearches = 0;
  let transcriptOpens = 0;
  let answerOnly = false;
  let answerEventStarted = false;
  let answerAttempts = 0;
  let assistant: ResearchAssistantMessage | null = null;
  let status: "complete" | "partial" | "stopped" | "failed" = "complete";

  const costCap = Math.min(limits.ceilingCostUsd, deps.costCapUsd ?? limits.ceilingCostUsd);
  const researchBoundary = (reserveMs = 0, reserveUsd = 0): string | null => {
    if (deps.signal?.aborted) return abortCode(deps.signal) ?? "research_run_stopped";
    if (elapsed(state, deps) + reserveMs >= limits.researchCutoffMs) return "research_time_cutoff";
    if (state.accountedCostUsd + limits.answerReserveUsd + reserveUsd >= costCap) return "research_budget_boundary";
    return null;
  };
  const researchAllowed = (reserveMs = 0, reserveUsd = 0) => researchBoundary(reserveMs, reserveUsd) === null;
  const isAllowedUrl = (raw: string): string => {
    const normalized = normalizeWebUrl(raw);
    if (supplied.has(normalized) || candidates.has(normalized)) return normalized;
    if (state.workspace.evidence.some((source) => source.url && normalizeWebUrl(source.url) === normalized)) return normalized;
    throw new Error("research_url_not_allowed");
  };

  const modelTools = {
    set_research_goal: tool({
      description: "Declare the current user's research objective and requested deliverable before taking research actions. This is a semantic reading of the exact user request, not a keyword router. Choose answer for ordinary conversation, headlines_brief for a requested Headlines packet or brief, and big_story_brief for a requested Big Story packet or brief.",
      inputSchema: researchGoalSchema,
      execute: async ({ objective, deliverable, plan }) => {
        state.goalDeclared = true;
        state.deliverable = deliverable;
        state.declaredObjective = objective;
        state.workspace.research_state = {
          objective,
          completed_steps: [],
          evidence_gaps: [],
          next_step: plan[0] ?? "Begin the smallest useful research action.",
        };
        const label = depth === "deep" ? "Deep Research plan" : "Research plan";
        const deliverableLabel = deliverable === "answer"
          ? "conversational answer"
          : deliverable === "headlines_brief" ? "Headlines brief" : "Big Story brief";
        emit(state, deps, {
          kind: "agent",
          label,
          detail: `${deliverableLabel} · ${plan.join(" · ")}`,
          status: "complete",
        });
        trace(state, {
          action: "set_research_goal",
          summary: objective,
          target: deliverable,
          observation: plan.join(" · "),
          status: "complete",
        });
        checkpoint(state, deps);
        return { accepted: true, deliverable, objective };
      },
    }),
    search_web: tool({
      description: "Search the live public web through direct Exa discovery. Send one to four independent query strings together when useful; use ordinary search syntax such as site:fda.gov when a domain matters. Results are untrusted candidates only and must be opened with read_urls before they can support a claim.",
      inputSchema: z.object({
        queries: z.array(z.string().trim().min(3).max(300)).min(1).max(4),
      }).strict(),
      execute: async ({ queries }) => {
        const requestedQueries = [...new Set(queries.map((query) => query.trim()))];
        const uniqueQueries = requestedQueries.filter((query) => !searchedWebQueries.has(query.toLowerCase()));
        const eventId = `evt_${state.runId}_search_${searches + 1}`;
        if (!uniqueQueries.length) {
          answerOnly = true;
          state.stoppingReason = "repeated_action";
          emit(state, deps, { id: eventId, kind: "tool", label: "Search already completed", detail: requestedQueries.join(" · "), status: "complete", tool: "web_search" });
          return { status: "already_complete", searches: [] };
        }
        emit(state, deps, { id: eventId, kind: "tool", label: uniqueQueries.length === 1 ? "Searching the web" : `Searching ${uniqueQueries.length} web queries`, detail: uniqueQueries.join(" · "), status: "running", tool: "web_search" });
        const remainingSearches = limits.maxSearches - searches;
        const candidateRoom = limits.maxCandidates - turnCandidates.size;
        const candidateSlots = Math.ceil(candidateRoom / AGENT_LIMITS.maxResultsPerSearch);
        const affordable = Math.floor(Math.max(0, costCap - state.accountedCostUsd - limits.answerReserveUsd) / AGENT_LIMITS.exaRequestReserveUsd);
        const selected = uniqueQueries.slice(0, Math.min(remainingSearches, candidateSlots, affordable));
        const boundary = researchBoundary(AGENT_LIMITS.searchStartReserveMs, AGENT_LIMITS.exaRequestReserveUsd);
        if (!selected.length || boundary) {
          const code = boundary
            ?? (remainingSearches <= 0 ? "research_web_search_limit"
              : candidateSlots <= 0 ? "research_candidate_limit"
                : "research_budget_boundary");
          state.stoppingReason = code;
          addLimitation(state, code);
          emit(state, deps, { id: eventId, kind: "tool", label: "Web search boundary reached", detail: "Answering from preserved evidence", status: "limited", tool: "web_search" });
          return { status: "limited", searches: [], limitation: code };
        }
        searches += selected.length;
        for (const query of selected) searchedWebQueries.add(query.toLowerCase());
        state.counts.web_searches = searches;
        const batch = await Promise.all(selected.map(async (query) => {
          const result = await deps.tools.webSearch({
            query,
            limit: AGENT_LIMITS.maxResultsPerSearch,
          });
          const providerRequests = result.receipt.web_search_requests ?? 0;
          if (providerRequests > 0) {
            recordUsage(state, deps, {
              action: `agent:exa:${searches}`,
              provider: result.receipt.provider_name,
              reported_cost_usd: result.receipt.cost_usd,
              requests: providerRequests,
              estimatedCostUsd: AGENT_LIMITS.missingExaReceiptUsd * providerRequests,
              kind: "exa",
            });
          }
          return { query, result };
        }));
        state.workspace.web_queries = [...new Set([...state.workspace.web_queries, ...selected])].slice(-24);
        let acceptedTotal = 0;
        const searchesForModel = [];
        for (const { query, result } of batch) {
          const accepted = [];
          for (const source of result.sources) {
            const normalized = normalizeWebUrl(source.url);
            if (!turnCandidates.has(normalized) && turnCandidates.size >= limits.maxCandidates) break;
            turnCandidates.add(normalized);
            const candidate = {
              source_id: source.source_id,
              url: source.url,
              title: source.title,
              excerpt: source.excerpt?.slice(0, 1_200) ?? null,
              byline: source.byline ?? null,
              published_at: source.published_at ?? null,
              query,
            };
            candidates.set(normalized, candidate);
            accepted.push(candidate);
          }
          acceptedTotal += accepted.length;
          if (result.status === "unavailable" || result.status === "failed") addLimitation(state, `web_search:${result.failure?.code ?? result.status}`);
          searchesForModel.push({
            query,
            status: result.status,
            candidates: accepted.slice(0, AGENT_LIMITS.maxCandidatesPerQueryForModel).map((candidate) => ({
              url: candidate.url,
              title: candidate.title,
              published_at: candidate.published_at,
              excerpt: candidate.excerpt?.slice(0, AGENT_LIMITS.maxCandidateExcerptCharactersForModel) ?? null,
            })),
            limitation: result.failure?.code ?? null,
          });
        }
        state.workspace.candidates = [...candidates.values()].slice(-RESEARCH_LIMITS.maxCandidates);
        state.counts.web_candidates = turnCandidates.size;
        const unavailable = batch.filter(({ result }) => result.status === "unavailable").length;
        const failed = batch.filter(({ result }) => result.status === "failed").length;
        const limited = batch.filter(({ result }) => result.status === "limited").length;
        const noMatch = batch.filter(({ result }) => result.status === "no_match").length;
        const eventStatus = acceptedTotal > 0
          ? unavailable || failed || limited ? "limited" : "complete"
          : failed ? "failed"
            : unavailable ? "unavailable"
              : noMatch === batch.length ? "no_match"
                : "limited";
        emit(state, deps, { id: eventId, kind: "tool", label: acceptedTotal ? "Searched the web" : "No useful web results", detail: `${selected.length} quer${selected.length === 1 ? "y" : "ies"} · ${acceptedTotal} candidates`, status: eventStatus, tool: "web_search" });
        trace(state, { action: "web_search", summary: `Ran ${selected.length} web quer${selected.length === 1 ? "y" : "ies"}`, target: selected.join(" · "), observation: `${acceptedTotal} candidates · ${unavailable} unavailable`, status: eventStatus === "failed" ? "failed" : eventStatus === "complete" || eventStatus === "no_match" ? "complete" : "partial" });
        checkpoint(state, deps);
        return { status: eventStatus, searches: searchesForModel };
      },
    }),
    read_urls: tool({
      description: "Open one to four user-supplied or discovered public URLs concurrently through the hardened reader. Only successfully retrieved page content becomes citeable evidence; search highlights never do.",
      inputSchema: z.object({ urls: z.array(z.string().url().max(2_000)).min(1).max(AGENT_LIMITS.maxBatchReads) }).strict(),
      execute: async ({ urls }) => {
        const requested = [...new Set(urls.map(isAllowedUrl))];
        const unique = requested.filter((url) => !openedWebUrls.has(url));
        const eventId = `evt_${state.runId}_read_${urlReads + 1}`;
        if (!unique.length) {
          answerOnly = true;
          state.stoppingReason = "repeated_action";
          emit(state, deps, { id: eventId, kind: "tool", label: "Sources already opened", detail: requested.map((url) => new URL(url).hostname).join(", "), status: "complete", tool: "read_url" });
          return { status: "already_complete", results: [] };
        }
        emit(state, deps, { id: eventId, kind: "tool", label: unique.length === 1 ? "Reading a source" : `Reading ${unique.length} sources`, detail: unique.map((url) => new URL(url).hostname).join(", "), status: "running", tool: "read_url" });
        const boundary = researchBoundary(AGENT_LIMITS.urlReadStartReserveMs);
        if (boundary || urlReads + unique.length > limits.maxUrlReads) {
          const code = boundary ?? "research_url_read_limit";
          state.stoppingReason = code;
          addLimitation(state, code);
          emit(state, deps, { id: eventId, kind: "tool", label: "Source-reading boundary reached", detail: "Answering from preserved evidence", status: "limited", tool: "read_url" });
          return { status: "limited", results: unique.map((url) => ({ url, status: "unavailable" })) };
        }
        urlReads += unique.length;
        for (const url of unique) openedWebUrls.add(url);
        state.counts.url_reads = urlReads;
        const settled = await Promise.allSettled(unique.map((url) => deps.tools.readUrl({ url })));
        const results = settled.map((item, index) => {
          const url = unique[index]!;
          if (item.status === "rejected") {
            addLimitation(state, `read_url:${safeCode(item.reason, "unavailable")}`);
            return { url, status: "unavailable" };
          }
          const source = pageEvidence(item.value, supplied.has(url) ? "provided_link" : "web");
          upsertEvidence(state, source);
          if (!source.evidence_usable) {
            addLimitation(state, `read_url:${source.failure_code ?? source.availability}`);
            return { url, status: source.availability, title: source.title };
          }
          return {
            url,
            status: source.availability,
            title: source.title,
            citation_alias: assignAlias(aliases, source.source_id),
            citation: citationToken(assignAlias(aliases, source.source_id)),
            evidence_text: (source.content ?? source.excerpt ?? "").slice(0, AGENT_LIMITS.maxOpenedEvidenceCharactersForModel),
          };
        });
        const usable = results.filter((item) => "citation_alias" in item).length;
        const eventStatus = usable === results.length ? "complete" : usable ? "limited" : "unavailable";
        emit(state, deps, { id: eventId, kind: "tool", label: usable === 1 ? "Read 1 source" : `Read ${usable} sources`, detail: `${usable}/${results.length} became citeable evidence`, status: eventStatus, tool: "read_url" });
        trace(state, { action: "read_urls", summary: `Opened ${usable} usable source${usable === 1 ? "" : "s"}`, target: unique.join(", "), observation: `${usable}/${results.length} usable`, status: eventStatus === "complete" ? "complete" : "partial" });
        checkpoint(state, deps);
        return { status: eventStatus, results };
      },
    }),
    search_transcripts: tool({
      description: "Search the validated Season 3–4 Nonsense transcript archive when prior coverage could materially improve the answer. Use concise topic terms. Returned matches must be opened before citation, and no match is only a bounded no-match.",
      inputSchema: z.object({ query: z.string().trim().min(2).max(500) }).strict(),
      execute: async ({ query }) => {
        const normalizedQuery = query.trim().toLowerCase();
        const eventId = `evt_${state.runId}_archive_search_${transcriptSearches + 1}`;
        if (searchedArchiveQueries.has(normalizedQuery)) {
          answerOnly = true;
          state.stoppingReason = "repeated_action";
          emit(state, deps, { id: eventId, kind: "tool", label: "Archive search already completed", detail: query, status: "complete", tool: "search_transcripts" });
          return { status: "already_complete", matches: [] };
        }
        emit(state, deps, { id: eventId, kind: "tool", label: "Checking the Nonsense archive", detail: query, status: "running", tool: "search_transcripts" });
        const boundary = researchBoundary(AGENT_LIMITS.transcriptSearchStartReserveMs, AGENT_LIMITS.transcriptSearchReserveUsd);
        if (boundary || transcriptSearches >= limits.maxTranscriptSearches) {
          const code = boundary ?? "research_transcript_search_limit";
          state.stoppingReason = code;
          addLimitation(state, code);
          emit(state, deps, { id: eventId, kind: "tool", label: "Archive-search boundary reached", detail: "Answering from preserved evidence", status: "limited", tool: "search_transcripts" });
          return { status: "limited", matches: [], limitation: code };
        }
        transcriptSearches += 1;
        searchedArchiveQueries.add(normalizedQuery);
        state.counts.transcript_searches = transcriptSearches;
        const envelope = await deps.tools.searchTranscripts({ query, limit: 6 });
        for (const [index, receipt] of (envelope.receipts ?? []).entries()) {
          recordUsage(state, deps, {
            action: `agent:transcript_search:${transcriptSearches}:${index + 1}`,
            model: receipt.model,
            provider: receipt.provider,
            prompt_tokens: receipt.usage.prompt_tokens,
            total_tokens: receipt.usage.total_tokens,
            reported_cost_usd: receipt.reportedCostUsd ?? receipt.calculatedCostUsd,
            requests: receipt.requests ?? 1,
            estimatedCostUsd: 0,
            kind: "retrieval",
          });
        }
        state.workspace.archive_queries = [...new Set([...state.workspace.archive_queries, query])].slice(-16);
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
        state.workspace.transcript_matches = [...transcriptMatches.values()].slice(-RESEARCH_LIMITS.maxTranscriptMatches);
        const retrieval = envelope.result.retrieval_status;
        if (["keyword_only", "unavailable"].includes(retrieval)) addLimitation(state, `archive:${retrieval}`);
        const eventStatus = retrieval === "unavailable" ? "unavailable" : retrieval === "keyword_only" ? "limited" : retrieval === "no_match" ? "no_match" : "complete";
        emit(state, deps, { id: eventId, kind: "tool", label: retrieval === "no_match" ? "No relevant archive match" : "Checked the Nonsense archive", detail: `${query} · ${envelope.result.matches.length} matches · ${retrieval}`, status: eventStatus, tool: "search_transcripts" });
        trace(state, { action: "search_transcripts", summary: "Checked the Nonsense archive", target: query, observation: `${envelope.result.matches.length} matches · ${retrieval}`, status: eventStatus === "complete" || eventStatus === "no_match" ? "complete" : "partial" });
        checkpoint(state, deps);
        return {
          status: retrieval,
          reason: envelope.result.reason ?? null,
          matches: envelope.result.matches.map((match) => ({ chunk_id: match.chunk_id, title: match.title, season: match.season, episode_number: match.episode_number, excerpt: match.excerpt })),
        };
      },
    }),
    open_transcript_chunks: tool({
      description: "Open one to four exact chunk IDs returned by search_transcripts. Returns citeable exact text plus bounded adjacent context. Never infer which host spoke unlabeled text.",
      inputSchema: z.object({ chunk_ids: z.array(z.string().trim().min(3).max(160)).min(1).max(AGENT_LIMITS.maxBatchReads) }).strict(),
      execute: async ({ chunk_ids }) => {
        const requested = [...new Set(chunk_ids)];
        if (requested.some((id) => !transcriptMatches.has(id))) throw new Error("research_chunk_not_allowed");
        const unique = requested.filter((id) => !openedArchiveChunks.has(id));
        const eventId = `evt_${state.runId}_archive_open_${transcriptOpens + 1}`;
        if (!unique.length) {
          answerOnly = true;
          state.stoppingReason = "repeated_action";
          emit(state, deps, { id: eventId, kind: "tool", label: "Archive passages already opened", detail: `${requested.length} exact archive chunk${requested.length === 1 ? "" : "s"}`, status: "complete", tool: "open_transcript_chunk" });
          return { status: "already_complete", results: [] };
        }
        emit(state, deps, { id: eventId, kind: "tool", label: unique.length === 1 ? "Opening a past episode passage" : `Opening ${unique.length} past episode passages`, detail: `${unique.length} exact archive chunks`, status: "running", tool: "open_transcript_chunk" });
        const boundary = researchBoundary(AGENT_LIMITS.transcriptOpenStartReserveMs);
        if (boundary || transcriptOpens + unique.length > limits.maxTranscriptOpens) {
          const code = boundary ?? "research_transcript_open_limit";
          state.stoppingReason = code;
          addLimitation(state, code);
          emit(state, deps, { id: eventId, kind: "tool", label: "Archive-opening boundary reached", detail: "Answering from preserved evidence", status: "limited", tool: "open_transcript_chunk" });
          return { status: "limited", results: unique.map((chunk_id) => ({ chunk_id, status: "unavailable" })) };
        }
        transcriptOpens += unique.length;
        for (const chunkId of unique) openedArchiveChunks.add(chunkId);
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
            excerpt: chunk.text.slice(0, RESEARCH_CONTENT_LIMITS.maxEvidenceCharactersPerSource),
            content: chunk.text.slice(0, RESEARCH_CONTENT_LIMITS.maxEvidenceCharactersPerSource),
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
            citation: citationToken(assignAlias(aliases, source.source_id)),
            exact_text: chunk.text,
            adjacent_context: opened.adjacent_chunks.map((adjacent) => ({
              position: adjacent.chunk_index < chunk.chunk_index ? "before" : "after",
              text: adjacent.text.slice(0, 2_000),
            })),
          };
        }));
        const usable = results.filter((item) => "citation_alias" in item).length;
        const eventStatus = usable === results.length ? "complete" : usable ? "limited" : "unavailable";
        emit(state, deps, { id: eventId, kind: "tool", label: usable === 1 ? "Opened 1 past episode passage" : `Opened ${usable} past episode passages`, detail: `${usable}/${results.length} exact passages opened`, status: eventStatus, tool: "open_transcript_chunk" });
        trace(state, { action: "open_transcript_chunks", summary: `Opened ${usable} archive passage${usable === 1 ? "" : "s"}`, target: unique.join(", "), observation: `${usable}/${results.length} usable`, status: eventStatus === "complete" ? "complete" : "partial" });
        checkpoint(state, deps);
        return { status: eventStatus, results };
      },
    }),
    submit_answer: tool({
      description: "Submit the final natural answer from this same research context. Do not use this before create_or_update_artifact succeeds when the current user explicitly requested a packet, Preparation Brief, outline, artifact, or revision. Put clean readable Markdown in paragraphs, with no bracketed citation markers in that text, and attach the exact numbered citations returned with opened evidence in each paragraph's citations array. Any quotation of six or more words must be copied exactly from a source cited in that same paragraph; otherwise paraphrase it without quotation marks. The interface owns visible citation numbering. Call when the central question is answered or the strongest honest limitation is ready. Do not emit final prose outside this tool.",
      inputSchema: answerSubmissionSchema,
      execute: async ({ paragraphs }) => {
        answerAttempts += 1;
        const eventId = `evt_${state.runId}_answer`;
        try {
          if (state.deliverable !== "answer" && !state.artifactCreated) {
            throw new Error("research_requested_artifact_missing");
          }
          const hasUsableEvidence = state.workspace.evidence.some((source) => source.evidence_usable);
          if (hasUsableEvidence && paragraphs.some((paragraph) => paragraph.citations.length === 0)) {
            throw new Error("research_answer_paragraph_missing_citation");
          }
          assistant = finalizeAnswer(state, deps, aliases, paragraphs);
          answerEventStarted = true;
          state.stoppingReason = "answer_submitted";
          status = state.limitations.length ? "partial" : "complete";
          emit(state, deps, { id: eventId, kind: "agent", label: "Answer ready", detail: "Every rendered citation resolved to usable server-side evidence", status: "complete" });
          trace(state, { action: "submit_answer", summary: "Answered the research question", target: state.message, observation: `${assistant.source_ids.length} validated sources`, status: "complete" });
          return { accepted: true, paragraphs: assistant.blocks.length, sources: assistant.source_ids.length };
        } catch (error) {
          const code = safeCode(error, "research_answer_validation_failed");
          if (answerAttempts < AGENT_LIMITS.maxAnswerAttempts) {
            state.counts.repairs += 1;
            emit(state, deps, { id: eventId, kind: "validation", label: "Answer needs one correction", detail: code, status: "partial" });
            return {
              accepted: false,
              error: code,
              ...(error instanceof AnswerQuoteValidationError ? {
                unverified_quote: error.quote.slice(0, 180),
                correction: "Either cite the source containing those exact words, or paraphrase them without quotation marks.",
              } : {}),
              attempts_remaining: AGENT_LIMITS.maxAnswerAttempts - answerAttempts,
            };
          }
          addLimitation(state, code);
          status = state.workspace.evidence.some((source) => source.evidence_usable) ? "partial" : "failed";
          assistant = incompleteAnswer(state, deps);
          answerEventStarted = true;
          emit(state, deps, { id: eventId, kind: "validation", label: "Answer could not be validated", detail: code, status: "failed" });
          trace(state, { action: "submit_answer", summary: "Returned an honest incomplete result", target: state.message, observation: code, status: status === "failed" ? "failed" : "partial" });
          return { accepted: false, error: code, attempts_remaining: 0 };
        }
      },
    }),
    create_or_update_artifact: tool({
      description: "Create or revise the explicitly requested Headlines or Big Story Working Artifact from usable evidence. In source_ids arrays, cite opened evidence using its exact string token, such as [1] or evidence_1. For each past_nonsense_coverage item, send only that archive citation as source_id plus an exact quote copied from opened archive text; stable episode, segment, and chunk IDs are hydrated by the server. Outline priorities must include essential, strong, and optional; never assign minutes or a locked running order.",
      inputSchema: researchGeneratedArtifactSchema,
      execute: async (input) => {
        const eventId = `evt_${state.runId}_artifact`;
        state.artifactAttempts += 1;
        emit(state, deps, { id: eventId, kind: "artifact", label: state.workspace.artifact ? "Updating the preparation brief" : "Creating the preparation brief", detail: `${input.mode === "headlines" ? "Headlines" : "Big Story"} · attempt ${state.artifactAttempts}`, status: "running" });
        if (!state.workspace.evidence.some((source) => source.evidence_usable)) {
          return { status: "invalid", errors: ["artifact:no_usable_evidence"] };
        }
        const expectedMode = state.deliverable === "headlines_brief"
          ? "headlines"
          : state.deliverable === "big_story_brief" ? "big_story" : null;
        if (expectedMode && input.mode !== expectedMode) {
          return { status: "invalid", errors: [`artifact:mode_must_be_${expectedMode}`] };
        }
        try {
          const resolved = resolveArtifactAliases(input, aliases);
          const hydrated = hydrateResearchArtifactSourceLedger(resolved, state.workspace.evidence);
          const validation = validateResearchArtifact(input.mode, hydrated, state.workspace.evidence);
          if (!validation.artifact || validation.errors.length) {
            if (state.artifactAttempts < AGENT_LIMITS.maxArtifactAttempts) state.counts.repairs += 1;
            else addLimitation(state, "research_artifact_validation_failed");
            emit(state, deps, { id: eventId, kind: "validation", label: "Preparation brief needs repair", detail: `${validation.errors.length} bounded validation issue${validation.errors.length === 1 ? "" : "s"}`, status: state.artifactAttempts < AGENT_LIMITS.maxArtifactAttempts ? "partial" : "failed" });
            return { status: "invalid", errors: validation.errors.slice(0, 12), attempts_remaining: Math.max(0, AGENT_LIMITS.maxArtifactAttempts - state.artifactAttempts) };
          }
          state.workspace.artifact = validation.artifact;
          state.workspace.artifact_revision += 1;
          state.counts.artifact_completions += 1;
          state.counts.artifact_calls += 1;
          state.artifactCreated = true;
          emit(state, deps, { id: eventId, kind: "artifact", label: "Preparation brief ready", detail: `${input.mode === "headlines" ? "Headlines" : "Big Story"} · Revision ${state.workspace.artifact_revision} · priority-based, no assigned minutes`, status: "complete" });
          trace(state, { action: "create_artifact", summary: "Created or updated the requested preparation brief", target: input.mode, observation: `revision ${state.workspace.artifact_revision}`, status: "complete" });
          checkpoint(state, deps);
          return { status: "complete", revision: state.workspace.artifact_revision, working_title: validation.artifact.working_title };
        } catch (error) {
          const code = safeCode(error, "artifact_validation_failed");
          if (state.artifactAttempts < AGENT_LIMITS.maxArtifactAttempts) state.counts.repairs += 1;
          else addLimitation(state, code);
          emit(state, deps, { id: eventId, kind: "validation", label: "Preparation brief needs repair", detail: code, status: state.artifactAttempts < AGENT_LIMITS.maxArtifactAttempts ? "partial" : "failed" });
          return { status: "invalid", errors: [code], attempts_remaining: Math.max(0, AGENT_LIMITS.maxArtifactAttempts - state.artifactAttempts) };
        }
      },
    }),
  };

  emit(state, deps, { kind: "run", label: depth === "deep" ? "Deep Research started" : "Research turn started", detail: "One Luna agent is reading the conversation and choosing useful tools", status: "running" });
  state.workspace.research_state = {
    objective: state.message.slice(0, 500),
    completed_steps: [],
    evidence_gaps: [],
    next_step: "The agent is choosing the smallest useful next research action.",
  };
  checkpoint(state, deps);

  const createAgent = () => new ToolLoopAgent({
    model: deps.model,
    instructions: promptContext(state, aliases, deps),
    tools: modelTools,
    toolOrder: ["set_research_goal", "search_web", "read_urls", "search_transcripts", "open_transcript_chunks", "create_or_update_artifact", "submit_answer"],
    stopWhen: [isStepCount(limits.maxAgentSteps), () => assistant !== null],
    prepareStep: ({ stepNumber }) => {
      if (!state.goalDeclared) {
        return {
          activeTools: ["set_research_goal"],
          toolChoice: { type: "tool" as const, toolName: "set_research_goal" as const },
          maxOutputTokens: 800,
          instructions: `${promptContext(state, aliases, deps)}\n\nFIRST ACTION: Call set_research_goal once. Semantically identify the exact requested deliverable from the current user request. Do not research or answer yet.`,
        };
      }
      const forceArtifactRepair = Boolean(
        !state.artifactCreated
        && state.artifactAttempts > 0
        && state.artifactAttempts < AGENT_LIMITS.maxArtifactAttempts
      );
      if (forceArtifactRepair) {
        return {
          activeTools: ["create_or_update_artifact"],
          toolChoice: { type: "tool" as const, toolName: "create_or_update_artifact" as const },
          maxOutputTokens: 6_000,
          instructions: `${promptContext(state, aliases, deps)}\n\nThe explicit Working Artifact is still required. Call create_or_update_artifact now. If a prior draft failed validation, correct the exact errors returned by that tool; do not submit the chat answer first.`,
        };
      }
      const deliveryPhase = answerOnly || !researchAllowed() || stepNumber >= limits.maxAgentSteps - 3;
      if (deliveryPhase && state.deliverable !== "answer" && !state.artifactCreated && state.artifactAttempts === 0) {
        if (!answerEventStarted) {
          answerEventStarted = true;
          emit(state, deps, { id: `evt_${state.runId}_answer`, kind: "agent", label: "Preparing the requested brief", detail: "Using the same research context and validated evidence", status: "running" });
        }
        const expectedMode = state.deliverable === "headlines_brief" ? "Headlines" : "Big Story";
        return {
          activeTools: ["create_or_update_artifact"],
          toolChoice: { type: "tool" as const, toolName: "create_or_update_artifact" as const },
          maxOutputTokens: 6_000,
          instructions: `${promptContext(state, aliases, deps)}\n\nDELIVERY STEP — NO MORE RESEARCH. Your own declared deliverable is ${expectedMode}. Call create_or_update_artifact now with that mode and the strongest validated evidence.`,
        };
      }
      const forceAnswer = deliveryPhase || state.artifactCreated;
      if (forceAnswer) {
        if (!answerEventStarted) {
          answerEventStarted = true;
          if (elapsed(state, deps) >= limits.researchCutoffMs) state.stoppingReason = "time_cutoff";
          else if (stepNumber >= limits.maxAgentSteps - 1) state.stoppingReason = "step_cutoff";
          emit(state, deps, { id: `evt_${state.runId}_answer`, kind: "agent", label: "Writing the answer", detail: "Answering from the same continuous research context", status: "running" });
        }
        return {
          activeTools: ["submit_answer"],
          toolChoice: { type: "tool" as const, toolName: "submit_answer" as const },
          maxOutputTokens: 2_500,
          instructions: finalAnswerPrompt(state, aliases, deps),
        };
      }
      const activeTools: Array<keyof typeof modelTools> = [];
      if (searches < limits.maxSearches && turnCandidates.size < limits.maxCandidates) activeTools.push("search_web");
      if (urlReads < limits.maxUrlReads) activeTools.push("read_urls");
      if (transcriptSearches < limits.maxTranscriptSearches) activeTools.push("search_transcripts");
      if (transcriptOpens < limits.maxTranscriptOpens) activeTools.push("open_transcript_chunks");
      if (state.artifactAttempts < AGENT_LIMITS.maxArtifactAttempts) activeTools.push("create_or_update_artifact");
      activeTools.push("submit_answer");
      return { activeTools, instructions: promptContext(state, aliases, deps) };
    },
    maxRetries: 0,
    maxOutputTokens: 3_000,
  });

  // Rebound persisted history before each provider call as well as after the
  // turn. This repairs workspaces written by older compaction code and keeps a
  // tool result from ever crossing requests without its matching tool call.
  const priorMessages = boundedHistory(workspace.agent_messages as unknown as ModelMessage[]);
  const inputMessages: ModelMessage[] = boundedHistory([...priorMessages, { role: "user", content: state.message }]);
  let persistedMessages = inputMessages;
  try {
    const agent = createAgent();
    const generate = async (messages: ModelMessage[]) => {
      const bounded = boundedHistory(messages);
      const result = await agent.generate({
        messages: bounded,
        abortSignal: deps.signal,
        onStepStart: () => {
          const code = abortCode(deps.signal);
          if (code) throw new Error(code);
          if (elapsed(state, deps) >= limits.hardDeadlineMs) throw new Error("research_run_timeout");
          const requestCap = Math.min(limits.maxProviderRequests, deps.providerRequestCap ?? limits.maxProviderRequests);
          if (state.providerRequests + 1 > requestCap) throw new Error("research_provider_request_limit");
        },
        onStepEnd: ({ providerMetadata, usage, finishReason }) => {
          const receipt = openRouterReceipt(providerMetadata);
          recordUsage(state, deps, {
            action: `agent:luna:${state.counts.model_requests + 1}`,
            model: deps.modelId,
            provider: receipt.provider,
            prompt_tokens: usage.inputTokens,
            completion_tokens: usage.outputTokens,
            total_tokens: usage.totalTokens,
            reported_cost_usd: receipt.cost,
            finish_reason: finishReason,
            requests: 1,
            estimatedCostUsd: AGENT_LIMITS.missingModelReceiptUsd,
            kind: "model",
          });
          state.counts.agent_steps = state.counts.model_requests;
        },
      });
      return { bounded, result };
    };

    const firstGeneration = await generate(inputMessages);
    const first = firstGeneration.result;
    persistedMessages = [...firstGeneration.bounded, ...first.responseMessages];
    if (!assistant) {
      answerOnly = true;
      let code = first.text.trim() ? "research_answer_not_submitted" : "research_answer_empty";
      for (let recovery = 1; recovery <= AGENT_LIMITS.maxAnswerRecoveryCalls && !assistant; recovery += 1) {
        state.counts.repairs += 1;
        emit(state, deps, { kind: "validation", label: "Repairing the answer", detail: code, status: "limited" });
        const repairMessage: ModelMessage = {
          role: "user",
          content: `Your previous response did not pass the answer boundary (${code}). Call submit_answer once now with corrected structured paragraphs and exact numbered citations. Do not mention this repair, tools, aliases, or internal IDs.`,
        };
        const repairGeneration = await generate([...persistedMessages, repairMessage]);
        const repaired = repairGeneration.result;
        persistedMessages = [...repairGeneration.bounded, ...repaired.responseMessages];
        if (!assistant) code = repaired.text.trim() ? "research_answer_not_submitted" : "research_answer_empty";
      }
      if (!assistant) throw new Error(code);
      const completedAnswer = assistant as ResearchAssistantMessage;
      if (!answerEventStarted) emit(state, deps, { id: `evt_${state.runId}_answer`, kind: "agent", label: "Answer ready", detail: "The same Luna context completed the answer", status: "complete" });
      else emit(state, deps, { id: `evt_${state.runId}_answer`, kind: "agent", label: "Answer ready", detail: "Every rendered citation resolved to usable server-side evidence", status: "complete" });
      trace(state, { action: "submit_answer", summary: "Answered the research question", target: state.message, observation: `${completedAnswer.source_ids.length} validated sources · ${state.stoppingReason}`, status: "complete" });
    }
    status = state.limitations.length ? "partial" : "complete";
  } catch (error) {
    const code = abortCode(deps.signal) ?? safeCode(error, "research_one_agent_runtime_failed");
    addLimitation(state, code);
    state.stoppingReason = code;
    status = code === "research_run_stopped" ? "stopped" : state.workspace.evidence.some((source) => source.evidence_usable) ? "partial" : "failed";
    assistant = incompleteAnswer(state, deps);
    for (const event of state.events.filter((item) => item.status === "running")) {
      emit(state, deps, { id: event.id, kind: event.kind, label: event.label, detail: code, status: status === "stopped" ? "stopped" : status === "partial" ? "partial" : "failed", ...(event.tool ? { tool: event.tool } : {}) });
    }
    trace(state, { action: "submit_answer", summary: "Returned an honest incomplete result", target: state.message, observation: code, status: status === "failed" ? "failed" : "partial" });
  }

  state.workspace.agent_messages = boundedHistory(persistedMessages) as unknown as Array<Record<string, unknown>>;
  appendTurn(state, deps, "assistant", assistant.text, assistant.source_ids);
  state.workspace.research_state = {
    objective: state.message.slice(0, 500),
    completed_steps: [
      ...(searches ? [`Searched the web ${searches} time${searches === 1 ? "" : "s"}`] : []),
      ...(urlReads ? [`Opened ${urlReads} web source${urlReads === 1 ? "" : "s"}`] : []),
      ...(transcriptSearches ? ["Checked the Nonsense archive"] : []),
      ...(state.artifactCreated ? ["Created or updated the requested preparation brief"] : []),
      "Answered from the strongest supported evidence",
    ].slice(0, 12),
    evidence_gaps: status === "complete" ? [] : state.limitations.slice(0, 8),
    next_step: status === "complete" ? "Ready for a follow-up." : depth === "standard" ? "Run Deep Research if the unresolved point matters." : "Ask a focused follow-up about the unresolved point.",
  };
  emit(state, deps, { kind: "run", label: status === "complete" ? "Answer ready" : status === "partial" ? "Answer ready with limitations" : status === "stopped" ? "Research stopped" : "Research failed safely", detail: state.stoppingReason, status });
  const traceValue = researchRunTraceSchema.parse({
    run_id: state.runId,
    research_depth: depth,
    started_at: state.startedAtIso,
    completed_at: nowIso(deps),
    status,
    steps: state.traceSteps,
    counts: state.counts,
    accounted_cost_usd: state.accountedCostUsd,
    source_ids: state.workspace.evidence.map((source) => source.source_id),
    artifact_revision: state.workspace.artifact_revision,
    limitations: state.limitations,
  });
  state.workspace.run_traces.push(traceValue);
  state.workspace.run_traces = state.workspace.run_traces.slice(-RESEARCH_LIMITS.maxRunTraces);
  checkpoint(state, deps);
  return researchTurnResultSchema.parse({
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
