import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { phase5RunResultSchema, type Phase5ActivityEvent } from "../src/lib/phase5/contracts.ts";
import { validatePhase5Artifact } from "../src/lib/phase5/validation.ts";
import { runPhase5Workflow } from "../src/lib/phase5/workflow.ts";
import { phase6RequestSchema } from "../src/lib/phase6/contracts.ts";
import { createPhase6FixtureDependencies } from "../src/lib/phase6/fixture.ts";
import { PHASE_6_FROZEN_HEADLINES_CASE } from "../src/lib/phase6/frozen-case.ts";
import { artifactToMarkdown, projectActivity, projectArtifact, projectReceipt } from "../src/lib/phase6/projection.ts";
import { clearPhase6SessionsForTest, getPhase6Session, putPhase6Session } from "../src/lib/phase6/session-store.ts";

const root = resolve(import.meta.dirname, "..");
const input = {
  mode: "headlines" as const,
  topic: "Lake Bonneville and its visible ancient shorelines",
  links: ["https://science.nasa.gov/example"],
  notes: "Keep the argument and clock visible.",
  target_minutes: 8,
};

describe("Phase 6 workbench contract", () => {
  it("uses the exact preserved Phase 5 Headlines case", async () => {
    const report = JSON.parse(await readFile(resolve(root, "reports/phase-5-live.json"), "utf8")) as {
      runs: Array<{ case: string; result: { input: unknown } | null }>;
    };
    const prior = report.runs.find((run) => run.case === "headlines" && run.result)?.result?.input;
    expect(PHASE_6_FROZEN_HEADLINES_CASE).toEqual(prior);
  });

  it("runs the production workflow through the deterministic zero-provider fixture", async () => {
    const streamed: Phase5ActivityEvent[] = [];
    const result = await runPhase5Workflow(input, {
      ...createPhase6FixtureDependencies(),
      onEvent: (event) => streamed.push(event),
    }, { runId: "run_phase6_fixture" });
    expect(result.status).toBe("complete");
    expect(result.accounted_cost_usd).toBe(0);
    expect(result.artifact?.mode).toBe("headlines");
    expect(streamed.map((event) => event.type)).toContain("tool_started");
    expect(streamed.at(-1)?.type).toBe("run_completed");
    expect(projectArtifact(result, 1)?.artifact).toEqual(result.artifact);
    expect(projectReceipt(result, 1).revision).toBe(1);
  });

  it("renders the same bounded fixture contract for a Big Story", async () => {
    const result = await runPhase5Workflow({ ...input, mode: "big_story", target_minutes: 24 }, createPhase6FixtureDependencies(), { runId: "run_phase6_big_story" });
    expect(result.status).toBe("complete");
    expect(result.artifact?.mode).toBe("big_story");
    if (result.artifact?.mode === "big_story") {
      expect(result.artifact.research_cards.some((card) => card.role === "key_evidence")).toBe(true);
      expect(result.artifact.modular_outline.reduce((sum, beat) => sum + (beat.estimated_minutes ?? 0), 0)).toBeLessThanOrEqual(24);
    }
  });

  it("propagates user cancellation and preserves a truthful stopped result", async () => {
    const controller = new AbortController();
    const events: Phase5ActivityEvent[] = [];
    const result = await runPhase5Workflow(input, {
      ...createPhase6FixtureDependencies(controller.signal),
      signal: controller.signal,
      onEvent: (event) => {
        events.push(event);
        if (event.type === "run_started") controller.abort();
      },
    }, { runId: "run_phase6_stopped" });
    expect(result.status).toBe("stopped");
    expect(result.validation_errors).toContain("phase5_run_stopped");
    expect(events.at(-1)?.type).toBe("run_stopped");
    expect(result.counts.web_searches).toBe(0);
  });

  it("retains the last validated server artifact when a later action has none", async () => {
    clearPhase6SessionsForTest();
    const complete = await runPhase5Workflow(input, createPhase6FixtureDependencies(), { runId: "run_retained" });
    const now = Date.now();
    putPhase6Session({ session_id: "session_retained", result: complete, revision: 1, updated_at_ms: now });
    const failed = phase5RunResultSchema.parse({
      ...complete,
      run_id: "run_failed_retry",
      status: "failed",
      artifact: null,
      validation_errors: ["model:unavailable"],
    });
    putPhase6Session({ session_id: "session_retained", result: failed, revision: 2, updated_at_ms: now + 1 });
    expect(getPhase6Session("session_retained")).toMatchObject({ result: { run_id: "run_retained" }, revision: 1, updated_at_ms: now + 1 });
    clearPhase6SessionsForTest();
  });

  it("projects only whitelisted tool detail", () => {
    const projected = projectActivity({
      event_id: "evt_1",
      run_id: "run_1",
      type: "tool_started",
      created_at: "2026-08-24T00:00:00.000Z",
      summary: "Reading",
      tool: "read_url",
      status: "running",
      detail: { url: "https://secret.example/path", query: "safe query", api_key: "secret", raw_content: "private" },
    });
    expect(projected.detail).toBe("query: safe query");
    expect(JSON.stringify(projected)).not.toContain("secret.example");
    expect(JSON.stringify(projected)).not.toContain("api_key");
    expect(JSON.stringify(projected)).not.toContain("private");
  });

  it("rejects malformed, overlong, and extra request fields", () => {
    expect(() => phase6RequestSchema.parse({ action: "start", session_id: "session_local", input, extra: true })).toThrow();
    expect(() => phase6RequestSchema.parse({ action: "follow_up", session_id: "session_local", instruction: "x" })).toThrow();
    expect(() => phase6RequestSchema.parse({ action: "start", session_id: "short", input })).toThrow();
  });

  it("copies a cited artifact as portable Markdown", async () => {
    const result = await runPhase5Workflow(input, createPhase6FixtureDependencies(), { runId: "run_markdown" });
    expect(result.artifact).not.toBeNull();
    const markdown = artifactToMarkdown(result.artifact!);
    expect(markdown).toContain("# The lake that vanished");
    expect(markdown).toContain("## Flexible outline");
    expect(markdown).toContain("[web_fixture_bonneville]");
  });

  it("keeps live execution relocked and the client detached from server graph modules", async () => {
    const live = await readFile(resolve(root, "src/lib/phase6/live-proof.ts"), "utf8");
    const client = await readFile(resolve(root, "src/components/research-harness.tsx"), "utf8");
    expect(live).toContain("export const PHASE_6_LIVE_UI_DISABLED = true;");
    expect(client).not.toContain("lib/phase5");
    expect(client).not.toContain("transcript-retrieval");
    expect(client).not.toContain("OPENROUTER_API_KEY");
  });

  it("accepts the replacement browser proof only as a bounded validated artifact", async () => {
    const report = JSON.parse(await readFile(resolve(root, "reports/phase-6-live.json"), "utf8")) as {
      gate: { cost_cap_usd: number; provider_request_cap: number; automatic_retries: number };
      observed_provider_requests_upper_bound: number;
      result: unknown;
    };
    const result = phase5RunResultSchema.parse(report.result);
    expect(result.input).toEqual(PHASE_6_FROZEN_HEADLINES_CASE);
    expect(result.status).toBe("complete");
    expect(result.artifact).not.toBeNull();
    expect(result.validation_errors).toEqual([]);
    const validation = validatePhase5Artifact(result.input, result.artifact, result.evidence);
    expect(validation.errors).toEqual([]);
    expect(validation.artifact).toEqual(result.artifact);
    expect(report.observed_provider_requests_upper_bound).toBeLessThanOrEqual(report.gate.provider_request_cap);
    expect(result.accounted_cost_usd).toBeLessThanOrEqual(report.gate.cost_cap_usd);
    expect(report.gate.automatic_retries).toBe(0);
    expect(result.counts.repairs).toBe(0);
  });

  it("keeps the production route fixture-only, bounded, streamed, and single-run", async () => {
    const { POST } = await import("../src/app/api/chat/route.ts");
    const requestFor = (body: unknown) => new Request("http://local.test/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const invalid = await POST(requestFor({ phase6: { action: "start", session_id: "too_short" } }));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ code: "phase6_invalid_request" });

    const oversized = await POST(new Request("http://local.test/api/chat", {
      method: "POST",
      body: JSON.stringify({ phase6: { action: "start", session_id: "session_oversized", input: { ...input, notes: "x".repeat(24_000) } } }),
    }));
    expect(oversized.status).toBe(413);

    const sessionId = `session_route_${Date.now()}`;
    const first = await POST(requestFor({ phase6: { action: "start", session_id: sessionId, input } }));
    expect(first.status).toBe(200);
    expect(first.headers.get("x-nonsense-execution")).toBe("fixture");
    expect(first.headers.get("cache-control")).toBe("no-store");

    const duplicate = await POST(requestFor({ phase6: { action: "start", session_id: sessionId, input } }));
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({ code: "phase6_run_in_progress" });

    const stream = await first.text();
    expect(stream).toContain('"type":"data-run"');
    expect(stream).toContain('"type":"data-activity"');
    expect(stream).toContain('"type":"data-artifact"');
    expect(stream).toContain('"type":"data-receipt"');
    expect(stream).toContain('"type":"finish"');
    expect(stream).not.toContain("OPENROUTER_API_KEY");
  });
});
