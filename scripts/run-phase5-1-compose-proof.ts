import { access, mkdir, writeFile } from "node:fs/promises";
import {
  PHASE_5_1_COMPOSE_PROOF_LIMITS,
  evaluatePhase51Composition,
  loadPhase51CompositionPacket,
} from "../src/lib/phase5/compose-proof.ts";
import { createOpenRouterPhase5Model } from "../src/lib/phase5/model.ts";

export const PHASE_5_1_COMPOSE_PROOF_DISABLED = true;

const OUTPUT_PATH = "reports/phase-5-1-compose-proof.json";
const authorized = process.env.PHASE51_EXECUTE_LIVE === "approved";
const oneShot = process.argv.includes("--execute-approved-once");
const apiKey = process.env.OPENROUTER_API_KEY?.trim();

if (PHASE_5_1_COMPOSE_PROOF_DISABLED || !authorized || !oneShot || !apiKey) {
  console.error("Phase 5.1 composition proof is locked or missing exact one-shot authority and key. No request was sent.");
  process.exitCode = 2;
} else {
  try {
    await access(OUTPUT_PATH);
    console.error("Phase 5.1 composition proof is already recorded. No request was sent.");
    process.exitCode = 2;
  } catch {
    const packet = await loadPhase51CompositionPacket();
    let record: Record<string, unknown>;
    try {
      const result = await createOpenRouterPhase5Model({ apiKey, liveAuthorized: true }).compose(
        packet.input,
        packet.plan,
        packet.evidence,
      );
      record = {
        phase: "5.1",
        kind: "composition_only",
        created_at: new Date().toISOString(),
        limits: PHASE_5_1_COMPOSE_PROOF_LIMITS,
        ...evaluatePhase51Composition(packet, result),
      };
    } catch (error) {
      const message = error instanceof Error && /^phase5_[a-z0-9_]+$/.test(error.message)
        ? error.message
        : "phase5_1_composition_failed";
      record = {
        phase: "5.1",
        kind: "composition_only",
        created_at: new Date().toISOString(),
        status: "failed",
        source_run_id: packet.source_run_id,
        packet_sha256: packet.packet_sha256,
        provider_requests: 1,
        retries: 0,
        artifact: null,
        validation_errors: [message],
        receipt: null,
        accounted_cost_usd: PHASE_5_1_COMPOSE_PROOF_LIMITS.costCapUsd,
        limits: PHASE_5_1_COMPOSE_PROOF_LIMITS,
      };
    }
    await mkdir("reports", { recursive: true });
    await writeFile(OUTPUT_PATH, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    console.log(JSON.stringify(record, null, 2));
    if (record.status !== "passed") process.exitCode = 1;
  }
}
