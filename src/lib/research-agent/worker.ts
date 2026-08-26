import { randomUUID } from "node:crypto";
import { ToolLoopAgent, hasToolCall, isStepCount, tool, type LanguageModel } from "ai";
import { z } from "zod";
import { PHASE_5_LIMITS, PHASE_5_MODELS, type EvidenceSource } from "../phase5/contracts.ts";
import type { Phase5ToolAdapter } from "../phase5/workflow.ts";
import {
  PHASE_7A_LIMITS,
  type Phase7ACandidate,
  type Phase7ATranscriptMatch,
  type Phase7AWorkspace,
} from "../phase7a/contracts.ts";
import { normalizeWebUrl } from "../web-research/contracts.ts";
import type { WebSourceRecord } from "../web-research/types.ts";
import type { ResearchBudget } from "./budget.ts";
import {
  RESEARCH_AGENT_LIMITS,
  researchEvidencePacketSchema,
  workerSubmissionSchema,
  type ResearchEvidencePacket,
  type ResearchNotebook,
  type ResearchTask,
  type ResearchUsageReceipt,
  type WorkerSubmission,
} from "./contracts.ts";
import { createOpenRouterResearchModel } from "./model.ts";
import { RESEARCH_SYSTEM_PROMPT, workerPrompt } from "./prompts.ts";

export type WorkerToolEvent = {
  tool: "search_web" | "read_urls" | "search_transcripts" | "open_transcript_chunks" | "submit_evidence";
  status: "running" | "complete" | "partial" | "unavailable" | "failed";
  detail: string;
};

export type ResearchWorkerInput = {
  goal: NonNullable<ResearchNotebook["current_goal"]>;
  task: ResearchTask;
  workspace: Phase7AWorkspace;
  suppliedUrls: string[];
  tools: Phase5ToolAdapter;
  budget: ResearchBudget;
  signal?: AbortSignal;
  onToolEvent?: (event: WorkerToolEvent) => void;
};

export type ResearchWorkerResult = {
  packet: ResearchEvidencePacket;
  evidence: EvidenceSource[];
  candidates: Phase7ACandidate[];
  transcript_matches: Phase7ATranscriptMatch[];
  web_queries: string[];
  archive_queries: string[];
  usage: ResearchUsageReceipt[];
  counts: {
    web_searches: number;
    url_reads: number;
    transcript_searches: number;
    transcript_opens: number;
  };
};

export type ResearchWorkerAdapter = {
  readonly modelId: string;
  run(input: ResearchWorkerInput): Promise<ResearchWorkerResult>;
};

const WORKER_TOOL_LIMITS = Object.freeze({
  webSearches: 3,
  urlReads: 9,
  transcriptSearches: 2,
  transcriptOpens: 6,
});

const WORKER_RESERVATIONS = Object.freeze({
  modelUsd: 0.025,
  webSearchUsd: 0.04,
  transcriptSearchUsd: 0.03,
});

function closesResearchBudget(code: string): boolean {
  return ["research_answer_reserve_protected", "research_budget_exhausted", "research_provider_request_limit"].includes(code);
}

function pageEvidence(page: WebSourceRecord, sourceType: "provided_link" | "web"): EvidenceSource {
  const content = page.text?.slice(0, PHASE_5_LIMITS.maxEvidenceCharactersPerSource);
  return {
    source_id: page.source_id,
    source_type: sourceType,
    availability: page.availability,
    evidence_usable: page.evidence_usable,
    title: page.title,
    url: page.canonical_url ?? page.requested_url,
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

function toolError(error: unknown): string {
  if (error instanceof Error && /^[a-z0-9_:-]{3,160}$/.test(error.message)) return error.message;
  return "tool_unavailable";
}

function receiptCost(metadata: unknown): { provider?: string; cost_usd?: number } {
  if (!metadata || typeof metadata !== "object") return {};
  const openrouter = (metadata as { openrouter?: unknown }).openrouter;
  if (!openrouter || typeof openrouter !== "object") return {};
  const value = openrouter as { provider?: unknown; usage?: { cost?: unknown } };
  return {
    provider: typeof value.provider === "string" ? value.provider : undefined,
    cost_usd: typeof value.usage?.cost === "number" ? value.usage.cost : undefined,
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function createResearchWorkerWithModel(options: {
  model: LanguageModel;
  modelId: string;
  modelReservationUsd?: number;
}): ResearchWorkerAdapter {
  return {
    modelId: options.modelId,
    async run(input) {
      const evidence = new Map(input.workspace.evidence.map((source) => [source.source_id, structuredClone(source)]));
      const candidates = new Map(input.workspace.candidates.map((candidate) => [normalizeWebUrl(candidate.url), structuredClone(candidate)]));
      const transcriptMatches = new Map(input.workspace.transcript_matches.map((match) => [match.chunk_id, structuredClone(match)]));
      const supplied = new Set(input.suppliedUrls.map(normalizeWebUrl));
      const webQueries: string[] = [];
      const archiveQueries: string[] = [];
      const failures: string[] = [];
      const counts = { web_searches: 0, url_reads: 0, transcript_searches: 0, transcript_opens: 0 };
      let webSearchAttempts = 0;
      let transcriptSearchAttempts = 0;
      const usageReceipts: ResearchUsageReceipt[] = [];
      const modelReservations = new Map<string, string>();
      let submission: WorkerSubmission | null = null;
      let researchBudgetClosed = false;
      let submissionReservation = input.budget.reserve({
        role: "worker",
        action: `worker:${input.task.task_id}:submit_evidence`,
        amount: options.modelReservationUsd ?? WORKER_RESERVATIONS.modelUsd,
        model: options.modelId,
      });
      const shouldForceSubmission = (stepNumber: number) => researchBudgetClosed
        || stepNumber >= RESEARCH_AGENT_LIMITS.maxWorkerSteps - 2
        || input.budget.availableForResearchUsd + 1e-9 < (options.modelReservationUsd ?? WORKER_RESERVATIONS.modelUsd);

      const emit = (event: WorkerToolEvent) => input.onToolEvent?.(event);
      const upsertEvidence = (source: EvidenceSource) => {
        if (!evidence.has(source.source_id) && evidence.size >= RESEARCH_AGENT_LIMITS.maxEvidenceSources) {
          throw new Error("research_evidence_limit");
        }
        evidence.set(source.source_id, source);
      };
      const isAllowedUrl = (raw: string) => {
        const url = normalizeWebUrl(raw);
        if (supplied.has(url) || candidates.has(url)) return url;
        if ([...evidence.values()].some((source) => source.url && normalizeWebUrl(source.url) === url)) return url;
        throw new Error("research_url_not_allowed");
      };

      const workerTools = {
        search_web: tool({
          description: "Search the current public web for candidate sources. Candidates must be opened with read_urls before they can support claims.",
          inputSchema: z.object({ query: z.string().trim().min(3).max(300) }).strict(),
          execute: async ({ query }) => {
            emit({ tool: "search_web", status: "running", detail: query });
            if (webSearchAttempts >= WORKER_TOOL_LIMITS.webSearches) {
              const code = "research_worker_web_search_limit";
              failures.push(`search_web:${code}`);
              emit({ tool: "search_web", status: "unavailable", detail: `${query} · ${code}` });
              return { status: "unavailable", candidates: [], limitation: code };
            }
            webSearchAttempts += 1;
            let reservation: string | undefined;
            try {
              reservation = input.budget.reserve({ role: "web_search", action: `worker:${input.task.task_id}:search_web`, amount: WORKER_RESERVATIONS.webSearchUsd, model: PHASE_5_MODELS.heavy.id });
              counts.web_searches += 1;
              const result = await input.tools.webSearch({ query, limit: 5 });
              usageReceipts.push(input.budget.settle(reservation, {
                provider: result.receipt.provider_name,
                prompt_tokens: result.receipt.prompt_tokens,
                completion_tokens: result.receipt.completion_tokens,
                total_tokens: result.receipt.total_tokens,
                cost_usd: result.receipt.cost_usd,
              }));
              reservation = undefined;
              webQueries.push(query);
              for (const source of result.sources) {
                candidates.set(normalizeWebUrl(source.url), {
                  source_id: source.source_id,
                  url: source.url,
                  title: source.title,
                  excerpt: source.excerpt,
                  query,
                });
              }
              const status = result.status === "complete" ? "complete" : result.status === "partial" ? "partial" : "unavailable";
              if (status === "unavailable") failures.push(`search_web:${result.failure?.code ?? result.status}`);
              emit({ tool: "search_web", status, detail: `${query} · ${result.sources.length} candidates` });
              return {
                status: result.status,
                candidates: result.sources.map((source) => ({ url: source.url, title: source.title, excerpt: source.excerpt })),
                limitation: result.failure?.code ?? null,
              };
            } catch (error) {
              if (reservation) usageReceipts.push(input.budget.fail(reservation));
              const code = toolError(error);
              if (closesResearchBudget(code)) researchBudgetClosed = true;
              failures.push(`search_web:${code}`);
              emit({ tool: "search_web", status: "unavailable", detail: `${query} · ${code}` });
              return { status: "unavailable", candidates: [], limitation: code };
            }
          },
        }),
        read_urls: tool({
          description: "Read one to three supplied or discovered public URLs concurrently and store exact citeable evidence.",
          inputSchema: z.object({ urls: z.array(z.string().url().max(2_000)).min(1).max(PHASE_7A_LIMITS.maxBatchTargets) }).strict(),
          execute: async ({ urls }) => {
            emit({ tool: "read_urls", status: "running", detail: urls.map((url) => new URL(url).hostname).join(", ") });
            const allowed = unique(urls.map(isAllowedUrl));
            if (counts.url_reads + allowed.length > WORKER_TOOL_LIMITS.urlReads) {
              const code = "research_worker_url_read_limit";
              failures.push(`read_urls:${code}`);
              emit({ tool: "read_urls", status: "unavailable", detail: code });
              return { results: allowed.map((url) => ({ url, status: "unavailable" })) };
            }
            counts.url_reads += allowed.length;
            const settled = await Promise.allSettled(allowed.map((url) => input.tools.readUrl({ url })));
            const results: Array<{ source_id?: string; title?: string | null; url: string; status: string; excerpt?: string | null }> = [];
            for (const [index, result] of settled.entries()) {
              const url = allowed[index]!;
              if (result.status === "rejected") {
                const code = toolError(result.reason);
                failures.push(`read_urls:${code}`);
                results.push({ url, status: "unavailable" });
                continue;
              }
              const page = result.value;
              const source = pageEvidence(page, supplied.has(url) ? "provided_link" : "web");
              upsertEvidence(source);
              if (!source.evidence_usable) failures.push(`read_urls:${source.failure_code ?? source.availability}`);
              results.push({
                source_id: source.source_id,
                title: source.title,
                url,
                status: source.availability,
                excerpt: source.content ?? source.excerpt,
              });
            }
            const usable = results.filter((result) => result.source_id && evidence.get(result.source_id)?.evidence_usable).length;
            emit({ tool: "read_urls", status: usable ? (usable === results.length ? "complete" : "partial") : "unavailable", detail: `${usable}/${results.length} sources became usable evidence` });
            return { results };
          },
        }),
        search_transcripts: tool({
          description: "Search the Nonsense S3-S4 transcript archive for candidate passages. Open returned chunks before citing them.",
          inputSchema: z.object({ query: z.string().trim().min(2).max(500) }).strict(),
          execute: async ({ query }) => {
            emit({ tool: "search_transcripts", status: "running", detail: query });
            if (transcriptSearchAttempts >= WORKER_TOOL_LIMITS.transcriptSearches) {
              const code = "research_worker_transcript_search_limit";
              failures.push(`search_transcripts:${code}`);
              emit({ tool: "search_transcripts", status: "unavailable", detail: `${query} · ${code}` });
              return { status: "unavailable", matches: [], limitation: code };
            }
            transcriptSearchAttempts += 1;
            let reservation: string | undefined;
            try {
              reservation = input.budget.reserve({ role: "transcript_search", action: `worker:${input.task.task_id}:search_transcripts`, amount: WORKER_RESERVATIONS.transcriptSearchUsd, requests: 2 });
              counts.transcript_searches += 1;
              const envelope = await input.tools.searchTranscripts({ query, limit: 5 });
              const receipts = envelope.receipts ?? [];
              const cost = receipts.reduce((sum, receipt) => sum + (receipt.reportedCostUsd ?? receipt.calculatedCostUsd), 0);
              usageReceipts.push(input.budget.settle(reservation, {
                provider: receipts.map((receipt) => receipt.provider).filter(Boolean).join(",") || undefined,
                prompt_tokens: receipts.reduce((sum, receipt) => sum + (receipt.usage.prompt_tokens ?? 0), 0),
                total_tokens: receipts.reduce((sum, receipt) => sum + (receipt.usage.total_tokens ?? 0), 0),
                cost_usd: receipts.length ? cost : undefined,
              }));
              reservation = undefined;
              archiveQueries.push(query);
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
              const status = envelope.result.retrieval_status === "unavailable" ? "unavailable" : envelope.result.retrieval_status === "keyword_only" ? "partial" : "complete";
              if (status !== "complete") failures.push(`search_transcripts:${envelope.result.retrieval_status}`);
              emit({ tool: "search_transcripts", status, detail: `${query} · ${envelope.result.matches.length} matches · ${envelope.result.retrieval_status}` });
              return {
                status: envelope.result.retrieval_status,
                matches: envelope.result.matches.map((match) => ({
                  chunk_id: match.chunk_id,
                  title: match.title,
                  season: match.season,
                  episode_number: match.episode_number,
                  excerpt: match.excerpt,
                })),
              };
            } catch (error) {
              if (reservation) usageReceipts.push(input.budget.fail(reservation));
              const code = toolError(error);
              if (closesResearchBudget(code)) researchBudgetClosed = true;
              failures.push(`search_transcripts:${code}`);
              emit({ tool: "search_transcripts", status: "unavailable", detail: `${query} · ${code}` });
              return { status: "unavailable", matches: [], limitation: code };
            }
          },
        }),
        open_transcript_chunks: tool({
          description: "Open one to three exact chunk IDs returned by transcript search and store citeable exact passages.",
          inputSchema: z.object({ chunk_ids: z.array(z.string().trim().min(3).max(160)).min(1).max(PHASE_7A_LIMITS.maxBatchTargets) }).strict(),
          execute: async ({ chunk_ids }) => {
            emit({ tool: "open_transcript_chunks", status: "running", detail: `${chunk_ids.length} archive passages` });
            const ids = unique(chunk_ids);
            if (counts.transcript_opens + ids.length > WORKER_TOOL_LIMITS.transcriptOpens) {
              const code = "research_worker_transcript_open_limit";
              failures.push(`open_transcript_chunks:${code}`);
              emit({ tool: "open_transcript_chunks", status: "unavailable", detail: code });
              return { results: ids.map((chunk_id) => ({ chunk_id, status: "unavailable" })) };
            }
            counts.transcript_opens += ids.length;
            if (ids.some((id) => !transcriptMatches.has(id))) throw new Error("research_chunk_not_allowed");
            const settled = await Promise.allSettled(ids.map((chunk_id) => Promise.resolve(input.tools.openTranscriptChunk({ chunk_id }))));
            const results: Array<{ source_id?: string; chunk_id: string; status: string; title?: string | null; excerpt?: string | null }> = [];
            for (const [index, result] of settled.entries()) {
              const chunkId = ids[index]!;
              if (result.status === "rejected") {
                failures.push(`open_transcript_chunks:${toolError(result.reason)}`);
                results.push({ chunk_id: chunkId, status: "unavailable" });
                continue;
              }
              const source = archiveEvidence(result.value);
              if (!source) {
                failures.push(`open_transcript_chunks:${result.value.status}`);
                results.push({ chunk_id: chunkId, status: result.value.status });
                continue;
              }
              upsertEvidence(source);
              results.push({ source_id: source.source_id, chunk_id: chunkId, status: "complete", title: source.title, excerpt: source.content });
            }
            const usable = results.filter((result) => result.source_id).length;
            emit({ tool: "open_transcript_chunks", status: usable ? (usable === results.length ? "complete" : "partial") : "unavailable", detail: `${usable}/${results.length} archive passages opened` });
            return { results };
          },
        }),
        submit_evidence: tool({
          description: "Submit the final typed evidence packet for this bounded research task. Call exactly once when the task is done or honestly unable to complete.",
          inputSchema: workerSubmissionSchema,
          execute: async (value) => {
            const parsed = workerSubmissionSchema.parse(value);
            for (const claim of parsed.claims) {
              if (claim.kind === "fact" && claim.source_ids.length === 0) throw new Error("research_fact_missing_source");
              for (const sourceId of claim.source_ids) {
                if (!evidence.get(sourceId)?.evidence_usable) throw new Error("research_worker_invalid_source");
              }
            }
            for (const conflict of parsed.conflicts) {
              for (const sourceId of conflict.source_ids) {
                if (!evidence.get(sourceId)?.evidence_usable) throw new Error("research_worker_invalid_source");
              }
            }
            submission = parsed;
            emit({ tool: "submit_evidence", status: parsed.status === "complete" ? "complete" : "partial", detail: `${parsed.claims.length} claims · ${parsed.conflicts.length} conflicts · ${parsed.gaps.length} gaps` });
            return { accepted: true, task_id: input.task.task_id, status: parsed.status };
          },
        }),
      };

      const instructions = `${RESEARCH_SYSTEM_PROMPT}\n\n${workerPrompt({
        goal: input.goal,
        task: input.task,
        workspace: input.workspace,
        suppliedUrls: input.suppliedUrls,
        budget: input.budget.snapshot(),
      })}`;
      const agent = new ToolLoopAgent({
        model: options.model,
        instructions,
        tools: workerTools,
        toolOrder: ["search_web", "read_urls", "search_transcripts", "open_transcript_chunks", "submit_evidence"],
        stopWhen: [hasToolCall("submit_evidence"), isStepCount(RESEARCH_AGENT_LIMITS.maxWorkerSteps)],
        prepareStep: ({ stepNumber }) => {
          const forceSubmission = shouldForceSubmission(stepNumber);
          if (forceSubmission) {
            return {
              activeTools: ["submit_evidence"],
              toolChoice: { type: "tool", toolName: "submit_evidence" },
            };
          }
          const activeTools: Array<keyof typeof workerTools> = ["submit_evidence"];
          if (webSearchAttempts < WORKER_TOOL_LIMITS.webSearches) activeTools.push("search_web");
          if (counts.url_reads < WORKER_TOOL_LIMITS.urlReads) activeTools.push("read_urls");
          if (transcriptSearchAttempts < WORKER_TOOL_LIMITS.transcriptSearches) activeTools.push("search_transcripts");
          if (counts.transcript_opens < WORKER_TOOL_LIMITS.transcriptOpens) activeTools.push("open_transcript_chunks");
          return { activeTools };
        },
        maxRetries: 0,
        maxOutputTokens: 4_000,
      });

      try {
        await agent.generate({
          prompt: `Complete task ${input.task.task_id}: ${input.task.question}\nSuccess means: ${input.task.success_criteria}`,
          abortSignal: input.signal,
          onStepStart: ({ callId, stepNumber }) => {
            const finalStep = shouldForceSubmission(stepNumber);
            const reservation = finalStep && submissionReservation
              ? submissionReservation
              : input.budget.reserve({
                  role: "worker",
                  action: `worker:${input.task.task_id}:model`,
                  amount: options.modelReservationUsd ?? WORKER_RESERVATIONS.modelUsd,
                  model: options.modelId,
                });
            if (reservation === submissionReservation) submissionReservation = "";
            modelReservations.set(callId, reservation);
          },
          onStepEnd: ({ callId, providerMetadata, usage }) => {
            const reservation = modelReservations.get(callId);
            if (!reservation) return;
            modelReservations.delete(callId);
            const metadata = receiptCost(providerMetadata);
            const promptTokens = usage.inputTokens;
            const completionTokens = usage.outputTokens;
            usageReceipts.push(input.budget.settle(reservation, {
              provider: metadata.provider,
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: promptTokens !== undefined && completionTokens !== undefined ? promptTokens + completionTokens : undefined,
              cost_usd: metadata.cost_usd,
            }));
          },
        });
      } finally {
        for (const reservation of modelReservations.values()) usageReceipts.push(input.budget.fail(reservation));
        modelReservations.clear();
        if (submissionReservation) input.budget.cancel(submissionReservation);
        submissionReservation = "";
      }
      const finalSubmission = submission as WorkerSubmission | null;
      if (!finalSubmission) {
        const usable = [...evidence.values()].filter((source) => source.evidence_usable);
        failures.push("research_worker_missing_submission");
        const packet = researchEvidencePacketSchema.parse({
          packet_id: `packet_${randomUUID()}`,
          goal_id: input.goal.goal_id,
          task_id: input.task.task_id,
          status: usable.length ? "partial" : "unable",
          answer: usable.length
            ? `The worker retrieved ${usable.length} usable source${usable.length === 1 ? "" : "s"} but did not complete its typed task judgment.`
            : "The worker ended before it could retrieve usable evidence or submit its typed task judgment.",
          claims: [],
          conflicts: [],
          gaps: [input.task.question],
          confidence: "low",
          source_ids: usable.map((source) => source.source_id),
          exact_excerpts: usable.map((source) => ({ source_id: source.source_id, excerpt: (source.content ?? source.excerpt ?? "").slice(0, PHASE_5_LIMITS.maxEvidenceCharactersPerSource) })),
          tool_failures: unique(failures),
          model_requests: usageReceipts.filter((item) => item.role === "worker").length,
          created_at: new Date().toISOString(),
        });
        return {
          packet,
          evidence: [...evidence.values()],
          candidates: [...candidates.values()],
          transcript_matches: [...transcriptMatches.values()],
          web_queries: unique(webQueries),
          archive_queries: unique(archiveQueries),
          usage: usageReceipts,
          counts,
        };
      }
      const citedSourceIds = unique([
        ...finalSubmission.claims.flatMap((claim) => claim.source_ids),
        ...finalSubmission.conflicts.flatMap((conflict) => conflict.source_ids),
      ]);
      const exactExcerpts = citedSourceIds.map((sourceId) => {
        const source = evidence.get(sourceId);
        if (!source?.evidence_usable) throw new Error("research_worker_invalid_source");
        return { source_id: sourceId, excerpt: (source.content ?? source.excerpt ?? "").slice(0, PHASE_5_LIMITS.maxEvidenceCharactersPerSource) };
      });
      const packet = researchEvidencePacketSchema.parse({
        ...finalSubmission,
        packet_id: `packet_${randomUUID()}`,
        goal_id: input.goal.goal_id,
        task_id: input.task.task_id,
        source_ids: citedSourceIds,
        exact_excerpts: exactExcerpts,
        tool_failures: unique(failures),
        model_requests: usageReceipts.filter((item) => item.role === "worker").length,
        created_at: new Date().toISOString(),
      });
      return {
        packet,
        evidence: [...evidence.values()],
        candidates: [...candidates.values()],
        transcript_matches: [...transcriptMatches.values()],
        web_queries: unique(webQueries),
        archive_queries: unique(archiveQueries),
        usage: usageReceipts,
        counts,
      };
    },
  };
}

export function createOpenRouterResearchWorker(options: { apiKey: string }): ResearchWorkerAdapter {
  const model = PHASE_5_MODELS.light;
  const provider = createOpenRouterResearchModel(options.apiKey, model);
  return createResearchWorkerWithModel({
    model: provider.chat(model.id, {
      extraBody: { reasoning: { effort: model.reasoningEffort, exclude: true } },
      usage: { include: true },
    }),
    modelId: model.id,
  });
}
