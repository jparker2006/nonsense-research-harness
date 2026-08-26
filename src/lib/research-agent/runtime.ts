import { randomUUID } from "node:crypto";
import {
  PHASE_5_LIMITS,
  PHASE_5_MODELS,
  phase5InputSchema,
  researchPlanSchema,
} from "../phase5/contracts.ts";
import {
  phase5ModelOutputFailure,
  type Phase5ModelAdapter,
} from "../phase5/model.ts";
import type { Phase5ToolAdapter } from "../phase5/workflow.ts";
import {
  hydratePhase7AArtifactSourceLedger,
  phase7aArtifactSchema,
  validatePhase7AArtifact,
} from "../phase7a/artifact.ts";
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
  type Phase7AResearchDepth,
  type Phase7ARunTrace,
  type Phase7ATurnResult,
  type Phase7AWorkspace,
} from "../phase7a/contracts.ts";
import { normalizeWebUrl } from "../web-research/contracts.ts";
import { ResearchBudget } from "./budget.ts";
import {
  RESEARCH_AGENT_LIMITS,
  answerSubmissionSchema,
  assertAcyclicTaskGraph,
  createEmptyResearchNotebook,
  managerPlanSchema,
  managerReviewSchema,
  researchEvidencePacketSchema,
  researchNotebookSchema,
  researchTaskSchema,
  researchWaveSchema,
  type AnswerSubmission,
  type ManagerReview,
  type PlannedResearchTask,
  type ResearchEvidencePacket,
  type ResearchNotebook,
  type ResearchTask,
} from "./contracts.ts";
import {
  isTransientResearchError,
  type ResearchManagerAdapter,
  type ResearchModelResult,
} from "./model.ts";
import { answerPrompt, managerPlanPrompt, managerReviewPrompt } from "./prompts.ts";
import type { ResearchWorkerAdapter, ResearchWorkerResult, WorkerToolEvent } from "./worker.ts";

export type ResearchRuntimeDependencies = {
  manager: ResearchManagerAdapter;
  fallbackManager: ResearchManagerAdapter;
  worker: ResearchWorkerAdapter;
  composer: Phase5ModelAdapter;
  tools: Phase5ToolAdapter;
  now?: () => Date;
  clockMs?: () => number;
  signal?: AbortSignal;
  onEvent?: (event: Phase7AActivity) => void;
  onCheckpoint?: (workspace: Phase7AWorkspace) => void;
  costCapUsd?: number;
  providerRequestCap?: number;
};

type RuntimeState = {
  runId: string;
  workspace: Phase7AWorkspace;
  notebook: ResearchNotebook;
  message: string;
  depth: Phase7AResearchDepth;
  status: "running" | "complete" | "partial" | "stopped" | "failed";
  events: Phase7AActivity[];
  traceSteps: Phase7ARunTrace["steps"];
  limitations: string[];
  assistantMessage: Phase7AAssistantMessage | null;
  budget: ResearchBudget;
  counts: Phase7ACounts;
  startedAtMs: number;
  startedAtIso: string;
  managerCalls: number;
  grokCalls: number;
  workerCounts: { web_searches: number; url_reads: number; transcript_searches: number; transcript_opens: number };
};

const MANAGER_RESERVATIONS = Object.freeze({ plan: 0.06, review: 0.06, answer: 0.04, fallback: 0.02, artifact: 0.25 });

function nowIso(deps: ResearchRuntimeDependencies): string {
  return (deps.now?.() ?? new Date()).toISOString();
}

function elapsed(state: RuntimeState, deps: ResearchRuntimeDependencies): number {
  return Math.max(0, (deps.clockMs?.() ?? performance.now()) - state.startedAtMs);
}

function abortedCode(signal: AbortSignal | undefined): "research_run_stopped" | "research_run_timeout" | null {
  if (!signal?.aborted) return null;
  const reason = signal.reason;
  return reason instanceof DOMException && reason.name === "TimeoutError"
    ? "research_run_timeout"
    : "research_run_stopped";
}

function assertActive(state: RuntimeState, deps: ResearchRuntimeDependencies): void {
  const abort = abortedCode(deps.signal);
  if (abort) throw new Error(abort);
  if (elapsed(state, deps) > RESEARCH_AGENT_LIMITS.maxElapsedMs[state.depth]) throw new Error("research_run_timeout");
}

function safeCode(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  return /^[a-z][a-z0-9_:-]{2,239}$/.test(message) ? message : fallback;
}

function parseManagerValue<T>(
  stage: "plan" | "review" | "answer",
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ code: string; path: PropertyKey[] }> } } },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  if (process.env.NODE_ENV === "development") {
    console.error("[nonsense-research-manager-output]", {
      stage,
      issues: parsed.error.issues.slice(0, 12).map((issue) => ({
        code: issue.code,
        path: issue.path.map(String).join("."),
      })),
    });
  }
  throw new Error(`research_manager_${stage}_invalid`);
}

function finalizeRunningEvents(state: RuntimeState, deps: ResearchRuntimeDependencies, code: string): void {
  const status = state.status === "stopped" ? "stopped" : state.status === "partial" ? "partial" : "failed";
  for (const event of state.events.filter((candidate) => candidate.status === "running")) {
    emit(state, deps, {
      id: event.id,
      kind: event.kind,
      label: event.label,
      detail: code,
      status,
    });
  }
}

function addLimitation(state: RuntimeState, limitation: string): void {
  const safe = limitation.slice(0, 240);
  if (!state.limitations.includes(safe) && state.limitations.length < 20) state.limitations.push(safe);
}

function emit(
  state: RuntimeState,
  deps: ResearchRuntimeDependencies,
  input: Omit<Phase7AActivity, "id" | "run_id" | "created_at"> & { id?: string },
): Phase7AActivity {
  const event = phase7aActivitySchema.parse({
    id: input.id ?? `evt_${state.runId}_${String(state.events.length + 1).padStart(3, "0")}`,
    run_id: state.runId,
    created_at: nowIso(deps),
    ...input,
    // Observable-work text is a bounded public projection; canonical task and
    // completion text remains unmodified in the notebook.
    label: input.label.slice(0, 180),
    detail: input.detail.slice(0, 300),
  });
  const index = state.events.findIndex((existing) => existing.id === event.id);
  if (index === -1) state.events.push(event);
  else state.events[index] = event;
  deps.onEvent?.(event);
  return event;
}

function trace(state: RuntimeState, input: {
  action: Phase7ARunTrace["steps"][number]["action"];
  summary: string;
  target: string;
  observation: string;
  status: "complete" | "partial" | "failed";
}) {
  state.traceSteps.push(phase7aTraceStepSchema.parse({
    sequence: state.traceSteps.length + 1,
    action: input.action,
    public_summary: input.summary.slice(0, 180),
    target: input.target.slice(0, 500),
    observation: input.observation.slice(0, 500),
    status: input.status,
  }));
}

function appendTurn(
  state: RuntimeState,
  role: "user" | "assistant",
  text: string,
  sourceIds: string[],
  deps: ResearchRuntimeDependencies,
) {
  state.workspace.turns.push({
    turn_id: `turn_${randomUUID()}`,
    role,
    text: text.slice(0, PHASE_7A_LIMITS.maxMessageCharacters),
    source_ids: sourceIds.slice(0, RESEARCH_AGENT_LIMITS.maxAnswerSourceIds),
    created_at: nowIso(deps),
  });
  state.workspace.turns = state.workspace.turns.slice(-PHASE_7A_LIMITS.maxConversationTurns);
}

function suppliedUrls(workspace: Phase7AWorkspace): string[] {
  const urls = new Set<string>();
  for (const turn of workspace.turns.filter((item) => item.role === "user")) {
    for (const match of turn.text.matchAll(/https?:\/\/[^\s<>()"']+/gi)) {
      try {
        urls.add(normalizeWebUrl(match[0].replace(/[.,;!?\])}]+$/, "")));
      } catch {
        // Invalid user text never becomes an authorized URL.
      }
    }
  }
  return [...urls];
}

export function requestedArtifactMode(message: string, existing: Phase7AWorkspace["artifact"]): "headlines" | "big_story" | null {
  const hasBriefWord = /\b(brief|packet|prep|preparation|artifact)\b/i.test(message);
  if (hasBriefWord && /\bheadlines?\b/i.test(message)) return "headlines";
  if (hasBriefWord && /\bbig story\b/i.test(message)) return "big_story";
  if (existing && hasBriefWord && /\b(revise|update|rewrite|shorten|expand|change)\b/i.test(message)) return existing.mode;
  return null;
}

function withoutMachineLedger(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const copy = { ...(value as Record<string, unknown>) };
  delete copy.source_ledger;
  return copy;
}

function checkpoint(state: RuntimeState, deps: ResearchRuntimeDependencies): void {
  state.notebook.updated_at = nowIso(deps);
  state.notebook.usage_receipts = state.budget.allReceipts().slice(-RESEARCH_AGENT_LIMITS.maxProviderRequests);
  state.notebook.artifact_revision = state.workspace.artifact_revision;
  state.workspace.research_notebook = researchNotebookSchema.parse(state.notebook);
  state.workspace.updated_at_ms = Date.now();
  deps.onCheckpoint?.(structuredClone(state.workspace));
}

function validateAnswer(state: RuntimeState, answer: AnswerSubmission): AnswerSubmission {
  const usable = new Set(state.workspace.evidence.filter((source) => source.evidence_usable).map((source) => source.source_id));
  const parsed = answerSubmissionSchema.parse(answer);
  const cited = new Set(parsed.blocks.flatMap((block) => block.source_ids));
  if (cited.size > RESEARCH_AGENT_LIMITS.maxAnswerSourceIds) throw new Error("research_answer_source_limit");
  for (const block of parsed.blocks) {
    for (const sourceId of block.source_ids) {
      if (!usable.has(sourceId)) throw new Error("research_invalid_citation");
    }
  }
  return parsed;
}

function answerMessage(state: RuntimeState, answer: AnswerSubmission, deps: ResearchRuntimeDependencies): Phase7AAssistantMessage {
  const parsed = validateAnswer(state, answer);
  const blocks = parsed.blocks.map((block) => ({ ...block, source_ids: block.source_ids.slice(0, RESEARCH_AGENT_LIMITS.maxAnswerSourceIds) }));
  if (parsed.follow_ups.length && blocks.length < 12) {
    blocks.push({
      text: `**Useful follow-ups**\n${parsed.follow_ups.map((followUp) => `- ${followUp}`).join("\n")}`,
      source_ids: [],
    });
  }
  const text = blocks.map((block) => block.text).join("\n\n").slice(0, 5_000);
  const sourceIds = [...new Set(blocks.flatMap((block) => block.source_ids))].slice(0, RESEARCH_AGENT_LIMITS.maxAnswerSourceIds);
  return phase7aAssistantMessageSchema.parse({
    message_id: `msg_${randomUUID()}`,
    run_id: state.runId,
    text,
    source_ids: sourceIds,
    blocks,
    created_at: nowIso(deps),
  });
}

function emergencyAnswer(state: RuntimeState, code: string): AnswerSubmission {
  const packets = state.notebook.packets.filter((packet) => packet.goal_id === state.notebook.current_goal?.goal_id);
  if (!packets.length) {
    return {
      goal_status: "unable",
      blocks: [{ text: "I couldn't complete this research turn reliably. No unsupported answer was substituted.", source_ids: [] }],
      limitations: [code],
      follow_ups: ["Try the same question again when the research models are available."],
    };
  }
  const blocks = packets.slice(0, 6).map((packet) => ({
    text: packet.answer,
    source_ids: packet.source_ids.slice(0, RESEARCH_AGENT_LIMITS.maxAnswerSourceIds),
  }));
  return {
    goal_status: "partial",
    blocks,
    limitations: [code, "Final synthesis was unavailable; these are preserved task findings."],
    follow_ups: ["Ask me to synthesize the preserved findings when the manager is available."],
  };
}

async function managerCall<T>(
  state: RuntimeState,
  deps: ResearchRuntimeDependencies,
  stage: "plan" | "review" | "answer",
  invoke: (manager: ResearchManagerAdapter) => Promise<ResearchModelResult<T>>,
): Promise<T> {
  const amount = MANAGER_RESERVATIONS[stage];
  const allowAnswerReserve = stage !== "plan";
  const attempt = async (manager: ResearchManagerAdapter, fallback: boolean): Promise<T> => {
    const reservation = state.budget.reserve({
      role: "manager",
      action: `manager:${stage}`,
      amount: fallback ? MANAGER_RESERVATIONS.fallback : amount,
      model: manager.modelId,
      allowAnswerReserve,
      fallback,
    });
    state.managerCalls += 1;
    if (!fallback) state.grokCalls += 1;
    try {
      const result = await invoke(manager);
      state.budget.settle(reservation, result.receipt);
      return result.value;
    } catch (error) {
      state.budget.fail(reservation);
      throw error;
    }
  };

  try {
    return await attempt(deps.manager, false);
  } catch (firstError) {
    if (!isTransientResearchError(firstError)) throw firstError;
    addLimitation(state, `manager_${stage}_transient_retry`);
    emit(state, deps, {
      kind: "agent",
      label: "Retrying the research manager",
      detail: `${stage} request failed transiently; resuming from the latest checkpoint`,
      status: "partial",
    });
    try {
      return await attempt(deps.manager, false);
    } catch (secondError) {
      if (!isTransientResearchError(secondError)) throw secondError;
      const fallback = {
        goal_id: state.notebook.current_goal?.goal_id ?? "goal_pending",
        stage,
        from_model: deps.manager.modelId,
        to_model: deps.fallbackManager.modelId,
        reason: safeCode(secondError, "manager_unavailable"),
        created_at: nowIso(deps),
      } as const;
      state.notebook.fallbacks.push(fallback);
      state.notebook.fallbacks = state.notebook.fallbacks.slice(-20);
      addLimitation(state, `manager_fallback:${stage}`);
      emit(state, deps, {
        kind: "agent",
        label: "Continuing with the fallback manager",
        detail: `Grok remained unavailable; Luna is completing the ${stage} stage`,
        status: "partial",
      });
      trace(state, { action: "fallback", summary: "Used the fallback manager", target: stage, observation: fallback.reason, status: "partial" });
      return attempt(deps.fallbackManager, true);
    }
  }
}

function addPlannedTasks(state: RuntimeState, planned: PlannedResearchTask[], deps: ResearchRuntimeDependencies): void {
  const goal = state.notebook.current_goal;
  if (!goal) throw new Error("research_goal_missing");
  const current = state.notebook.tasks.filter((task) => task.goal_id === goal.goal_id);
  if (current.length + planned.length > RESEARCH_AGENT_LIMITS.maxTasksPerGoal) throw new Error("research_task_limit");
  assertAcyclicTaskGraph(planned, current.map((task) => task.task_id));
  for (const task of planned) {
    state.notebook.tasks.push(researchTaskSchema.parse({
      ...task,
      goal_id: goal.goal_id,
      status: "pending",
      attempt: 0,
      created_at: nowIso(deps),
      started_at: null,
      completed_at: null,
      failure_code: null,
    }));
  }
  state.notebook.tasks = state.notebook.tasks.slice(-RESEARCH_AGENT_LIMITS.maxTaskHistory);
}

function terminalDependency(status: ResearchTask["status"]): boolean {
  return ["complete", "partial"].includes(status);
}

function readyTasks(state: RuntimeState): ResearchTask[] {
  const goalId = state.notebook.current_goal?.goal_id;
  const tasks = state.notebook.tasks.filter((task) => task.goal_id === goalId);
  const byId = new Map(tasks.map((task) => [task.task_id, task]));
  for (const task of tasks.filter((candidate) => candidate.status === "pending")) {
    if (task.dependencies.some((dependency) => ["failed", "cancelled"].includes(byId.get(dependency)?.status ?? "failed"))) {
      task.status = "cancelled";
      task.failure_code = "research_dependency_failed";
      task.completed_at = new Date().toISOString();
    }
  }
  return tasks.filter((task) => task.status === "pending" && task.dependencies.every((dependency) => terminalDependency(byId.get(dependency)?.status ?? "failed")));
}

async function runPool<T>(items: T[], concurrency: number, work: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await work(items[index]!);
    }
  });
  await Promise.all(workers);
}

function mergeWorkerResult(state: RuntimeState, result: ResearchWorkerResult): void {
  const evidence = new Map(state.workspace.evidence.map((source) => [source.source_id, source]));
  for (const source of result.evidence) evidence.set(source.source_id, source);
  state.workspace.evidence = [...evidence.values()].slice(-RESEARCH_AGENT_LIMITS.maxEvidenceSources);
  const candidates = new Map(state.workspace.candidates.map((candidate) => [normalizeWebUrl(candidate.url), candidate]));
  for (const candidate of result.candidates) candidates.set(normalizeWebUrl(candidate.url), candidate);
  state.workspace.candidates = [...candidates.values()].slice(-PHASE_7A_LIMITS.maxCandidates);
  const matches = new Map(state.workspace.transcript_matches.map((match) => [match.chunk_id, match]));
  for (const match of result.transcript_matches) matches.set(match.chunk_id, match);
  state.workspace.transcript_matches = [...matches.values()].slice(-PHASE_7A_LIMITS.maxTranscriptMatches);
  state.workspace.web_queries = [...new Set([
    ...state.workspace.web_queries,
    ...result.web_queries.map((query) => query.slice(0, 300)),
  ])].slice(-12);
  state.workspace.archive_queries = [...new Set([
    ...state.workspace.archive_queries,
    ...result.archive_queries.map((query) => query.slice(0, 500)),
  ])].slice(-8);
  state.workerCounts.web_searches += result.counts.web_searches;
  state.workerCounts.url_reads += result.counts.url_reads;
  state.workerCounts.transcript_searches += result.counts.transcript_searches;
  state.workerCounts.transcript_opens += result.counts.transcript_opens;
  state.notebook.packets.push(result.packet);
  state.notebook.packets = state.notebook.packets.slice(-RESEARCH_AGENT_LIMITS.maxEvidencePackets);
  state.notebook.claims.push(...result.packet.claims.map((claim) => ({ ...claim, goal_id: result.packet.goal_id, task_id: result.packet.task_id })));
  state.notebook.claims = state.notebook.claims.slice(-RESEARCH_AGENT_LIMITS.maxNotebookClaims);
  state.notebook.conflicts.push(...result.packet.conflicts.map((conflict) => ({ ...conflict, goal_id: result.packet.goal_id, task_id: result.packet.task_id })));
  state.notebook.conflicts = state.notebook.conflicts.slice(-RESEARCH_AGENT_LIMITS.maxNotebookConflicts);
  state.notebook.gaps.push(...result.packet.gaps.map((text) => ({ goal_id: result.packet.goal_id, task_id: result.packet.task_id, text })));
  state.notebook.gaps = state.notebook.gaps.slice(-RESEARCH_AGENT_LIMITS.maxNotebookGaps);
  for (const failure of result.packet.tool_failures) addLimitation(state, failure);
}

function failedPacket(state: RuntimeState, task: ResearchTask, code: string, deps: ResearchRuntimeDependencies): ResearchEvidencePacket {
  return researchEvidencePacketSchema.parse({
    packet_id: `packet_${randomUUID()}`,
    goal_id: task.goal_id,
    task_id: task.task_id,
    status: "unable",
    answer: `This research task could not complete: ${code}.`,
    claims: [],
    conflicts: [],
    gaps: [task.question],
    confidence: "low",
    source_ids: [],
    exact_excerpts: [],
    tool_failures: [code],
    model_requests: task.attempt,
    created_at: nowIso(deps),
  });
}

async function executeTask(
  state: RuntimeState,
  deps: ResearchRuntimeDependencies,
  task: ResearchTask,
): Promise<void> {
  const eventId = `evt_${state.runId}_${task.task_id}`;
  task.status = "running";
  task.started_at = nowIso(deps);
  emit(state, deps, { id: eventId, kind: "agent", label: task.question.slice(0, 180), detail: "Research task started", status: "running" });
  const runOnce = () => deps.worker.run({
    goal: state.notebook.current_goal!,
    task: structuredClone(task),
    workspace: structuredClone(state.workspace),
    suppliedUrls: suppliedUrls(state.workspace),
    tools: deps.tools,
    budget: state.budget,
    signal: deps.signal,
    onToolEvent: (event: WorkerToolEvent) => emit(state, deps, {
      id: eventId,
      kind: "agent",
      label: task.question.slice(0, 180),
      detail: `${event.tool.replaceAll("_", " ")} · ${event.detail}`.slice(0, 300),
      status: event.status === "failed" ? "failed" : event.status,
    }),
  });
  try {
    task.attempt += 1;
    let result: ResearchWorkerResult;
    try {
      result = await runOnce();
    } catch (error) {
      if (!isTransientResearchError(error) || task.attempt >= 2) throw error;
      addLimitation(state, `worker_retry:${task.task_id}`);
      emit(state, deps, { id: eventId, kind: "agent", label: task.question.slice(0, 180), detail: "Transient failure; retrying this task from its checkpoint", status: "partial" });
      task.attempt += 1;
      result = await runOnce();
    }
    mergeWorkerResult(state, result);
    task.status = result.packet.status === "complete" ? "complete" : "partial";
    task.completed_at = nowIso(deps);
    emit(state, deps, {
      id: eventId,
      kind: "agent",
      label: task.question.slice(0, 180),
      detail: `${result.packet.claims.length} grounded claims · ${result.packet.conflicts.length} conflicts · ${result.packet.gaps.length} gaps`,
      status: task.status === "complete" ? "complete" : "partial",
    });
    trace(state, { action: "run_task", summary: task.question, target: task.success_criteria, observation: result.packet.answer, status: task.status === "complete" ? "complete" : "partial" });
  } catch (error) {
    const code = safeCode(error, "research_worker_failed");
    const abort = abortedCode(deps.signal);
    const stopped = abort === "research_run_stopped" || code === "research_run_stopped";
    const timedOut = abort === "research_run_timeout" || code === "research_run_timeout";
    task.status = stopped || timedOut ? "cancelled" : "failed";
    task.failure_code = timedOut ? "research_run_timeout" : stopped ? "research_run_stopped" : code;
    task.completed_at = nowIso(deps);
    const packet = failedPacket(state, task, code, deps);
    state.notebook.packets.push(packet);
    state.notebook.packets = state.notebook.packets.slice(-RESEARCH_AGENT_LIMITS.maxEvidencePackets);
    state.notebook.gaps.push({ goal_id: task.goal_id, task_id: task.task_id, text: task.question });
    addLimitation(state, `${task.task_id}:${code}`);
    emit(state, deps, { id: eventId, kind: "agent", label: task.question.slice(0, 180), detail: timedOut ? "research_run_timeout" : stopped ? "research_run_stopped" : code, status: task.status === "cancelled" ? (timedOut ? "failed" : "stopped") : "failed" });
    trace(state, { action: "run_task", summary: task.question, target: task.success_criteria, observation: code, status: "failed" });
  }
}

function applyReview(state: RuntimeState, review: ManagerReview, deps: ResearchRuntimeDependencies): void {
  const goalId = state.notebook.current_goal?.goal_id;
  const current = state.notebook.tasks.filter((task) => task.goal_id === goalId);
  for (const taskId of review.cancel_task_ids) {
    const task = current.find((candidate) => candidate.task_id === taskId);
    if (task?.status === "pending") {
      task.status = "cancelled";
      task.completed_at = nowIso(deps);
      task.failure_code = "research_manager_cancelled";
    }
  }
  if (review.new_tasks.length) addPlannedTasks(state, review.new_tasks, deps);
  if (state.notebook.current_goal) {
    state.notebook.current_goal.plan_revision += 1;
    state.notebook.current_goal.completion_reason = review.completion_reason;
  }
}

async function createArtifact(
  state: RuntimeState,
  deps: ResearchRuntimeDependencies,
  mode: "headlines" | "big_story",
): Promise<boolean> {
  if (!state.workspace.archive_queries.length) {
    addLimitation(state, "artifact_archive_not_checked");
    return false;
  }
  const input = phase5InputSchema.parse({
    mode,
    topic: state.notebook.current_goal?.objective ?? state.message.slice(0, 300),
    links: state.workspace.evidence.filter((source) => source.evidence_usable && source.url).map((source) => source.url!).slice(0, 3),
    notes: state.workspace.turns.slice(-10).map((turn) => `${turn.role.toUpperCase()}: ${turn.text}`).join("\n").slice(0, PHASE_5_LIMITS.maxNotesCharacters),
  });
  const plan = researchPlanSchema.parse({
    web_queries: (state.workspace.web_queries.length ? state.workspace.web_queries : [input.topic]).slice(-2),
    archive_queries: state.workspace.archive_queries.slice(-2),
  });
  const eventId = `evt_${state.runId}_artifact`;
  emit(state, deps, { id: eventId, kind: "composition", label: "Creating the requested preparation brief", detail: mode === "headlines" ? "Headlines" : "Big Story", status: "running" });
  const reservation = state.budget.reserve({ role: "artifact", action: `artifact:${mode}`, amount: MANAGER_RESERVATIONS.artifact, model: deps.manager.modelId, allowAnswerReserve: true });
  state.counts.compositions += 1;
  state.grokCalls += 1;
  try {
    const result = await deps.composer.compose(input, plan, state.workspace.evidence, { signal: deps.signal, timeoutMs: 180_000 });
    state.budget.settle(reservation, result.receipt);
    const outputFailure = phase5ModelOutputFailure(result.output_status);
    if (outputFailure) throw new Error(outputFailure.replace(/^phase5_/, "research_artifact_"));
    let raw = hydratePhase7AArtifactSourceLedger(result.value, state.workspace.evidence);
    let validation = validatePhase7AArtifact(mode, raw, state.workspace.evidence);
    if (validation.errors.length && state.counts.repairs < PHASE_7A_LIMITS.maxRepairs) {
      let repairReservation: string | undefined;
      try {
        repairReservation = state.budget.reserve({ role: "artifact", action: `artifact:${mode}:repair`, amount: MANAGER_RESERVATIONS.artifact, model: deps.manager.modelId, allowAnswerReserve: true });
        state.counts.repairs += 1;
        state.grokCalls += 1;
        const repaired = await deps.composer.repair(input, plan, state.workspace.evidence, withoutMachineLedger(raw), validation.errors, { signal: deps.signal, timeoutMs: 180_000 });
        state.budget.settle(repairReservation, repaired.receipt);
        repairReservation = undefined;
        const repairFailure = phase5ModelOutputFailure(repaired.output_status);
        if (!repairFailure) {
          raw = hydratePhase7AArtifactSourceLedger(repaired.value, state.workspace.evidence);
          validation = validatePhase7AArtifact(mode, raw, state.workspace.evidence);
        }
      } catch (error) {
        if (repairReservation) state.budget.fail(repairReservation);
        addLimitation(state, safeCode(error, "artifact_repair_unavailable"));
      }
    }
    if (!validation.artifact || validation.errors.length) {
      for (const error of validation.errors) addLimitation(state, `artifact:${error}`);
      emit(state, deps, { id: eventId, kind: "composition", label: "The brief did not pass validation", detail: "The previous valid brief was preserved", status: "failed" });
      return false;
    }
    state.workspace.artifact = phase7aArtifactSchema.parse(validation.artifact);
    state.workspace.artifact_revision += 1;
    emit(state, deps, { id: eventId, kind: "artifact", label: "Preparation brief ready", detail: `${mode === "headlines" ? "Headlines" : "Big Story"} · revision ${state.workspace.artifact_revision}`, status: "complete" });
    return true;
  } catch (error) {
    try {
      state.budget.fail(reservation);
    } catch {
      // The reservation was already reconciled before a later validation error.
    }
    addLimitation(state, safeCode(error, "research_artifact_failed"));
    emit(state, deps, { id: eventId, kind: "composition", label: "Preparation brief unavailable", detail: "Collected research was preserved", status: "failed" });
    return false;
  }
}

function countsFor(state: RuntimeState): Phase7ACounts {
  const receipts = state.budget.allReceipts();
  return phase7aCountsSchema.parse({
    controller_turns: state.managerCalls,
    provider_requests: state.budget.providerRequests,
    grok_turns: receipts.filter((receipt) => receipt.model === PHASE_5_MODELS.heavy.id).length,
    web_searches: state.workerCounts.web_searches,
    url_reads: state.workerCounts.url_reads,
    transcript_searches: state.workerCounts.transcript_searches,
    transcript_opens: state.workerCounts.transcript_opens,
    compositions: state.counts.compositions,
    repairs: state.counts.repairs,
  });
}

export async function runResearchTurn(options: {
  workspace: Phase7AWorkspace;
  message: string;
  researchDepth?: Phase7AResearchDepth;
  runId?: string;
}, deps: ResearchRuntimeDependencies): Promise<Phase7ATurnResult> {
  const depth = options.researchDepth ?? "standard";
  const startedAtIso = nowIso(deps);
  const workspace = structuredClone(phase7aWorkspaceSchema.parse(options.workspace));
  const notebook = workspace.research_notebook
    ? structuredClone(researchNotebookSchema.parse(workspace.research_notebook))
    : createEmptyResearchNotebook(startedAtIso);
  const state: RuntimeState = {
    runId: options.runId ?? `run_${randomUUID()}`,
    workspace,
    notebook,
    message: options.message.trim(),
    depth,
    status: "running",
    events: [],
    traceSteps: [],
    limitations: [],
    assistantMessage: null,
    budget: new ResearchBudget(depth, { ceilingUsd: deps.costCapUsd, maxProviderRequests: deps.providerRequestCap }),
    counts: phase7aCountsSchema.parse({ controller_turns: 0, provider_requests: 0, grok_turns: 0, web_searches: 0, url_reads: 0, transcript_searches: 0, transcript_opens: 0, compositions: 0, repairs: 0 }),
    startedAtMs: deps.clockMs?.() ?? performance.now(),
    startedAtIso,
    managerCalls: 0,
    grokCalls: 0,
    workerCounts: { web_searches: 0, url_reads: 0, transcript_searches: 0, transcript_opens: 0 },
  };
  appendTurn(state, "user", state.message, [], deps);
  emit(state, deps, { kind: "run", label: "Research turn started", detail: "The manager is reading the conversation and saved evidence", status: "running" });

  let completion: Pick<ManagerReview, "decision" | "completion_reason" | "remaining_gaps"> = {
    decision: "partial",
    completion_reason: "Research did not reach a semantic completion checkpoint.",
    remaining_gaps: [],
  };
  let directAnswer: AnswerSubmission | null = null;
  try {
    assertActive(state, deps);
    const planEventId = `evt_${state.runId}_plan`;
    emit(state, deps, { id: planEventId, kind: "agent", label: depth === "deep" ? "Building the Deep Research plan" : "Planning the research", detail: "Identifying independent questions and evidence needs", status: "running" });
    const plan = parseManagerValue("plan", managerPlanSchema, await managerCall(state, deps, "plan", (manager) => manager.plan(managerPlanPrompt({
      workspace: state.workspace,
      notebook: state.notebook,
      message: state.message,
      depth,
      budget: state.budget.snapshot(),
    }), { signal: deps.signal, timeoutMs: 120_000 })));
    const goalId = `goal_${randomUUID()}`;
    const explicitArtifact = requestedArtifactMode(state.message, state.workspace.artifact);
    if (plan.artifact_mode && !explicitArtifact) addLimitation(state, "artifact_intent_rejected");
    const artifactMode = explicitArtifact;
    state.notebook.current_goal = {
      goal_id: goalId,
      user_message: state.message,
      objective: plan.objective,
      depth,
      status: plan.requires_research ? "researching" : "planning",
      artifact_mode: artifactMode,
      plan_revision: 1,
      started_at: startedAtIso,
      completed_at: null,
      completion_reason: null,
    };
    if (plan.user_correction) {
      const turn = state.workspace.turns.at(-1)!;
      state.notebook.user_corrections.push({ turn_id: turn.turn_id, text: plan.user_correction, created_at: turn.created_at });
      state.notebook.user_corrections = state.notebook.user_corrections.slice(-32);
    }
    if (plan.scope_question) {
      directAnswer = { goal_status: "partial", blocks: [{ text: plan.scope_question, source_ids: [] }], limitations: ["The requested expansion needs confirmation."], follow_ups: [] };
    } else if (!plan.requires_research) {
      directAnswer = plan.direct_answer;
    } else {
      if (!plan.tasks.length) throw new Error("research_plan_missing_tasks");
      assertAcyclicTaskGraph(plan.tasks);
      addPlannedTasks(state, plan.tasks, deps);
    }
    state.workspace.research_state = {
      // This is a compact public/UI projection. The canonical goal and full
      // task questions remain intact in the versioned research notebook.
      objective: plan.objective.slice(0, 500),
      completed_steps: [],
      evidence_gaps: plan.tasks
        .map((task) => task.question.slice(0, 240))
        .slice(0, PHASE_7A_LIMITS.maxNotebookEvidenceGaps),
      next_step: plan.public_summary,
    };
    const visibleTasks = plan.tasks.map((task) => task.question).join(" · ").slice(0, 300);
    emit(state, deps, { id: planEventId, kind: "agent", label: depth === "deep" ? "Deep Research plan ready" : "Research plan ready", detail: plan.requires_research ? `${plan.tasks.length} tasks · ${visibleTasks}` : "No new research is needed", status: "complete" });
    trace(state, { action: "plan_research", summary: plan.public_summary, target: plan.objective, observation: `${plan.tasks.length} tasks`, status: "complete" });
    checkpoint(state, deps);

    let waveNumber = 0;
    while (!directAnswer && state.notebook.current_goal?.status === "researching") {
      assertActive(state, deps);
      const ready = readyTasks(state);
      if (!ready.length) {
        const pending = state.notebook.tasks.filter((task) => task.goal_id === goalId && task.status === "pending");
        completion = {
          decision: "partial",
          completion_reason: pending.length ? "The remaining task graph could not make progress." : "No additional research tasks remained.",
          remaining_gaps: pending.map((task) => task.question),
        };
        break;
      }
      if (waveNumber >= RESEARCH_AGENT_LIMITS.maxWaves[depth]) {
        addLimitation(state, "research_wave_safety_limit");
        completion = { decision: "partial", completion_reason: "The research wave safety limit was reached.", remaining_gaps: ready.map((task) => task.question) };
        break;
      }
      waveNumber += 1;
      const waveId = `wave_${goalId}_${waveNumber}`;
      const waveStarted = nowIso(deps);
      emit(state, deps, { kind: "agent", label: `Research wave ${waveNumber}`, detail: `${ready.length} dependency-ready tasks · up to ${RESEARCH_AGENT_LIMITS.maxParallelWorkers} concurrent`, status: "running" });
      await runPool(ready, RESEARCH_AGENT_LIMITS.maxParallelWorkers, (task) => executeTask(state, deps, task));
      const waveAbort = abortedCode(deps.signal);
      if (waveAbort) throw new Error(waveAbort);
      const waveStatus = ready.every((task) => task.status === "complete") ? "complete" : ready.some((task) => ["complete", "partial"].includes(task.status)) ? "partial" : "failed";
      state.notebook.waves.push(researchWaveSchema.parse({
        wave_id: waveId,
        goal_id: goalId,
        task_ids: ready.map((task) => task.task_id),
        started_at: waveStarted,
        completed_at: nowIso(deps),
        status: waveStatus,
      }));
      state.notebook.waves = state.notebook.waves.slice(-RESEARCH_AGENT_LIMITS.maxNotebookWaves);
      checkpoint(state, deps);
      emit(state, deps, { kind: "agent", label: `Research wave ${waveNumber} converged`, detail: `${ready.filter((task) => task.status === "complete").length} complete · ${ready.filter((task) => task.status === "partial").length} partial · ${ready.filter((task) => task.status === "failed").length} failed`, status: waveStatus === "complete" ? "complete" : waveStatus === "partial" ? "partial" : "failed" });

      const reviewEventId = `evt_${state.runId}_review_${waveNumber}`;
      emit(state, deps, { id: reviewEventId, kind: "agent", label: "Checking whether the goal is answered", detail: "Reviewing coverage, conflicts, uncertainty, and marginal value", status: "running" });
      let review: ManagerReview;
      try {
        review = parseManagerValue("review", managerReviewSchema, await managerCall(state, deps, "review", (manager) => manager.review(managerReviewPrompt({
          notebook: state.notebook,
          workspace: state.workspace,
          depth,
          budget: state.budget.snapshot(),
        }), { signal: deps.signal, timeoutMs: 120_000 })));
      } catch (error) {
        if (["research_answer_reserve_protected", "research_budget_exhausted"].includes(safeCode(error, ""))) {
          addLimitation(state, "review_budget_reserved_for_answer");
          completion = { decision: "partial", completion_reason: "Research stopped to preserve final-answer capacity.", remaining_gaps: state.notebook.gaps.filter((gap) => gap.goal_id === goalId).map((gap) => gap.text).slice(0, 12) };
          break;
        }
        throw error;
      }
      applyReview(state, review, deps);
      emit(state, deps, { id: reviewEventId, kind: "agent", label: review.decision === "continue" ? "More research will materially help" : "Research coverage checked", detail: review.completion_reason, status: review.decision === "satisfied" ? "complete" : "partial" });
      trace(state, { action: "review_research", summary: review.public_summary, target: review.decision, observation: review.completion_reason, status: review.decision === "satisfied" ? "complete" : "partial" });
      checkpoint(state, deps);
      if (review.decision !== "continue") {
        if (review.decision === "needs_scope_confirmation" && review.scope_question) {
          directAnswer = {
            goal_status: "partial",
            blocks: [{ text: review.scope_question, source_ids: [] }],
            limitations: ["The requested expansion needs confirmation."],
            follow_ups: [],
          };
        }
        completion = review;
        break;
      }
      const pending = state.notebook.tasks.filter((task) => task.goal_id === goalId && task.status === "pending");
      if (!pending.length) {
        addLimitation(state, "manager_continue_without_tasks");
        completion = { decision: "partial", completion_reason: "The manager requested more research without a runnable task.", remaining_gaps: review.remaining_gaps };
        break;
      }
    }

    if (!directAnswer) {
      const artifactMode = state.notebook.current_goal?.artifact_mode;
      if (artifactMode) {
        const created = await createArtifact(state, deps, artifactMode);
        if (created && state.workspace.artifact) {
          directAnswer = {
            goal_status: completion.decision === "satisfied" ? "satisfied" : "partial",
            blocks: [{
              text: `The validated ${artifactMode === "headlines" ? "Headlines" : "Big Story"} preparation brief “${state.workspace.artifact.working_title}” is ready.`,
              source_ids: state.workspace.artifact.source_ledger.filter((source) => source.evidence_usable).map((source) => source.source_id).slice(0, RESEARCH_AGENT_LIMITS.maxAnswerSourceIds),
            }],
            limitations: completion.decision === "satisfied" ? [] : [completion.completion_reason],
            follow_ups: ["Ask me to revise the brief around a different editorial priority."],
          };
        }
      }
    }
    if (!directAnswer) {
      const answerEventId = `evt_${state.runId}_answer`;
      emit(state, deps, { id: answerEventId, kind: "agent", label: "Writing the grounded answer", detail: "Using the converged evidence and completion judgment", status: "running" });
      directAnswer = parseManagerValue("answer", answerSubmissionSchema, await managerCall(state, deps, "answer", (manager) => manager.answer(answerPrompt({
        workspace: state.workspace,
        notebook: state.notebook,
        depth,
        completion,
      }), { signal: deps.signal, timeoutMs: 120_000 })));
      emit(state, deps, { id: answerEventId, kind: "agent", label: "Grounded answer ready", detail: directAnswer.goal_status === "satisfied" ? "The research goal was satisfied" : "The answer includes explicit limitations", status: directAnswer.goal_status === "satisfied" ? "complete" : "partial" });
      trace(state, { action: "submit_answer", summary: "Submitted the grounded answer", target: directAnswer.goal_status, observation: directAnswer.limitations.join("; ") || "No material limitation", status: directAnswer.goal_status === "satisfied" ? "complete" : "partial" });
    }
    for (const limitation of directAnswer.limitations) addLimitation(state, limitation);
    state.assistantMessage = answerMessage(state, directAnswer, deps);
    state.notebook.prior_answers.push({
      message_id: state.assistantMessage.message_id,
      goal_id: state.notebook.current_goal?.goal_id ?? "goal_unavailable",
      text: state.assistantMessage.text,
      source_ids: state.assistantMessage.source_ids,
      created_at: state.assistantMessage.created_at,
    });
    state.notebook.prior_answers = state.notebook.prior_answers.slice(-24);
    appendTurn(state, "assistant", state.assistantMessage.text, state.assistantMessage.source_ids, deps);
    state.status = directAnswer.goal_status === "satisfied" ? "complete" : "partial";
    if (state.notebook.current_goal) {
      state.notebook.current_goal.status = directAnswer.goal_status;
      state.notebook.current_goal.completed_at = nowIso(deps);
      state.notebook.current_goal.completion_reason = completion.completion_reason;
    }
    emit(state, deps, { kind: "run", label: state.status === "complete" ? "Answer ready" : "Answer ready with limitations", detail: directAnswer.goal_status === "satisfied" ? "The research goal was satisfied" : "Open gaps are stated in the answer", status: state.status });
  } catch (error) {
    const code = abortedCode(deps.signal) ?? safeCode(error, "research_runtime_failed");
    if (process.env.NODE_ENV === "development" && code === "research_runtime_failed") {
      const issues = error && typeof error === "object" && "issues" in error && Array.isArray(error.issues)
        ? error.issues.slice(0, 12).map((issue: unknown) => {
            const value = issue && typeof issue === "object" ? issue as { code?: unknown; path?: unknown[] } : {};
            return { code: String(value.code ?? "unknown"), path: Array.isArray(value.path) ? value.path.map(String).join(".") : "" };
          })
        : [];
      console.error("[nonsense-research-runtime]", {
        name: error instanceof Error ? error.name.slice(0, 80) : "unknown",
        issues,
      });
    }
    addLimitation(state, code);
    state.status = code === "research_run_stopped" ? "stopped" : state.notebook.packets.length ? "partial" : "failed";
    const answer = emergencyAnswer(state, code);
    state.assistantMessage = answerMessage(state, answer, deps);
    state.notebook.prior_answers.push({
      message_id: state.assistantMessage.message_id,
      goal_id: state.notebook.current_goal?.goal_id ?? "goal_unavailable",
      text: state.assistantMessage.text,
      source_ids: state.assistantMessage.source_ids,
      created_at: state.assistantMessage.created_at,
    });
    state.notebook.prior_answers = state.notebook.prior_answers.slice(-24);
    appendTurn(state, "assistant", state.assistantMessage.text, state.assistantMessage.source_ids, deps);
    if (state.notebook.current_goal) {
      state.notebook.current_goal.status = state.status === "stopped" ? "stopped" : state.status === "failed" ? "failed" : "partial";
      state.notebook.current_goal.completed_at = nowIso(deps);
      state.notebook.current_goal.completion_reason = code;
    }
    finalizeRunningEvents(state, deps, code);
    emit(state, deps, { kind: "run", label: state.status === "stopped" ? "Research stopped" : state.status === "partial" ? "Preserved partial research" : "Research failed safely", detail: code, status: state.status });
  }

  state.counts = countsFor(state);
  if (state.budget.accountedCostUsd > state.budget.ceilingUsd + 1e-9) addLimitation(state, "provider_cost_exceeded_reservation");
  checkpoint(state, deps);
  const traceValue = phase7aRunTraceSchema.parse({
    run_id: state.runId,
    research_depth: depth,
    started_at: state.startedAtIso,
    completed_at: nowIso(deps),
    status: state.status,
    steps: state.traceSteps,
    counts: state.counts,
    accounted_cost_usd: Math.min(state.budget.accountedCostUsd, PHASE_7A_LIMITS.costCapUsd),
    source_ids: state.workspace.evidence.map((source) => source.source_id),
    artifact_revision: state.workspace.artifact_revision,
    limitations: state.limitations,
    controller_failure: null,
  });
  state.workspace.run_traces.push(traceValue);
  state.workspace.run_traces = state.workspace.run_traces.slice(-PHASE_7A_LIMITS.maxRunTraces);
  checkpoint(state, deps);
  const usage = state.budget.allReceipts().map((receipt) => ({
    action: receipt.action,
    model: receipt.model,
    provider: receipt.provider,
    prompt_tokens: receipt.prompt_tokens,
    completion_tokens: receipt.completion_tokens,
    total_tokens: receipt.total_tokens,
    reported_cost_usd: receipt.reported_cost_usd,
    accounted_cost_usd: receipt.accounted_cost_usd,
    receipt_missing: receipt.receipt_missing,
  }));
  return phase7aTurnResultSchema.parse({
    run_id: state.runId,
    status: state.status,
    assistant_message: state.assistantMessage,
    artifact: state.workspace.artifact,
    artifact_revision: state.workspace.artifact_revision,
    events: state.events,
    usage,
    counts: state.counts,
    accounted_cost_usd: Math.min(state.budget.accountedCostUsd, PHASE_7A_LIMITS.costCapUsd),
    elapsed_ms: Number(elapsed(state, deps).toFixed(2)),
    limitations: state.limitations,
    trace: traceValue,
    workspace: state.workspace,
  });
}
