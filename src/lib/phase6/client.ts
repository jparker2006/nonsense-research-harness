import type { UIMessage } from "ai";
import { z } from "zod";

export type Phase6Input = {
  mode: "headlines" | "big_story";
  topic: string;
  links: string[];
  notes: string;
  target_minutes?: number;
};

type SourcedText = { text: string; source_ids: string[] };
type OutlineBeat = { priority: "must_have" | "use_if_time" | "cut_first"; text: string; source_ids: string[]; estimated_minutes?: number };
type ArchiveCoverage = { status: "matches" | "no_relevant_archive_match"; items: Array<{ source_id: string; episode_id: string; segment_id: string; chunk_id: string; quote: string }> };
export type BrowserSource = {
  source_id: string;
  source_type: "provided_link" | "web" | "archive";
  availability: string;
  evidence_usable: boolean;
  title?: string | null;
  url?: string;
  excerpt?: string | null;
  season?: number;
  episode_number?: number;
};
type ArtifactBase = {
  working_title: string;
  past_nonsense_coverage: ArchiveCoverage;
  conversation_questions: string[];
  uncertainties_and_open_checks: string[];
  source_ledger: BrowserSource[];
};
export type BrowserArtifact = ArtifactBase & ({
  mode: "headlines";
  what_happened: SourcedText;
  why_it_matters_now: SourcedText;
  verified_facts: SourcedText[];
  tension_or_argument: SourcedText;
  surprising_details: SourcedText[];
  flexible_outline: OutlineBeat[];
} | {
  mode: "big_story";
  core_question: string;
  research_brief: SourcedText;
  research_cards: Array<SourcedText & { role: string }>;
  modular_outline: OutlineBeat[];
});

export type Phase6Activity = {
  id: string;
  run_id: string;
  kind: "run" | "tool" | "validation" | "composition" | "artifact";
  label: string;
  detail: string;
  status: "running" | "complete" | "partial" | "unavailable" | "stopped" | "failed";
  tool?: "web_search" | "read_url" | "search_transcripts" | "open_transcript_chunk";
  created_at: string;
};
export type Phase6Run = { session_id: string; run_id: string; state: "running" | "complete" | "partial" | "stopped" | "failed"; summary: string; mode: Phase6Input["mode"]; execution: "fixture" | "live" };
export type Phase6Receipt = { run_id: string; status: "complete" | "partial" | "stopped" | "failed"; counts: { luna_turns: number; grok_turns: number; web_searches: number; url_reads: number; transcript_searches: number; transcript_opens: number; repairs: number }; accounted_cost_usd: number; elapsed_ms: number; limitations: string[]; revision: number };
export type Phase6Error = { code: string; message: string; retryable: boolean };
export type Phase6Request =
  | { action: "start" | "retry"; session_id: string; input: Phase6Input }
  | { action: "follow_up"; session_id: string; instruction: string };

export const phase6ActivitySchema = z.custom<Phase6Activity>((value) => Boolean(value && typeof value === "object" && "id" in value && "status" in value));
export const phase6ArtifactSchema = z.object({ run_id: z.string(), revision: z.number(), artifact: z.custom<BrowserArtifact>() });
export const phase6RunSchema = z.custom<Phase6Run>((value) => Boolean(value && typeof value === "object" && "run_id" in value && "state" in value));
export const phase6ReceiptSchema = z.custom<Phase6Receipt>((value) => Boolean(value && typeof value === "object" && "counts" in value && "status" in value));
export const phase6ErrorSchema = z.custom<Phase6Error>((value) => Boolean(value && typeof value === "object" && "code" in value && "message" in value));

export type Phase6DataParts = { activity: Phase6Activity; artifact: { run_id: string; revision: number; artifact: BrowserArtifact }; run: Phase6Run; receipt: Phase6Receipt; error: Phase6Error };
export type Phase6UIMessage = UIMessage<unknown, Phase6DataParts>;

function cite(ids: string[]) { return ids.length ? ` ${ids.map((id) => `[${id}]`).join(" ")}` : ""; }
export function artifactToMarkdown(artifact: BrowserArtifact): string {
  const lines = [`# ${artifact.working_title}`, ""];
  if (artifact.mode === "headlines") {
    lines.push("## What happened", `${artifact.what_happened.text}${cite(artifact.what_happened.source_ids)}`, "", "## Why it matters now", `${artifact.why_it_matters_now.text}${cite(artifact.why_it_matters_now.source_ids)}`, "", "## The argument", `${artifact.tension_or_argument.text}${cite(artifact.tension_or_argument.source_ids)}`, "", "## Flexible outline");
    artifact.flexible_outline.forEach((beat) => lines.push(`- **${beat.priority.replaceAll("_", " ")}** — ${beat.text}${cite(beat.source_ids)}`));
  } else {
    lines.push("## Core question", artifact.core_question, "", "## Research brief", `${artifact.research_brief.text}${cite(artifact.research_brief.source_ids)}`, "", "## Research cards");
    artifact.research_cards.forEach((card) => lines.push(`- **${card.role.replaceAll("_", " ")}** — ${card.text}${cite(card.source_ids)}`));
    lines.push("", "## Modular outline");
    artifact.modular_outline.forEach((beat) => lines.push(`- **${beat.priority.replaceAll("_", " ")}** — ${beat.text}${cite(beat.source_ids)}`));
  }
  lines.push("", "## Conversation questions", ...artifact.conversation_questions.map((item) => `- ${item}`), "", "## Open checks", ...artifact.uncertainties_and_open_checks.map((item) => `- ${item}`), "", "## Sources");
  artifact.source_ledger.forEach((source) => lines.push(`- **${source.source_id}** — ${source.title ?? source.source_type}${source.url ? ` — ${source.url}` : ""}`));
  return `${lines.join("\n")}\n`;
}
