import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it } from "vitest";
import { createPhase7AChatRoute } from "../src/app/api/chat/route.ts";
import { createPhase7AWorkspace, clearPhase7AWorkspacesForTest } from "../src/lib/phase7a/session-store.ts";
import {
  runStandardResearchTurn,
  STANDARD_RESEARCH_LIMITS,
  type StandardRuntimeDependencies,
} from "../src/lib/research-agent/standard.ts";
import type { Phase5ToolAdapter } from "../src/lib/phase5/workflow.ts";
import type { WebSearchResult } from "../src/lib/web-research/types.ts";
import {
  FIXTURE_CHUNK_ID,
  FIXTURE_WEB_SOURCE_ID,
  FIXTURE_WEB_URL,
  fixtureTools,
} from "./phase5-fixtures.ts";

type MockGenerateResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;

function modelStep(content: MockGenerateResult["content"]): MockGenerateResult {
  return {
    content,
    finishReason: { unified: "tool-calls", raw: undefined },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 5, text: 5, reasoning: undefined },
    },
    warnings: [],
  };
}

function textStep(text: string): MockGenerateResult {
  return { ...modelStep([{ type: "text", text }]), finishReason: { unified: "stop", raw: undefined } };
}

function toolCall(
  toolCallId: string,
  toolName: string,
  input: unknown,
): Extract<MockGenerateResult["content"][number], { type: "tool-call" }> {
  return { type: "tool-call", toolCallId, toolName, input: JSON.stringify(input) };
}

function dependencies(model: MockLanguageModelV4, tools: Phase5ToolAdapter = fixtureTools(), overrides: Partial<StandardRuntimeDependencies> = {}): StandardRuntimeDependencies {
  return {
    standardModel: model,
    modelId: "openai/gpt-5.6-luna",
    tools,
    ...overrides,
  };
}

function request(sessionId: string, message: string, depth: "standard" | "deep" = "standard") {
  return new Request("http://local.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phase7a: { action: "message", session_id: sessionId, message, research_depth: depth } }),
  });
}

function tenCandidateSearch(query: string, offset: number): WebSearchResult {
  return {
    status: "complete",
    query,
    retrieved_at: "2026-08-26T00:00:00.000Z",
    receipt: { provider_model: "openai/gpt-5.6-luna", provider_name: "OpenAI", cost_usd: 0.006, web_search_requests: 1 },
    sources: Array.from({ length: 10 }, (_, index) => {
      const number = offset + index;
      return {
        source_id: `web_candidate_${number}`,
        source_kind: "search_candidate" as const,
        availability: "candidate" as const,
        url: `https://example.com/result-${number}`,
        title: `Result ${number}`,
        excerpt: `Candidate excerpt ${number}`,
        retrieved_at: "2026-08-26T00:00:00.000Z",
        trust: "untrusted_external_content" as const,
        evidence_usable: false,
        receipt: {},
      };
    }),
  };
}

describe("Standard Research v2 single-Luna loop", () => {
  beforeEach(() => clearPhase7AWorkspacesForTest());

  it("reserves synthesis time and keeps Standard tool ceilings deliberately small", () => {
    expect(STANDARD_RESEARCH_LIMITS).toMatchObject({
      maxSearches: 6,
      maxResultsPerSearch: 10,
      maxCandidates: 60,
      maxCandidatesPerQueryForModel: 4,
      maxOpenedEvidenceCharactersForModel: 3_500,
      maxUrlReads: 5,
      maxTranscriptSearches: 1,
      maxTranscriptOpens: 3,
      researchCutoffMs: 50_000,
      hardDeadlineMs: 90_000,
      targetCostUsd: 0.2,
      ceilingCostUsd: 0.5,
    });
  });

  it("answers direct conversation in one Luna call without browsing or making a preparation brief", async () => {
    const model = new MockLanguageModelV4({ doGenerate: textStep("I can research current questions, inspect links, or check past episodes when that would help.") });
    const calls: string[] = [];
    const result = await runStandardResearchTurn({
      workspace: createPhase7AWorkspace("session_standard_direct"),
      message: "What can you help with?",
      runId: "run_standard_direct",
    }, dependencies(model, fixtureTools({ onCall: (name) => calls.push(name) }), {
      now: () => new Date("2026-08-26T12:00:00.000Z"),
    }));
    expect(result.status).toBe("complete");
    expect(result.assistant_message?.text).toContain("research current questions");
    expect(result.artifact).toBeNull();
    expect(result.counts).toMatchObject({ controller_turns: 1, grok_turns: 0, web_searches: 0, transcript_searches: 0 });
    expect(calls).toEqual([]);
    expect(model.doGenerateCalls[0]?.tools?.map((item) => item.name)).toEqual([
      "search_web",
      "read_urls",
      "search_transcripts",
      "open_transcript_chunks",
    ]);
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain("operative legal status");
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain("CURRENT DATE: 2026-08-26");
  });

  it("searches, selectively opens evidence, and returns natural server-validated citations through the chat stream", async () => {
    const model = new MockLanguageModelV4({ doGenerate: [
      modelStep([toolCall("search_one", "search_web", { queries: ["current food rule primary source"] })]),
      modelStep([toolCall("read_one", "read_urls", { urls: [FIXTURE_WEB_URL] })]),
      textStep("**Short answer:** the current rule is narrower than the headline suggests. [[evidence_1]]\n\nThe underlying source is the important evidence; the search result itself was only a candidate. [[evidence_1]]"),
    ] });
    const route = createPhase7AChatRoute({ dependencies: () => dependencies(model) });
    const response = await route(request("session_standard_route", "What changed, and does it matter?"));
    const stream = await response.text();
    expect(stream).toContain("Searched the web");
    expect(stream).toContain("Read 1 source");
    expect(stream).toContain("the current rule is narrower");
    expect(stream).toContain('"type":"data-source"');
    expect(stream).toContain('"type":"data-message"');
    expect(stream).toContain(FIXTURE_WEB_SOURCE_ID);
    expect(stream).not.toContain("[[evidence_1]]");
    expect(stream).not.toContain("Research plan ready");
    expect(stream).not.toContain("x-ai/grok-4.6");
  });

  it("uses a discovered Exa excerpt as honest partial evidence when the page cannot be opened", async () => {
    const model = new MockLanguageModelV4({ doGenerate: [
      modelStep([toolCall("fallback_search", "search_web", { queries: ["blocked official source"] })]),
      modelStep([toolCall("fallback_read", "read_urls", { urls: [FIXTURE_WEB_URL] })]),
      textStep("The limited search excerpt supports only this narrow point. [[evidence_1]]"),
    ] });
    const result = await runStandardResearchTurn({
      workspace: createPhase7AWorkspace("session_standard_search_excerpt"),
      message: "Check the blocked official source.",
    }, dependencies(model, fixtureTools({ pageAvailability: "unavailable" })));
    expect(result.status).toBe("partial");
    expect(result.limitations).toContain("read_url:search_excerpt_fallback");
    expect(result.workspace.evidence).toContainEqual(expect.objectContaining({
      source_id: FIXTURE_WEB_SOURCE_ID,
      availability: "partial",
      evidence_usable: true,
      failure_code: "search_excerpt_fallback",
    }));
    expect(result.assistant_message?.source_ids).toEqual([FIXTURE_WEB_SOURCE_ID]);
    expect(result.events).toContainEqual(expect.objectContaining({
      label: "Collected 1 source",
      status: "partial",
    }));
  });

  it("treats six searches and sixty candidates as ceilings, not quotas", async () => {
    let searchNumber = 0;
    let activeSearches = 0;
    let peakConcurrentSearches = 0;
    const tools = fixtureTools();
    tools.webSearch = async ({ query }) => {
      const offset = searchNumber++ * 10;
      activeSearches += 1;
      peakConcurrentSearches = Math.max(peakConcurrentSearches, activeSearches);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeSearches -= 1;
      return tenCandidateSearch(query, offset);
    };
    const model = new MockLanguageModelV4({ doGenerate: [
      modelStep([toolCall("search_batch", "search_web", {
        queries: ["query one", "query two", "query three", "query four", "query five", "query six"],
      })]),
      textStep("The bounded search pass found candidates but no page was opened, so I can't safely state the material conclusion yet. Run Deep Research if you want me to continue."),
    ] });
    const result = await runStandardResearchTurn({
      workspace: createPhase7AWorkspace("session_standard_boundaries"),
      message: "Map the current landscape.",
    }, dependencies(model, tools));
    expect(result.counts).toMatchObject({ web_searches: 6, web_candidates: 60, grok_turns: 0 });
    expect(result.workspace.candidates).toHaveLength(60);
    expect(searchNumber).toBe(6);
    expect(peakConcurrentSearches).toBe(6);
    expect(model.doGenerateCalls[1]?.tools?.map((item) => item.name)).not.toContain("search_web");
    const boundedToolContext = JSON.stringify(model.doGenerateCalls[1]?.prompt);
    expect(boundedToolContext).toContain("Candidate excerpt 3");
    expect(boundedToolContext).not.toMatch(/Candidate excerpt 4(?:\\?"|$)/);

    const earlyModel = new MockLanguageModelV4({ doGenerate: textStep("This conversational question does not need web research.") });
    const early = await runStandardResearchTurn({ workspace: createPhase7AWorkspace("session_standard_early"), message: "Say what this tool does." }, dependencies(earlyModel));
    expect(early.counts.web_searches).toBe(0);
  });

  it("closes research near 75 seconds and preserves the final Luna answer step", async () => {
    let clock = 0;
    const tools = fixtureTools();
    const original = tools.webSearch;
    tools.webSearch = async (input) => {
      const result = await original(input);
      clock = STANDARD_RESEARCH_LIMITS.researchCutoffMs + 1;
      return result;
    };
    const model = new MockLanguageModelV4({ doGenerate: [
      modelStep([toolCall("timed_search", "search_web", { queries: ["current bounded question"] })]),
      textStep("I reached the research cutoff before opening a central source, so the material point remains unresolved. Run Deep Research if that gap matters."),
    ] });
    const result = await runStandardResearchTurn({
      workspace: createPhase7AWorkspace("session_standard_time"),
      message: "Check the current question.",
    }, dependencies(model, tools, { clockMs: () => clock }));
    expect(result.elapsed_ms).toBeGreaterThanOrEqual(STANDARD_RESEARCH_LIMITS.researchCutoffMs);
    expect(result.counts.web_searches).toBe(1);
    expect(model.doGenerateCalls[1]?.tools).toBeUndefined();
    expect(JSON.stringify(model.doGenerateCalls[1]?.prompt)).not.toContain("Candidate excerpt");
    expect(JSON.stringify(model.doGenerateCalls[1]?.prompt)).toContain("FINAL SYNTHESIS STEP");
    expect(result.assistant_message?.text).toContain("Run Deep Research");
  });

  it("lets Luna skip the archive or choose search plus exact opening with adjacent context", async () => {
    const skipModel = new MockLanguageModelV4({ doGenerate: textStep("This greeting does not need an archive search.") });
    const skipped = await runStandardResearchTurn({ workspace: createPhase7AWorkspace("session_archive_skip"), message: "Hello." }, dependencies(skipModel));
    expect(skipped.counts.transcript_searches).toBe(0);

    const archiveModel = new MockLanguageModelV4({ doGenerate: [
      modelStep([toolCall("archive_search", "search_transcripts", { query: "old technology dependencies" })]),
      modelStep([toolCall("archive_open", "open_transcript_chunks", { chunk_ids: [FIXTURE_CHUNK_ID] })]),
      textStep("A past episode discussed how old systems survive because surrounding dependencies still rely on them. [[evidence_1]]"),
    ] });
    const opened = await runStandardResearchTurn({
      workspace: createPhase7AWorkspace("session_archive_use"),
      message: "Have they discussed why old technology survives?",
    }, dependencies(archiveModel));
    expect(opened.status).toBe("partial");
    expect(opened.limitations).toContain("archive:keyword_only");
    expect(opened.counts).toMatchObject({ transcript_searches: 1, transcript_opens: 1, grok_turns: 0 });
    expect(opened.assistant_message?.source_ids).toEqual([`archive_${FIXTURE_CHUNK_ID}`]);
  });

  it("rejects invented citation aliases instead of rendering an unsupported answer", async () => {
    const saved = createPhase7AWorkspace("session_invalid_standard_citation");
    const model = new MockLanguageModelV4({ doGenerate: textStep("A fabricated material claim. [[evidence_99]]") });
    const result = await runStandardResearchTurn({ workspace: saved, message: "Answer this." }, dependencies(model));
    expect(result.status).toBe("failed");
    expect(result.limitations).toContain("research_invalid_citation");
    expect(result.assistant_message?.text).toContain("didn't substitute an unsupported answer");
  });

  it("rejects leaked tool protocol instead of rendering it as an answer", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: textStep('I am checking.\n\nto=functions.search_web code:\n{"queries":["current rules"]}'),
    });
    const result = await runStandardResearchTurn({
      workspace: createPhase7AWorkspace("session_standard_tool_leak"),
      message: "What changed?",
    }, dependencies(model));
    expect(result.status).toBe("failed");
    expect(result.limitations).toContain("research_answer_exposed_tool_protocol");
    expect(result.assistant_message?.text).not.toContain("to=functions");
  });

  it("reuses saved evidence on a follow-up without repeating research", async () => {
    const firstModel = new MockLanguageModelV4({ doGenerate: [
      modelStep([toolCall("followup_search", "search_web", { queries: ["current fixture evidence"] })]),
      modelStep([toolCall("followup_read", "read_urls", { urls: [FIXTURE_WEB_URL] })]),
      textStep("The source establishes the initial point. [[evidence_1]]"),
    ] });
    const first = await runStandardResearchTurn({ workspace: createPhase7AWorkspace("session_standard_followup"), message: "Research the initial point." }, dependencies(firstModel));
    const secondModel = new MockLanguageModelV4({ doGenerate: textStep("The same saved source also supports the narrower follow-up. [[evidence_1]]") });
    const second = await runStandardResearchTurn({ workspace: first.workspace, message: "What is the narrower takeaway?" }, dependencies(secondModel));
    expect(second.status).toBe("complete");
    expect(second.counts).toMatchObject({ web_searches: 0, url_reads: 0, grok_turns: 0 });
    expect(second.assistant_message?.source_ids).toEqual([FIXTURE_WEB_SOURCE_ID]);
    expect(JSON.stringify(secondModel.doGenerateCalls[0]?.prompt)).toContain("SAVED USABLE EVIDENCE");
  });

  it("retries one transient Luna failure but never retries a deterministic citation failure", async () => {
    let calls = 0;
    const transientModel = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1;
        if (calls === 1) throw new Error("network unavailable");
        return textStep("The bounded retry recovered without switching models.");
      },
    });
    const recovered = await runStandardResearchTurn({ workspace: createPhase7AWorkspace("session_standard_retry"), message: "Answer conversationally." }, dependencies(transientModel));
    expect(recovered.status).toBe("complete");
    expect(calls).toBe(2);
    expect(recovered.limitations).toContain("standard_luna_transient_retry");
    expect(recovered.counts.grok_turns).toBe(0);

    const deterministicModel = new MockLanguageModelV4({ doGenerate: textStep("Unsupported. [[evidence_404]]") });
    const rejected = await runStandardResearchTurn({ workspace: createPhase7AWorkspace("session_standard_no_retry"), message: "Answer." }, dependencies(deterministicModel));
    expect(rejected.status).toBe("failed");
    expect(deterministicModel.doGenerateCalls).toHaveLength(1);
  });

  it("retries one classified transient Exa failure and does not retry deterministic no-match", async () => {
    let searchCalls = 0;
    const tools = fixtureTools();
    tools.webSearch = async ({ query }) => {
      searchCalls += 1;
      if (searchCalls === 1) {
        return {
          status: "unavailable",
          query,
          sources: [],
          retrieved_at: "2026-08-26T00:00:00.000Z",
          receipt: {},
          failure: { code: "timeout", message: "The bounded search timed out." },
        };
      }
      return tenCandidateSearch(query, 0);
    };
    const model = new MockLanguageModelV4({ doGenerate: [
      modelStep([toolCall("retry_search", "search_web", { queries: ["current retry evidence"] })]),
      textStep("The search recovered, but I did not open a source, so I am not claiming the material point is verified."),
    ] });
    const recovered = await runStandardResearchTurn({ workspace: createPhase7AWorkspace("session_search_retry"), message: "Check the current point." }, dependencies(model, tools));
    expect(searchCalls).toBe(2);
    expect(recovered.counts.web_searches).toBe(2);
    expect(recovered.limitations).toContain("standard_search_transient_retry");

    let noMatchCalls = 0;
    const noMatchTools = fixtureTools();
    noMatchTools.webSearch = async ({ query }) => {
      noMatchCalls += 1;
      return { status: "no_match", query, sources: [], retrieved_at: "2026-08-26T00:00:00.000Z", receipt: { cost_usd: 0.005, web_search_requests: 1 } };
    };
    const noMatchModel = new MockLanguageModelV4({ doGenerate: [
      modelStep([toolCall("no_match_search", "search_web", { queries: ["deliberately absent fixture"] })]),
      textStep("The bounded search found no relevant result, so I am leaving the point unresolved."),
    ] });
    await runStandardResearchTurn({ workspace: createPhase7AWorkspace("session_search_no_match"), message: "Look for the absent fixture." }, dependencies(noMatchModel, noMatchTools));
    expect(noMatchCalls).toBe(1);
  });
});
