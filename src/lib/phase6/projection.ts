import type {
  Phase5ActivityEvent,
  Phase5Artifact,
  Phase5RunResult,
} from "../phase5/contracts.ts";
import {
  phase6ActivitySchema,
  phase6ArtifactSchema,
  phase6ReceiptSchema,
  type Phase6Activity,
  type Phase6Artifact,
  type Phase6Receipt,
} from "./contracts.ts";

const LABELS: Record<Phase5ActivityEvent["type"], string> = {
  run_started: "Research run started",
  tool_started: "Tool started",
  tool_completed: "Tool completed",
  tool_failed: "Tool unavailable",
  validation_started: "Checking the artifact",
  validation_failed: "Artifact needs repair",
  repair_started: "Repairing the artifact",
  composition_started: "Writing the preparation packet",
  artifact_completed: "Preparation packet ready",
  run_stopped: "Research run stopped",
  run_failed: "Research run failed safely",
  run_completed: "Research run finished",
};

const SAFE_DETAIL_KEYS = new Set([
  "availability",
  "chunk_id",
  "code",
  "error_count",
  "mode",
  "query",
  "result_count",
  "retrieval_status",
  "search_status",
  "source_count",
  "source_id",
]);

function detailText(event: Phase5ActivityEvent): string {
  if (!event.detail) return event.summary;
  const parts = Object.entries(event.detail)
    .filter(([key]) => SAFE_DETAIL_KEYS.has(key))
    .slice(0, 4)
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value).slice(0, 120)}`);
  return parts.length ? parts.join(" · ") : event.summary;
}

function kindFor(event: Phase5ActivityEvent): Phase6Activity["kind"] {
  if (event.type.startsWith("tool_")) return "tool";
  if (event.type.startsWith("validation") || event.type === "repair_started") return "validation";
  if (event.type === "composition_started") return "composition";
  if (event.type === "artifact_completed") return "artifact";
  return "run";
}

function statusFor(event: Phase5ActivityEvent): Phase6Activity["status"] {
  if (event.type === "run_stopped") return "stopped";
  if (event.type === "tool_failed") return "unavailable";
  if (event.type === "run_failed" || event.type === "validation_failed") return "failed";
  if (event.status === "partial") return "partial";
  if (event.status === "failed") return "failed";
  if (event.status === "running" || event.type.endsWith("_started")) return "running";
  return "complete";
}

export function projectActivity(event: Phase5ActivityEvent): Phase6Activity {
  return phase6ActivitySchema.parse({
    id: event.event_id,
    run_id: event.run_id,
    kind: kindFor(event),
    label: LABELS[event.type],
    detail: detailText(event).slice(0, 300),
    status: statusFor(event),
    tool: event.tool,
    created_at: event.created_at,
  });
}

export function projectArtifact(result: Phase5RunResult, revision: number): Phase6Artifact | null {
  if (!result.artifact) return null;
  return phase6ArtifactSchema.parse({ run_id: result.run_id, revision, artifact: result.artifact });
}

export function projectReceipt(result: Phase5RunResult, revision: number): Phase6Receipt {
  return phase6ReceiptSchema.parse({
    run_id: result.run_id,
    status: result.status,
    counts: result.counts,
    accounted_cost_usd: result.accounted_cost_usd,
    elapsed_ms: result.elapsed_ms,
    limitations: result.validation_errors.map((value) => value.slice(0, 240)),
    revision,
  });
}

function cite(ids: string[]): string {
  return ids.length ? ` ${ids.map((id) => `[${id}]`).join(" ")}` : "";
}

export function artifactToMarkdown(artifact: Phase5Artifact): string {
  const lines = [`# ${artifact.working_title}`, ""];
  if (artifact.mode === "headlines") {
    lines.push("## What happened", `${artifact.what_happened.text}${cite(artifact.what_happened.source_ids)}`, "");
    lines.push("## Why it matters now", `${artifact.why_it_matters_now.text}${cite(artifact.why_it_matters_now.source_ids)}`, "");
    lines.push("## The argument", `${artifact.tension_or_argument.text}${cite(artifact.tension_or_argument.source_ids)}`, "");
    lines.push("## Flexible outline");
    artifact.flexible_outline.forEach((beat) => lines.push(`- **${beat.priority.replaceAll("_", " ")}** — ${beat.text}${cite(beat.source_ids)}`));
  } else {
    lines.push("## Core question", artifact.core_question, "");
    lines.push("## Research brief", `${artifact.research_brief.text}${cite(artifact.research_brief.source_ids)}`, "");
    lines.push("## Research cards");
    artifact.research_cards.forEach((card) => lines.push(`- **${card.role.replaceAll("_", " ")}** — ${card.text}${cite(card.source_ids)}`));
    lines.push("", "## Modular outline");
    artifact.modular_outline.forEach((beat) => lines.push(`- **${beat.priority.replaceAll("_", " ")}** — ${beat.text}${cite(beat.source_ids)}`));
  }
  lines.push("", "## Conversation questions");
  artifact.conversation_questions.forEach((question) => lines.push(`- ${question}`));
  lines.push("", "## Open checks");
  artifact.uncertainties_and_open_checks.forEach((item) => lines.push(`- ${item}`));
  lines.push("", "## Sources");
  artifact.source_ledger.forEach((source) => {
    const destination = source.url ? ` — ${source.url}` : "";
    lines.push(`- **${source.source_id}** — ${source.title ?? source.source_type}${destination}`);
  });
  return `${lines.join("\n")}\n`;
}
