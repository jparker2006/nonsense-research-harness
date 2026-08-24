import { z } from "zod";
import {
  PHASE_5_LIMITS,
  PHASE_5_MODELS,
  phase5RunResultSchema,
  type Phase5RunResult,
} from "./contracts.ts";
import { canonicalizeArtifactSourceLedger, validatePhase5Artifact } from "./validation.ts";

export const PHASE_5_LIVE_PROOF_LIMITS = Object.freeze({
  maximumAttempts: 4,
  maximumAttemptsByCase: Object.freeze({ headlines: 2, big_story: 2 }),
  perRunCostCapUsd: 0.5,
  totalCostCapUsd: 1.3,
  retries: 0,
});

export const phase5LiveCaseSchema = z.enum(["headlines", "big_story"]);
export type Phase5LiveCase = z.infer<typeof phase5LiveCaseSchema>;
export type Phase5LiveAttempt = "original" | "replacement";

const storedRunSchema = z.object({
  case: phase5LiveCaseSchema,
  attempt: z.enum(["original", "replacement"]).optional(),
  started_at: z.string(),
  completed_at: z.string(),
  gate_status: z.enum(["passed", "failed"]),
  result: phase5RunResultSchema.nullable(),
  error: z.string().max(240).nullable(),
  accounted_cost_usd: z.number().nonnegative().optional(),
});

const storedRecoverySchema = z.object({
  recovery_id: z.string(),
  case: z.literal("headlines"),
  source_run_id: z.string(),
  kind: z.literal("canonical_source_ledger"),
  created_at: z.string(),
  provider_requests: z.literal(0),
  original_gate_status: z.literal("failed"),
  original_validation_errors: z.array(z.string()),
  gate_status: z.enum(["passed", "failed"]),
  recovered_result: phase5RunResultSchema,
});

const storedReportSchema = z.object({
  phase: z.literal(5),
  status: z.enum(["in_progress", "passed", "failed"]),
  updated_at: z.string(),
  limits: z.object({
    maximum_cases: z.number().int().positive(),
    per_run_cost_cap_usd: z.number().positive(),
    total_cost_cap_usd: z.number().positive(),
    retries: z.number().int().nonnegative(),
  }),
  usage: z.object({
    completed_cases: z.number().int().nonnegative(),
    accounted_cost_usd: z.number().nonnegative(),
  }),
  runs: z.array(storedRunSchema),
  recoveries: z.array(storedRecoverySchema).optional(),
});

export type Phase5LiveRun = {
  case: Phase5LiveCase;
  attempt: Phase5LiveAttempt;
  started_at: string;
  completed_at: string;
  gate_status: "passed" | "failed";
  result: Phase5RunResult | null;
  error: string | null;
  accounted_cost_usd: number;
};

export type Phase5LiveReport = {
  phase: 5;
  status: "in_progress" | "passed" | "failed";
  updated_at: string;
  limits: {
    maximum_cases: number;
    per_run_cost_cap_usd: number;
    total_cost_cap_usd: number;
    retries: 0;
  };
  usage: { completed_cases: number; accounted_cost_usd: number };
  runs: Phase5LiveRun[];
  recoveries: Phase5LiveRecovery[];
};

export type Phase5LiveRecovery = z.infer<typeof storedRecoverySchema>;

export function emptyPhase5LiveReport(now = new Date().toISOString()): Phase5LiveReport {
  return recomputePhase5LiveReport({
    phase: 5,
    status: "in_progress",
    updated_at: now,
    limits: {
      maximum_cases: PHASE_5_LIVE_PROOF_LIMITS.maximumAttempts,
      per_run_cost_cap_usd: PHASE_5_LIVE_PROOF_LIMITS.perRunCostCapUsd,
      total_cost_cap_usd: PHASE_5_LIVE_PROOF_LIMITS.totalCostCapUsd,
      retries: 0,
    },
    usage: { completed_cases: 0, accounted_cost_usd: 0 },
    runs: [],
    recoveries: [],
  }, now);
}

export function normalizePhase5LiveReport(value: unknown): Phase5LiveReport {
  const stored = storedReportSchema.parse(value);
  const seen = { headlines: 0, big_story: 0 };
  const runs: Phase5LiveRun[] = stored.runs.map((run) => {
    const index = seen[run.case]++;
    const attempt = run.attempt ?? (run.case === "headlines" && index > 0 ? "replacement" : "original");
    const accounted = run.accounted_cost_usd ?? run.result?.accounted_cost_usd ?? (run.error ? 0.5 : 0);
    return { ...run, attempt, accounted_cost_usd: Number(accounted.toFixed(8)) };
  });
  return recomputePhase5LiveReport({
    ...stored,
    limits: { ...stored.limits, retries: 0 },
    runs,
    recoveries: stored.recoveries ?? [],
  }, stored.updated_at);
}

export function recomputePhase5LiveReport(
  report: Phase5LiveReport,
  now = new Date().toISOString(),
): Phase5LiveReport {
  const runs = report.runs.map((run) => ({ ...run }));
  const recoveries = report.recoveries.map((recovery) => ({ ...recovery }));
  const accounted = Number(runs.reduce((sum, run) => sum + run.accounted_cost_usd, 0).toFixed(8));
  const headlinesPassed =
    runs.some((run) => run.case === "headlines" && run.gate_status === "passed") ||
    recoveries.some((recovery) => recovery.case === "headlines" && recovery.gate_status === "passed");
  const bigStoryPassed = runs.some((run) => run.case === "big_story" && run.gate_status === "passed");
  const headlinesExhausted =
    runs.filter((run) => run.case === "headlines").length >=
    PHASE_5_LIVE_PROOF_LIMITS.maximumAttemptsByCase.headlines;
  const bigStoryExhausted =
    runs.filter((run) => run.case === "big_story").length >=
    PHASE_5_LIVE_PROOF_LIMITS.maximumAttemptsByCase.big_story;
  const status = headlinesPassed && bigStoryPassed
    ? "passed"
    : (headlinesExhausted && !headlinesPassed) || (bigStoryExhausted && !bigStoryPassed)
      ? "failed"
      : "in_progress";
  return {
    phase: 5,
    status,
    updated_at: now,
    limits: {
      maximum_cases: PHASE_5_LIVE_PROOF_LIMITS.maximumAttempts,
      per_run_cost_cap_usd: PHASE_5_LIVE_PROOF_LIMITS.perRunCostCapUsd,
      total_cost_cap_usd: PHASE_5_LIVE_PROOF_LIMITS.totalCostCapUsd,
      retries: 0,
    },
    usage: { completed_cases: runs.length, accounted_cost_usd: accounted },
    runs,
    recoveries,
  };
}

export function authorizePhase5LiveCase(
  reportValue: Phase5LiveReport,
  liveCase: Phase5LiveCase,
): { allowed: true; attempt: Phase5LiveAttempt } | { allowed: false; reason: string } {
  const report = recomputePhase5LiveReport(reportValue, reportValue.updated_at);
  if (report.status === "passed") return { allowed: false, reason: "phase5_live_gate_already_passed" };
  if (report.runs.length >= PHASE_5_LIVE_PROOF_LIMITS.maximumAttempts) {
    return { allowed: false, reason: "phase5_live_attempt_cap_exhausted" };
  }
  const caseRuns = report.runs.filter((run) => run.case === liveCase);
  if (
    caseRuns.some((run) => run.gate_status === "passed") ||
    report.recoveries.some((recovery) => recovery.case === liveCase && recovery.gate_status === "passed")
  ) {
    return { allowed: false, reason: "phase5_live_case_already_passed" };
  }
  if (caseRuns.length >= PHASE_5_LIVE_PROOF_LIMITS.maximumAttemptsByCase[liveCase]) {
    return { allowed: false, reason: "phase5_live_case_cap_exhausted" };
  }
  if (
    report.usage.accounted_cost_usd + PHASE_5_LIVE_PROOF_LIMITS.perRunCostCapUsd >
    PHASE_5_LIVE_PROOF_LIMITS.totalCostCapUsd + 1e-9
  ) {
    return { allowed: false, reason: "phase5_live_budget_exhausted" };
  }
  return { allowed: true, attempt: caseRuns.length === 0 ? "original" : "replacement" };
}

export function recoverPhase5ResultWithCanonicalLedger(result: Phase5RunResult): Phase5RunResult {
  if (!result.artifact) return result;
  const canonical = canonicalizeArtifactSourceLedger(result.artifact, result.evidence);
  const validation = validatePhase5Artifact(result.input, canonical, result.evidence);
  const hadToolFailure = result.events.some((event) => event.type === "tool_failed");
  return phase5RunResultSchema.parse({
    ...result,
    artifact: validation.artifact,
    validation_errors: validation.errors,
    status: validation.artifact
      ? validation.errors.length > 0
        ? "partial"
        : hadToolFailure
          ? "partial"
          : "complete"
      : "failed",
  });
}

export function phase5LiveResultPasses(result: Phase5RunResult): boolean {
  const hasModelUsage =
    result.usage.some(
      (usage) => usage.action === "luna_research_plan" && usage.model === PHASE_5_MODELS.light.id,
    ) &&
    result.usage.some(
      (usage) => usage.action === "grok_composition" && usage.model === PHASE_5_MODELS.heavy.id,
    );
  const requiredToolsRan =
    result.counts.web_searches >= 1 &&
    result.counts.url_reads >= 1 &&
    result.counts.transcript_searches >= 1 &&
    (result.input.mode !== "big_story" || result.counts.transcript_opens >= 1);
  return (
    result.artifact !== null &&
    result.plan !== null &&
    result.artifact.mode === result.input.mode &&
    result.status !== "failed" &&
    result.validation_errors.length === 0 &&
    result.evidence.some((source) => source.evidence_usable) &&
    result.accounted_cost_usd <= PHASE_5_LIMITS.costCapUsd + 1e-9 &&
    result.elapsed_ms <= PHASE_5_LIMITS.wholeRunTimeoutMs &&
    result.counts.luna_turns <= PHASE_5_LIMITS.maxLunaTurns &&
    result.counts.grok_turns <= PHASE_5_LIMITS.maxGrokTurns &&
    result.counts.web_searches <= PHASE_5_LIMITS.maxWebSearches &&
    result.counts.url_reads <= PHASE_5_LIMITS.maxUrlReads &&
    result.counts.transcript_searches <= PHASE_5_LIMITS.maxTranscriptSearches &&
    result.counts.transcript_opens <= PHASE_5_LIMITS.maxTranscriptOpens &&
    result.counts.repairs <= 1 &&
    hasModelUsage &&
    requiredToolsRan
  );
}
