import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPhase7AChatRoute, POST } from "../src/app/api/chat/route.ts";
import { validatePhase5Artifact } from "../src/lib/phase5/validation.ts";
import { phase5ArtifactSchema } from "../src/lib/phase5/contracts.ts";
import {
  PHASE_7A_LIMITS,
  phase7aActionSchema,
  phase7aRequestSchema,
  type Phase7AAction,
} from "../src/lib/phase7a/contracts.ts";
import { createPhase7AFixtureDependencies } from "../src/lib/phase7a/fixture.ts";
import { createOpenRouterPhase7AModel } from "../src/lib/phase7a/model.ts";
import { PHASE_7A_SYSTEM_PROMPT } from "../src/lib/phase7a/prompts.ts";
import { clearPhase7AWorkspacesForTest, createPhase7AWorkspace } from "../src/lib/phase7a/session-store.ts";
import { runPhase7AWorkflow } from "../src/lib/phase7a/workflow.ts";
import { PHASE_6_FROZEN_HEADLINES_CASE } from "../src/lib/phase6/frozen-case.ts";

const root = resolve(import.meta.dirname, "..");
const suppliedUrl = PHASE_6_FROZEN_HEADLINES_CASE.links[0];
const webSourceId = "web_fixture_bonneville";
const chunkId = "chunk_fixture_archive";
const archiveSourceId = `archive_${chunkId}`;

function requestFor(body: unknown) {
  return new Request("http://local.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function action<T extends Phase7AAction>(value: T): T {
  return phase7aActionSchema.parse(value) as T;
}

function researchActions(mode?: "headlines" | "big_story"): Phase7AAction[] {
  const actions: Phase7AAction[] = [
    action({ action: "read_url", public_summary: "Read the supplied NASA source", url: suppliedUrl }),
    action({ action: "search_transcripts", public_summary: "Check past Nonsense coverage", query: "vanished lake landscape memory" }),
    action({ action: "open_transcript_chunk", public_summary: "Open the strongest archive passage", chunk_id: chunkId }),
  ];
  if (mode) {
    actions.push(action({
      action: "create_artifact",
      public_summary: `Create a ${mode} preparation packet`,
      mode,
      topic: "Lake Bonneville and the landscape left behind",
      target_minutes: mode === "headlines" ? 8 : 24,
      instruction: "Keep the clock and evidence visible.",
    }));
  }
  actions.push(action({
    action: "respond",
    public_summary: mode ? "Tell the user the packet is ready" : "Answer from the retrieved evidence",
    message: mode ? `The validated ${mode === "headlines" ? "Headlines" : "Big Story"} packet is ready.` : "The missing lake is still visible in the landscape, and an older Nonsense passage used a similar absence-as-structure idea.",
    source_ids: [webSourceId, archiveSourceId],
  }));
  return actions;
}

describe("Phase 7A chat-first agent", () => {
  beforeEach(() => clearPhase7AWorkspacesForTest());
  afterEach(() => clearPhase7AWorkspacesForTest());

  it("answers ordinary chat without forcing research or an artifact", async () => {
    const result = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace("session_direct_chat"),
      message: "What can you help us do?",
      runId: "run_direct_chat",
    }, createPhase7AFixtureDependencies([
      action({ action: "respond", public_summary: "Explain the research desk", message: "I can research a topic, inspect links, search past episodes, answer follow-ups, or make a prep packet when you ask.", source_ids: [] }),
    ]));
    expect(result.status).toBe("complete");
    expect(result.assistant_message?.text).toContain("when you ask");
    expect(result.artifact).toBeNull();
    expect(result.counts).toMatchObject({ controller_turns: 1, web_searches: 0, transcript_searches: 0, compositions: 0 });
    expect(result.accounted_cost_usd).toBe(0);
  });

  it("adapts through supplied-page retrieval, archive search, exact chunk opening, and a cited response", async () => {
    const events: string[] = [];
    const result = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace("session_adaptive"),
      message: `What is interesting about this? ${suppliedUrl}`,
      runId: "run_adaptive",
    }, createPhase7AFixtureDependencies(researchActions(), { onEvent: (event) => events.push(`${event.kind}:${event.status}`) }));
    expect(result.status).toBe("partial");
    expect(result.limitations).toContain("archive:keyword_only");
    expect(result.assistant_message?.source_ids).toEqual([webSourceId, archiveSourceId]);
    expect(result.workspace.evidence.map((source) => source.source_id)).toEqual([webSourceId, archiveSourceId]);
    expect(result.counts).toMatchObject({ controller_turns: 4, url_reads: 1, transcript_searches: 1, transcript_opens: 1 });
    expect(events).toContain("agent:running");
    expect(events).toContain("tool:complete");
  });

  it.each(["headlines", "big_story"] as const)("creates an optional validated %s artifact only after research", async (mode) => {
    const result = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace(`session_artifact_${mode}`),
      message: `${suppliedUrl} Research this and turn it into a ${mode === "headlines" ? "Headlines" : "Big Story"} packet.`,
      runId: `run_artifact_${mode}`,
    }, createPhase7AFixtureDependencies(researchActions(mode)));
    expect(result.artifact?.mode).toBe(mode);
    expect(result.artifact_revision).toBe(1);
    expect(result.counts).toMatchObject({ controller_turns: 4, compositions: 1, repairs: 0, grok_turns: 1 });
    expect(result.assistant_message?.text).toContain("ready in the artifact panel");
    const input = {
      mode,
      topic: "Lake Bonneville and the landscape left behind",
      links: [suppliedUrl],
      notes: "",
      target_minutes: mode === "headlines" ? 8 : 24,
    };
    expect(validatePhase5Artifact(input, result.artifact, result.workspace.evidence).errors).toEqual([]);
  });

  it("continues the same evidence workspace and can do new research on a follow-up", async () => {
    const first = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace("session_followup"),
      message: `Start with this source: ${suppliedUrl}`,
      runId: "run_followup_one",
    }, createPhase7AFixtureDependencies(researchActions()));
    const second = await runPhase7AWorkflow({
      workspace: first.workspace,
      message: "Search for newer context and tell me whether the earlier framing still holds.",
      runId: "run_followup_two",
    }, createPhase7AFixtureDependencies([
      action({ action: "web_search", public_summary: "Search for newer independent context", query: "Lake Bonneville shoreline evidence current research" }),
      action({ action: "respond", public_summary: "Answer using saved and new context", message: "The saved physical evidence still supports the framing; the new search produced another lead but it has not yet been read as evidence.", source_ids: [webSourceId] }),
    ]));
    expect(second.counts.web_searches).toBe(1);
    expect(second.workspace.turns.filter((turn) => turn.role === "user")).toHaveLength(2);
    expect(second.workspace.evidence.map((source) => source.source_id)).toContain(webSourceId);
    expect(second.assistant_message?.text).not.toContain("not independently researched");
  });

  it("preserves the last valid artifact when a later turn fails", async () => {
    const first = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace("session_preserve_artifact"),
      message: `${suppliedUrl} Make a Headlines packet.`,
    }, createPhase7AFixtureDependencies(researchActions("headlines")));
    const second = await runPhase7AWorkflow({
      workspace: first.workspace,
      message: "Read a source we never supplied or discovered.",
    }, createPhase7AFixtureDependencies([
      action({ action: "read_url", public_summary: "Attempt an unknown source", url: "https://example.com/not-discovered" }),
    ]));
    expect(second.status).toBe("failed");
    expect(second.limitations).toContain("phase7a_url_not_allowed");
    expect(second.artifact).toEqual(first.artifact);
    expect(second.artifact_revision).toBe(1);
  });

  it("rejects invented citations and unknown chunks without a model retry", async () => {
    const cited = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace("session_bad_citation"),
      message: "Tell me something sourced.",
    }, createPhase7AFixtureDependencies([
      action({ action: "respond", public_summary: "Answer with a false citation", message: "Unsupported.", source_ids: ["web_invented"] }),
    ]));
    expect(cited.status).toBe("failed");
    expect(cited.limitations).toContain("phase7a_invalid_citation");
    expect(cited.counts.controller_turns).toBe(1);

    const chunk = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace("session_bad_chunk"),
      message: "Open a made-up archive chunk.",
    }, createPhase7AFixtureDependencies([
      action({ action: "open_transcript_chunk", public_summary: "Open an unknown chunk", chunk_id: "chunk_not_returned" }),
    ]));
    expect(chunk.status).toBe("failed");
    expect(chunk.limitations).toContain("phase7a_chunk_not_allowed");
    expect(chunk.counts.controller_turns).toBe(1);
  });

  it("refuses artifact composition before usable evidence and an archive search exist", async () => {
    const result = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace("session_early_artifact"),
      message: `${suppliedUrl} Make a Headlines packet immediately.`,
    }, createPhase7AFixtureDependencies([
      action({ action: "read_url", public_summary: "Read the supplied source", url: suppliedUrl }),
      action({ action: "create_artifact", public_summary: "Attempt the packet too early", mode: "headlines", topic: "Lake Bonneville", target_minutes: 8, instruction: "" }),
    ]));
    expect(result.status).toBe("failed");
    expect(result.limitations).toContain("phase7a_artifact_archive_required");
    expect(result.counts.compositions).toBe(0);
    expect(result.artifact).toBeNull();
  });

  it("enforces tool limits and stops instead of automatically retrying", async () => {
    const actions = Array.from({ length: 4 }, (_, index) => action({
      action: "web_search" as const,
      public_summary: `Search bounded query ${index}`,
      query: `distinct bounded query number ${index}`,
    }));
    const result = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace("session_tool_limit"),
      message: "Keep searching forever.",
    }, createPhase7AFixtureDependencies(actions));
    expect(result.status).toBe("failed");
    expect(result.counts.web_searches).toBe(PHASE_7A_LIMITS.maxWebSearches);
    expect(result.counts.controller_turns).toBe(4);
    expect(result.limitations).toContain("phase7a_web_search_limit");
  });

  it("propagates a stop with zero paid work and an honest terminal message", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace("session_stopped"),
      message: "Research this.",
    }, createPhase7AFixtureDependencies([
      action({ action: "respond", public_summary: "Would have answered", message: "Not reached", source_ids: [] }),
    ], { signal: controller.signal }));
    expect(result.status).toBe("stopped");
    expect(result.counts.provider_requests).toBe(0);
    expect(result.accounted_cost_usd).toBe(0);
    expect(result.assistant_message?.text).toContain("stopped");
  });

  it("keeps request and action schemas strict", () => {
    expect(() => phase7aRequestSchema.parse({ action: "message", session_id: "session_valid", message: "hello", extra: true })).toThrow();
    expect(() => phase7aActionSchema.parse({ action: "respond", public_summary: "answer", message: "hello", source_ids: [], tool: "shell" })).toThrow();
    expect(() => phase7aActionSchema.parse({ action: "shell", public_summary: "run code", command: "pwd" })).toThrow();
  });

  it("uses the concise server prompt and strict OpenRouter controller policy", async () => {
    let observed: Record<string, unknown> | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      observed = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const payload = JSON.stringify({
        id: "gen_phase7a_test",
        model: "openai/gpt-5.6-luna",
        provider: "OpenAI",
        choices: [{ delta: { content: JSON.stringify({ action: "respond", public_summary: "Answer directly", argument: "Hello.", mode: null, target_minutes: null, instruction: "", source_ids: [] }) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0.0001 },
      });
      return new Response(`data: ${payload}\n\ndata: [DONE]\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } });
    };
    const model = createOpenRouterPhase7AModel({ apiKey: "test-key", liveAuthorized: true, fetchImpl });
    const result = await model.decide({ workspace: createPhase7AWorkspace("session_model_policy"), currentMessage: "hello", remaining: {}, lastObservation: undefined });
    expect(result.value.action).toBe("respond");
    const request = observed as { messages: Array<{ role: string; content: string }>; provider: Record<string, unknown>; response_format: unknown; model: string };
    expect(request.model).toBe("openai/gpt-5.6-luna");
    expect(request.messages[0]?.content).toBe(PHASE_7A_SYSTEM_PROMPT);
    expect(request.messages[0]?.content).toContain("equal partners CJ Little and Jeff Parker");
    expect(request.provider).toMatchObject({ allow_fallbacks: false, require_parameters: true, data_collection: "deny" });
    expect(request.response_format).toBeTruthy();
  });

  it("keeps fixtures test-only and streams an injected chat route without leaking raw evidence", async () => {
    const route = createPhase7AChatRoute({ dependencies: () => createPhase7AFixtureDependencies([
      action({ action: "read_url", public_summary: "Read supplied page", url: suppliedUrl }),
      action({ action: "respond", public_summary: "Answer from evidence", message: "The source describes visible traces of an ancient lake.", source_ids: [webSourceId] }),
    ]) });
    const response = await route(requestFor({ phase7a: { action: "message", session_id: "session_route_test", message: `Read this: ${suppliedUrl}` } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-nonsense-execution")).toBeNull();
    const stream = await response.text();
    expect(stream).toContain('"type":"data-run"');
    expect(stream).toContain('"type":"data-activity"');
    expect(stream).toContain('"type":"data-message"');
    expect(stream).toContain('"type":"data-source"');
    expect(stream).toContain('"type":"data-receipt"');
    expect(stream).not.toContain("preserving evidence of vanished water levels");
    expect(stream).not.toContain("OPENROUTER_API_KEY");

    const invalid = await route(requestFor({ phase7a: { action: "message", session_id: "short", message: "hello" } }));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ code: "phase7a_invalid_request" });
    const oversized = await route(requestFor({ phase7a: { action: "message", session_id: "session_oversized", message: "x".repeat(24_000) } }));
    expect(oversized.status).toBe(413);
  });

  it("rejects a concurrent paid turn for the same local session", async () => {
    const dependencies = createPhase7AFixtureDependencies([
      action({ action: "respond", public_summary: "Answer after a short fixture delay", message: "Done.", source_ids: [] }),
    ]);
    const decide = dependencies.controller.decide;
    dependencies.controller.decide = async (...args) => {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 80));
      return decide(...args);
    };
    const route = createPhase7AChatRoute({ dependencies: () => dependencies });
    const body = { phase7a: { action: "message", session_id: "session_concurrent", message: "Only run once" } };
    const first = await route(requestFor(body));
    const duplicate = await route(requestFor(body));
    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({ code: "phase7a_run_in_progress" });
    expect(await first.text()).toContain('"type":"data-message"');
  });

  it("degrades to an explicit unavailable response with no fixture substitution", async () => {
    const previousKey = process.env.OPENROUTER_API_KEY;
    const previousFlag = process.env.PHASE7A_LOCAL_LIVE;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.PHASE7A_LOCAL_LIVE;
    try {
      const response = await POST(requestFor({ phase7a: { action: "message", session_id: "session_no_provider", message: "Research this" } }));
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({ code: "phase7a_missing_key" });
    } finally {
      if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = previousKey;
      if (previousFlag === undefined) delete process.env.PHASE7A_LOCAL_LIVE;
      else process.env.PHASE7A_LOCAL_LIVE = previousFlag;
    }
    const routeSource = await readFile(resolve(root, "src/app/api/chat/route.ts"), "utf8");
    const componentSource = await readFile(resolve(root, "src/components/research-harness.tsx"), "utf8");
    expect(routeSource).not.toContain("createPhase6FixtureDependencies");
    expect(componentSource).not.toContain("Lake Bonneville");
    expect(componentSource).not.toContain("Demo/Live");
    expect(componentSource).not.toContain("OPENROUTER_API_KEY");
  });

  it("accepts the final live Headlines and Big Story evidence within the frozen caps", async () => {
    const report = JSON.parse(await readFile(resolve(root, "reports/phase-7a-live.json"), "utf8")) as {
      automatic_retries: number;
      failures: string[];
      aggregate_cost_usd: number;
      aggregate_provider_requests: number;
      cases: Array<{
        expected_mode: "headlines" | "big_story";
        receipt: { status: string; accounted_cost_usd: number; counts: { controller_turns: number; provider_requests: number; repairs: number } };
        artifact: { artifact: unknown };
        assistant_message: { text: string; source_ids: string[] };
      }>;
    };
    expect(report.failures).toEqual([]);
    expect(report.automatic_retries).toBe(0);
    expect(report.cases).toHaveLength(2);
    expect(report.aggregate_cost_usd).toBeLessThanOrEqual(PHASE_7A_LIMITS.liveProofTotalCostCapUsd);
    expect(report.aggregate_provider_requests).toBe(18);
    for (const item of report.cases) {
      const artifact = phase5ArtifactSchema.parse(item.artifact.artifact);
      const ledgerIds = new Set(artifact.source_ledger.map((source) => source.source_id));
      const citedIds: string[] = [];
      const visit = (value: unknown) => {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === "object") {
          for (const [key, child] of Object.entries(value)) {
            if (key === "source_ids" && Array.isArray(child)) citedIds.push(...child.filter((id): id is string => typeof id === "string"));
            else visit(child);
          }
        }
      };
      visit(artifact);
      expect(artifact.mode).toBe(item.expected_mode);
      expect(item.receipt.status).toBe("partial");
      expect(item.receipt.accounted_cost_usd).toBeLessThanOrEqual(PHASE_7A_LIMITS.costCapUsd);
      expect(item.receipt.counts.controller_turns).toBeLessThanOrEqual(PHASE_7A_LIMITS.maxControllerTurns);
      expect(item.receipt.counts.provider_requests).toBeLessThanOrEqual(PHASE_7A_LIMITS.maxProviderRequests);
      expect(item.receipt.counts.repairs).toBe(0);
      expect(citedIds.every((id) => ledgerIds.has(id))).toBe(true);
      expect(item.assistant_message.text).toContain("ready in the artifact panel");
      expect(item.assistant_message.source_ids.every((id) => ledgerIds.has(id))).toBe(true);
      const beats = artifact.mode === "headlines" ? artifact.flexible_outline : artifact.modular_outline;
      const target = artifact.mode === "headlines" ? 8 : 24;
      expect(beats.reduce((sum, beat) => sum + (beat.estimated_minutes ?? 0), 0)).toBeLessThanOrEqual(target);
    }
  });

  it("preserves failed live attempts and the successful browser handoff honestly", async () => {
    const initial = JSON.parse(await readFile(resolve(root, "reports/phase-7a-live-failed-initial.json"), "utf8")) as { cases: Array<{ receipt: { limitations: string[] } }> };
    const replacement = JSON.parse(await readFile(resolve(root, "reports/phase-7a-live-failed-replacement-1.json"), "utf8")) as { cases: Array<{ receipt: { status: string; limitations: string[] }; artifact: unknown }> };
    const browser = JSON.parse(await readFile(resolve(root, "reports/phase-7a-browser.json"), "utf8")) as {
      terminal_state: string;
      visible_receipt: { provider_requests: number; controller_turns: number; accounted_cost_usd_rounded: number };
      observed_tools: Record<string, number>;
      artifact: { visible_in_artifact_panel: boolean; mode: string };
      ui_assertions: { permanent_demo_live_badge_absent: boolean; blank_chat_first_state_before_message: boolean };
    };
    expect(initial.cases.every((item) => item.receipt.limitations.includes("phase7a_model_unavailable"))).toBe(true);
    expect(replacement.cases[0]?.artifact).not.toBeNull();
    expect(replacement.cases[0]?.receipt.status).toBe("failed");
    expect(replacement.cases[1]?.receipt.limitations).toContain("phase7a_controller_invalid");
    expect(browser).toMatchObject({
      terminal_state: "complete",
      visible_receipt: { provider_requests: 1, controller_turns: 1, accounted_cost_usd_rounded: 0.0022 },
      artifact: { visible_in_artifact_panel: true, mode: "headlines" },
      ui_assertions: { permanent_demo_live_badge_absent: true, blank_chat_first_state_before_message: true },
    });
    expect(Object.values(browser.observed_tools).every((count) => count === 0)).toBe(true);
  });
});
