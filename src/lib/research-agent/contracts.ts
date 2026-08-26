import { z } from "zod";
import { evidenceSourceSchema } from "../phase5/contracts.ts";

export const RESEARCH_AGENT_LIMITS = Object.freeze({
  maxTasksPerPlan: 12,
  maxTasksPerGoal: 16,
  maxTaskHistory: 64,
  maxEvidencePackets: 64,
  maxWaves: Object.freeze({ standard: 4, deep: 8 }),
  maxParallelWorkers: 8,
  maxWorkerSteps: 8,
  maxProviderRequests: 120,
  maxEvidenceSources: 64,
  maxNotebookClaims: 192,
  maxNotebookConflicts: 48,
  maxNotebookGaps: 48,
  maxNotebookWaves: 32,
  maxAnswerSourceIds: 12,
  maxAnswerBlocks: 12,
  maxElapsedMs: Object.freeze({ standard: 300_000, deep: 720_000 }),
  budgets: Object.freeze({
    standard: Object.freeze({ targetUsd: 0.3, ceilingUsd: 0.5, answerReserveUsd: 0.1 }),
    deep: Object.freeze({ targetUsd: 1, ceilingUsd: 2, answerReserveUsd: 0.3 }),
  }),
});

export const researchDepthSchema = z.enum(["standard", "deep"]);
export const researchGoalStatusSchema = z.enum(["planning", "researching", "satisfied", "partial", "unable", "stopped", "failed"]);
export const researchTaskStatusSchema = z.enum(["pending", "running", "complete", "partial", "failed", "cancelled"]);
export const researchSourceTypeSchema = z.enum(["provided_links", "web", "archive", "mixed"]);

export const plannedResearchTaskSchema = z.object({
  task_id: z.string().regex(/^task_[a-z0-9][a-z0-9_-]{0,63}$/),
  question: z.string().trim().min(3).max(600),
  priority: z.enum(["high", "medium", "low"]),
  dependencies: z.array(z.string().regex(/^task_[a-z0-9][a-z0-9_-]{0,63}$/)).max(RESEARCH_AGENT_LIMITS.maxTasksPerPlan),
  source_types: z.array(researchSourceTypeSchema).min(1).max(4),
  success_criteria: z.string().trim().min(3).max(600),
}).strict();

export const researchTaskSchema = plannedResearchTaskSchema.extend({
  goal_id: z.string().max(120),
  status: researchTaskStatusSchema,
  attempt: z.number().int().min(0).max(2),
  created_at: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  failure_code: z.string().max(160).nullable(),
}).strict();

export const answerBlockSchema = z.object({
  text: z.string().trim().min(1).max(2_500),
  source_ids: z.array(z.string().trim().min(3).max(180)).max(RESEARCH_AGENT_LIMITS.maxAnswerSourceIds),
}).strict();

export const answerSubmissionSchema = z.object({
  goal_status: z.enum(["satisfied", "partial", "unable"]),
  blocks: z.array(answerBlockSchema).min(1).max(RESEARCH_AGENT_LIMITS.maxAnswerBlocks),
  limitations: z.array(z.string().trim().min(1).max(300)).max(12),
  follow_ups: z.array(z.string().trim().min(1).max(240)).max(3),
}).strict();

export const managerPlanSchema = z.object({
  objective: z.string().trim().min(1).max(600),
  public_summary: z.string().trim().min(1).max(240),
  requires_research: z.boolean(),
  scope_question: z.string().trim().min(1).max(500).nullable(),
  artifact_mode: z.enum(["headlines", "big_story"]).nullable(),
  user_correction: z.string().trim().min(1).max(1_000).nullable(),
  tasks: z.array(plannedResearchTaskSchema).max(RESEARCH_AGENT_LIMITS.maxTasksPerPlan),
  direct_answer: answerSubmissionSchema.nullable(),
}).strict();

export const managerReviewSchema = z.object({
  decision: z.enum(["continue", "satisfied", "partial", "unable", "needs_scope_confirmation"]),
  public_summary: z.string().trim().min(1).max(240),
  completion_reason: z.string().trim().min(1).max(800),
  remaining_gaps: z.array(z.string().trim().min(1).max(400)).max(12),
  new_tasks: z.array(plannedResearchTaskSchema).max(RESEARCH_AGENT_LIMITS.maxTasksPerPlan),
  cancel_task_ids: z.array(z.string().regex(/^task_[a-z0-9][a-z0-9_-]{0,63}$/)).max(RESEARCH_AGENT_LIMITS.maxTasksPerGoal),
  scope_question: z.string().trim().min(1).max(500).nullable(),
}).strict();

export const workerClaimInputSchema = z.object({
  text: z.string().trim().min(1).max(1_200),
  kind: z.enum(["fact", "inference"]),
  source_ids: z.array(z.string().trim().min(3).max(180)).max(8),
}).strict();

export const workerConflictInputSchema = z.object({
  summary: z.string().trim().min(1).max(1_200),
  source_ids: z.array(z.string().trim().min(3).max(180)).min(1).max(8),
}).strict();

export const workerSubmissionSchema = z.object({
  status: z.enum(["complete", "partial", "unable"]),
  answer: z.string().trim().min(1).max(4_000),
  claims: z.array(workerClaimInputSchema).max(20),
  conflicts: z.array(workerConflictInputSchema).max(10),
  gaps: z.array(z.string().trim().min(1).max(500)).max(10),
  confidence: z.enum(["low", "medium", "high"]),
}).strict();

export const exactEvidenceExcerptSchema = z.object({
  source_id: z.string().max(180),
  excerpt: z.string().max(6_000),
}).strict();

export const researchEvidencePacketSchema = workerSubmissionSchema.extend({
  packet_id: z.string().max(160),
  goal_id: z.string().max(120),
  task_id: z.string().max(72),
  source_ids: z.array(z.string().max(180)).max(32),
  exact_excerpts: z.array(exactEvidenceExcerptSchema).max(32),
  tool_failures: z.array(z.string().max(240)).max(20),
  model_requests: z.number().int().nonnegative().max(RESEARCH_AGENT_LIMITS.maxWorkerSteps),
  created_at: z.string(),
}).strict();

export const researchWaveSchema = z.object({
  wave_id: z.string().max(160),
  goal_id: z.string().max(120),
  task_ids: z.array(z.string().max(72)).min(1).max(RESEARCH_AGENT_LIMITS.maxTasksPerGoal),
  started_at: z.string(),
  completed_at: z.string(),
  status: z.enum(["complete", "partial", "failed", "stopped"]),
}).strict();

export const researchGoalSchema = z.object({
  goal_id: z.string().max(120),
  user_message: z.string().max(12_000),
  objective: z.string().max(600),
  depth: researchDepthSchema,
  status: researchGoalStatusSchema,
  artifact_mode: z.enum(["headlines", "big_story"]).nullable(),
  plan_revision: z.number().int().nonnegative(),
  started_at: z.string(),
  completed_at: z.string().nullable(),
  completion_reason: z.string().max(800).nullable(),
}).strict();

export const researchFallbackSchema = z.object({
  goal_id: z.string().max(120),
  stage: z.enum(["plan", "review", "answer"]),
  from_model: z.string().max(120),
  to_model: z.string().max(120),
  reason: z.string().max(180),
  created_at: z.string(),
}).strict();

export const researchUsageReceiptSchema = z.object({
  usage_id: z.string().max(160),
  role: z.enum(["manager", "worker", "web_search", "transcript_search", "artifact"]),
  action: z.string().max(160),
  model: z.string().max(160).optional(),
  provider: z.string().max(160).optional(),
  prompt_tokens: z.number().int().nonnegative().optional(),
  completion_tokens: z.number().int().nonnegative().optional(),
  total_tokens: z.number().int().nonnegative().optional(),
  reported_cost_usd: z.number().nonnegative().optional(),
  accounted_cost_usd: z.number().nonnegative(),
  receipt_missing: z.boolean(),
  fallback: z.boolean(),
}).strict();

const researchCorrectionSchema = z.object({
  turn_id: z.string().max(160),
  text: z.string().trim().min(1).max(1_000),
  created_at: z.string(),
}).strict();

const researchPriorAnswerSchema = z.object({
  message_id: z.string().max(160),
  goal_id: z.string().max(120),
  text: z.string().trim().min(1).max(5_000),
  source_ids: z.array(z.string().max(180)).max(RESEARCH_AGENT_LIMITS.maxAnswerSourceIds),
  created_at: z.string(),
}).strict();

export const researchNotebookSchema = z.object({
  version: z.literal(1),
  current_goal: researchGoalSchema.nullable(),
  tasks: z.array(researchTaskSchema).max(RESEARCH_AGENT_LIMITS.maxTaskHistory),
  packets: z.array(researchEvidencePacketSchema).max(RESEARCH_AGENT_LIMITS.maxEvidencePackets),
  waves: z.array(researchWaveSchema).max(RESEARCH_AGENT_LIMITS.maxNotebookWaves),
  claims: z.array(workerClaimInputSchema.extend({ goal_id: z.string().max(120), task_id: z.string().max(72) }).strict()).max(RESEARCH_AGENT_LIMITS.maxNotebookClaims),
  conflicts: z.array(workerConflictInputSchema.extend({ goal_id: z.string().max(120), task_id: z.string().max(72) }).strict()).max(RESEARCH_AGENT_LIMITS.maxNotebookConflicts),
  gaps: z.array(z.object({ goal_id: z.string().max(120), task_id: z.string().max(72), text: z.string().max(500) }).strict()).max(RESEARCH_AGENT_LIMITS.maxNotebookGaps),
  fallbacks: z.array(researchFallbackSchema).max(20),
  user_corrections: z.array(researchCorrectionSchema).max(32).default([]),
  prior_answers: z.array(researchPriorAnswerSchema).max(24).default([]),
  usage_receipts: z.array(researchUsageReceiptSchema).max(RESEARCH_AGENT_LIMITS.maxProviderRequests).default([]),
  artifact_revision: z.number().int().nonnegative().default(0),
  updated_at: z.string(),
}).strict();

export type ResearchDepth = z.infer<typeof researchDepthSchema>;
export type PlannedResearchTask = z.infer<typeof plannedResearchTaskSchema>;
export type ResearchTask = z.infer<typeof researchTaskSchema>;
export type ManagerPlan = z.infer<typeof managerPlanSchema>;
export type ManagerReview = z.infer<typeof managerReviewSchema>;
export type AnswerSubmission = z.infer<typeof answerSubmissionSchema>;
export type WorkerSubmission = z.infer<typeof workerSubmissionSchema>;
export type ResearchEvidencePacket = z.infer<typeof researchEvidencePacketSchema>;
export type ResearchNotebook = z.infer<typeof researchNotebookSchema>;
export type ResearchUsageReceipt = z.infer<typeof researchUsageReceiptSchema>;
export type ResearchEvidenceSource = z.infer<typeof evidenceSourceSchema>;

export function createEmptyResearchNotebook(now = new Date().toISOString()): ResearchNotebook {
  return researchNotebookSchema.parse({
    version: 1,
    current_goal: null,
    tasks: [],
    packets: [],
    waves: [],
    claims: [],
    conflicts: [],
    gaps: [],
    fallbacks: [],
    user_corrections: [],
    prior_answers: [],
    usage_receipts: [],
    artifact_revision: 0,
    updated_at: now,
  });
}

export function assertAcyclicTaskGraph(tasks: readonly PlannedResearchTask[], existingTaskIds: readonly string[] = []): void {
  const existing = new Set(existingTaskIds);
  const ids = new Set<string>();
  for (const task of tasks) {
    if (existing.has(task.task_id) || ids.has(task.task_id)) throw new Error("research_task_duplicate_id");
    ids.add(task.task_id);
  }
  const allowed = new Set([...existing, ...ids]);
  for (const task of tasks) {
    if (task.dependencies.includes(task.task_id)) throw new Error("research_task_self_dependency");
    if (task.dependencies.some((dependency) => !allowed.has(dependency))) throw new Error("research_task_missing_dependency");
  }
  const byId = new Map(tasks.map((task) => [task.task_id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (taskId: string) => {
    if (visited.has(taskId) || existing.has(taskId)) return;
    if (visiting.has(taskId)) throw new Error("research_task_cycle");
    visiting.add(taskId);
    for (const dependency of byId.get(taskId)?.dependencies ?? []) visit(dependency);
    visiting.delete(taskId);
    visited.add(taskId);
  };
  for (const task of tasks) visit(task.task_id);
}
