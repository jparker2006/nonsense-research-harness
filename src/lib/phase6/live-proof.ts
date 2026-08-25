import "server-only";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Phase5RunResult } from "../phase5/contracts.ts";
import { PHASE_6_LIMITS } from "./contracts.ts";

export const PHASE_6_LIVE_UI_DISABLED = true;
export const PHASE_6_LIVE_REPORT = path.join(process.cwd(), "reports", "phase-6-live.json");

let claimed = false;

export function phase6LiveProofAuthorized(): boolean {
  return !PHASE_6_LIVE_UI_DISABLED &&
    process.env.NODE_ENV !== "production" &&
    process.env.PHASE6_EXECUTE_LIVE === "approved" &&
    process.env.PHASE6_LIVE_PROOF === "approved" &&
    Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export function claimPhase6LiveProof(): void {
  if (!phase6LiveProofAuthorized()) throw new Error("phase6_live_not_authorized");
  if (claimed || existsSync(PHASE_6_LIVE_REPORT)) throw new Error("phase6_live_attempt_consumed");
  claimed = true;
}

export function writePhase6LiveReport(result: Phase5RunResult, routeStartedAt: string): void {
  const providerRequests = result.counts.luna_turns + result.counts.grok_turns + result.counts.web_searches + result.counts.transcript_searches * 2;
  const report = {
    schema_version: "1.0",
    phase: "6.5",
    route_started_at: routeStartedAt,
    completed_at: new Date().toISOString(),
    gate: {
      cost_cap_usd: PHASE_6_LIMITS.liveProofCostCapUsd,
      provider_request_cap: PHASE_6_LIMITS.liveProofProviderRequests,
      automatic_retries: 0,
    },
    observed_provider_requests_upper_bound: providerRequests,
    result,
  };
  writeFileSync(PHASE_6_LIVE_REPORT, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}
