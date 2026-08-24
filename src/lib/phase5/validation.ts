import {
  artifactSourceSchema,
  bigStoryArtifactSchema,
  headlinesArtifactSchema,
  type EvidenceSource,
  type Phase5Artifact,
  type Phase5Input,
} from "./contracts.ts";

export function canonicalizeArtifactSourceLedger(
  artifactValue: unknown,
  evidence: EvidenceSource[],
): unknown {
  if (!artifactValue || typeof artifactValue !== "object" || Array.isArray(artifactValue)) return artifactValue;
  const artifact = artifactValue as Record<string, unknown>;
  if (!Array.isArray(artifact.source_ledger)) return artifactValue;
  const evidenceById = new Map(evidence.map((source) => [source.source_id, source]));
  const sourceLedger = artifact.source_ledger.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const sourceId = (value as Record<string, unknown>).source_id;
    if (typeof sourceId !== "string") return value;
    const source = evidenceById.get(sourceId);
    return source ? artifactSourceSchema.parse(source) : value;
  });
  return { ...artifact, source_ledger: sourceLedger };
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

export function hydrateArtifactSourceLedger(
  artifactValue: unknown,
  evidence: EvidenceSource[],
): unknown {
  if (!artifactValue || typeof artifactValue !== "object" || Array.isArray(artifactValue)) return artifactValue;
  const referenced = referencedSourceIds(artifactValue);
  const sourceLedger = evidence
    .filter((source) => referenced.has(source.source_id))
    .map((source) => artifactSourceSchema.parse(source));
  return { ...(artifactValue as Record<string, unknown>), source_ledger: sourceLedger };
}

function pathLabel(path: PropertyKey[]): string {
  return path.length ? path.map(String).join(".") : "artifact";
}

function collectSourcedFields(artifact: Phase5Artifact) {
  const shared = artifact.mode === "headlines"
    ? [
        artifact.what_happened,
        artifact.why_it_matters_now,
        ...artifact.verified_facts,
        artifact.tension_or_argument,
        ...artifact.surprising_details,
      ]
    : [
        artifact.research_brief,
        ...artifact.research_cards,
      ];
  const outline = artifact.mode === "headlines" ? artifact.flexible_outline : artifact.modular_outline;
  return { sourced: shared, outline };
}

function stringLeaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringLeaves);
  return [];
}

function generatedProseLeaves(artifact: Phase5Artifact): string[] {
  const archive = artifact.past_nonsense_coverage;
  const generated: Record<string, unknown> = { ...artifact };
  delete generated.source_ledger;
  delete generated.past_nonsense_coverage;
  return [
    ...stringLeaves(generated),
    ...stringLeaves({ status: archive.status }),
  ];
}

export function validatePhase5Artifact(
  input: Phase5Input,
  artifactValue: unknown,
  evidence: EvidenceSource[],
): { artifact: Phase5Artifact | null; errors: string[] } {
  const schema = input.mode === "headlines" ? headlinesArtifactSchema : bigStoryArtifactSchema;
  const parsed = schema.safeParse(artifactValue);
  if (!parsed.success) {
    return {
      artifact: null,
      errors: parsed.error.issues.map(
        (issue) => `schema:${pathLabel(issue.path)}:${issue.message}`,
      ),
    };
  }

  const artifact = parsed.data as Phase5Artifact;
  const errors: string[] = [];
  const evidenceById = new Map(evidence.map((source) => [source.source_id, source]));
  const ledgerById = new Map(artifact.source_ledger.map((source) => [source.source_id, source]));
  if (ledgerById.size !== artifact.source_ledger.length) errors.push("ledger:duplicate_source_id");
  if (artifact.mode === "big_story") {
    if (!artifact.research_cards.some((card) => card.role === "key_evidence")) {
      errors.push("big_story:missing_key_evidence");
    }
    if (!artifact.research_cards.some((card) => card.role === "interpretation")) {
      errors.push("big_story:missing_interpretation");
    }
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

  const { sourced, outline } = collectSourcedFields(artifact);
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

  const archive = artifact.past_nonsense_coverage;
  if (archive.status === "matches" && archive.items.length === 0) {
    errors.push("archive:matches_requires_item");
  }
  if (archive.status === "no_relevant_archive_match" && archive.items.length > 0) {
    errors.push("archive:no_match_requires_empty_items");
  }
  for (const item of archive.items) {
    const source = evidenceById.get(item.source_id);
    if (!source || source.source_type !== "archive") {
      errors.push(`archive:unknown_source:${item.source_id}`);
      continue;
    }
    if (
      source.episode_id !== item.episode_id ||
      source.segment_id !== item.segment_id ||
      source.chunk_id !== item.chunk_id
    ) {
      errors.push(`archive:id_mismatch:${item.source_id}`);
    }
    if (!source.content?.includes(item.quote)) errors.push(`archive:quote_not_exact:${item.source_id}`);
    if (!ledgerById.has(item.source_id)) errors.push(`archive:not_in_ledger:${item.source_id}`);
  }

  const estimates = outline.map((beat) => beat.estimated_minutes);
  if (input.target_minutes === undefined && estimates.some((value) => value !== undefined)) {
    errors.push("clock:estimates_without_target");
  }
  if (input.target_minutes !== undefined) {
    if (estimates.some((value) => value === undefined)) errors.push("clock:missing_estimates");
    const total = estimates.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    if (total > input.target_minutes + 0.001) errors.push("clock:estimated_total_exceeds_target");
  }
  if (!outline.some((beat) => beat.priority === "must_have")) errors.push("clock:missing_must_have");
  if (!outline.some((beat) => beat.priority === "cut_first")) errors.push("clock:missing_cut_first");

  const unsafeAttribution =
    /\b(?:CJ|Jeff)\s*(?::|said\b|says\b|thinks\b|believes\b|argues\b|would\b|will\b|might\b|probably\b|jokes?\b|asks?\b|responds?\b|replies?\b)/i;
  if (generatedProseLeaves(artifact).some((value) => unsafeAttribution.test(value))) {
    errors.push("safety:invented_host_voice_or_attribution");
  }

  return { artifact, errors: [...new Set(errors)] };
}
