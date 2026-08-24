import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { artifactSourceSchema, type EvidenceSource, type Phase5Artifact, type Phase5Input, type ResearchPlan } from "./contracts.ts";
import { normalizePhase5LiveReport } from "./live-proof.ts";
import type { Phase5ModelResult } from "./model.ts";
import { TranscriptRetrievalService } from "../transcript-retrieval/search.ts";
import {
  canonicalizeArtifactSourceLedger,
  hydrateArtifactSourceLedger,
  validatePhase5Artifact,
} from "./validation.ts";

export const PHASE_5_1_COMPOSE_PROOF_LIMITS = Object.freeze({
  providerRequests: 1,
  costCapUsd: 0.2,
  retries: 0,
});

export const PHASE_5_LIVE_REPORT_SHA256 =
  "fb1ec9c4e59eea5aea98e0cc48668a1a90ea937103a923a386d40be695675fc4";

export type Phase51CompositionPacket = {
  source_run_id: string;
  packet_sha256: string;
  input: Phase5Input & { mode: "big_story" };
  plan: ResearchPlan;
  evidence: EvidenceSource[];
};

export type Phase51CompositionEvaluation = {
  status: "passed" | "failed";
  source_run_id: string;
  packet_sha256: string;
  provider_requests: 1;
  retries: 0;
  output_status: Phase5ModelResult<unknown>["output_status"];
  artifact: Phase5Artifact | null;
  validation_errors: string[];
  receipt: Phase5ModelResult<unknown>["receipt"];
  accounted_cost_usd: number;
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function safePacketHash(input: Phase5Input, plan: ResearchPlan, evidence: EvidenceSource[]): string {
  return sha256(JSON.stringify({ input, plan, evidence }));
}

export async function loadPhase51CompositionPacket(root = process.cwd()): Promise<Phase51CompositionPacket> {
  const reportBuffer = await readFile(resolve(root, "reports/phase-5-live.json"));
  if (sha256(reportBuffer) !== PHASE_5_LIVE_REPORT_SHA256) {
    throw new Error("phase5_1_live_report_drift");
  }
  const report = normalizePhase5LiveReport(JSON.parse(reportBuffer.toString("utf8")));
  const source = [...report.runs].reverse().find(
    (run) => run.case === "big_story" && run.attempt === "replacement",
  );
  if (!source?.result?.plan || source.result.input.mode !== "big_story") {
    throw new Error("phase5_1_source_run_unavailable");
  }

  const transcripts = new TranscriptRetrievalService({ root });
  const evidence = source.result.evidence.map((stored): EvidenceSource => {
    if (stored.source_type !== "archive") {
      return { ...stored, content: stored.excerpt ?? undefined };
    }
    if (!stored.chunk_id) throw new Error("phase5_1_archive_chunk_id_missing");
    const opened = transcripts.openTranscriptChunk(stored.chunk_id);
    if (opened.status !== "complete") throw new Error("phase5_1_archive_chunk_missing");
    const chunk = opened.chunk;
    const metadataMatches =
      stored.episode_id === chunk.episode_id &&
      stored.segment_id === chunk.segment_id &&
      stored.title === chunk.title &&
      stored.season === chunk.season &&
      stored.episode_number === chunk.episode_number &&
      stored.episode_format === chunk.episode_format &&
      stored.segment_role === chunk.segment_role;
    if (!metadataMatches || (stored.excerpt !== null && !chunk.text.includes(stored.excerpt))) {
      throw new Error("phase5_1_archive_evidence_drift");
    }
    return { ...stored, content: chunk.text.slice(0, 6_000) };
  });
  const input = { ...source.result.input, mode: "big_story" as const };
  const plan = source.result.plan;
  return {
    source_run_id: source.result.run_id,
    packet_sha256: safePacketHash(input, plan, evidence),
    input,
    plan,
    evidence,
  };
}

export function evaluatePhase51Composition(
  packet: Phase51CompositionPacket,
  modelResult: Phase5ModelResult<unknown>,
): Phase51CompositionEvaluation {
  const accounted = Number(
    (modelResult.receipt.cost_usd ?? PHASE_5_1_COMPOSE_PROOF_LIMITS.costCapUsd).toFixed(8),
  );
  const outputFailure = modelResult.output_status === "parsed"
    ? undefined
    : `phase5_model_${modelResult.output_status}_output`;
  const hydrated = outputFailure
    ? null
    : canonicalizeArtifactSourceLedger(
        hydrateArtifactSourceLedger(modelResult.value, packet.evidence),
        packet.evidence,
      );
  const validation = outputFailure
    ? { artifact: null, errors: [outputFailure] }
    : validatePhase5Artifact(packet.input, hydrated, packet.evidence);
  const errors = [...validation.errors];
  if (accounted > PHASE_5_1_COMPOSE_PROOF_LIMITS.costCapUsd + 1e-9) {
    errors.push("phase5_1_cost_cap_crossed");
  }
  const artifact = validation.artifact
    ? ({
        ...validation.artifact,
        source_ledger: validation.artifact.source_ledger.map((source) => artifactSourceSchema.parse(source)),
      } as Phase5Artifact)
    : null;
  return {
    status: artifact && errors.length === 0 ? "passed" : "failed",
    source_run_id: packet.source_run_id,
    packet_sha256: packet.packet_sha256,
    provider_requests: 1,
    retries: 0,
    output_status: modelResult.output_status,
    artifact,
    validation_errors: [...new Set(errors)],
    receipt: modelResult.receipt,
    accounted_cost_usd: accounted,
  };
}
