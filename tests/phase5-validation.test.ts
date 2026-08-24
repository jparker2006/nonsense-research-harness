import { describe, expect, it } from "vitest";
import type { EvidenceSource, Phase5Input } from "../src/lib/phase5/contracts.ts";
import {
  canonicalizeArtifactSourceLedger,
  hydrateArtifactSourceLedger,
  validatePhase5Artifact,
} from "../src/lib/phase5/validation.ts";
import {
  FIXTURE_ARCHIVE_SOURCE_ID,
  FIXTURE_CHUNK_ID,
  FIXTURE_WEB_SOURCE_ID,
  fixtureChunk,
  validArtifact,
} from "./phase5-fixtures.ts";

const input: Phase5Input = {
  mode: "headlines",
  topic: "Old systems",
  links: [],
  notes: "",
  target_minutes: 6,
};

const evidence: EvidenceSource[] = [
  {
    source_id: FIXTURE_WEB_SOURCE_ID,
    source_type: "web",
    availability: "complete",
    evidence_usable: true,
    title: "Current source",
    url: "https://example.com/current-story",
    retrieved_at: "2026-08-24T08:00:00.000Z",
    excerpt: "Current evidence.",
    content: "Current evidence with enough context for the fixture.",
  },
  {
    source_id: FIXTURE_ARCHIVE_SOURCE_ID,
    source_type: "archive",
    availability: "complete",
    evidence_usable: true,
    title: fixtureChunk.title,
    excerpt: fixtureChunk.text,
    content: fixtureChunk.text,
    episode_id: fixtureChunk.episode_id,
    segment_id: fixtureChunk.segment_id,
    chunk_id: FIXTURE_CHUNK_ID,
    season: fixtureChunk.season,
    episode_number: fixtureChunk.episode_number,
    episode_format: fixtureChunk.episode_format,
    segment_role: fixtureChunk.segment_role,
  },
];

describe("Phase 5 deterministic artifact validation", () => {
  it("accepts a fully resolvable fixture", () => {
    const result = validatePhase5Artifact(input, validArtifact(input, evidence), evidence);
    expect(result.errors).toEqual([]);
    expect(result.artifact?.mode).toBe("headlines");
  });

  it("rejects invented source IDs and sources missing from the ledger", () => {
    const artifact = validArtifact(input, evidence);
    if (artifact.mode !== "headlines") throw new Error("fixture mode mismatch");
    artifact.what_happened.source_ids = ["made_up"];
    const result = validatePhase5Artifact(input, artifact, evidence);
    expect(result.errors).toEqual(
      expect.arrayContaining(["citation:not_in_ledger:made_up", "citation:unknown_source:made_up"]),
    );
  });

  it("rejects unavailable evidence even when its ID exists", () => {
    const unavailable = evidence.map((source) =>
      source.source_id === FIXTURE_WEB_SOURCE_ID
        ? { ...source, availability: "unavailable" as const, evidence_usable: false }
        : source,
    );
    const artifact = validArtifact(input, evidence);
    const result = validatePhase5Artifact(input, artifact, unavailable);
    expect(result.errors).toContain(`citation:unusable_source:${FIXTURE_WEB_SOURCE_ID}`);
  });

  it("rejects invented archive IDs and non-exact quotes", () => {
    const artifact = validArtifact(input, evidence);
    artifact.past_nonsense_coverage.items[0]!.segment_id = "invented_segment";
    artifact.past_nonsense_coverage.items[0]!.quote = "This quote never appeared.";
    const result = validatePhase5Artifact(input, artifact, evidence);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        `archive:id_mismatch:${FIXTURE_ARCHIVE_SOURCE_ID}`,
        `archive:quote_not_exact:${FIXTURE_ARCHIVE_SOURCE_ID}`,
      ]),
    );
  });

  it("rejects mutated archive metadata in the source ledger", () => {
    const artifact = validArtifact(input, evidence);
    const archive = artifact.source_ledger.find((source) => source.source_id === FIXTURE_ARCHIVE_SOURCE_ID)!;
    archive.season = 99;
    archive.episode_format = "invented_format";
    const result = validatePhase5Artifact(input, artifact, evidence);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        `ledger:mismatch:${FIXTURE_ARCHIVE_SOURCE_ID}:season`,
        `ledger:mismatch:${FIXTURE_ARCHIVE_SOURCE_ID}:episode_format`,
      ]),
    );
  });

  it("canonicalizes machine-owned ledger metadata without blessing invented source IDs", () => {
    const artifact = validArtifact(input, evidence);
    artifact.source_ledger[0]!.retrieved_at = "invented timestamp";
    artifact.source_ledger[0]!.excerpt = "model paraphrase";
    artifact.source_ledger.push({
      source_id: "invented_source",
      source_type: "web",
      availability: "complete",
      evidence_usable: true,
      title: "Invented",
      excerpt: "Invented",
    });
    const canonical = canonicalizeArtifactSourceLedger(artifact, evidence);
    const result = validatePhase5Artifact(input, canonical, evidence);
    expect(result.errors).not.toContain(`ledger:mismatch:${FIXTURE_WEB_SOURCE_ID}:retrieved_at`);
    expect(result.errors).not.toContain(`ledger:mismatch:${FIXTURE_WEB_SOURCE_ID}:excerpt`);
    expect(result.errors).toContain("ledger:invented_source:invented_source");
  });

  it("hydrates only cited evidence into the machine-owned ledger", () => {
    const artifact = validArtifact(input, evidence);
    const draft = structuredClone(artifact);
    delete (draft as Partial<typeof artifact>).source_ledger;
    const hydrated = hydrateArtifactSourceLedger(draft, [
      ...evidence,
      {
        ...evidence[0]!,
        source_id: "web_uncited",
        url: "https://example.com/uncited",
      },
    ]);
    const result = validatePhase5Artifact(input, hydrated, evidence);
    expect(result.errors).toEqual([]);
    expect(result.artifact?.source_ledger.map((source) => source.source_id)).toEqual([
      FIXTURE_WEB_SOURCE_ID,
      FIXTURE_ARCHIVE_SOURCE_ID,
    ]);
  });

  it("requires key evidence and an interpretation in a compact Big Story", () => {
    const bigInput: Phase5Input = { ...input, mode: "big_story", target_minutes: 24 };
    const artifact = validArtifact(bigInput, evidence);
    if (artifact.mode !== "big_story") throw new Error("fixture mode mismatch");
    artifact.research_cards = artifact.research_cards.map((card) => ({ ...card, role: "background" }));
    const result = validatePhase5Artifact(bigInput, artifact, evidence);
    expect(result.errors).toEqual(
      expect.arrayContaining(["big_story:missing_key_evidence", "big_story:missing_interpretation"]),
    );
  });

  it("rejects fabricated host dialogue or speaker attribution", () => {
    const artifact = validArtifact(input, evidence);
    artifact.conversation_questions[0] = "CJ said this was obviously a bad idea.";
    const result = validatePhase5Artifact(input, artifact, evidence);
    expect(result.errors).toContain("safety:invented_host_voice_or_attribution");
  });

  it("rejects hypothetical host voice but does not scan verbatim evidence metadata as generated prose", () => {
    const artifact = validArtifact(input, evidence);
    artifact.conversation_questions[0] = "Jeff would probably say this is a terrible idea.";
    expect(validatePhase5Artifact(input, artifact, evidence).errors).toContain(
      "safety:invented_host_voice_or_attribution",
    );
    artifact.conversation_questions[0] = "What makes this a terrible idea?";
    artifact.source_ledger[0]!.title = "CJ says this source title is verbatim";
    const matchingEvidence = evidence.map((source, index) =>
      index === 0 ? { ...source, title: "CJ says this source title is verbatim" } : source,
    );
    expect(validatePhase5Artifact(input, artifact, matchingEvidence).errors).not.toContain(
      "safety:invented_host_voice_or_attribution",
    );
  });

  it("enforces clock estimates only when a target exists and inside that target", () => {
    const artifact = validArtifact(input, evidence);
    if (artifact.mode !== "headlines") throw new Error("fixture mode mismatch");
    artifact.flexible_outline[0]!.estimated_minutes = 10;
    expect(validatePhase5Artifact(input, artifact, evidence).errors).toContain(
      "clock:estimated_total_exceeds_target",
    );
    const untimedInput = { ...input, target_minutes: undefined };
    expect(validatePhase5Artifact(untimedInput, artifact, evidence).errors).toContain(
      "clock:estimates_without_target",
    );
  });
});
