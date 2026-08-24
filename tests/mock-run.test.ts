import { describe, expect, it } from "vitest";
import { MOCK_ACTIVITIES, MOCK_ARTIFACT, STREAM_EVENT_KINDS } from "../src/lib/mock-run";

describe("Phase 1 mock run contract", () => {
  it("covers successful tools, a truthful tool error, text, artifact, and completion data", () => {
    expect(MOCK_ACTIVITIES.some((event) => event.status === "complete")).toBe(true);
    expect(MOCK_ACTIVITIES.some((event) => event.status === "error")).toBe(true);
    expect(STREAM_EVENT_KINDS).toEqual(
      expect.arrayContaining([
        "text-delta",
        "tool-input-start",
        "tool-output-available",
        "tool-output-error",
        "data-artifact",
        "data-run",
      ]),
    );
  });

  it("keeps activity IDs unique for deterministic replay", () => {
    const ids = MOCK_ACTIVITIES.map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves every outline source to the source ledger", () => {
    const sourceIds = new Set(MOCK_ARTIFACT.sources.map((source) => source.id));
    for (const beat of MOCK_ARTIFACT.beats) {
      for (const sourceId of beat.sourceIds) {
        expect(sourceIds.has(sourceId)).toBe(true);
      }
    }
  });
});
