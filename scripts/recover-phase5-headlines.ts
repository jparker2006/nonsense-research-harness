import { readFile, writeFile } from "node:fs/promises";
import {
  normalizePhase5LiveReport,
  phase5LiveResultPasses,
  recoverPhase5ResultWithCanonicalLedger,
  recomputePhase5LiveReport,
  type Phase5LiveRecovery,
} from "../src/lib/phase5/live-proof.ts";

export const PHASE_5_HEADLINES_RECOVERY_DISABLED = true;

const REPORT_PATH = "reports/phase-5-live.json";
const authorized = process.env.PHASE5_RECOVER_HEADLINES === "approved";
const oneShot = process.argv.includes("--execute-approved-once");

if (PHASE_5_HEADLINES_RECOVERY_DISABLED || !authorized || !oneShot) {
  console.error("Phase 5 Headlines recovery is locked or missing one-shot authority. No file was changed.");
  process.exitCode = 2;
} else {
  let report = normalizePhase5LiveReport(JSON.parse(await readFile(REPORT_PATH, "utf8")));
  if (report.recoveries.some((recovery) => recovery.case === "headlines")) {
    console.error("The Phase 5 Headlines recovery is already recorded. No file was changed.");
    process.exitCode = 2;
  } else {
    const source = report.runs.find(
      (run) => run.case === "headlines" && run.attempt === "replacement" && run.gate_status === "failed",
    );
    const eligibleErrors = source?.result?.validation_errors.every(
      (error) => error.startsWith("ledger:mismatch:") || error === "phase5_model_unavailable",
    );
    const noArchiveQuote =
      source?.result?.artifact?.mode === "headlines" &&
      source.result.artifact.past_nonsense_coverage.status === "no_relevant_archive_match" &&
      source.result.artifact.past_nonsense_coverage.items.length === 0;
    if (!source?.result || !source.result.artifact || !eligibleErrors || !noArchiveQuote) {
      throw new Error("phase5_headlines_recovery_not_eligible");
    }
    const recovered = recoverPhase5ResultWithCanonicalLedger(source.result);
    if (!phase5LiveResultPasses(recovered)) throw new Error("phase5_headlines_recovery_failed_gate");
    const recovery: Phase5LiveRecovery = {
      recovery_id: `recovery_${source.result.run_id}`,
      case: "headlines",
      source_run_id: source.result.run_id,
      kind: "canonical_source_ledger",
      created_at: new Date().toISOString(),
      provider_requests: 0,
      original_gate_status: "failed",
      original_validation_errors: [...source.result.validation_errors],
      gate_status: "passed",
      recovered_result: recovered,
    };
    report.recoveries.push(recovery);
    report = recomputePhase5LiveReport(report);
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({
      report_status: report.status,
      recovery_id: recovery.recovery_id,
      source_run_id: recovery.source_run_id,
      provider_requests: 0,
      validation_errors_before: recovery.original_validation_errors,
      validation_errors_after: recovery.recovered_result.validation_errors,
      artifact_mode: recovery.recovered_result.artifact?.mode,
    }, null, 2));
  }
}
