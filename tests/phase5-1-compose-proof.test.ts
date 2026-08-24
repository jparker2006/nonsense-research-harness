import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PHASE_5_1_COMPOSE_PROOF_LIMITS,
  evaluatePhase51Composition,
  loadPhase51CompositionPacket,
} from "../src/lib/phase5/compose-proof.ts";
import type { Phase5ModelOutputStatus, Phase5ModelResult } from "../src/lib/phase5/model.ts";
import { validArtifact } from "./phase5-fixtures.ts";

const root = process.cwd();

function modelResult(
  value: unknown,
  outputStatus: Phase5ModelOutputStatus = "parsed",
  cost = 0.08,
): Phase5ModelResult<unknown> {
  return {
    value,
    output_status: outputStatus,
    receipt: {
      model: "x-ai/grok-4.6",
      provider: "xAI",
      prompt_tokens: 5_000,
      completion_tokens: 6_000,
      total_tokens: 11_000,
      cost_usd: cost,
      latency_ms: 80_000,
      generation_id: "gen_phase5_1_fixture",
      finish_reason: outputStatus === "truncated" ? "length" : "stop",
      response_characters: outputStatus === "parsed" ? 12_000 : 100,
      output_status: outputStatus,
      reasoning_tokens: 2_000,
    },
  };
}

describe("Phase 5.1 frozen composition-only proof", () => {
  it("rebuilds the immutable five-source packet locally with exact archive content", async () => {
    const packet = await loadPhase51CompositionPacket(root);
    expect(packet).toMatchObject({
      source_run_id: "run_e8bba85f-2b4b-42ef-9d02-5b917a6cfdbc",
      packet_sha256: "ca1049a6e4b0b733564775b384757c005e53543385bbc77074b70898e91d8798",
      input: { mode: "big_story" },
    });
    expect(packet.evidence).toHaveLength(5);
    expect(packet.evidence.filter((source) => source.source_type === "archive")).toHaveLength(4);
    expect(packet.evidence.every((source) => typeof source.content === "string" && source.content.length > 0)).toBe(true);
  });

  it("hydrates and validates a compact model draft without a model-supplied ledger", async () => {
    const packet = await loadPhase51CompositionPacket(root);
    const draft = structuredClone(validArtifact(packet.input, packet.evidence));
    delete (draft as Partial<typeof draft>).source_ledger;
    const evaluation = evaluatePhase51Composition(packet, modelResult(draft));
    expect(evaluation).toMatchObject({
      status: "passed",
      provider_requests: 1,
      retries: 0,
      output_status: "parsed",
      validation_errors: [],
      accounted_cost_usd: 0.08,
      artifact: { mode: "big_story" },
    });
    expect(evaluation.artifact?.source_ledger.length).toBeGreaterThan(0);
  });

  it("fails closed on non-parseable output or a receipt over the proof cap", async () => {
    const packet = await loadPhase51CompositionPacket(root);
    const truncated = evaluatePhase51Composition(packet, modelResult(null, "truncated"));
    expect(truncated).toMatchObject({
      status: "failed",
      artifact: null,
      validation_errors: ["phase5_model_truncated_output"],
    });

    const draft = structuredClone(validArtifact(packet.input, packet.evidence));
    delete (draft as Partial<typeof draft>).source_ledger;
    const expensive = evaluatePhase51Composition(
      packet,
      modelResult(draft, "parsed", PHASE_5_1_COMPOSE_PROOF_LIMITS.costCapUsd + 0.01),
    );
    expect(expensive).toMatchObject({
      status: "failed",
      validation_errors: ["phase5_1_cost_cap_crossed"],
    });
  });

  it("keeps the one-shot launcher statically locked and absent from normal gates", async () => {
    const runner = await readFile(resolve(root, "scripts/run-phase5-1-compose-proof.ts"), "utf8");
    const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
    expect(runner).toContain("export const PHASE_5_1_COMPOSE_PROOF_DISABLED = true;");
    expect(runner).toContain("provider_requests: 1");
    expect(runner).not.toMatch(/while\s*\(|for\s*\(/i);
    expect(packageJson.scripts["phase5.1:compose-proof"]).toContain("run-phase5-1-compose-proof.ts");
    expect(packageJson.scripts.gate).not.toContain("phase5.1:compose-proof");
  });
});
