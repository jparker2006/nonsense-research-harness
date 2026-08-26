import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Phase7AWorkspace } from "../phase7a/contracts.ts";
import type {
  ManagerReview,
  ResearchDepth,
  ResearchEvidencePacket,
  ResearchNotebook,
  ResearchTask,
} from "./contracts.ts";

const DIRECTORY = join(process.cwd(), "prompts", "research-agent");

function load(name: string): string {
  const value = readFileSync(join(DIRECTORY, name), "utf8").trim();
  if (!value) throw new Error(`research_prompt_empty:${name}`);
  return value;
}

function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`research_prompt_placeholder_unknown:${key}`);
    return value;
  });
}

export const RESEARCH_SYSTEM_PROMPT = load("SYSTEM.md");
export const RESEARCH_WORKER_TEMPLATE = load("WORKER.md");
export const RESEARCH_FALLBACK_PROMPT = load("FALLBACK.md");
const PLAN_TEMPLATE = load("MANAGER_PLAN.md");
const REVIEW_TEMPLATE = load("MANAGER_REVIEW.md");
const ANSWER_TEMPLATE = load("ANSWER.md");
const MODE_POLICIES = Object.freeze({ standard: load("STANDARD.md"), deep: load("DEEP.md") });

export function researchModePolicy(depth: ResearchDepth): string {
  return MODE_POLICIES[depth];
}

function conversationView(workspace: Phase7AWorkspace) {
  return workspace.turns.slice(-16).map(({ turn_id, role, text, source_ids, created_at }) => ({
    turn_id,
    role,
    text,
    source_ids,
    created_at,
  }));
}

export function evidenceView(workspace: Phase7AWorkspace) {
  let textBudget = 64_000;
  return workspace.evidence.map((source) => {
    const raw = source.content ?? source.excerpt ?? "";
    const text = raw.slice(0, Math.min(2_000, Math.max(0, textBudget)));
    textBudget -= text.length;
    return {
      source_id: source.source_id,
      source_type: source.source_type,
      availability: source.availability,
      evidence_usable: source.evidence_usable,
      title: source.title,
      url: source.url,
      retrieved_at: source.retrieved_at,
      episode_id: source.episode_id,
      segment_id: source.segment_id,
      chunk_id: source.chunk_id,
      evidence_text: text,
    };
  });
}

function notebookView(notebook: ResearchNotebook | null) {
  if (!notebook) return null;
  return {
    version: notebook.version,
    current_goal: notebook.current_goal,
    tasks: notebook.tasks.slice(-32),
    packets: notebook.packets.slice(-24),
    conflicts: notebook.conflicts.slice(-24),
    gaps: notebook.gaps.slice(-24),
    fallbacks: notebook.fallbacks.slice(-8),
    user_corrections: notebook.user_corrections.slice(-12),
    prior_answers: notebook.prior_answers.slice(-8),
    usage_receipts: notebook.usage_receipts.slice(-24),
    artifact_revision: notebook.artifact_revision,
  };
}

export function managerPlanPrompt(input: {
  workspace: Phase7AWorkspace;
  notebook: ResearchNotebook;
  message: string;
  depth: ResearchDepth;
  budget: unknown;
}): string {
  return render(PLAN_TEMPLATE, {
    MODE_POLICY: researchModePolicy(input.depth),
    CURRENT_MESSAGE: input.message,
    CONVERSATION: JSON.stringify(conversationView(input.workspace)),
    EVIDENCE: JSON.stringify(evidenceView(input.workspace)),
    NOTEBOOK: JSON.stringify(notebookView(input.notebook)),
    ARTIFACT: JSON.stringify(input.workspace.artifact ? {
      mode: input.workspace.artifact.mode,
      working_title: input.workspace.artifact.working_title,
      revision: input.workspace.artifact_revision,
    } : null),
    BUDGET: JSON.stringify(input.budget),
  });
}

export function managerReviewPrompt(input: {
  notebook: ResearchNotebook;
  workspace: Phase7AWorkspace;
  depth: ResearchDepth;
  budget: unknown;
}): string {
  const goalId = input.notebook.current_goal?.goal_id;
  return render(REVIEW_TEMPLATE, {
    MODE_POLICY: researchModePolicy(input.depth),
    GOAL_AND_TASKS: JSON.stringify({
      goal: input.notebook.current_goal,
      tasks: input.notebook.tasks.filter((task) => task.goal_id === goalId),
    }),
    PACKETS: JSON.stringify(input.notebook.packets.filter((packet) => packet.goal_id === goalId)),
    EVIDENCE: JSON.stringify(evidenceView(input.workspace)),
    BUDGET: JSON.stringify(input.budget),
  });
}

export function workerPrompt(input: {
  goal: ResearchNotebook["current_goal"];
  task: ResearchTask;
  workspace: Phase7AWorkspace;
  suppliedUrls: string[];
  budget: unknown;
}): string {
  return render(RESEARCH_WORKER_TEMPLATE, {
    USER_GOAL: JSON.stringify(input.goal),
    TASK: JSON.stringify(input.task),
    EVIDENCE: JSON.stringify(evidenceView(input.workspace)),
    SUPPLIED_URLS: JSON.stringify(input.suppliedUrls),
    BUDGET: JSON.stringify(input.budget),
  });
}

export function answerPrompt(input: {
  workspace: Phase7AWorkspace;
  notebook: ResearchNotebook;
  depth: ResearchDepth;
  completion: Pick<ManagerReview, "decision" | "completion_reason" | "remaining_gaps">;
}): string {
  const goalId = input.notebook.current_goal?.goal_id;
  const packets: ResearchEvidencePacket[] = input.notebook.packets.filter((packet) => packet.goal_id === goalId);
  return render(ANSWER_TEMPLATE, {
    MODE_POLICY: researchModePolicy(input.depth),
    GOAL: JSON.stringify(input.notebook.current_goal),
    CONVERSATION: JSON.stringify(conversationView(input.workspace)),
    PACKETS: JSON.stringify(packets),
    EVIDENCE: JSON.stringify(evidenceView(input.workspace)),
    COMPLETION: JSON.stringify(input.completion),
  });
}
