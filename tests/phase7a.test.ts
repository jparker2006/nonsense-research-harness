import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPhase7AChatRoute, POST } from "../src/app/api/chat/route.ts";
import { phase5ArtifactSchema } from "../src/lib/phase5/contracts.ts";
import {
  phase7aArtifactFromLegacyFixture,
  phase7aArtifactSchema,
  validatePhase7AArtifact,
} from "../src/lib/phase7a/artifact.ts";
import {
  PHASE_7A_LIMITS,
  phase7aActionSchema,
  phase7aControllerOutputSchema,
  phase7aControllerOutputSchemaForAliases,
  phase7aControllerOutputToDecision,
  phase7aRequestSchema,
  type Phase7AAction,
} from "../src/lib/phase7a/contracts.ts";
import { createPhase7AFixtureDependencies } from "../src/lib/phase7a/fixture.ts";
import { allowedControllerActions, createOpenRouterPhase7AModel, PHASE_7A_CONTROLLER_MAX_OUTPUT_TOKENS, Phase7AControllerOutputError } from "../src/lib/phase7a/model.ts";
import {
  PHASE_7A_ARTIFACT_PROCEDURES,
  PHASE_7A_DEEP_RESEARCH_INSTRUCTION,
  PHASE_7A_SYSTEM_PROMPT,
  phase7aArtifactInstructions,
  phase7aDecisionPrompt,
} from "../src/lib/phase7a/prompts.ts";
import { clearPhase7AWorkspacesForTest, createPhase7AWorkspace } from "../src/lib/phase7a/session-store.ts";
import { runPhase7AWorkflow } from "../src/lib/phase7a/workflow.ts";
import { createPhase7ABrowserSessionId, getOrCreatePhase7ABrowserSessionId } from "../src/lib/phase7a/browser-session.ts";
import { PHASE_6_FROZEN_HEADLINES_CASE } from "../src/lib/phase6/frozen-case.ts";

const root = resolve(import.meta.dirname, "..");
const suppliedUrl = PHASE_6_FROZEN_HEADLINES_CASE.links[0];
const webSourceId = "web_fixture_bonneville";
const chunkId = "chunk_fixture_archive";
const archiveSourceId = `archive_${chunkId}`;

function requestFor(body: unknown) {
  const candidate = body && typeof body === "object" ? body as Record<string, unknown> : null;
  const envelope = candidate?.phase7a && typeof candidate.phase7a === "object"
    ? candidate.phase7a as Record<string, unknown>
    : null;
  const normalized = envelope && envelope.action === "message" && envelope.research_depth === undefined
    ? { ...candidate, phase7a: { ...envelope, research_depth: "standard" } }
    : body;
  return new Request("http://local.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(normalized),
  });
}

type LegacyTestAction =
  | { action: "respond"; public_summary: string; message: string; source_ids: string[] };

function action(value: Phase7AAction | LegacyTestAction): Phase7AAction {
  if (value.action === "respond" && "message" in value) {
    return phase7aActionSchema.parse({
      action: "respond",
      public_summary: value.public_summary,
      blocks: [{ text: value.message, source_ids: value.source_ids }],
    });
  }
  return phase7aActionSchema.parse(value);
}

function controllerEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    action: "respond",
    public_summary: "Answer directly",
    argument: "Hello.",
    arguments: [],
    mode: null,
    instruction: "",
    response_blocks: [{ text: "Hello.", source_ids: [] }],
    research_state: {
      objective: "Answer the current request.",
      completed_steps: [],
      evidence_gaps: [],
      next_step: "Respond directly.",
    },
    ...overrides,
  };
}

function controllerStreamFetch(content: string, finishReason = "stop"): typeof fetch {
  return async () => {
    const payload = JSON.stringify({
      id: "gen_phase7a_failure_fixture",
      model: "openai/gpt-5.6-luna",
      provider: "OpenAI",
      choices: [{ delta: { content }, finish_reason: finishReason }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0.0042 },
    });
    return new Response(`data: ${payload}\n\ndata: [DONE]\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
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
      instruction: "Rank the evidence by editorial priority.",
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

  it("creates a unique valid session for every new browser conversation", () => {
    const first = createPhase7ABrowserSessionId(() => "11111111-1111-4111-8111-111111111111");
    const second = createPhase7ABrowserSessionId(() => "22222222-2222-4222-8222-222222222222");
    expect(first).not.toBe(second);
    expect(phase7aRequestSchema.parse({ action: "message", session_id: first, message: "hello", research_depth: "standard" }).session_id).toBe(first);
    expect(phase7aRequestSchema.parse({ action: "message", session_id: second, message: "hello", research_depth: "deep" }).session_id).toBe(second);
  });

  it("keeps one session stable until New research clears the conversation holder", () => {
    const holder: { current: string | null } = { current: null };
    const ids = [
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ];
    let index = 0;
    const create = () => createPhase7ABrowserSessionId(() => ids[index++]!);
    const first = getOrCreatePhase7ABrowserSessionId(holder, create);
    expect(getOrCreatePhase7ABrowserSessionId(holder, create)).toBe(first);
    holder.current = null;
    const second = getOrCreatePhase7ABrowserSessionId(holder, create);
    expect(second).not.toBe(first);
    expect(index).toBe(2);
  });

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

  it("uses tools for standard current research while Deep research makes a broader bounded pass without creating a brief", async () => {
    const prompt = "What is the strongest current evidence about Lake Bonneville's visible shorelines?";
    const standard = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace("session_standard_depth"),
      message: prompt,
      researchDepth: "standard",
      runId: "run_standard_depth",
    }, createPhase7AFixtureDependencies([
      action({ action: "web_search", public_summary: "Find the current primary source", query: "current Lake Bonneville visible shoreline evidence" }),
      action({ action: "read_url", public_summary: "Read the primary result", url: suppliedUrl }),
      action({ action: "respond", public_summary: "Answer from the primary evidence", message: "The clearest evidence is the old shoreline terraces still visible on mountains.", source_ids: [webSourceId] }),
    ]));
    const deep = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace("session_deep_depth"),
      message: prompt,
      researchDepth: "deep",
      runId: "run_deep_depth",
    }, createPhase7AFixtureDependencies([
      action({ action: "web_search", public_summary: "Find the current primary source", query: "current Lake Bonneville visible shoreline evidence" }),
      action({ action: "read_url", public_summary: "Read the primary result", url: suppliedUrl }),
      action({ action: "search_transcripts", public_summary: "Check related past Nonsense coverage", query: "vanished lake landscape memory" }),
      action({ action: "open_transcript_chunk", public_summary: "Open the strongest related passage", chunk_id: chunkId }),
      action({ action: "respond", public_summary: "Synthesize the broader evidence pass", message: "The old shoreline terraces are the primary physical evidence; an earlier Nonsense passage also explored how an absence can organize what remains.", source_ids: [webSourceId, archiveSourceId] }),
    ]));

    expect(standard.trace.research_depth).toBe("standard");
    expect(standard.counts).toMatchObject({ web_searches: 1, url_reads: 1, transcript_searches: 0, compositions: 0 });
    expect(standard.assistant_message?.blocks[0]?.source_ids).toEqual([webSourceId]);
    expect(standard.artifact).toBeNull();
    expect(deep.trace.research_depth).toBe("deep");
    expect(deep.counts.controller_turns).toBeGreaterThan(standard.counts.controller_turns);
    expect(deep.counts).toMatchObject({ web_searches: 1, url_reads: 1, transcript_searches: 1, transcript_opens: 1, compositions: 0 });
    expect(deep.artifact).toBeNull();
    expect(deep.counts.provider_requests).toBeLessThanOrEqual(PHASE_7A_LIMITS.maxProviderRequests);
  });

  it("keeps citations attached to the natural answer blocks they support", async () => {
    const result = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace("session_claim_blocks"),
      message: `${suppliedUrl} Research the physical evidence and related archive context.`,
      runId: "run_claim_blocks",
    }, createPhase7AFixtureDependencies([
      action({ action: "read_url", public_summary: "Read the supplied source", url: suppliedUrl }),
      action({ action: "search_transcripts", public_summary: "Search the related archive", query: "vanished lake landscape memory" }),
      action({ action: "open_transcript_chunk", public_summary: "Open the matching archive passage", chunk_id: chunkId }),
      action({
        action: "respond",
        public_summary: "Answer with evidence beside each claim",
        blocks: [
          { text: "Visible terraces preserve the former lake levels.", source_ids: [webSourceId] },
          { text: "A past Nonsense passage framed absence as something that still shapes the present.", source_ids: [archiveSourceId] },
        ],
      }),
    ]));
    expect(result.assistant_message?.blocks).toEqual([
      { text: "Visible terraces preserve the former lake levels.", source_ids: [webSourceId] },
      { text: "A past Nonsense passage framed absence as something that still shapes the present.", source_ids: [archiveSourceId] },
    ]);
    expect(result.assistant_message?.text).toContain("\n\n");
  });

  it("keeps a structured research notebook and a sanitized replayable trace", async () => {
    const first = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace("session_notebook_trace"),
      message: "What can you help us do?",
      runId: "run_notebook_first",
    }, createPhase7AFixtureDependencies([
      action({ action: "respond", public_summary: "Explain the desk", message: "I can research and prepare sourced material.", source_ids: [] }),
    ]));
    expect(first.workspace.research_state).toMatchObject({
      objective: "Complete the current fixture research request.",
      next_step: "Explain the desk",
    });
    expect(first.trace).toMatchObject({
      run_id: "run_notebook_first",
      status: "complete",
      steps: [{ action: "respond", public_summary: "Explain the desk", status: "complete" }],
    });
    expect(first.workspace.run_traces).toHaveLength(1);

    const nextDependencies = createPhase7AFixtureDependencies([
      action({ action: "respond", public_summary: "Continue from the notebook", message: "The prior objective is still available.", source_ids: [] }),
    ]);
    const originalDecide = nextDependencies.controller.decide;
    let observedObjective: string | undefined;
    nextDependencies.controller.decide = async (input, options) => {
      observedObjective = input.workspace.research_state?.objective;
      return originalDecide(input, options);
    };
    const second = await runPhase7AWorkflow({ workspace: first.workspace, message: "Continue." }, nextDependencies);
    expect(observedObjective).toBe("Complete the current fixture research request.");
    expect(second.workspace.run_traces).toHaveLength(2);
    expect(JSON.stringify(second.trace)).not.toContain("OPENROUTER_API_KEY");
  });

  it("reads independent allowed URLs concurrently and preserves a partial batch honestly", async () => {
    const urls = ["https://one.example/article", "https://two.example/article"];
    const sourceIds = ["web_batch_one", "web_batch_two"];
    const dependencies = createPhase7AFixtureDependencies([
      action({ action: "read_urls", public_summary: "Read both supplied sources", urls }),
      action({ action: "respond", public_summary: "Answer from the usable source", message: "One source was usable and one was unavailable.", source_ids: [sourceIds[0]!] }),
    ]);
    let active = 0;
    let maximumActive = 0;
    dependencies.tools.readUrl = async ({ url }) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
      active -= 1;
      const index = urls.indexOf(url);
      if (index === 1) {
        return {
          source_id: sourceIds[index]!,
          source_kind: "retrieved_page",
          availability: "unavailable",
          url,
          requested_url: url,
          title: "Unavailable source",
          excerpt: null,
          retrieved_at: "2026-08-24T00:00:00.000Z",
          trust: "untrusted_external_content",
          evidence_usable: false,
          receipt: {},
          failure: { code: "fixture_unavailable", message: "Fixture failure." },
        };
      }
      return {
        source_id: sourceIds[index]!,
        source_kind: "retrieved_page",
        availability: "complete",
        url,
        requested_url: url,
        final_url: url,
        title: "Usable source",
        excerpt: "A bounded excerpt.",
        text: "SECRET_PAGE_BODY_TOKEN should stay out of the sanitized trace.",
        retrieved_at: "2026-08-24T00:00:00.000Z",
        trust: "untrusted_external_content",
        evidence_usable: true,
        receipt: {},
      };
    };
    const result = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace("session_parallel_urls"),
      message: `Read ${urls[0]} and ${urls[1]}`,
    }, dependencies);
    expect(maximumActive).toBe(2);
    expect(result.counts.url_reads).toBe(2);
    expect(result.status).toBe("partial");
    expect(result.limitations).toContain("read_url:fixture_unavailable");
    expect(result.trace.steps[0]).toMatchObject({ action: "read_urls", status: "partial" });
    expect(JSON.stringify(result.trace)).not.toContain("SECRET_PAGE_BODY_TOKEN");
  });

  it("opens a bounded batch of returned archive chunks in one controller step", async () => {
    const chunkIds = ["chunk_batch_one", "chunk_batch_two"];
    const dependencies = createPhase7AFixtureDependencies([
      action({ action: "open_transcript_chunks", public_summary: "Open two archive passages", chunk_ids: chunkIds }),
      action({ action: "respond", public_summary: "Summarize the passages", message: "Both archive passages are ready.", source_ids: chunkIds.map((id) => `archive_${id}`) }),
    ]);
    dependencies.tools.openTranscriptChunk = ({ chunk_id }) => ({
      status: "complete",
      adjacent_chunks: [],
      chunk: {
        schema_version: "1.0",
        chunk_id,
        chunk_index: 0,
        segment_id: `segment_${chunk_id}`,
        episode_id: `episode_${chunk_id}`,
        title: `Archive ${chunk_id}`,
        published_at: "2025-01-01T00:00:00.000Z",
        season: 4,
        episode_number: 1,
        episode_format: "big_story",
        corpus_role: "episode_content",
        segment_role: "topic",
        chapter_label_raw: "Topic",
        start_seconds: 0,
        end_seconds: 30,
        start_char: 0,
        end_char: 48,
        word_count: 6,
        text: `Exact transcript text for ${chunk_id}.`,
      },
    });
    const workspace = createPhase7AWorkspace("session_parallel_chunks");
    workspace.transcript_matches = chunkIds.map((id) => ({
      chunk_id: id,
      episode_id: `episode_${id}`,
      segment_id: `segment_${id}`,
      title: `Archive ${id}`,
      season: 4,
      episode_number: 1,
      excerpt: `Excerpt ${id}`,
      query: "batch archive test",
    }));
    const result = await runPhase7AWorkflow({ workspace, message: "Open both returned passages." }, dependencies);
    expect(result.status).toBe("complete");
    expect(result.counts.transcript_opens).toBe(2);
    expect(result.counts.controller_turns).toBe(2);
    expect(result.trace.steps[0]).toMatchObject({ action: "open_transcript_chunks", status: "complete" });
    expect(result.workspace.evidence.map((item) => item.chunk_id)).toEqual(chunkIds);
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
    expect(result.assistant_message?.text).toContain("preparation brief");
    expect(validatePhase7AArtifact(mode, result.artifact, result.workspace.evidence).errors).toEqual([]);
    expect(JSON.stringify(result.artifact)).not.toMatch(/target_minutes|estimated_minutes/);
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

  it("allows the same web query in a later user turn but rejects it inside one run", async () => {
    const query = "current foodborne illness recall";
    const first = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace("session_repeat_scope"),
      message: "Search for the latest recall.",
      runId: "run_repeat_scope_one",
    }, createPhase7AFixtureDependencies([
      action({ action: "web_search", public_summary: "Search the current web", query }),
      action({ action: "respond", public_summary: "Return the current leads", message: "I found current leads that still need source reading.", source_ids: [] }),
    ]));
    expect(first.status).toBe("complete");

    const second = await runPhase7AWorkflow({
      workspace: first.workspace,
      message: "Run that current search again for this follow-up.",
      runId: "run_repeat_scope_two",
    }, createPhase7AFixtureDependencies([
      action({ action: "web_search", public_summary: "Refresh the same current-web query", query }),
      action({ action: "respond", public_summary: "Return the refreshed leads", message: "The follow-up search completed without inheriting the prior run's duplicate lock.", source_ids: [] }),
    ]));
    expect(second.status).toBe("complete");
    expect(second.counts.web_searches).toBe(1);
    expect(second.limitations).not.toContain("phase7a_repeated_action");
    expect(second.workspace.web_queries).toEqual([query]);

    const repeatedInsideRun = await runPhase7AWorkflow({
      workspace: second.workspace,
      message: "Repeat forever inside this turn.",
      runId: "run_repeat_scope_three",
    }, createPhase7AFixtureDependencies([
      action({ action: "web_search", public_summary: "Search once", query }),
      action({ action: "web_search", public_summary: "Repeat without new evidence", query: `  ${query.toUpperCase()}  ` }),
      action({ action: "respond", public_summary: "Answer after the repeated search is refused", message: "The first search completed; repeating it would not add evidence.", source_ids: [] }),
    ]));
    expect(repeatedInsideRun.status).toBe("partial");
    expect(repeatedInsideRun.counts.web_searches).toBe(1);
    expect(repeatedInsideRun.limitations).toContain("phase7a_repeated_action");
    expect(repeatedInsideRun.assistant_message?.text).toContain("repeating it would not add evidence");
  });

  it("allows an authorized URL to be reread in a later user turn", async () => {
    const first = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace("session_reread_scope"),
      message: `Read ${suppliedUrl}`,
    }, createPhase7AFixtureDependencies([
      action({ action: "read_url", public_summary: "Read the supplied source", url: suppliedUrl }),
      action({ action: "respond", public_summary: "Confirm the first read", message: "The first read completed.", source_ids: [webSourceId] }),
    ]));
    const second = await runPhase7AWorkflow({
      workspace: first.workspace,
      message: `Reread ${suppliedUrl} for this follow-up.`,
    }, createPhase7AFixtureDependencies([
      action({ action: "read_url", public_summary: "Reread the supplied source", url: suppliedUrl }),
      action({ action: "respond", public_summary: "Confirm the follow-up read", message: "The follow-up reread completed.", source_ids: [webSourceId] }),
    ]));
    expect(second.status).toBe("complete");
    expect(second.counts.url_reads).toBe(1);
    expect(second.limitations).not.toContain("phase7a_repeated_action");
    expect(second.workspace.evidence.filter((source) => source.source_id === webSourceId)).toHaveLength(1);
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

    const stop = new AbortController();
    stop.abort();
    const stopped = await runPhase7AWorkflow({
      workspace: second.workspace,
      message: "Stop this follow-up.",
    }, createPhase7AFixtureDependencies([], { signal: stop.signal }));
    expect(stopped.status).toBe("stopped");
    expect(stopped.artifact).toEqual(first.artifact);
    expect(stopped.artifact_revision).toBe(1);
    expect(stopped.workspace.evidence).toEqual(first.workspace.evidence);
  });

  it("requires current-turn brief intent, preserves corrections, and creates only explicit revisions", async () => {
    const first = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace("session_explicit_revision"),
      message: `${suppliedUrl} Make a Headlines preparation brief.`,
      runId: "run_explicit_revision_one",
    }, createPhase7AFixtureDependencies(researchActions("headlines")));

    const unrequestedDependencies = createPhase7AFixtureDependencies([
      action({ action: "create_artifact", public_summary: "Try to rewrite the retained packet", mode: "headlines", topic: "Lake Bonneville", instruction: "" }),
    ]);
    const unrequested = await runPhase7AWorkflow({
      workspace: first.workspace,
      message: "Go deeper on the physical evidence.",
      researchDepth: "deep",
      runId: "run_explicit_revision_two",
    }, unrequestedDependencies);
    expect(unrequested.status).toBe("failed");
    expect(unrequested.limitations).toContain("phase7a_artifact_not_requested");
    expect(unrequested.counts.compositions).toBe(0);
    expect(unrequested.artifact_revision).toBe(1);
    expect(unrequested.artifact).toEqual(first.artifact);

    const revisionDependencies = createPhase7AFixtureDependencies([
      action({ action: "create_artifact", public_summary: "Revise the retained brief", mode: "headlines", topic: "Lake Bonneville", instruction: "Apply the user's correction." }),
    ]);
    const originalCompose = revisionDependencies.composer.compose;
    let observedNotes = "";
    revisionDependencies.composer.compose = async (input, plan, evidence, options) => {
      observedNotes = input.notes;
      return originalCompose(input, plan, evidence, options);
    };
    const correction = "Correction: the visible terraces are old shorelines, not current waterlines.";
    const revised = await runPhase7AWorkflow({
      workspace: unrequested.workspace,
      message: `Revise the current brief. ${correction}`,
      runId: "run_explicit_revision_three",
    }, revisionDependencies);
    expect(revised.status).toBe("complete");
    expect(revised.artifact_revision).toBe(2);
    expect(revised.counts.compositions).toBe(1);
    expect(observedNotes).toContain(correction);
    expect(revised.workspace.turns.map((turn) => turn.text)).toContain(`Revise the current brief. ${correction}`);
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

  it("rejects unavailable and candidate-only citations at the claim-block boundary", async () => {
    const unavailableWorkspace = createPhase7AWorkspace("session_unusable_citation");
    unavailableWorkspace.evidence.push({
      source_id: "web_unavailable",
      source_type: "web",
      availability: "unavailable",
      evidence_usable: false,
      title: "Unavailable source",
      excerpt: null,
      failure_code: "fixture_unavailable",
    });
    unavailableWorkspace.candidates.push({
      source_id: "candidate_only",
      url: "https://example.com/candidate",
      title: "Unread candidate",
      excerpt: "Search result text is not evidence.",
      query: "fixture query",
    });
    for (const sourceId of ["web_unavailable", "candidate_only"]) {
      const result = await runPhase7AWorkflow({
        workspace: unavailableWorkspace,
        message: `Cite ${sourceId}.`,
      }, createPhase7AFixtureDependencies([
        action({ action: "respond", public_summary: "Attempt an unusable citation", blocks: [{ text: "Unsupported claim.", source_ids: [sourceId] }] }),
      ]));
      expect(result.status).toBe("failed");
      expect(result.limitations).toContain("phase7a_invalid_citation");
      expect(result.assistant_message).toBeNull();
    }
  });

  it("keeps the active artifact schema strict, priority-based, and timing-free", async () => {
    const report = JSON.parse(await readFile(resolve(root, "reports/phase-7a-live.json"), "utf8")) as { cases: Array<{ artifact: { artifact: unknown } }> };
    const active = phase7aArtifactSchema.parse(phase7aArtifactFromLegacyFixture(report.cases[0]!.artifact.artifact));
    const beats = active.mode === "headlines" ? active.flexible_outline : active.modular_outline;
    expect(new Set(beats.map((beat) => beat.priority))).toEqual(new Set(["must_cover", "strong_material", "optional_detail", "cut_first"]));
    expect(JSON.stringify(active)).not.toMatch(/target_minutes|estimated_minutes/);
    expect(() => phase7aArtifactSchema.parse({ ...active, target_minutes: 8 })).toThrow();
    const [firstBeat, ...remainingBeats] = beats;
    const withEstimatedMinutes = active.mode === "headlines"
      ? { ...active, flexible_outline: [{ ...firstBeat!, estimated_minutes: 3 }, ...remainingBeats] }
      : { ...active, modular_outline: [{ ...firstBeat!, estimated_minutes: 3 }, ...remainingBeats] };
    expect(() => phase7aArtifactSchema.parse(withEstimatedMinutes)).toThrow();
  });

  it("refuses artifact composition before usable evidence and an archive search exist", async () => {
    const result = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace("session_early_artifact"),
      message: `${suppliedUrl} Make a Headlines packet immediately.`,
    }, createPhase7AFixtureDependencies([
      action({ action: "read_url", public_summary: "Read the supplied source", url: suppliedUrl }),
      action({ action: "create_artifact", public_summary: "Attempt the packet too early", mode: "headlines", topic: "Lake Bonneville", instruction: "" }),
    ]));
    expect(result.status).toBe("failed");
    expect(result.limitations).toContain("phase7a_artifact_archive_required");
    expect(result.counts.compositions).toBe(0);
    expect(result.artifact).toBeNull();
  });

  it("closes an exhausted tool and answers from preserved evidence instead of failing", async () => {
    const workspace = createPhase7AWorkspace("session_tool_limit");
    workspace.evidence.push({
      source_id: "web_preserved_evidence",
      source_type: "web",
      availability: "complete",
      evidence_usable: true,
      title: "Preserved source",
      url: "https://example.com/preserved",
      excerpt: "This usable evidence was collected before the tool boundary was reached.",
      content: "This usable evidence was collected before the tool boundary was reached.",
    });
    const actions = Array.from({ length: 4 }, (_, index) => action({
      action: "web_search" as const,
      public_summary: `Search bounded query ${index}`,
      query: `distinct bounded query number ${index}`,
    }));
    actions.push(action({
      action: "respond",
      public_summary: "Answer from the evidence already collected",
      message: "The search ceiling is closed, so this answer uses the evidence already collected.",
      source_ids: ["web_preserved_evidence"],
    }));
    const result = await runPhase7AWorkflow({
      workspace,
      message: "Keep searching forever.",
    }, createPhase7AFixtureDependencies(actions));
    expect(result.status).toBe("partial");
    expect(result.counts.web_searches).toBe(PHASE_7A_LIMITS.maxWebSearches);
    expect(result.counts.controller_turns).toBe(5);
    expect(result.limitations).toContain("phase7a_web_search_limit");
    expect(result.assistant_message?.text).toContain("evidence already collected");
    expect(result.assistant_message?.source_ids).toEqual(["web_preserved_evidence"]);
    expect(result.workspace.evidence).toContainEqual(expect.objectContaining({ source_id: "web_preserved_evidence" }));
    expect(result.trace.steps.at(-2)).toMatchObject({ action: "web_search", status: "partial" });
    expect(result.events).toContainEqual(expect.objectContaining({ label: "Continuing with collected evidence", status: "partial" }));
  });

  it("removes exhausted tools from the provider action contract and reserves synthesis", () => {
    expect(allowedControllerActions({
      controller_turns: 4,
      provider_requests: 6,
      web_searches: 0,
      url_reads: 3,
      transcript_searches: 1,
      transcript_opens: 2,
      compositions: 1,
    })).toEqual(["read_url", "read_urls", "search_transcripts", "open_transcript_chunk", "open_transcript_chunks", "create_artifact", "respond"]);
    expect(allowedControllerActions({
      controller_turns: 0,
      provider_requests: 0,
      web_searches: 2,
      url_reads: 3,
      transcript_searches: 1,
      transcript_opens: 2,
      compositions: 0,
    })).toEqual(["respond"]);
  });

  it("enforces a lower proof-specific provider request cap and exposes it to the controller", async () => {
    const dependencies = createPhase7AFixtureDependencies([
      action({ action: "web_search", public_summary: "Try a provider-backed search", query: "bounded provider cap" }),
    ]);
    dependencies.providerRequestCap = 1;
    const originalDecide = dependencies.controller.decide;
    let observedRemaining: number | undefined;
    dependencies.controller.decide = async (input, options) => {
      observedRemaining = input.remaining.provider_requests;
      return originalDecide(input, options);
    };
    const result = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace("session_request_cap"),
      message: "Use one controller request and then try to search.",
    }, dependencies);
    expect(observedRemaining).toBe(0);
    expect(result.status).toBe("failed");
    expect(result.counts.provider_requests).toBe(1);
    expect(result.counts.web_searches).toBe(0);
    expect(result.limitations).toContain("phase7a_provider_request_limit");
  });

  it("reserves the final provider request for an explicitly requested packet", async () => {
    const workspace = createPhase7AWorkspace("session_final_artifact_slot");
    workspace.archive_queries = ["food safety recalls"];
    const dependencies = createPhase7AFixtureDependencies([
      action({ action: "read_url", public_summary: "Read the supplied source", url: suppliedUrl }),
    ]);
    dependencies.providerRequestCap = 2;
    const result = await runPhase7AWorkflow({
      workspace,
      message: `${suppliedUrl} Read this and create a Headlines prep packet ranked by editorial priority.`,
      runId: "run_final_artifact_slot",
    }, dependencies);
    expect(result.status).toBe("complete");
    expect(result.artifact?.mode).toBe("headlines");
    expect(result.counts).toMatchObject({
      controller_turns: 1,
      provider_requests: 2,
      url_reads: 1,
      compositions: 1,
    });
    expect(result.events).toContainEqual(expect.objectContaining({
      label: "Final request reserved for the packet",
      status: "complete",
    }));
    expect(result.trace.steps.map((step) => step.action)).toEqual(["read_url", "create_artifact"]);
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
    expect(() => phase7aRequestSchema.parse({ action: "message", session_id: "session_valid", message: "hello", research_depth: "standard", extra: true })).toThrow();
    expect(() => phase7aRequestSchema.parse({ action: "message", session_id: "session_valid", message: "hello" })).toThrow();
    expect(() => phase7aActionSchema.parse({ action: "respond", public_summary: "answer", message: "hello", source_ids: [], tool: "shell" })).toThrow();
    expect(() => phase7aActionSchema.parse({ action: "shell", public_summary: "run code", command: "pwd" })).toThrow();
  });

  it("round-trips every controller action and accepts neutral batch fields", () => {
    const cases = [
      controllerEnvelope({ action: "web_search", argument: "latest recall" }),
      controllerEnvelope({ action: "read_url", argument: "https://one.example/article" }),
      controllerEnvelope({ action: "read_urls", argument: "", arguments: ["https://one.example/article", "https://two.example/article"] }),
      controllerEnvelope({ action: "search_transcripts", argument: "food safety recalls" }),
      controllerEnvelope({ action: "open_transcript_chunk", argument: "chunk_one" }),
      controllerEnvelope({ action: "open_transcript_chunks", argument: "", arguments: ["chunk_one", "chunk_two"] }),
      controllerEnvelope({ action: "create_artifact", argument: "Foodborne illness recall", mode: "headlines", instruction: "Rank the material." }),
      controllerEnvelope({ action: "respond", argument: "", response_blocks: [{ text: "The answer.", source_ids: ["web_one"] }] }),
    ];
    expect(cases.map((value) => phase7aControllerOutputToDecision(phase7aControllerOutputSchema.parse(value)).action.action)).toEqual([
      "web_search",
      "read_url",
      "read_urls",
      "search_transcripts",
      "open_transcript_chunk",
      "open_transcript_chunks",
      "create_artifact",
      "respond",
    ]);
  });

  it.each([
    ["phase7a_controller_invalid_json", "json", "invalid_json", "{SECRET_RAW_OUTPUT_TOKEN"],
    ["phase7a_controller_transport_invalid", "transport", "parsed", JSON.stringify(controllerEnvelope({ research_state: undefined }))],
    ["phase7a_controller_action_invalid", "action", "parsed", JSON.stringify(controllerEnvelope({ action: "read_urls", argument: "", arguments: [] }))],
    ["phase7a_controller_truncated_output", "completion", "truncated", JSON.stringify(controllerEnvelope())],
  ] as const)("classifies %s and preserves its paid receipt", async (code, stage, outputStatus, content) => {
    const model = createOpenRouterPhase7AModel({
      apiKey: "test-key",
      liveAuthorized: true,
      fetchImpl: controllerStreamFetch(content, code === "phase7a_controller_truncated_output" ? "length" : "stop"),
    });
    let thrown: unknown;
    try {
      await model.decide({ workspace: createPhase7AWorkspace(`session_${stage}`), currentMessage: "Research this.", researchDepth: "standard", remaining: {} });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Phase7AControllerOutputError);
    const failure = thrown as Phase7AControllerOutputError;
    expect(failure.failure).toMatchObject({ code, stage, response_characters: content.length });
    expect(failure.receipt).toMatchObject({ cost_usd: 0.0042, output_status: outputStatus, generation_id: "gen_phase7a_failure_fixture" });
    expect(JSON.stringify(failure.failure)).not.toContain(content);
  });

  it("records an invalid paid controller response once with safe diagnostics and no retry", async () => {
    const dependencies = createPhase7AFixtureDependencies([]);
    dependencies.controller = createOpenRouterPhase7AModel({
      apiKey: "test-key",
      liveAuthorized: true,
      fetchImpl: controllerStreamFetch(JSON.stringify(controllerEnvelope({ action: "read_urls", argument: "", arguments: [] }))),
    });
    const result = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace("session_controller_receipt"),
      message: "Research this.",
      runId: "run_controller_receipt",
    }, dependencies);
    expect(result.status).toBe("failed");
    expect(result.counts).toMatchObject({ controller_turns: 1, provider_requests: 1 });
    expect(result.accounted_cost_usd).toBe(0.0042);
    expect(result.usage).toHaveLength(1);
    expect(result.usage[0]).toMatchObject({ reported_cost_usd: 0.0042, accounted_cost_usd: 0.0042, receipt_missing: false });
    expect(result.trace.controller_failure).toMatchObject({
      code: "phase7a_controller_action_invalid",
      stage: "action",
      issues: ["urls:too_small"],
      generation_id: "gen_phase7a_failure_fixture",
    });
    expect(result.events.at(-1)).toMatchObject({
      label: "Research stopped before completion",
      detail: "The planning model returned an invalid next step. Collected research was preserved.",
      status: "failed",
    });
  });

  it("completes the web-search to batch-read to archive to Headlines path deterministically", async () => {
    const urls = ["https://one.example/recall", "https://two.example/context"];
    const dependencies = createPhase7AFixtureDependencies([
      action({ action: "web_search", public_summary: "Find current recall reporting", query: "current foodborne illness recall" }),
      action({ action: "read_urls", public_summary: "Read the primary and independent sources", urls }),
      action({ action: "search_transcripts", public_summary: "Search prior Nonsense coverage", query: "food safety recalls regulation" }),
      action({ action: "open_transcript_chunk", public_summary: "Open the strongest archive passage", chunk_id: chunkId }),
      action({ action: "create_artifact", public_summary: "Create the Headlines brief", mode: "headlines", topic: "Foodborne illness recall", instruction: "Rank material by editorial priority." }),
    ]);
    dependencies.tools.webSearch = async ({ query }) => ({
      status: "complete",
      query,
      sources: urls.map((url, index) => ({
        source_id: `candidate_completion_${index}`,
        source_kind: "search_candidate" as const,
        availability: "candidate" as const,
        url,
        title: index === 0 ? "Official recall" : "Independent context",
        excerpt: "A bounded search-result lead.",
        retrieved_at: "2026-08-24T00:00:00.000Z",
        trust: "untrusted_external_content" as const,
        evidence_usable: false,
        receipt: {},
      })),
      retrieved_at: "2026-08-24T00:00:00.000Z",
      receipt: { provider_model: "fixture", provider_name: "fixture", total_tokens: 0, cost_usd: 0, web_search_proof: "citations_and_request_bound" },
    });
    dependencies.tools.readUrl = async ({ url }) => ({
      source_id: `web_completion_${urls.indexOf(url)}`,
      source_kind: "retrieved_page",
      availability: "complete",
      url,
      requested_url: url,
      final_url: url,
      title: url === urls[0] ? "Official recall" : "Independent context",
      excerpt: "Current evidence about the fictional fixture recall.",
      text: "Current evidence about the fictional fixture recall and its regulatory context.",
      retrieved_at: "2026-08-24T00:00:00.000Z",
      trust: "untrusted_external_content",
      evidence_usable: true,
      receipt: {},
    });
    const result = await runPhase7AWorkflow({
      workspace: createPhase7AWorkspace("session_controller_completion"),
      message: "Research this recall and make a Headlines packet ranked by editorial priority.",
      runId: "run_controller_completion",
    }, dependencies);
    expect(result.artifact?.mode).toBe("headlines");
    expect(result.counts).toMatchObject({
      controller_turns: 5,
      web_searches: 1,
      url_reads: 2,
      transcript_searches: 1,
      transcript_opens: 1,
      compositions: 1,
    });
    expect(result.workspace.candidates).toEqual([]);
    expect(result.trace.controller_failure).toBeNull();
    expect(result.limitations).not.toContain("phase7a_controller_invalid");
  });

  it("uses the concise server prompt and strict OpenRouter controller policy", async () => {
    let observed: Record<string, unknown> | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      observed = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const payload = JSON.stringify({
        id: "gen_phase7a_test",
        model: "openai/gpt-5.6-luna",
        provider: "OpenAI",
        choices: [{ delta: { content: JSON.stringify({
          action: "respond",
          public_summary: "Answer directly",
          argument: "Hello.",
          arguments: [],
          mode: null,
          instruction: "",
          response_blocks: [{ text: "Hello.", source_ids: [] }],
          research_state: {
            objective: "Answer the greeting.",
            completed_steps: [],
            evidence_gaps: [],
            next_step: "Respond directly.",
          },
        }) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0.0001 },
      });
      return new Response(`data: ${payload}\n\ndata: [DONE]\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } });
    };
    const model = createOpenRouterPhase7AModel({ apiKey: "test-key", liveAuthorized: true, fetchImpl });
    const result = await model.decide({
      workspace: createPhase7AWorkspace("session_model_policy"),
      currentMessage: "hello",
      researchDepth: "standard",
      remaining: {
        controller_turns: 9,
        provider_requests: 19,
        web_searches: 0,
        url_reads: 8,
        transcript_searches: 2,
        transcript_opens: 6,
        compositions: 1,
      },
      lastObservation: undefined,
    });
    expect(result.value.action.action).toBe("respond");
    expect(result.value.research_state.objective).toBe("Answer the greeting.");
    const request = observed as {
      messages: Array<{ role: string; content: string }>;
      provider: Record<string, unknown>;
      response_format: { json_schema: { schema: { properties: { action: { enum: string[] }; argument: Record<string, unknown> } } } };
      model: string;
    };
    expect(request.model).toBe("openai/gpt-5.6-luna");
    expect(request.messages[0]?.content).toBe(PHASE_7A_SYSTEM_PROMPT);
    expect(request.messages[0]?.content).toContain("equal partners CJ Little and Jeff Parker");
    expect(request.provider).toMatchObject({ allow_fallbacks: false, require_parameters: true, data_collection: "deny" });
    expect(request.response_format).toBeTruthy();
    expect(observed).toMatchObject({ max_tokens: PHASE_7A_CONTROLLER_MAX_OUTPUT_TOKENS });
    expect(PHASE_7A_CONTROLLER_MAX_OUTPUT_TOKENS).toBe(8_000);
    expect(request.response_format.json_schema.schema.properties.argument).toMatchObject({ type: "string", maxLength: 5_000 });
    expect(request.response_format.json_schema.schema.properties.argument).not.toHaveProperty("minLength");
    expect(request.response_format.json_schema.schema.properties.action.enum).not.toContain("web_search");
    expect(request.response_format.json_schema.schema.properties.action.enum).toContain("respond");
    expect(PHASE_7A_SYSTEM_PROMPT).toContain("conversational, evidence-first research partner, not a show writer");
    expect(PHASE_7A_SYSTEM_PROMPT).toContain("Do not choose stories, assign episode minutes, or create a preparation brief unless the user explicitly requests one");
    expect(PHASE_7A_SYSTEM_PROMPT).not.toMatch(/target_minutes|estimated_minutes/);

    const deepPrompt = phase7aDecisionPrompt({
      workspace: createPhase7AWorkspace("session_deep_prompt"),
      currentMessage: "Investigate this.",
      researchDepth: "deep",
      remaining: {},
    });
    const standardPrompt = phase7aDecisionPrompt({
      workspace: createPhase7AWorkspace("session_standard_prompt"),
      currentMessage: "Investigate this.",
      researchDepth: "standard",
      remaining: {},
    });
    expect(deepPrompt).toContain(PHASE_7A_DEEP_RESEARCH_INSTRUCTION);
    expect(standardPrompt).not.toContain(PHASE_7A_DEEP_RESEARCH_INSTRUCTION);
    expect(deepPrompt).toContain("Deep research, an existing artifact, or an older request is not current-turn artifact intent.");
    expect(deepPrompt).not.toMatch(/target_minutes|estimated_minutes/);
    expect(deepPrompt).not.toContain("{{");
    expect(PHASE_7A_SYSTEM_PROMPT).toBe((await readFile(resolve(root, "prompts/phase7a/SYSTEM.md"), "utf8")).trim());
    expect(PHASE_7A_DEEP_RESEARCH_INSTRUCTION).toBe((await readFile(resolve(root, "prompts/phase7a/DEEP_RESEARCH.md"), "utf8")).trim());
    expect(PHASE_7A_ARTIFACT_PROCEDURES.headlines).toBe((await readFile(resolve(root, "prompts/phase7a/HEADLINES_BRIEF.md"), "utf8")).trim());
    expect(PHASE_7A_ARTIFACT_PROCEDURES.big_story).toBe((await readFile(resolve(root, "prompts/phase7a/BIG_STORY_BRIEF.md"), "utf8")).trim());
    const artifactTemplate = (await readFile(resolve(root, "prompts/phase7a/ARTIFACT.md"), "utf8")).trim();
    expect(phase7aArtifactInstructions("headlines")).toBe(artifactTemplate.replace("{{MODE}}", "headlines"));
    expect(phase7aArtifactInstructions("big_story")).toBe(artifactTemplate.replace("{{MODE}}", "big_story"));
    expect((await readFile(resolve(root, "prompts/phase7a/CONTROLLER.md"), "utf8"))).toContain("{{CURRENT_MESSAGE}}");

    const literalPlaceholderMessage = phase7aDecisionPrompt({
      workspace: createPhase7AWorkspace("session_literal_placeholder"),
      currentMessage: "Explain the literal text {{EVIDENCE}}.",
      researchDepth: "standard",
      remaining: {},
    });
    expect(literalPlaceholderMessage).toContain("CURRENT USER MESSAGE:\nExplain the literal text {{EVIDENCE}}.");
  });

  it("gives Luna short usable-evidence aliases and resolves them before strict citation validation", async () => {
    const workspace = createPhase7AWorkspace("session_citation_aliases");
    workspace.evidence.push({
      source_id: "web_opaque_retrieved_source_2fbe64e4d1",
      source_type: "web",
      availability: "complete",
      evidence_usable: true,
      title: "Retrieved source",
      url: "https://example.com/retrieved",
      excerpt: "The retrieved source supports this claim.",
      content: "The retrieved source supports this claim.",
    });
    workspace.candidates.push({
      source_id: "web_unread_candidate_73cf99",
      url: "https://example.com/unread",
      title: "Unread candidate",
      excerpt: "A search-result excerpt is not evidence.",
      query: "fixture query",
    });
    const prompt = phase7aDecisionPrompt({
      workspace,
      currentMessage: "Answer from the retrieved evidence.",
      researchDepth: "standard",
      remaining: {},
    });
    expect(prompt).toContain('"citation_alias":"evidence_1"');
    expect(prompt).not.toContain("web_opaque_retrieved_source_2fbe64e4d1");
    expect(prompt).not.toContain("web_unread_candidate_73cf99");
    const boundedSchema = phase7aControllerOutputSchemaForAliases(["evidence_1"]);
    expect(boundedSchema.safeParse(controllerEnvelope({
      response_blocks: [{ text: "Supported.", source_ids: ["evidence_1"] }],
    })).success).toBe(true);
    expect(boundedSchema.safeParse(controllerEnvelope({
      response_blocks: [{ text: "Unsupported.", source_ids: ["source_1"] }],
    })).success).toBe(false);
    const noEvidenceSchema = phase7aControllerOutputSchemaForAliases([]);
    expect(noEvidenceSchema.safeParse(controllerEnvelope()).success).toBe(true);
    expect(noEvidenceSchema.safeParse(controllerEnvelope({
      response_blocks: [{ text: "Unsupported.", source_ids: ["evidence_1"] }],
    })).success).toBe(false);

    const dependencies = createPhase7AFixtureDependencies([]);
    dependencies.controller = createOpenRouterPhase7AModel({
      apiKey: "test-key",
      liveAuthorized: true,
      fetchImpl: controllerStreamFetch(JSON.stringify(controllerEnvelope({
        public_summary: "Answer from retrieved evidence",
        response_blocks: [{ text: "The retrieved source supports this claim.", source_ids: ["evidence_1"] }],
      }))),
    });
    const result = await runPhase7AWorkflow({
      workspace,
      message: "Answer from the retrieved evidence.",
    }, dependencies);
    expect(result.status).toBe("complete");
    expect(result.assistant_message?.blocks).toEqual([{
      text: "The retrieved source supports this claim.",
      source_ids: ["web_opaque_retrieved_source_2fbe64e4d1"],
    }]);
    expect(result.counts.controller_turns).toBe(1);
    expect(result.limitations).not.toContain("phase7a_invalid_citation");

    const invalidDependencies = createPhase7AFixtureDependencies([]);
    invalidDependencies.controller = createOpenRouterPhase7AModel({
      apiKey: "test-key",
      liveAuthorized: true,
      fetchImpl: controllerStreamFetch(JSON.stringify(controllerEnvelope({
        response_blocks: [{ text: "Unsupported.", source_ids: ["source_1"] }],
      }))),
    });
    const invalid = await runPhase7AWorkflow({
      workspace,
      message: "Answer from the retrieved evidence.",
    }, invalidDependencies);
    expect(invalid.status).toBe("failed");
    expect(invalid.limitations).toContain("phase7a_controller_transport_invalid");
    expect(invalid.limitations).not.toContain("phase7a_invalid_citation");
    expect(invalid.counts.controller_turns).toBe(1);
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
    expect(stream.indexOf('"type":"data-source"')).toBeLessThan(stream.indexOf('"type":"data-message"'));
    expect(stream).not.toContain("preserving evidence of vanished water levels");
    expect(stream).not.toContain("OPENROUTER_API_KEY");

    const invalid = await route(requestFor({ phase7a: { action: "message", session_id: "short", message: "hello" } }));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ code: "phase7a_invalid_request" });
    const oversized = await route(requestFor({ phase7a: { action: "message", session_id: "session_oversized", message: "x".repeat(24_000) } }));
    expect(oversized.status).toBe(413);
  });

  it("streams an artifact only from the run that actually created a new revision", async () => {
    let requestNumber = 0;
    const route = createPhase7AChatRoute({
      dependencies: () => createPhase7AFixtureDependencies(requestNumber++ === 0
        ? researchActions("headlines")
        : [action({ action: "respond", public_summary: "Answer the follow-up", message: "The recall timing is the strongest follow-up angle.", source_ids: [] })]),
    });
    const sessionId = "session_artifact_revision_route";
    const first = await route(requestFor({ phase7a: { action: "message", session_id: sessionId, message: `Make a Headlines preparation packet from ${suppliedUrl}.` } }));
    const firstStream = await first.text();
    expect(firstStream).toContain('"type":"data-artifact"');
    expect(firstStream.indexOf('"type":"data-source"')).toBeLessThan(firstStream.indexOf('"type":"data-artifact"'));

    const second = await route(requestFor({ phase7a: { action: "message", session_id: sessionId, message: "What is the strongest angle?" } }));
    const secondStream = await second.text();
    expect(secondStream).toContain("The recall timing is the strongest follow-up angle.");
    expect(secondStream).not.toContain('"type":"data-artifact"');
  });

  it("streams an explicit terminal controller failure with its real receipt and no retry", async () => {
    const dependencies = createPhase7AFixtureDependencies([]);
    dependencies.controller = createOpenRouterPhase7AModel({
      apiKey: "test-key",
      liveAuthorized: true,
      fetchImpl: controllerStreamFetch(JSON.stringify(controllerEnvelope({ action: "read_urls", argument: "", arguments: [] }))),
    });
    const route = createPhase7AChatRoute({ dependencies: () => dependencies });
    const response = await route(requestFor({ phase7a: { action: "message", session_id: "session_route_controller_failure", message: "Research this." } }));
    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain("phase7a_controller_action_invalid");
    expect(stream).toContain("The planning model selected an invalid research action.");
    expect(stream).toContain("Research stopped before completion");
    expect(stream).toContain('\"accounted_cost_usd\":0.0042');
    expect(stream).toContain('\"provider_requests\":1');
    expect(stream).toContain('\"state\":\"failed\"');
    expect(stream).toMatch(/\"type\":\"data-error\".*\"run_id\":\"run_/);
    expect(stream).not.toContain("SECRET_RAW_OUTPUT_TOKEN");
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
    const threadSource = await readFile(resolve(root, "src/components/research-thread.tsx"), "utf8");
    expect(routeSource).not.toContain("createPhase6FixtureDependencies");
    expect(componentSource).not.toContain("Lake Bonneville");
    expect(componentSource).not.toContain("Demo/Live");
    expect(componentSource).not.toContain("OPENROUTER_API_KEY");
    expect(componentSource).not.toContain("session-rail");
    expect(componentSource).not.toContain("activity-rail");
    expect(componentSource).not.toContain("mobile-switch");
    expect(threadSource).toContain("agent-work");
    expect(threadSource).toContain("Observable agent work");
    expect(componentSource).toContain("workspace-main");
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
