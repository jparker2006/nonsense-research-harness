import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  authorizePhase5LiveCase,
  normalizePhase5LiveReport,
  phase5LiveResultPasses,
} from "../src/lib/phase5/live-proof.ts";
import { loadPhase51CompositionPacket } from "../src/lib/phase5/compose-proof.ts";
import { createOpenRouterPhase5Model } from "../src/lib/phase5/model.ts";
import type { Phase5Input } from "../src/lib/phase5/contracts.ts";
import { validatePhase5Artifact } from "../src/lib/phase5/validation.ts";

const root = process.cwd();

describe("Phase 5 immutable final evidence", () => {
  it("preserves the historical attempts and independently validates the passing Phase 5.1 proof", async () => {
    const report = normalizePhase5LiveReport(
      JSON.parse(await readFile(resolve(root, "reports/phase-5-live.json"), "utf8")),
    );
    expect(report).toMatchObject({
      status: "failed",
      limits: { maximum_cases: 4, per_run_cost_cap_usd: 0.5, total_cost_cap_usd: 1.3, retries: 0 },
      usage: { completed_cases: 4, accounted_cost_usd: 0.83080686 },
    });
    expect(report.runs.map((run) => [run.case, run.attempt, run.gate_status])).toEqual([
      ["headlines", "original", "failed"],
      ["headlines", "replacement", "failed"],
      ["big_story", "original", "failed"],
      ["big_story", "replacement", "failed"],
    ]);
    expect(report.runs[0]?.result).toMatchObject({
      status: "failed",
      validation_errors: ["phase5_model_timeout"],
      accounted_cost_usd: 0.2522195,
    });
    expect(report.runs[1]?.result).toMatchObject({
      status: "partial",
      repair_attempted: true,
      accounted_cost_usd: 0.25720412,
    });
    expect(report.runs[2]?.result).toMatchObject({
      status: "failed",
      plan: null,
      artifact: null,
      validation_errors: ["phase5_planner_failed"],
      accounted_cost_usd: 0.02,
    });
    expect(report.runs[3]?.result).toMatchObject({
      run_id: "run_e8bba85f-2b4b-42ef-9d02-5b917a6cfdbc",
      status: "failed",
      artifact: null,
      validation_errors: [
        "schema:artifact:Invalid input: expected object, received null",
        "phase5_model_unavailable",
      ],
      counts: {
        luna_turns: 1,
        grok_turns: 2,
        web_searches: 1,
        url_reads: 1,
        transcript_searches: 2,
        transcript_opens: 4,
        repairs: 1,
      },
      repair_attempted: true,
      elapsed_ms: 149527.51,
      accounted_cost_usd: 0.30138324,
    });
    expect(report.recoveries).toHaveLength(1);
    expect(report.recoveries[0]).toMatchObject({
      kind: "canonical_source_ledger",
      provider_requests: 0,
      original_gate_status: "failed",
      gate_status: "passed",
      recovered_result: { status: "complete", validation_errors: [], artifact: { mode: "headlines" } },
    });
    expect(phase5LiveResultPasses(report.recoveries[0]!.recovered_result)).toBe(true);
    expect(report.runs[3]?.result?.evidence.filter((source) => source.evidence_usable)).toHaveLength(5);
    expect(authorizePhase5LiveCase(report, "headlines")).toEqual({
      allowed: false,
      reason: "phase5_live_attempt_cap_exhausted",
    });
    expect(authorizePhase5LiveCase(report, "big_story")).toEqual({
      allowed: false,
      reason: "phase5_live_attempt_cap_exhausted",
    });

    const proof = JSON.parse(
      await readFile(resolve(root, "reports/phase-5-1-compose-proof.json"), "utf8"),
    );
    const packet = await loadPhase51CompositionPacket(root);
    expect(proof).toMatchObject({
      phase: "5.1",
      kind: "composition_only",
      status: "passed",
      source_run_id: packet.source_run_id,
      packet_sha256: packet.packet_sha256,
      provider_requests: 1,
      retries: 0,
      output_status: "parsed",
      validation_errors: [],
      accounted_cost_usd: 0.047494,
      receipt: {
        model: "x-ai/grok-4.6",
        provider: "xAI",
        cost_usd: 0.047494,
        finish_reason: "stop",
        output_status: "parsed",
      },
      artifact: {
        mode: "big_story",
        research_cards: expect.any(Array),
        modular_outline: expect.any(Array),
        source_ledger: expect.any(Array),
      },
    });
    expect(proof.artifact.research_cards).toHaveLength(6);
    expect(proof.artifact.past_nonsense_coverage.items).toHaveLength(4);
    expect(proof.artifact.modular_outline).toHaveLength(7);
    expect(proof.artifact.modular_outline.reduce(
      (total: number, beat: { estimated_minutes?: number }) => total + (beat.estimated_minutes ?? 0),
      0,
    )).toBe(28);
    expect(proof.artifact.source_ledger).toHaveLength(5);
    expect(validatePhase5Artifact(packet.input, proof.artifact, packet.evidence)).toMatchObject({
      artifact: { mode: "big_story" },
      errors: [],
    });
  });

  it("locks production model calls and all one-shot scripts after evidence capture", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const input: Phase5Input = {
      mode: "headlines",
      topic: "Locked evidence check",
      links: [],
      notes: "",
    };
    await expect(
      createOpenRouterPhase5Model({ apiKey: "synthetic", liveAuthorized: true }).plan(input),
    ).rejects.toThrow("phase5_live_not_authorized");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    const model = await readFile(resolve(root, "src/lib/phase5/model.ts"), "utf8");
    const runner = await readFile(resolve(root, "scripts/run-phase5-live.ts"), "utf8");
    const recovery = await readFile(resolve(root, "scripts/recover-phase5-headlines.ts"), "utf8");
    const compositionProof = await readFile(resolve(root, "scripts/run-phase5-1-compose-proof.ts"), "utf8");
    expect(model).toContain("export const PHASE_5_LIVE_CALLS_DISABLED = true;");
    expect(runner).toContain("export const PHASE_5_LIVE_RUNNER_DISABLED = true;");
    expect(recovery).toContain("export const PHASE_5_HEADLINES_RECOVERY_DISABLED = true;");
    expect(compositionProof).toContain("export const PHASE_5_1_COMPOSE_PROOF_DISABLED = true;");
  });

  it("keeps the final report free of secrets, raw source content, and hidden reasoning", async () => {
    const reports = await Promise.all([
      readFile(resolve(root, "reports/phase-5-live.json"), "utf8"),
      readFile(resolve(root, "reports/phase-5-1-compose-proof.json"), "utf8"),
    ]);
    for (const report of reports) {
      expect(report).not.toMatch(/sk-or-|Bearer\s+|OPENROUTER_API_KEY|chain.of.thought|system prompt/i);
      expect(report).not.toContain('"content":');
    }
  });
});
