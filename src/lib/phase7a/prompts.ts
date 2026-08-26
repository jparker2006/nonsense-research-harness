import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Phase7AResearchDepth, Phase7AWorkspace } from "./contracts.ts";

const PROMPT_DIRECTORY = join(process.cwd(), "prompts", "phase7a");

function loadPromptFile(name: string): string {
  const prompt = readFileSync(join(PROMPT_DIRECTORY, name), "utf8").trim();
  if (!prompt) throw new Error(`phase7a_prompt_empty:${name}`);
  return prompt;
}

export type Phase7ACitationAliases = {
  aliasBySourceId: ReadonlyMap<string, string>;
  sourceIdByAlias: ReadonlyMap<string, string>;
};

export function phase7aCitationAliases(workspace: Phase7AWorkspace): Phase7ACitationAliases {
  const aliasBySourceId = new Map<string, string>();
  const sourceIdByAlias = new Map<string, string>();
  let citationNumber = 0;
  for (const source of workspace.evidence.slice(0, 16)) {
    if (!source.evidence_usable || aliasBySourceId.has(source.source_id)) continue;
    citationNumber += 1;
    const alias = `evidence_${citationNumber}`;
    aliasBySourceId.set(source.source_id, alias);
    sourceIdByAlias.set(alias, source.source_id);
  }
  return { aliasBySourceId, sourceIdByAlias };
}

export const PHASE_7A_SYSTEM_PROMPT = loadPromptFile("SYSTEM.md");

export const PHASE_7A_ARTIFACT_PROCEDURES = Object.freeze({
  headlines: loadPromptFile("HEADLINES_BRIEF.md"),
  big_story: loadPromptFile("BIG_STORY_BRIEF.md"),
});

export const PHASE_7A_DEEP_RESEARCH_INSTRUCTION = loadPromptFile("DEEP_RESEARCH.md");
const PHASE_7A_CONTROLLER_TEMPLATE = loadPromptFile("CONTROLLER.md");
const PHASE_7A_ARTIFACT_TEMPLATE = loadPromptFile("ARTIFACT.md");

export function phase7aArtifactInstructions(mode: "headlines" | "big_story"): string {
  return PHASE_7A_ARTIFACT_TEMPLATE.replace("{{MODE}}", mode);
}

type ControllerPromptValue =
  | "RESEARCH_DEPTH"
  | "CURRENT_MESSAGE"
  | "RECENT_CONVERSATION"
  | "EVIDENCE"
  | "WEB_CANDIDATES"
  | "TRANSCRIPT_MATCHES"
  | "CURRENT_ARTIFACT"
  | "RESEARCH_NOTEBOOK"
  | "LAST_OBSERVATION"
  | "REMAINING_LIMITS";

function renderControllerPrompt(values: Record<ControllerPromptValue, string>): string {
  return PHASE_7A_CONTROLLER_TEMPLATE.replace(/\{\{([A-Z_]+)\}\}/g, (_placeholder, key: string) => {
    if (!(key in values)) throw new Error(`phase7a_prompt_placeholder_unknown:${key}`);
    return values[key as ControllerPromptValue];
  });
}

function evidenceView(workspace: Phase7AWorkspace, aliases: Phase7ACitationAliases) {
  let remaining = 32_000;
  return workspace.evidence.map((source) => {
    const raw = source.content ?? source.excerpt ?? "";
    const evidence_text = raw.slice(0, Math.min(4_000, remaining));
    remaining -= evidence_text.length;
    return {
      citation_alias: aliases.aliasBySourceId.get(source.source_id) ?? null,
      source_type: source.source_type,
      availability: source.availability,
      evidence_usable: source.evidence_usable,
      title: source.title,
      url: source.url,
      episode_id: source.episode_id,
      segment_id: source.segment_id,
      chunk_id: source.chunk_id,
      evidence_text,
    };
  }).filter((_, index) => index < 16 && remaining >= 0);
}

function conversationView(workspace: Phase7AWorkspace, aliases: Phase7ACitationAliases) {
  return workspace.turns.slice(-12).map(({ source_ids, ...turn }) => ({
    ...turn,
    citation_aliases: source_ids.flatMap((sourceId) => aliases.aliasBySourceId.get(sourceId) ?? []),
  }));
}

function candidateView(workspace: Phase7AWorkspace) {
  return workspace.candidates.slice(-12).map((candidate) => ({
    url: candidate.url,
    title: candidate.title,
    excerpt: candidate.excerpt,
    query: candidate.query,
  }));
}

export function phase7aDecisionPrompt(options: {
  workspace: Phase7AWorkspace;
  currentMessage: string;
  researchDepth: Phase7AResearchDepth;
  remaining: Record<string, number>;
  lastObservation?: string;
}): string {
  const { workspace } = options;
  const aliases = phase7aCitationAliases(workspace);
  return renderControllerPrompt({
    RESEARCH_DEPTH: `${options.researchDepth}${options.researchDepth === "deep" ? `\n${PHASE_7A_DEEP_RESEARCH_INSTRUCTION}` : "\nStandard chat: use tools intelligently and stop as soon as the answer is sufficiently supported."}`,
    CURRENT_MESSAGE: options.currentMessage,
    RECENT_CONVERSATION: JSON.stringify(conversationView(workspace, aliases)),
    EVIDENCE: JSON.stringify(evidenceView(workspace, aliases)),
    WEB_CANDIDATES: JSON.stringify(candidateView(workspace)),
    TRANSCRIPT_MATCHES: JSON.stringify(workspace.transcript_matches.slice(-12)),
    CURRENT_ARTIFACT: JSON.stringify(workspace.artifact ? {
      mode: workspace.artifact.mode,
      working_title: workspace.artifact.working_title,
      revision: workspace.artifact_revision,
    } : null),
    RESEARCH_NOTEBOOK: JSON.stringify(workspace.research_state),
    LAST_OBSERVATION: options.lastObservation ?? "none",
    REMAINING_LIMITS: JSON.stringify(options.remaining),
  });
}
