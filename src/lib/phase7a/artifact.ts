import { z } from "zod";
import {
  archiveReferenceSchema,
  artifactSourceSchema,
  bigStoryResearchCardSchema,
  sourcedTextSchema,
  type EvidenceSource,
} from "../phase5/contracts.ts";

export const editorialPrioritySchema = z.enum([
  "essential",
  "strong",
  "optional",
]);

export const phase7aOutlineBeatSchema = z.object({
  priority: editorialPrioritySchema,
  text: z.string().trim().min(1).max(2_000),
  source_ids: z.array(z.string()).max(8),
}).strict();

const sharedArtifact = {
  working_title: z.string().trim().min(1).max(300),
  past_nonsense_coverage: z.object({
    status: z.enum(["matches", "no_relevant_archive_match"]),
    items: z.array(archiveReferenceSchema).max(6),
  }).strict(),
  conversation_questions: z.array(z.string().trim().min(1).max(1_000)).min(2).max(12),
  uncertainties_and_open_checks: z.array(z.string().trim().min(1).max(1_000)).max(12),
  source_ledger: z.array(artifactSourceSchema).max(24),
};

export const phase7aHeadlinesArtifactSchema = z.object({
  mode: z.literal("headlines"),
  ...sharedArtifact,
  what_happened: sourcedTextSchema,
  why_it_matters_now: sourcedTextSchema,
  verified_facts: z.array(sourcedTextSchema).min(1).max(12),
  tension_or_argument: sourcedTextSchema,
  surprising_details: z.array(sourcedTextSchema).max(10),
  flexible_outline: z.array(phase7aOutlineBeatSchema).min(3).max(12),
}).strict();

export const phase7aBigStoryArtifactSchema = z.object({
  mode: z.literal("big_story"),
  working_title: z.string().trim().min(1).max(200),
  core_question: z.string().trim().min(1).max(500),
  research_brief: z.object({
    text: z.string().trim().min(1).max(1_200),
    source_ids: z.array(z.string()).min(1).max(8),
  }).strict(),
  research_cards: z.array(bigStoryResearchCardSchema).min(4).max(10),
  past_nonsense_coverage: z.object({
    status: z.enum(["matches", "no_relevant_archive_match"]),
    items: z.array(archiveReferenceSchema.extend({ quote: z.string().trim().min(1).max(1_200) })).max(6),
  }).strict(),
  conversation_questions: z.array(z.string().trim().min(1).max(500)).min(2).max(8),
  modular_outline: z.array(phase7aOutlineBeatSchema.extend({ text: z.string().trim().min(1).max(800) })).min(4).max(10),
  uncertainties_and_open_checks: z.array(z.string().trim().min(1).max(500)).max(8),
  source_ledger: z.array(artifactSourceSchema).max(24),
}).strict();

// The model selects an opened archive source and copies an exact quote. Stable
// corpus provenance is server-owned; making the model repeat three machine IDs
// adds no editorial value and creates an avoidable failure mode.
const generatedArchiveReferenceSchema = archiveReferenceSchema.pick({
  source_id: true,
  quote: true,
});

const generatedArchiveCoverageSchema = z.object({
  status: z.enum(["matches", "no_relevant_archive_match"]),
  items: z.array(generatedArchiveReferenceSchema).max(6),
}).strict();

export const phase7aHeadlinesGeneratedArtifactSchema = phase7aHeadlinesArtifactSchema
  .omit({ source_ledger: true, past_nonsense_coverage: true })
  .extend({ past_nonsense_coverage: generatedArchiveCoverageSchema });
export const phase7aBigStoryGeneratedArtifactSchema = phase7aBigStoryArtifactSchema
  .omit({ source_ledger: true, past_nonsense_coverage: true })
  .extend({ past_nonsense_coverage: generatedArchiveCoverageSchema });
export const phase7aGeneratedArtifactSchema = z.discriminatedUnion("mode", [
  phase7aHeadlinesGeneratedArtifactSchema,
  phase7aBigStoryGeneratedArtifactSchema,
]);

export const phase7aArtifactSchema = z.discriminatedUnion("mode", [
  phase7aHeadlinesArtifactSchema,
  phase7aBigStoryArtifactSchema,
]);

export type Phase7AArtifact = z.infer<typeof phase7aArtifactSchema>;

export function phase7aArtifactFromLegacyFixture(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const artifact = value as Record<string, unknown>;
  const outlineKey = artifact.mode === "big_story" ? "modular_outline" : "flexible_outline";
  const rawOutline = artifact[outlineKey];
  if (!Array.isArray(rawOutline)) return value;
  let flexibleIndex = 0;
  const outline = rawOutline.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const beat = item as Record<string, unknown>;
    let priority: z.infer<typeof editorialPrioritySchema>;
    if (beat.priority === "must_have" || beat.priority === "must_cover") priority = "essential";
    else if (beat.priority === "strong_material") priority = "strong";
    else if (beat.priority === "cut_first") priority = "optional";
    else priority = flexibleIndex++ === 0 ? "strong" : "optional";
    const { estimated_minutes: _estimatedMinutes, ...withoutTiming } = beat;
    void _estimatedMinutes;
    return { ...withoutTiming, priority };
  });
  return { ...artifact, [outlineKey]: outline };
}

function referencedSourceIds(value: unknown, ids = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) referencedSourceIds(item, ids);
    return ids;
  }
  if (!value || typeof value !== "object") return ids;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "source_ids" && Array.isArray(child)) {
      for (const sourceId of child) if (typeof sourceId === "string") ids.add(sourceId);
    } else if (key === "source_id" && typeof child === "string") {
      ids.add(child);
    } else if (key !== "source_ledger") {
      referencedSourceIds(child, ids);
    }
  }
  return ids;
}

export function hydratePhase7AArtifactSourceLedger(value: unknown, evidence: EvidenceSource[]): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const artifact = value as Record<string, unknown>;
  const archive = artifact.past_nonsense_coverage;
  const hydratedArchive = archive && typeof archive === "object" && !Array.isArray(archive)
    ? {
        ...(archive as Record<string, unknown>),
        items: Array.isArray((archive as Record<string, unknown>).items)
          ? ((archive as Record<string, unknown>).items as unknown[]).map((item) => {
              if (!item || typeof item !== "object" || Array.isArray(item)) return item;
              const reference = item as Record<string, unknown>;
              const source = typeof reference.source_id === "string"
                ? evidence.find((candidate) => candidate.source_id === reference.source_id && candidate.source_type === "archive")
                : undefined;
              if (!source) return item;
              return {
                ...reference,
                episode_id: source.episode_id,
                segment_id: source.segment_id,
                chunk_id: source.chunk_id,
              };
            })
          : (archive as Record<string, unknown>).items,
      }
    : archive;
  const hydrated = { ...artifact, past_nonsense_coverage: hydratedArchive };
  const referenced = referencedSourceIds(hydrated);
  return {
    ...hydrated,
    source_ledger: evidence
      .filter((source) => referenced.has(source.source_id))
      .map((source) => artifactSourceSchema.parse(source)),
  };
}

function pathLabel(path: PropertyKey[]): string {
  return path.length ? path.map(String).join(".") : "artifact";
}

function stringLeaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringLeaves);
  return [];
}

function generatedProseLeaves(artifact: Phase7AArtifact): string[] {
  const generated: Record<string, unknown> = { ...artifact };
  delete generated.source_ledger;
  delete generated.past_nonsense_coverage;
  return [
    ...stringLeaves(generated),
    ...stringLeaves({ status: artifact.past_nonsense_coverage.status }),
  ];
}

export function validatePhase7AArtifact(
  mode: "headlines" | "big_story",
  artifactValue: unknown,
  evidence: EvidenceSource[],
): { artifact: Phase7AArtifact | null; errors: string[] } {
  const schema = mode === "headlines" ? phase7aHeadlinesArtifactSchema : phase7aBigStoryArtifactSchema;
  const parsed = schema.safeParse(artifactValue);
  if (!parsed.success) {
    return {
      artifact: null,
      errors: parsed.error.issues.map((issue) => `schema:${pathLabel(issue.path)}:${issue.message}`),
    };
  }

  const artifact = parsed.data as Phase7AArtifact;
  const errors: string[] = [];
  const evidenceById = new Map(evidence.map((source) => [source.source_id, source]));
  const ledgerById = new Map(artifact.source_ledger.map((source) => [source.source_id, source]));
  if (ledgerById.size !== artifact.source_ledger.length) errors.push("ledger:duplicate_source_id");

  if (artifact.mode === "big_story") {
    if (!artifact.research_cards.some((card) => card.role === "key_evidence")) errors.push("big_story:missing_key_evidence");
    if (!artifact.research_cards.some((card) => card.role === "interpretation")) errors.push("big_story:missing_interpretation");
  }

  for (const ledger of artifact.source_ledger) {
    const source = evidenceById.get(ledger.source_id);
    if (!source) {
      errors.push(`ledger:invented_source:${ledger.source_id}`);
      continue;
    }
    for (const field of [
      "source_type",
      "availability",
      "evidence_usable",
      "title",
      "url",
      "retrieved_at",
      "excerpt",
      "episode_id",
      "segment_id",
      "chunk_id",
      "season",
      "episode_number",
      "episode_format",
      "segment_role",
      "failure_code",
    ] as const) {
      if (ledger[field] !== source[field]) errors.push(`ledger:mismatch:${ledger.source_id}:${field}`);
    }
  }

  const sourced = artifact.mode === "headlines"
    ? [
        artifact.what_happened,
        artifact.why_it_matters_now,
        ...artifact.verified_facts,
        artifact.tension_or_argument,
        ...artifact.surprising_details,
      ]
    : [artifact.research_brief, ...artifact.research_cards];
  const outline = artifact.mode === "headlines" ? artifact.flexible_outline : artifact.modular_outline;

  for (const field of sourced) {
    for (const sourceId of field.source_ids) {
      const source = evidenceById.get(sourceId);
      if (!ledgerById.has(sourceId)) errors.push(`citation:not_in_ledger:${sourceId}`);
      if (!source) errors.push(`citation:unknown_source:${sourceId}`);
      else if (!source.evidence_usable || !["complete", "partial"].includes(source.availability)) {
        errors.push(`citation:unusable_source:${sourceId}`);
      }
    }
  }

  for (const beat of outline) {
    for (const sourceId of beat.source_ids) {
      const source = evidenceById.get(sourceId);
      if (!ledgerById.has(sourceId)) errors.push(`outline:not_in_ledger:${sourceId}`);
      if (!source) errors.push(`outline:unknown_source:${sourceId}`);
      else if (!source.evidence_usable) errors.push(`outline:unusable_source:${sourceId}`);
    }
  }
  if (!outline.some((beat) => beat.priority === "essential")) errors.push("priority:missing_essential");
  if (!outline.some((beat) => beat.priority === "strong")) errors.push("priority:missing_strong");
  if (!outline.some((beat) => beat.priority === "optional")) errors.push("priority:missing_optional");

  const archive = artifact.past_nonsense_coverage;
  if (archive.status === "matches" && archive.items.length === 0) errors.push("archive:matches_requires_item");
  if (archive.status === "no_relevant_archive_match" && archive.items.length > 0) errors.push("archive:no_match_requires_empty_items");
  for (const item of archive.items) {
    const source = evidenceById.get(item.source_id);
    if (!source || source.source_type !== "archive") {
      errors.push(`archive:unknown_source:${item.source_id}`);
      continue;
    }
    if (source.episode_id !== item.episode_id || source.segment_id !== item.segment_id || source.chunk_id !== item.chunk_id) {
      errors.push(`archive:id_mismatch:${item.source_id}`);
    }
    if (!source.content?.includes(item.quote)) errors.push(`archive:quote_not_exact:${item.source_id}`);
    if (!ledgerById.has(item.source_id)) errors.push(`archive:not_in_ledger:${item.source_id}`);
  }

  const unsafeAttribution =
    /\b(?:CJ|Jeff)\s*(?::|said\b|says\b|thinks\b|believes\b|argues\b|would\b|will\b|might\b|probably\b|jokes?\b|asks?\b|responds?\b|replies?\b)/i;
  if (generatedProseLeaves(artifact).some((value) => unsafeAttribution.test(value))) {
    errors.push("safety:invented_host_voice_or_attribution");
  }

  return { artifact, errors: [...new Set(errors)] };
}
