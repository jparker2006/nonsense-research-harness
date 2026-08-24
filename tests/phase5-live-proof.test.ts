import { describe, expect, it } from "vitest";
import {
  authorizePhase5LiveCase,
  emptyPhase5LiveReport,
  normalizePhase5LiveReport,
  phase5LiveResultPasses,
  recoverPhase5ResultWithCanonicalLedger,
  recomputePhase5LiveReport,
  type Phase5LiveReport,
  type Phase5LiveRun,
} from "../src/lib/phase5/live-proof.ts";
import { runPhase5Workflow } from "../src/lib/phase5/workflow.ts";
import type { Phase5Input, Phase5RunResult } from "../src/lib/phase5/contracts.ts";
import { fixtureModel, fixtureTools } from "./phase5-fixtures.ts";

const inputs: Record<Phase5Input["mode"], Phase5Input> = {
  headlines: {
    mode: "headlines",
    topic: "Why old infrastructure refuses to retire",
    links: [],
    notes: "Focus on the dependency problem.",
    target_minutes: 6,
  },
  big_story: {
    mode: "big_story",
    topic: "Why old infrastructure refuses to retire",
    links: [],
    notes: "Map the strongest explanations.",
    target_minutes: 24,
  },
};

async function validResult(mode: Phase5Input["mode"]): Promise<Phase5RunResult> {
  return runPhase5Workflow(inputs[mode], { model: fixtureModel(), tools: fixtureTools() });
}

function liveRun(
  result: Phase5RunResult,
  attempt: Phase5LiveRun["attempt"] = "original",
): Phase5LiveRun {
  return {
    case: result.input.mode,
    attempt,
    started_at: "2026-08-24T08:00:00.000Z",
    completed_at: "2026-08-24T08:01:00.000Z",
    gate_status: "passed",
    result,
    error: null,
    accounted_cost_usd: result.accounted_cost_usd,
  };
}

describe("Phase 5 revised live-proof ledger", () => {
  it("normalizes the preserved legacy failure, ignores stale totals, and authorizes only its replacement", () => {
    const report = normalizePhase5LiveReport({
      phase: 5,
      status: "failed",
      updated_at: "2026-08-24T08:26:57.856Z",
      limits: { maximum_cases: 2, per_run_cost_cap_usd: 0.5, total_cost_cap_usd: 1, retries: 0 },
      usage: { completed_cases: 99, accounted_cost_usd: 0 },
      runs: [
        {
          case: "headlines",
          started_at: "2026-08-24T08:24:22.229Z",
          completed_at: "2026-08-24T08:26:57.856Z",
          gate_status: "failed",
          result: {
            run_id: "run_failed_headlines",
            status: "failed",
            input: inputs.headlines,
            plan: null,
            artifact: null,
            evidence: [],
            validation_errors: ["phase5_model_timeout"],
            events: [],
            usage: [],
            counts: {
              luna_turns: 1,
              grok_turns: 1,
              web_searches: 1,
              url_reads: 1,
              transcript_searches: 1,
              transcript_opens: 0,
              repairs: 0,
            },
            repair_attempted: false,
            elapsed_ms: 155_000,
            accounted_cost_usd: 0.2522195,
          },
          error: null,
        },
      ],
    });
    expect(report).toMatchObject({
      status: "in_progress",
      limits: { maximum_cases: 4, total_cost_cap_usd: 1.3, retries: 0 },
      usage: { completed_cases: 1, accounted_cost_usd: 0.2522195 },
      runs: [{ case: "headlines", attempt: "original", gate_status: "failed" }],
    });
    expect(authorizePhase5LiveCase(report, "headlines")).toEqual({ allowed: true, attempt: "replacement" });
    expect(authorizePhase5LiveCase(report, "big_story")).toEqual({ allowed: true, attempt: "original" });
  });

  it("preserves a failed original while passing only after replacement Headlines and Big Story both pass", async () => {
    const headlines = await validResult("headlines");
    const bigStory = await validResult("big_story");
    const failedOriginal: Phase5LiveRun = {
      ...liveRun(headlines),
      gate_status: "failed",
      result: null,
      error: "phase5_model_timeout",
      accounted_cost_usd: 0.2522195,
    };
    let report: Phase5LiveReport = recomputePhase5LiveReport({
      ...emptyPhase5LiveReport(),
      runs: [failedOriginal, liveRun(headlines, "replacement")],
    });
    expect(report.status).toBe("in_progress");
    expect(authorizePhase5LiveCase(report, "headlines")).toEqual({
      allowed: false,
      reason: "phase5_live_case_already_passed",
    });
    expect(authorizePhase5LiveCase(report, "big_story")).toEqual({ allowed: true, attempt: "original" });

    report = recomputePhase5LiveReport({ ...report, runs: [...report.runs, liveRun(bigStory)] });
    expect(report.status).toBe("passed");
    expect(report.runs).toHaveLength(3);
    expect(report.runs[0]).toMatchObject({ gate_status: "failed", error: "phase5_model_timeout" });
    expect(authorizePhase5LiveCase(report, "big_story")).toEqual({
      allowed: false,
      reason: "phase5_live_gate_already_passed",
    });
  });

  it("preserves a failed original Big Story and authorizes exactly one replacement", async () => {
    const headlines = await validResult("headlines");
    const failedBigStory: Phase5LiveRun = {
      ...liveRun(await validResult("big_story")),
      gate_status: "failed",
      result: null,
      error: "phase5_planner_failed",
      accounted_cost_usd: 0.02,
    };
    const report = recomputePhase5LiveReport({
      ...emptyPhase5LiveReport(),
      runs: [liveRun(headlines), failedBigStory],
    });
    expect(report.status).toBe("in_progress");
    expect(authorizePhase5LiveCase(report, "big_story")).toEqual({
      allowed: true,
      attempt: "replacement",
    });

    const exhausted = recomputePhase5LiveReport({
      ...report,
      runs: [
        ...report.runs,
        { ...failedBigStory, attempt: "replacement", started_at: "2026-08-24T09:00:00.000Z" },
      ],
    });
    expect(exhausted.status).toBe("failed");
    expect(authorizePhase5LiveCase(exhausted, "big_story")).toEqual({
      allowed: false,
      reason: "phase5_live_case_cap_exhausted",
    });
  });

  it("fails closed on per-case, global-attempt, missing-result, and aggregate-cost exposure", () => {
    const base = emptyPhase5LiveReport();
    const missingResult = {
      case: "headlines" as const,
      started_at: "2026-08-24T08:00:00.000Z",
      completed_at: "2026-08-24T08:01:00.000Z",
      gate_status: "failed" as const,
      result: null,
      error: "phase5_live_run_failed",
    };
    const normalized = normalizePhase5LiveReport({
      ...base,
      runs: [missingResult],
    });
    expect(normalized.runs[0]?.accounted_cost_usd).toBe(0.5);

    const expensive: Phase5LiveReport = recomputePhase5LiveReport({
      ...base,
      runs: [
        { ...normalized.runs[0]!, accounted_cost_usd: 0.81 },
      ],
    });
    expect(authorizePhase5LiveCase(expensive, "big_story")).toEqual({
      allowed: false,
      reason: "phase5_live_budget_exhausted",
    });
  });

  it("requires real model receipts, required tools, usable evidence, time, and all coded ceilings", async () => {
    const headlines = await validResult("headlines");
    const bigStory = await validResult("big_story");
    expect(phase5LiveResultPasses(headlines)).toBe(true);
    expect(phase5LiveResultPasses(bigStory)).toBe(true);

    expect(phase5LiveResultPasses({ ...headlines, elapsed_ms: 300_001 })).toBe(false);
    expect(
      phase5LiveResultPasses({
        ...headlines,
        usage: headlines.usage.filter((usage) => usage.action !== "grok_composition"),
      }),
    ).toBe(false);
    expect(
      phase5LiveResultPasses({
        ...bigStory,
        counts: { ...bigStory.counts, transcript_opens: 0 },
      }),
    ).toBe(false);
  });

  it("can validate a stored artifact after code-only ledger recovery without adding an attempt or cost", async () => {
    const original = await runPhase5Workflow(inputs.headlines, {
      model: fixtureModel(),
      tools: fixtureTools({
        transcript: {
          retrieval_status: "no_match",
          query: "old technology replacement",
          matches: [],
          reason: "No fixture archive match.",
        },
      }),
    });
    if (!original.artifact) throw new Error("fixture artifact missing");
    const broken = structuredClone(original);
    broken.status = "partial";
    broken.artifact!.source_ledger[0]!.retrieved_at = "model supplied timestamp";
    broken.artifact!.source_ledger[0]!.excerpt = "model supplied paraphrase";
    broken.validation_errors = [
      "ledger:mismatch:web_fixture_current:retrieved_at",
      "ledger:mismatch:web_fixture_current:excerpt",
      "phase5_model_unavailable",
    ];
    broken.repair_attempted = true;
    broken.counts.grok_turns = 2;
    broken.counts.repairs = 1;
    const recovered = recoverPhase5ResultWithCanonicalLedger(broken);
    expect(recovered).toMatchObject({ status: "complete", validation_errors: [] });
    expect(phase5LiveResultPasses(recovered)).toBe(true);

    const failedRun: Phase5LiveRun = {
      ...liveRun(broken, "replacement"),
      gate_status: "failed",
    };
    const bigStory = await validResult("big_story");
    const report = recomputePhase5LiveReport({
      ...emptyPhase5LiveReport(),
      runs: [failedRun, liveRun(bigStory)],
      recoveries: [
        {
          recovery_id: "recovery_fixture",
          case: "headlines",
          source_run_id: broken.run_id,
          kind: "canonical_source_ledger",
          created_at: "2026-08-24T10:00:00.000Z",
          provider_requests: 0,
          original_gate_status: "failed",
          original_validation_errors: broken.validation_errors,
          gate_status: "passed",
          recovered_result: recovered,
        },
      ],
    });
    expect(report.status).toBe("passed");
    expect(report.usage).toEqual({
      completed_cases: 2,
      accounted_cost_usd: Number((broken.accounted_cost_usd + bigStory.accounted_cost_usd).toFixed(8)),
    });
  });
});
