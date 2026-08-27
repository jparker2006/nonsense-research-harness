import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it } from "vitest";
import { createPhase7AChatRoute } from "../src/app/api/chat/route.ts";
import { clearPhase7AWorkspacesForTest, createPhase7AWorkspace } from "../src/lib/phase7a/session-store.ts";
import {
  ONE_AGENT_LIMITS,
  requestedOneAgentArtifactMode,
  runOneAgentResearchTurn,
  type OneAgentRuntimeDependencies,
} from "../src/lib/research-agent/one-agent.ts";
import type { Phase5ToolAdapter } from "../src/lib/phase5/workflow.ts";
import type { WebSearchResult } from "../src/lib/web-research/types.ts";
import {
  FIXTURE_CHUNK_ID,
  FIXTURE_WEB_SOURCE_ID,
  FIXTURE_WEB_URL,
  fixtureChunk,
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

function dependencies(
  model: MockLanguageModelV4,
  tools: Phase5ToolAdapter = fixtureTools(),
  overrides: Partial<OneAgentRuntimeDependencies> = {},
): OneAgentRuntimeDependencies {
  return {
    model,
    modelId: "openai/gpt-5.6-luna",
    tools,
    now: () => new Date("2026-08-26T12:00:00.000Z"),
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

function headlinesArtifact() {
  const sourced = (text: string) => ({ text, source_ids: ["evidence_1"] });
  return {
    mode: "headlines" as const,
    working_title: "The fixture rule is narrower than the headline",
    past_nonsense_coverage: { status: "no_relevant_archive_match" as const, items: [] },
    conversation_questions: ["What actually changed?", "What should listeners watch next?"],
    uncertainties_and_open_checks: ["The next implementation date remains open."],
    what_happened: sourced("The official source describes a bounded change."),
    why_it_matters_now: sourced("The immediate effect is narrower than broad coverage implies."),
    verified_facts: [sourced("The retrieved page is the direct supporting evidence.")],
    tension_or_argument: sourced("The direction matters more than the immediate legal effect."),
    surprising_details: [sourced("The most consequential step is not the loudest headline.")],
    flexible_outline: [
      { priority: "essential" as const, text: "Lead with the operative change.", source_ids: ["evidence_1"] },
      { priority: "strong" as const, text: "Explain why the direction still matters.", source_ids: ["evidence_1"] },
      { priority: "optional" as const, text: "Add the secondary implementation detail.", source_ids: ["evidence_1"] },
    ],
  };
}

function numberedHeadlinesArtifact(): ReturnType<typeof headlinesArtifact> {
  return JSON.parse(JSON.stringify(headlinesArtifact()).replaceAll("evidence_1", "[1] example.com")) as ReturnType<typeof headlinesArtifact>;
}

function tenCandidateSearch(query: string, offset: number): WebSearchResult {
  return {
    status: "complete",
    query,
    retrieved_at: "2026-08-26T00:00:00.000Z",
    receipt: { provider_model: "direct-exa-search", provider_name: "Exa", cost_usd: 0.004, web_search_requests: 1 },
    sources: Array.from({ length: 10 }, (_, index) => {
      const number = offset + index;
      return {
        source_id: `candidate_${number}`,
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

describe("one continuous Nonsense Research Agent", () => {
  beforeEach(() => clearPhase7AWorkspacesForTest());

  it("uses the same Luna ToolLoopAgent shape for ordinary, Deep, and explicit-artifact turns", async () => {
    expect(ONE_AGENT_LIMITS.standard).toMatchObject({
      maxSearches: 6,
      maxCandidates: 60,
      maxUrlReads: 12,
      maxAgentSteps: 12,
      researchCutoffMs: 50_000,
      hardDeadlineMs: 120_000,
      ceilingCostUsd: 0.5,
    });
    expect(ONE_AGENT_LIMITS.deep).toMatchObject({ maxSearches: 18, maxCandidates: 120, maxUrlReads: 30, maxAgentSteps: 24, ceilingCostUsd: 2 });

    const ordinary = new MockLanguageModelV4({ doGenerate: textStep("I can investigate a current question or continue a saved line of research.") });
    await runOneAgentResearchTurn({ workspace: createPhase7AWorkspace("session_one_agent_plain"), message: "What can you do?" }, dependencies(ordinary));
    expect(ordinary.doGenerateCalls[0]?.tools?.map((item) => item.name)).toEqual([
      "search_web",
      "read_urls",
      "search_transcripts",
      "open_transcript_chunks",
      "submit_answer",
    ]);

    const deep = new MockLanguageModelV4({ doGenerate: textStep("The question is already narrow enough to answer without spending the larger budget.") });
    const deepResult = await runOneAgentResearchTurn({ workspace: createPhase7AWorkspace("session_one_agent_deep"), message: "Research this deeply.", researchDepth: "deep" }, dependencies(deep));
    expect(deep.doGenerateCalls[0]?.tools?.map((item) => item.name)).toEqual(ordinary.doGenerateCalls[0]?.tools?.map((item) => item.name));
    expect(deepResult.events).toContainEqual(expect.objectContaining({ label: "Deep Research plan" }));

    const briefMessage = "Create a Headlines preparation brief about this topic.";
    const brief = new MockLanguageModelV4({ doGenerate: textStep("I need evidence before creating that brief.") });
    await runOneAgentResearchTurn({
      workspace: createPhase7AWorkspace("session_one_agent_brief_tools"),
      message: briefMessage,
      artifactMode: requestedOneAgentArtifactMode(briefMessage, null),
    }, dependencies(brief));
    expect(brief.doGenerateCalls[0]?.tools?.map((item) => item.name)).toContain("create_or_update_artifact");
    expect(JSON.stringify([...ordinary.doGenerateCalls, ...deep.doGenerateCalls, ...brief.doGenerateCalls])).not.toMatch(/grok|manager|worker|fallback/i);
  });

  it("streams direct search, safe reading, validated citations, and model plus Exa receipt counts", async () => {
    const model = new MockLanguageModelV4({ doGenerate: [
      modelStep([toolCall("search", "search_web", {
        queries: ["current fixture rule official source"],
        allowed_domains: [],
        excluded_domains: [],
      })]),
      modelStep([toolCall("read", "read_urls", { urls: [FIXTURE_WEB_URL] })]),
      modelStep([toolCall("answer", "submit_answer", {
        paragraphs: [{
          markdown: "**Short answer:** the operative change is narrower than the headline suggests.",
          citations: [1],
        }],
      })]),
    ] });
    const tools = fixtureTools();
    const search = tools.webSearch;
    tools.webSearch = async (input) => {
      expect(input.allowed_domains).toBeUndefined();
      expect(input.excluded_domains).toBeUndefined();
      const result = await search(input);
      return { ...result, receipt: { ...result.receipt, provider_model: "direct-exa-search", provider_name: "Exa", web_search_requests: 1, cost_usd: 0.004 } };
    };
    const route = createPhase7AChatRoute({ dependencies: () => dependencies(model, tools) });
    const response = await route(request("session_one_agent_route", "What changed, and does it matter?"));
    const stream = await response.text();
    expect(stream).toContain("Searched the web");
    expect(stream).toContain("Read 1 source");
    expect(stream).toContain("the operative change is narrower");
    expect(stream).toContain(`"model_requests":3`);
    expect(stream).toContain(`"exa_search_requests":1`);
    expect(stream).toContain(`"grok_turns":0`);
    expect(stream).toContain(`"luna_usd":0.09`);
    expect(stream).not.toContain("[[evidence_1]]");
    expect(stream).not.toContain("submit_answer");
    expect(JSON.stringify(model.doGenerateCalls[2]?.prompt)).toContain("ANSWER CITATION CONTRACT");
    expect(JSON.stringify(model.doGenerateCalls[2]?.prompt)).toContain("[1]");
  });

  it("fans six independent searches out concurrently without treating the ceiling as a quota", async () => {
    let next = 0;
    let active = 0;
    let peak = 0;
    const tools = fixtureTools();
    tools.webSearch = async ({ query }) => {
      const offset = next++ * 10;
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return tenCandidateSearch(query, offset);
    };
    const model = new MockLanguageModelV4({ doGenerate: [
      modelStep([toolCall("batch", "search_web", { queries: ["query one", "query two", "query three", "query four", "query five", "query six"] })]),
      textStep("The search found candidates, but no page was opened, so the material conclusion remains unresolved. Run Deep Research if that gap matters."),
    ] });
    const result = await runOneAgentResearchTurn({ workspace: createPhase7AWorkspace("session_one_agent_parallel"), message: "Map the current landscape." }, dependencies(model, tools));
    expect(result.counts).toMatchObject({ web_searches: 6, web_candidates: 60, exa_search_requests: 6 });
    expect(peak).toBe(6);
    expect(result.workspace.evidence).toHaveLength(0);
    expect(model.doGenerateCalls[1]?.tools?.map((item) => item.name)).not.toContain("search_web");
  });

  it("suppresses repeated actions only inside one run and permits the same research on a legitimate follow-up", async () => {
    let calls = 0;
    const tools = fixtureTools();
    tools.webSearch = async ({ query }) => {
      calls += 1;
      return tenCandidateSearch(query, 0);
    };
    const firstModel = new MockLanguageModelV4({ doGenerate: [
      modelStep([toolCall("first", "search_web", { queries: ["same current query"] })]),
      modelStep([toolCall("repeat", "search_web", { queries: ["same current query"] })]),
      textStep("I already ran that bounded search, but no source was opened, so the point remains unresolved."),
    ] });
    const first = await runOneAgentResearchTurn({ workspace: createPhase7AWorkspace("session_one_agent_repeat"), message: "Check this topic." }, dependencies(firstModel, tools));
    expect(calls).toBe(1);
    expect(first.counts.web_searches).toBe(1);
    expect(first.events).toContainEqual(expect.objectContaining({ label: "Search already completed" }));

    const followupModel = new MockLanguageModelV4({ doGenerate: [
      modelStep([toolCall("legitimate-followup", "search_web", { queries: ["same current query"] })]),
      textStep("The follow-up was allowed to refresh the search, but no page was opened, so I am still not asserting the material claim."),
    ] });
    const second = await runOneAgentResearchTurn({ workspace: first.workspace, message: "Refresh that exact search now." }, dependencies(followupModel, tools));
    expect(calls).toBe(2);
    expect(second.counts.web_searches).toBe(1);
  });

  it("never promotes search candidates or unreadable pages into citeable evidence and repairs once in the same context", async () => {
    const model = new MockLanguageModelV4({ doGenerate: [
      modelStep([toolCall("search", "search_web", { queries: ["blocked official source"] })]),
      modelStep([toolCall("read", "read_urls", { urls: [FIXTURE_WEB_URL] })]),
      textStep("The blocked page proves the claim. [[evidence_1]]"),
      textStep("The page could not be retrieved, so I cannot verify the material claim from that candidate. Run Deep Research if the unresolved point matters."),
    ] });
    const result = await runOneAgentResearchTurn({ workspace: createPhase7AWorkspace("session_one_agent_unreadable"), message: "Verify this claim." }, dependencies(model, fixtureTools({ pageAvailability: "unavailable" })));
    expect(result.status).toBe("partial");
    expect(result.counts.repairs).toBe(1);
    expect(model.doGenerateCalls).toHaveLength(4);
    expect(result.assistant_message?.source_ids).toEqual([]);
    expect(result.workspace.evidence).toContainEqual(expect.objectContaining({ evidence_usable: false }));
    expect(result.limitations.some((item) => item.startsWith("read_url:"))).toBe(true);
  });

  it("lets the agent choose the archive, opens exact S3-4 provenance, and carries full tool history into a follow-up", async () => {
    const firstModel = new MockLanguageModelV4({ doGenerate: [
      modelStep([toolCall("search", "search_web", { queries: ["current fixture question"] })]),
      modelStep([toolCall("read", "read_urls", { urls: [FIXTURE_WEB_URL] })]),
      textStep("The current source establishes the starting point. [[evidence_1]]"),
    ] });
    const first = await runOneAgentResearchTurn({ workspace: createPhase7AWorkspace("session_one_agent_followup"), message: "Research the current point." }, dependencies(firstModel));
    expect(first.workspace.agent_messages.length).toBeGreaterThan(4);

    const followupModel = new MockLanguageModelV4({ doGenerate: [
      modelStep([toolCall("archive-search", "search_transcripts", { query: "old technology dependencies" })]),
      modelStep([toolCall("archive-open", "open_transcript_chunks", { chunk_ids: [FIXTURE_CHUNK_ID] })]),
      textStep("Past Nonsense coverage made the same dependency point, while the saved current source supplies the present context. [[evidence_2]] [[evidence_1]]"),
    ] });
    const second = await runOneAgentResearchTurn({ workspace: first.workspace, message: "Did Nonsense cover a similar dependency before?" }, dependencies(followupModel));
    expect(second.counts).toMatchObject({ transcript_searches: 1, transcript_opens: 1, web_searches: 0 });
    expect(second.assistant_message?.source_ids).toEqual([`archive_${FIXTURE_CHUNK_ID}`, FIXTURE_WEB_SOURCE_ID]);
    expect(second.workspace.evidence).toContainEqual(expect.objectContaining({ source_id: `archive_${FIXTURE_CHUNK_ID}`, chunk_id: FIXTURE_CHUNK_ID, evidence_usable: true }));
    const followupPrompt = JSON.stringify(followupModel.doGenerateCalls[0]?.prompt);
    expect(followupPrompt).toContain("The current source establishes the starting point");
    expect(followupPrompt).toContain("tool-result");
  });

  it("creates a validated priority-only artifact only when explicitly requested", async () => {
    const message = "Create a Headlines preparation brief from this research.";
    const model = new MockLanguageModelV4({ doGenerate: [
      modelStep([toolCall("search", "search_web", { queries: ["current fixture evidence"] })]),
      modelStep([toolCall("read", "read_urls", { urls: [FIXTURE_WEB_URL] })]),
      modelStep([toolCall("artifact", "create_or_update_artifact", numberedHeadlinesArtifact())]),
      textStep("The sourced Headlines brief is ready. [[evidence_1]]"),
    ] });
    const result = await runOneAgentResearchTurn({
      workspace: createPhase7AWorkspace("session_one_agent_artifact"),
      message,
      artifactMode: requestedOneAgentArtifactMode(message, null),
    }, dependencies(model));
    expect(result.status).toBe("complete");
    expect(result.artifact?.mode).toBe("headlines");
    expect(result.artifact_revision).toBe(1);
    expect(result.counts).toMatchObject({ artifact_calls: 1, compositions: 1, grok_turns: 0 });
    const outline = result.artifact?.mode === "headlines" ? result.artifact.flexible_outline : [];
    expect(new Set(outline.map((beat) => beat.priority))).toEqual(new Set(["essential", "strong", "optional"]));
    expect(JSON.stringify(result.artifact)).not.toMatch(/estimated_minutes|target_minutes/);
    expect(requestedOneAgentArtifactMode("Research this topic carefully.", null)).toBeNull();
  });

  it("hydrates server-owned archive identifiers when an artifact cites an opened exact quote", async () => {
    const message = "Create a Headlines preparation brief from the relevant past episode.";
    const artifact = headlinesArtifact();
    artifact.past_nonsense_coverage = {
      status: "matches",
      items: [{
        source_id: "[1]",
        quote: "Older systems survive because replacement means rebuilding every dependency around them.",
      }],
    } as never;
    const model = new MockLanguageModelV4({ doGenerate: [
      modelStep([toolCall("archive-search", "search_transcripts", { query: "old technology replacement" })]),
      modelStep([toolCall("archive-open", "open_transcript_chunks", { chunk_ids: [FIXTURE_CHUNK_ID] })]),
      modelStep([toolCall("archive-artifact", "create_or_update_artifact", artifact)]),
      modelStep([toolCall("archive-answer", "submit_answer", {
        paragraphs: [{ markdown: "The sourced preparation brief is ready.", citations: [1] }],
      })]),
    ] });
    const result = await runOneAgentResearchTurn({
      workspace: createPhase7AWorkspace("session_one_agent_archive_artifact"),
      message,
      artifactMode: "headlines",
    }, dependencies(model));
    const reference = result.artifact?.past_nonsense_coverage.items[0];
    expect(reference).toMatchObject({
      source_id: `archive_${FIXTURE_CHUNK_ID}`,
      episode_id: fixtureChunk.episode_id,
      segment_id: fixtureChunk.segment_id,
      chunk_id: fixtureChunk.chunk_id,
    });
    expect(result.artifact_revision).toBe(1);
    expect(result.counts.artifact_calls).toBe(1);
  });

  it("repairs an invalid artifact once, then revises the same artifact without discarding a simulated manual edit", async () => {
    const message = "Create a Headlines preparation brief from this research.";
    const invalid = headlinesArtifact();
    invalid.flexible_outline = invalid.flexible_outline.map((beat) => ({ ...beat, priority: "essential" as const }));
    const createModel = new MockLanguageModelV4({ doGenerate: [
      modelStep([toolCall("search", "search_web", { queries: ["current fixture evidence"] })]),
      modelStep([toolCall("read", "read_urls", { urls: [FIXTURE_WEB_URL] })]),
      modelStep([toolCall("artifact-invalid", "create_or_update_artifact", invalid)]),
      modelStep([toolCall("artifact-repaired", "create_or_update_artifact", headlinesArtifact())]),
      textStep("The repaired sourced brief is ready. [[evidence_1]]"),
    ] });
    const created = await runOneAgentResearchTurn({
      workspace: createPhase7AWorkspace("session_one_agent_artifact_repair"),
      message,
      artifactMode: "headlines",
    }, dependencies(createModel));
    expect(created.artifact_revision).toBe(1);
    expect(created.counts.repairs).toBe(1);
    expect(createModel.doGenerateCalls).toHaveLength(5);
    expect(createModel.doGenerateCalls[3]?.toolChoice).toEqual({ type: "tool", toolName: "create_or_update_artifact" });

    const editedWorkspace = structuredClone(created.workspace);
    if (!editedWorkspace.artifact || editedWorkspace.artifact.mode !== "headlines") throw new Error("fixture_artifact_missing");
    editedWorkspace.artifact.conversation_questions[0] = "Manual editor question that must survive the revision.";
    const revision = headlinesArtifact();
    revision.working_title = "Updated working title";
    revision.conversation_questions[0] = "Manual editor question that must survive the revision.";
    const reviseMessage = "Update the current Headlines preparation brief title only.";
    const reviseModel = new MockLanguageModelV4({ doGenerate: [
      modelStep([toolCall("artifact-revise", "create_or_update_artifact", revision)]),
      textStep("The same brief is now revision two; the manual question remains intact. [[evidence_1]]"),
    ] });
    const revised = await runOneAgentResearchTurn({
      workspace: editedWorkspace,
      message: reviseMessage,
      artifactMode: requestedOneAgentArtifactMode(reviseMessage, editedWorkspace.artifact),
    }, dependencies(reviseModel));
    expect(revised.artifact_revision).toBe(2);
    expect(revised.artifact?.working_title).toBe("Updated working title");
    expect(revised.artifact?.conversation_questions[0]).toBe("Manual editor question that must survive the revision.");
    expect(revised.counts).toMatchObject({ artifact_calls: 1, web_searches: 0, url_reads: 0, grok_turns: 0 });
  });

  it("does not publish unsupported factual prose when web research is unavailable", async () => {
    const tools = fixtureTools();
    tools.webSearch = async ({ query }) => ({
      status: "unavailable",
      query,
      sources: [],
      retrieved_at: "2026-08-26T00:00:00.000Z",
      receipt: {},
      failure: { code: "provider_unavailable", message: "Direct web search is unavailable." },
    });
    const model = new MockLanguageModelV4({ doGenerate: [
      modelStep([toolCall("search", "search_web", { queries: ["current unsupported claim"], allowed_domains: [] })]),
      textStep("Here are several current factual claims without any source."),
      textStep("Here are the same unsupported claims after validation."),
    ] });
    const result = await runOneAgentResearchTurn(
      { workspace: createPhase7AWorkspace("session_one_agent_search_unavailable"), message: "What changed today?" },
      dependencies(model, tools),
    );
    expect(model.doGenerateCalls).toHaveLength(4);
    expect(result.counts.repairs).toBe(2);
    expect(result.status).toBe("failed");
    expect(result.assistant_message?.text).toContain("didn't substitute an unsupported answer");
    expect(result.assistant_message?.text).not.toContain("several current factual claims");
  });

  it("compacts persisted history without orphaning a tool result across follow-up turns", async () => {
    const workspace = createPhase7AWorkspace("session_one_agent_history_boundary");
    workspace.agent_messages = [
      {
        role: "tool",
        content: [{
          type: "tool-result",
          toolCallId: "orphaned-call",
          toolName: "search_web",
          output: { type: "json", value: { status: "complete" } },
        }],
      },
      { role: "user", content: "Earlier valid question." },
      { role: "assistant", content: "Earlier valid answer." },
    ];
    const model = new MockLanguageModelV4({ doGenerate: textStep("The saved conversation remains usable.") });
    const result = await runOneAgentResearchTurn(
      { workspace, message: "Create a Headlines preparation brief from the saved conversation.", artifactMode: "headlines" },
      dependencies(model),
    );
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(prompt).not.toContain("orphaned-call");
    expect(prompt).toContain("Earlier valid question");
    expect(result.status).toBe("complete");
  });

  it("uses at most two same-context answer recovery calls when Luna returns an empty submission", async () => {
    const model = new MockLanguageModelV4({ doGenerate: [
      textStep(""),
      textStep(""),
      modelStep([toolCall("recovered-answer", "submit_answer", {
        paragraphs: [{ markdown: "The bounded answer recovery completed without inventing evidence.", citations: [] }],
      })]),
    ] });
    const result = await runOneAgentResearchTurn(
      { workspace: createPhase7AWorkspace("session_one_agent_answer_recovery"), message: "Explain the available capability." },
      dependencies(model),
    );
    expect(model.doGenerateCalls).toHaveLength(3);
    expect(result.counts.repairs).toBe(2);
    expect(result.status).toBe("complete");
    expect(result.assistant_message?.text).toContain("bounded answer recovery completed");
  });

  it("does not automatically retry a failed whole run", async () => {
    const model = new MockLanguageModelV4({ doGenerate: async () => { throw new Error("provider unavailable"); } });
    const result = await runOneAgentResearchTurn({ workspace: createPhase7AWorkspace("session_one_agent_no_retry"), message: "Research this." }, dependencies(model));
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(result.status).toBe("failed");
    expect(result.limitations).toContain("research_one_agent_runtime_failed");
    expect(result.assistant_message?.text).toContain("didn't substitute an unsupported answer");
  });
});
