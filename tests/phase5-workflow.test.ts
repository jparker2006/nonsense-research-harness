import { describe, expect, it, vi } from "vitest";
import { createOpenRouterPhase5Model } from "../src/lib/phase5/model.ts";
import { runPhase5Workflow } from "../src/lib/phase5/workflow.ts";
import {
  PHASE_5_LIMITS,
  type Phase5Artifact,
  type Phase5Input,
  type ResearchPlan,
} from "../src/lib/phase5/contracts.ts";
import {
  FIXTURE_WEB_URL,
  fixtureChunk,
  fixtureModel,
  fixtureSearch,
  fixtureTools,
  fixtureTranscriptSearch,
  validArtifact,
} from "./phase5-fixtures.ts";

const headlinesInput: Phase5Input = {
  mode: "headlines",
  topic: "Why old infrastructure refuses to retire",
  links: [],
  notes: "Focus on the dependency problem, not nostalgia.",
  target_minutes: 6,
};

const bigStoryInput: Phase5Input = {
  mode: "big_story",
  topic: "Why old infrastructure refuses to retire",
  links: [],
  notes: "Map the strongest competing explanations.",
  target_minutes: 24,
};

function invalidateCitation(artifact: Phase5Artifact): unknown {
  const copy = structuredClone(artifact);
  if (copy.mode === "headlines") copy.what_happened.source_ids = ["invented_source"];
  else copy.research_brief.source_ids = ["invented_source"];
  return copy;
}

describe("Phase 5 Mastra workflow", () => {
  it.each([
    ["headlines", headlinesInput],
    ["big story", bigStoryInput],
  ])("completes a validated %s fixture through all four tools", async (_label, input) => {
    const calls: string[] = [];
    const result = await runPhase5Workflow(
      input,
      {
        model: fixtureModel(),
        tools: fixtureTools({ onCall: (tool) => calls.push(tool) }),
      },
      { runId: `run_fixture_${input.mode}` },
    );
    expect(result).toMatchObject({
      run_id: `run_fixture_${input.mode}`,
      status: "complete",
      artifact: { mode: input.mode },
      validation_errors: [],
      repair_attempted: false,
      counts: {
        luna_turns: 1,
        grok_turns: 1,
        web_searches: 1,
        url_reads: 1,
        transcript_searches: 1,
        transcript_opens: 1,
        repairs: 0,
      },
    });
    expect(calls).toEqual(["webSearch", "readUrl", "searchTranscripts", "openTranscriptChunk"]);
    expect(result.evidence.every((source) => source.content === undefined)).toBe(true);
    expect(result.events[0]?.type).toBe("run_started");
    expect(result.events.at(-1)?.type).toBe("run_completed");
    expect(result.accounted_cost_usd).toBeLessThan(0.5);
  });

  it("returns a useful partial artifact when a non-critical web page is unavailable", async () => {
    const result = await runPhase5Workflow(headlinesInput, {
      model: fixtureModel(),
      tools: fixtureTools({ pageAvailability: "unavailable" }),
    });
    expect(result.status).toBe("partial");
    expect(result.artifact?.mode).toBe("headlines");
    expect(result.validation_errors).toEqual([]);
    expect(result.events.some((event) => event.type === "tool_failed" && event.tool === "read_url")).toBe(true);
    const unavailable = result.evidence.find((source) => source.url === FIXTURE_WEB_URL);
    expect(unavailable).toMatchObject({ availability: "unavailable", evidence_usable: false });
  });

  it("continues honestly from a web no-match when archive evidence is usable", async () => {
    const noMatch = fixtureSearch();
    noMatch.status = "no_match";
    noMatch.sources = [];
    const result = await runPhase5Workflow(headlinesInput, {
      model: fixtureModel(),
      tools: fixtureTools({ search: noMatch }),
    });
    expect(result).toMatchObject({ status: "partial", artifact: { mode: "headlines" }, validation_errors: [] });
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "tool_failed", tool: "web_search", status: "failed" }),
      ]),
    );
  });

  it("uses exactly one successful repair and then terminates", async () => {
    const result = await runPhase5Workflow(headlinesInput, {
      model: fixtureModel({
        compose: (input, evidence) => invalidateCitation(validArtifact(input, evidence)),
      }),
      tools: fixtureTools(),
    });
    expect(result).toMatchObject({
      status: "complete",
      repair_attempted: true,
      validation_errors: [],
      counts: { grok_turns: 2, repairs: 1 },
    });
    expect(result.events.filter((event) => event.type === "repair_started")).toHaveLength(1);
  });

  it("fills machine-owned source ledger fields in code without spending a repair", async () => {
    const result = await runPhase5Workflow(headlinesInput, {
      model: fixtureModel({
        compose: (input, evidence) => {
          const artifact = validArtifact(input, evidence);
          artifact.source_ledger[0]!.retrieved_at = "model invented timestamp";
          artifact.source_ledger[0]!.excerpt = "model paraphrased excerpt";
          return artifact;
        },
      }),
      tools: fixtureTools(),
    });
    expect(result).toMatchObject({
      status: "complete",
      validation_errors: [],
      repair_attempted: false,
      counts: { grok_turns: 1, repairs: 0 },
    });
    expect(result.artifact?.source_ledger[0]).toMatchObject({
      retrieved_at: "2026-08-24T08:00:00.000Z",
      excerpt: "A public agency kept an old system because replacement would break compatible equipment.",
    });
  });

  it("hydrates the complete source ledger when the model returns no ledger", async () => {
    const result = await runPhase5Workflow(headlinesInput, {
      model: fixtureModel({
        compose: (input, evidence) => {
          const draft = structuredClone(validArtifact(input, evidence));
          delete (draft as Partial<Phase5Artifact>).source_ledger;
          return draft;
        },
      }),
      tools: fixtureTools(),
    });
    expect(result).toMatchObject({
      status: "complete",
      repair_attempted: false,
      validation_errors: [],
    });
    expect(result.artifact?.source_ledger.map((source) => source.source_id)).toEqual([
      "web_fixture_current",
      "archive_chunk_fixture_archive",
    ]);
  });

  it("repairs malformed structured output once", async () => {
    const result = await runPhase5Workflow(headlinesInput, {
      model: fixtureModel({ compose: () => ({ malformed: true }) }),
      tools: fixtureTools(),
    });
    expect(result).toMatchObject({
      status: "complete",
      repair_attempted: true,
      validation_errors: [],
      counts: { grok_turns: 2, repairs: 1 },
    });
  });

  it.each(["empty", "invalid_json", "truncated", "incomplete"] as const)(
    "records %s composition output exactly and does not spend the repair call",
    async (outputStatus) => {
      const result = await runPhase5Workflow(headlinesInput, {
        model: fixtureModel({ compose: () => null, composeStatus: outputStatus }),
        tools: fixtureTools(),
      });
      expect(result).toMatchObject({
        status: "failed",
        artifact: null,
        repair_attempted: false,
        validation_errors: [`phase5_model_${outputStatus}_output`],
        counts: { grok_turns: 1, repairs: 0 },
      });
      expect(result.usage.find((usage) => usage.action === "grok_composition")).toMatchObject({
        output_status: outputStatus,
        finish_reason: "stop",
        response_characters: 100,
        reasoning_tokens: 10,
      });
      expect(result.events.some((event) => event.type === "repair_started")).toBe(false);
    },
  );

  it("fails after one repair when structured output stays malformed", async () => {
    const result = await runPhase5Workflow(headlinesInput, {
      model: fixtureModel({ compose: () => ({ malformed: true }), repair: () => ({ still_bad: true }) }),
      tools: fixtureTools(),
    });
    expect(result.status).toBe("failed");
    expect(result.artifact).toBeNull();
    expect(result.repair_attempted).toBe(true);
    expect(result.counts.repairs).toBe(1);
  });

  it("fails honestly after the only repair also violates citation integrity", async () => {
    const invalid = (input: Phase5Input, evidence: Parameters<typeof validArtifact>[1]) =>
      invalidateCitation(validArtifact(input, evidence));
    const result = await runPhase5Workflow(headlinesInput, {
      model: fixtureModel({ compose: invalid, repair: invalid }),
      tools: fixtureTools(),
    });
    expect(result.status).toBe("partial");
    expect(result.artifact?.mode).toBe("headlines");
    expect(result.validation_errors).toContain("citation:unknown_source:invented_source");
    expect(result.counts.repairs).toBe(1);
    expect(result.events.filter((event) => event.type === "repair_started")).toHaveLength(1);
  });

  it("rejects malformed planner output before any tool call", async () => {
    const toolCalls = vi.fn();
    const invalidPlan = { web_queries: [], archive_queries: [] } as unknown as ResearchPlan;
    const result = await runPhase5Workflow(headlinesInput, {
      model: fixtureModel({ plan: invalidPlan }),
      tools: fixtureTools({ onCall: toolCalls }),
    });
    expect(result.status).toBe("failed");
    expect(result.plan).toBeNull();
    expect(result.counts).toMatchObject({ luna_turns: 1, web_searches: 0, transcript_searches: 0, grok_turns: 0 });
    expect(toolCalls).not.toHaveBeenCalled();
  });

  it("fails closed before a paid action would cross the per-run cost cap", async () => {
    const result = await runPhase5Workflow(headlinesInput, {
      model: fixtureModel({ planCost: 0.49 }),
      tools: fixtureTools(),
    });
    expect(result.status).toBe("failed");
    expect(result.accounted_cost_usd).toBe(0.49);
    expect(result.counts).toMatchObject({ web_searches: 0, transcript_searches: 0, grok_turns: 0 });
    expect(result.validation_errors).toContain("phase5_budget_exhausted");
  });

  it("records a provider-reported cap crossing and makes no subsequent calls", async () => {
    const toolCalls = vi.fn();
    const result = await runPhase5Workflow(headlinesInput, {
      model: fixtureModel({ planCost: 0.51 }),
      tools: fixtureTools({ onCall: toolCalls }),
    });
    expect(result).toMatchObject({ status: "failed", accounted_cost_usd: 0.51 });
    expect(result.validation_errors).toContain("phase5_budget_crossed");
    expect(toolCalls).not.toHaveBeenCalled();
  });

  it("never exceeds six URL reads even when supplied links and search candidates compete", async () => {
    const threeCandidates = fixtureSearch();
    threeCandidates.sources = [1, 2, 3].map((index) => ({
      ...threeCandidates.sources[0]!,
      source_id: `web_candidate_${index}`,
      url: `https://example.com/story-${index}`,
    }));
    const twoQueries: ResearchPlan = {
      web_queries: ["current infrastructure case one", "current infrastructure case two"],
      archive_queries: ["old technology replacement"],
    };
    let reads = 0;
    const result = await runPhase5Workflow(
      {
        ...bigStoryInput,
        links: [
          "https://example.com/supplied-1",
          "https://example.com/supplied-2",
          "https://example.com/supplied-3",
        ],
      },
      {
        model: fixtureModel({ plan: twoQueries }),
        tools: fixtureTools({ search: threeCandidates, onCall: (tool) => { if (tool === "readUrl") reads += 1; } }),
      },
    );
    expect(reads).toBe(6);
    expect(result.counts.url_reads).toBe(6);
    expect(result.counts.web_searches).toBe(2);
  });

  it("uses both Big Story queries, story-section filters, two opens per query, and no duplicate chunks", async () => {
    const plan: ResearchPlan = {
      web_queries: ["current infrastructure evidence", "independent infrastructure analysis"],
      archive_queries: ["AI electricity infrastructure", "data center physical buildout"],
    };
    const tools = fixtureTools();
    const searches: Array<{ query: string; filters?: unknown; limit?: number }> = [];
    const opened: string[] = [];
    const matches = Array.from({ length: 4 }, (_, index) => ({
      ...fixtureTranscriptSearch.matches[0]!,
      chunk_id: `chunk_story_${index + 1}`,
      segment_id: `segment_story_${index + 1}`,
      segment_role: "story_section",
    }));
    tools.searchTranscripts = async (searchInput) => {
      searches.push(searchInput);
      return {
        result: {
          ...fixtureTranscriptSearch,
          query: searchInput.query,
          matches,
        },
      };
    };
    tools.openTranscriptChunk = ({ chunk_id }) => {
      opened.push(chunk_id);
      const index = Number(chunk_id.split("_").at(-1));
      return {
        status: "complete",
        adjacent_chunks: [],
        chunk: {
          ...fixtureChunk,
          chunk_id,
          segment_id: `segment_story_${index}`,
          segment_role: "story_section",
        },
      };
    };
    const result = await runPhase5Workflow(bigStoryInput, {
      model: fixtureModel({ plan }),
      tools,
    });
    expect(result.status).toBe("complete");
    expect(result.counts).toMatchObject({
      web_searches: 2,
      transcript_searches: 2,
      transcript_opens: 4,
    });
    expect(searches).toEqual([
      { query: plan.archive_queries[0], filters: { episode_format: "big_story", segment_role: "story_section" }, limit: 4 },
      { query: plan.archive_queries[1], filters: { episode_format: "big_story", segment_role: "story_section" }, limit: 4 },
    ]);
    expect(opened).toEqual(["chunk_story_1", "chunk_story_2", "chunk_story_3", "chunk_story_4"]);
  });

  it("does not re-read or overwrite a supplied link returned by web search", async () => {
    let reads = 0;
    const result = await runPhase5Workflow(
      { ...headlinesInput, links: [FIXTURE_WEB_URL] },
      {
        model: fixtureModel(),
        tools: fixtureTools({ onCall: (tool) => { if (tool === "readUrl") reads += 1; } }),
      },
    );
    expect(reads).toBe(1);
    expect(result.counts.url_reads).toBe(1);
    expect(result.evidence.find((source) => source.source_id === "web_fixture_current")?.source_type).toBe(
      "provided_link",
    );
  });

  it("provider-disabled execution makes zero fetch or tool calls", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    const toolCalls = vi.fn();
    const result = await runPhase5Workflow(headlinesInput, {
      model: createOpenRouterPhase5Model({
        apiKey: "synthetic",
        liveAuthorized: false,
        fetchImpl: fetchSpy,
      }),
      tools: fixtureTools({ onCall: toolCalls }),
    });
    expect(result.status).toBe("failed");
    expect(result.validation_errors).toContain("phase5_live_not_authorized");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(toolCalls).not.toHaveBeenCalled();
  });

  it("bounds and sanitizes visible events", async () => {
    const result = await runPhase5Workflow(headlinesInput, {
      model: fixtureModel(),
      tools: fixtureTools(),
    });
    const rendered = JSON.stringify(result.events);
    expect(rendered).not.toMatch(/chain.of.thought|system prompt|OPENROUTER_API_KEY|Bearer\s+|sk-or-/i);
    expect(result.events.every((event) => event.summary.length <= 300)).toBe(true);
    expect(new Set(result.events.map((event) => event.event_id)).size).toBe(result.events.length);
  });

  it("sanitizes unexpected adapter exceptions and records thrown reads as unavailable evidence", async () => {
    const tools = fixtureTools();
    tools.readUrl = async () => {
      throw new Error(["SECRET", "Bearer", ["sk", "or", "should-never-render"].join("-")].join(" "));
    };
    const result = await runPhase5Workflow(
      { ...headlinesInput, links: [FIXTURE_WEB_URL] },
      { model: fixtureModel(), tools },
    );
    expect(result.status).toBe("partial");
    expect(result.evidence.find((source) => source.url === FIXTURE_WEB_URL)).toMatchObject({
      availability: "unavailable",
      evidence_usable: false,
      failure_code: "read_unavailable",
    });
    const rendered = JSON.stringify(result);
    expect(rendered).not.toMatch(/SECRET|Bearer|sk-or-/);
    expect(rendered).toContain("read_unavailable");
  });

  it("terminates before tools when the whole-run clock is exhausted", async () => {
    const toolCalls = vi.fn();
    let clockCalls = 0;
    const result = await runPhase5Workflow(headlinesInput, {
      model: fixtureModel(),
      tools: fixtureTools({ onCall: toolCalls }),
      clockMs: () => (clockCalls++ === 0 ? 0 : PHASE_5_LIMITS.wholeRunTimeoutMs + 1),
    });
    expect(result.status).toBe("failed");
    expect(result.validation_errors).toContain("phase5_run_timeout");
    expect(toolCalls).not.toHaveBeenCalled();
    expect(result.counts.luna_turns).toBe(0);
  });

  it("returns an inspectable failed result when a tool crosses the whole-run clock", async () => {
    let clock = 0;
    const calls: string[] = [];
    const result = await runPhase5Workflow(headlinesInput, {
      model: fixtureModel(),
      tools: fixtureTools({
        onCall: (tool) => {
          calls.push(tool);
          if (tool === "webSearch") clock = PHASE_5_LIMITS.wholeRunTimeoutMs + 1;
        },
      }),
      clockMs: () => clock,
    });
    expect(result).toMatchObject({ status: "failed", validation_errors: ["phase5_run_timeout"] });
    expect(calls).toEqual(["webSearch"]);
    expect(result.events.at(-1)).toMatchObject({ type: "run_failed", detail: { code: "phase5_run_timeout" } });
  });
});
