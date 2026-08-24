import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Phase 3 paid evidence lock", () => {
  it("keeps every Phase 3 live-call command statically locked after proof", () => {
    const source = readFileSync("scripts/run-phase3-retrieval.ts", "utf8");
    expect(source).toContain("export const PHASE_3_LIVE_SCRIPTS_LOCKED = true;");
  });
});
