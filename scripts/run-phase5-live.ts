import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  phase5InputSchema,
  phase5RunResultSchema,
  type Phase5Input,
  type Phase5RunResult,
} from "../src/lib/phase5/contracts.ts";
import {
  PHASE_5_LIVE_PROOF_LIMITS,
  authorizePhase5LiveCase,
  emptyPhase5LiveReport,
  normalizePhase5LiveReport,
  phase5LiveResultPasses,
  recomputePhase5LiveReport,
  type Phase5LiveCase,
  type Phase5LiveReport,
  type Phase5LiveRun,
} from "../src/lib/phase5/live-proof.ts";
import { createLivePhase5Tools } from "../src/lib/phase5/live-tools.ts";
import { createOpenRouterPhase5Model } from "../src/lib/phase5/model.ts";
import { runPhase5Workflow } from "../src/lib/phase5/workflow.ts";

// Flip to true immediately after the single approved replacement Big Story evidence run.
export const PHASE_5_LIVE_RUNNER_DISABLED = true;

const REPORT_PATH = "reports/phase-5-live.json";
const CASES = Object.freeze({
  headlines: phase5InputSchema.parse({
    mode: "headlines",
    topic:
      "NASA's August 24, 2026 article 'What Lake Bonneville Left Behind' and what its ancient shorelines reveal",
    links: [
      "https://science.nasa.gov/earth/earth-observatory/what-lake-bonneville-left-behind/",
    ],
    notes:
      "Prepare a compact current headline discussion. Separate what the article proves from broader interpretation.",
    target_minutes: 8,
  }),
  big_story: phase5InputSchema.parse({
    mode: "big_story",
    topic: "The infrastructure and electricity demands behind the AI data-center boom",
    links: [
      "https://www.iea.org/news/data-centre-electricity-use-surged-in-2025-even-with-tightening-bottlenecks-driving-a-scramble-for-solutions",
    ],
    notes:
      "Explain the physical buildout, energy constraints, strongest competing interpretations, and what prior Nonsense coverage adds.",
    target_minutes: 28,
  }),
} satisfies Record<Phase5Input["mode"], Phase5Input>);

async function loadReport(): Promise<Phase5LiveReport> {
  try {
    return normalizePhase5LiveReport(JSON.parse(await readFile(REPORT_PATH, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyPhase5LiveReport();
    throw error;
  }
}

async function persist(report: Phase5LiveReport): Promise<Phase5LiveReport> {
  const updated = recomputePhase5LiveReport(report);
  await mkdir("reports", { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  return updated;
}

const requested = process.argv.find((argument) => argument.startsWith("--case="))?.slice(7);
const liveCase = requested === "headlines" || requested === "big_story" ? requested : undefined;
const apiKey = process.env.OPENROUTER_API_KEY?.trim();
const authorized = process.env.PHASE5_EXECUTE_LIVE === "approved";
const oneShot = process.argv.includes("--execute-approved-once");

if (PHASE_5_LIVE_RUNNER_DISABLED || !authorized || !oneShot || !liveCase || !apiKey) {
  console.error("Phase 5 live proof is locked or missing exact case, key, and one-shot authority. No request was sent.");
  process.exitCode = 2;
} else {
  let report = await loadReport();
  const decision = authorizePhase5LiveCase(report, liveCase as Phase5LiveCase);
  if (!decision.allowed) {
    console.error(`${decision.reason}. No request was sent.`);
    process.exitCode = 2;
  } else {
    const startedAt = new Date().toISOString();
    let result: Phase5RunResult | null = null;
    let error: string | null = null;
    try {
      result = phase5RunResultSchema.parse(
        await runPhase5Workflow(CASES[liveCase], {
          model: createOpenRouterPhase5Model({ apiKey, liveAuthorized: true }),
          tools: createLivePhase5Tools({ apiKey, liveAuthorized: true }),
        }),
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      error = /^phase5_[a-z0-9_]+$/.test(message) ? message : "phase5_live_run_failed";
    }
    const run: Phase5LiveRun = {
      case: liveCase as Phase5LiveCase,
      attempt: decision.attempt,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      gate_status: result && phase5LiveResultPasses(result) ? "passed" : "failed",
      result,
      error,
      accounted_cost_usd: result?.accounted_cost_usd ?? PHASE_5_LIVE_PROOF_LIMITS.perRunCostCapUsd,
    };
    report.runs.push(run);
    report = await persist(report);
    console.log(JSON.stringify({ report_status: report.status, run }, null, 2));
    if (run.gate_status === "failed") process.exitCode = 1;
  }
}
