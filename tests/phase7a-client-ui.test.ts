import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConversationThread } from "../src/components/research-thread.tsx";
import {
  phase7aArtifactFromLegacyFixture,
  phase7aArtifactSchema,
} from "../src/lib/phase7a/artifact.ts";
import {
  phase7aMessageSchema,
  type BrowserArtifact,
  type BrowserSource,
  type Phase7AActivity,
  type Phase7AReceipt,
  type Phase7ARun,
} from "../src/lib/phase7a/client.ts";
import {
  createResearchConversationState,
  researchConversationReducer,
  type ResearchConversationState,
  type ResearchExchange,
} from "../src/lib/phase7a/client-state.ts";
import {
  artifactToReadableMarkdown,
  buildSourceReferences,
  groupObservableWork,
  outcomeLabel,
  referencesForArtifact,
} from "../src/lib/phase7a/presentation.ts";

const root = resolve(import.meta.dirname, "..");

function run(runId: string, state: Phase7ARun["state"]): Phase7ARun {
  return { session_id: "session_fixture", run_id: runId, state, summary: state === "running" ? "Researching" : "Answer ready" };
}

function activity(runId: string, id: string, label: string, status: Phase7AActivity["status"] = "complete"): Phase7AActivity {
  return { id, run_id: runId, kind: "tool", tool: "web_search", label, detail: `${label} detail`, status, created_at: "2026-08-25T00:00:00.000Z" };
}

function receipt(runId: string, status: Phase7AReceipt["status"] = "complete"): Phase7AReceipt {
  return {
    run_id: runId,
    status,
    counts: { controller_turns: 2, provider_requests: 3, grok_turns: 1, web_searches: 1, url_reads: 1, transcript_searches: 1, transcript_opens: 0, compositions: 1, repairs: 0 },
    accounted_cost_usd: 0.0123,
    elapsed_ms: 65_000,
    limitations: [],
    artifact_revision: 1,
  };
}

async function frozenHeadlines(): Promise<BrowserArtifact> {
  const report = JSON.parse(await readFile(resolve(root, "reports/phase-7a-live.json"), "utf8")) as { cases: Array<{ artifact: { artifact: unknown } }> };
  return phase7aArtifactSchema.parse(phase7aArtifactFromLegacyFixture(report.cases[0]!.artifact.artifact));
}

async function frozenBigStory(): Promise<BrowserArtifact> {
  const report = JSON.parse(await readFile(resolve(root, "reports/phase-7a-live.json"), "utf8")) as { cases: Array<{ artifact: { artifact: unknown } }> };
  return phase7aArtifactSchema.parse(phase7aArtifactFromLegacyFixture(report.cases[1]!.artifact.artifact));
}

function exchangeWithArtifact(artifact: BrowserArtifact): ResearchExchange {
  return {
    local_id: "local_first",
    run_id: "run_first",
    user: { id: "user_first", text: "Research the sprout outbreak", research_depth: "standard", created_at: "2026-08-25T00:00:00.000Z" },
    run: run("run_first", "partial"),
    activities: [activity("run_first", "search_one", "Searched foodborne illness"), { ...activity("run_first", "read_one", "Reuters could not be read"), tool: "read_url", status: "unavailable" }],
    assistant: { message_id: "message_first", run_id: "run_first", text: "The packet is ready in the artifact panel.", source_ids: [], blocks: [{ text: "The packet is ready in the artifact panel.", source_ids: [] }], created_at: "2026-08-25T00:01:00.000Z" },
    artifact: { run_id: "run_first", revision: 1, artifact },
    receipt: { ...receipt("run_first", "partial"), limitations: ["archive:keyword_only"] },
    error: null,
  };
}

describe("Phase 7A chat-native client state", () => {
  it("keeps repeated activity IDs and follow-up updates under their originating run", () => {
    let state = createResearchConversationState();
    state = researchConversationReducer(state, { type: "start", local_id: "local_one", text: "First", research_depth: "standard", created_at: "2026-08-25T00:00:00Z" });
    state = researchConversationReducer(state, { type: "run", run: run("run_one", "running") });
    state = researchConversationReducer(state, { type: "activity", activity: activity("run_one", "shared_step", "First running", "running") });
    state = researchConversationReducer(state, { type: "activity", activity: activity("run_one", "shared_step", "First finished") });
    state = researchConversationReducer(state, { type: "run", run: run("run_one", "complete") });
    state = researchConversationReducer(state, { type: "start", local_id: "local_two", text: "Follow up", research_depth: "deep", created_at: "2026-08-25T00:02:00Z" });
    state = researchConversationReducer(state, { type: "run", run: run("run_two", "running") });
    state = researchConversationReducer(state, { type: "activity", activity: activity("run_two", "shared_step", "Second finished") });

    expect(state.exchanges[0]?.activities).toHaveLength(1);
    expect(state.exchanges[0]?.activities[0]?.label).toBe("First finished");
    expect(state.exchanges[1]?.activities).toHaveLength(1);
    expect(state.exchanges[1]?.activities[0]?.label).toBe("Second finished");
  });

  it("does not attach a retained prior artifact to a follow-up exchange", async () => {
    const artifact = await frozenHeadlines();
    let state: ResearchConversationState = { exchanges: [exchangeWithArtifact(artifact)], sources: {}, active_exchange_id: null };
    state = researchConversationReducer(state, { type: "start", local_id: "local_two", text: "What is the best joke angle?", research_depth: "standard", created_at: "2026-08-25T00:02:00Z" });
    state = researchConversationReducer(state, { type: "run", run: run("run_two", "running") });
    state = researchConversationReducer(state, { type: "assistant", message: { message_id: "message_two", run_id: "run_two", text: "The recall timing is the strongest tension.", source_ids: [], blocks: [{ text: "The recall timing is the strongest tension.", source_ids: [] }], created_at: "2026-08-25T00:03:00Z" } });
    state = researchConversationReducer(state, { type: "receipt", receipt: { ...receipt("run_two"), counts: { ...receipt("run_two").counts, compositions: 0 } } });
    state = researchConversationReducer(state, { type: "run", run: run("run_two", "complete") });
    expect(state.exchanges[0]?.artifact).not.toBeNull();
    expect(state.exchanges[1]?.artifact).toBeNull();
  });

  it("routes late errors by run, blocks duplicate pending sends, and resets cleanly", () => {
    let state = createResearchConversationState();
    state = researchConversationReducer(state, { type: "start", local_id: "local_one", text: "First", research_depth: "standard", created_at: "2026-08-25T00:00:00Z" });
    const pendingState = researchConversationReducer(state, { type: "start", local_id: "duplicate", text: "Duplicate", research_depth: "standard", created_at: "2026-08-25T00:00:01Z" });
    expect(pendingState.exchanges).toHaveLength(1);
    state = researchConversationReducer(state, { type: "run", run: run("run_one", "complete") });
    state = researchConversationReducer(state, { type: "start", local_id: "local_two", text: "Second", research_depth: "standard", created_at: "2026-08-25T00:02:00Z" });
    state = researchConversationReducer(state, { type: "run", run: run("run_two", "running") });
    state = researchConversationReducer(state, { type: "error", terminal: true, error: { run_id: "run_one", code: "phase7a_request_failed", message: "First failed late.", retryable: true } });
    expect(state.exchanges[0]?.error?.message).toBe("First failed late.");
    expect(state.exchanges[1]?.error).toBeNull();
    expect(state.active_exchange_id).toBe("local_two");
    state = researchConversationReducer(state, { type: "stop_requested" });
    expect(state.exchanges[1]?.run?.state).toBe("stopped");
    state = researchConversationReducer(state, { type: "reset" });
    expect(state).toEqual(createResearchConversationState());
  });

  it("uses stable ledger-order citations without exposing machine IDs", async () => {
    const artifact = await frozenHeadlines();
    const refs = referencesForArtifact(artifact);
    expect(refs.map((item) => item.number)).toEqual(refs.map((_, index) => index + 1));
    expect(refs[0]?.publisher).toBe("FDA");
    expect(refs[0]?.compact_label).not.toContain(refs[0]!.source_id);

    const duplicateTitleSources: BrowserSource[] = [
      { source_id: "web_alpha", source_type: "web", availability: "complete", evidence_usable: true, title: "Same title", url: "https://fda.gov/a", excerpt: "Alpha evidence" },
      { source_id: "web_beta", source_type: "web", availability: "complete", evidence_usable: true, title: "Same title", url: "https://cdc.gov/b", excerpt: "Beta evidence" },
      { source_id: "archive_null_episode", source_type: "archive", availability: "complete", evidence_usable: true, title: "Old conversation", season: 3, excerpt: "Archive evidence" },
    ];
    const duplicateRefs = buildSourceReferences(duplicateTitleSources.map((source) => source.source_id), {}, duplicateTitleSources);
    expect(duplicateRefs.map((item) => item.number)).toEqual([1, 2, 3]);
    expect(duplicateRefs.map((item) => item.publisher)).toEqual(["FDA", "CDC", "Season 3"]);
  });

  it("exports the full packet with readable numbered references and editorial priorities", async () => {
    const artifact = await frozenHeadlines();
    const markdown = artifactToReadableMarkdown(artifact);
    expect(markdown).toContain("## Verified facts");
    expect(markdown).toContain("## Surprising details");
    expect(markdown).toContain("## Past Nonsense coverage");
    expect(markdown).toContain("## Open checks");
    expect(markdown).toContain("## References");
    expect(markdown).toContain("## Editorial priorities");
    expect(markdown).toContain("**must cover**");
    expect(markdown).not.toMatch(/\b(?:estimated|target)?\s*minutes?\b|\([0-9.]+ min\)/i);
    expect(markdown).toContain("— FDA");
    expect(markdown).not.toContain("web_2786293ce491e6089cc4");
  });

  it("renders prompt, observable work, and complete inline packet in chronological order", async () => {
    const artifact = await frozenHeadlines();
    const exchange = exchangeWithArtifact(artifact);
    const markup = renderToStaticMarkup(createElement(ConversationThread, {
      exchanges: [exchange],
      sources: Object.fromEntries(artifact.source_ledger.map((source) => [source.source_id, source])),
      draft: "",
      setDraft: () => undefined,
      researchDepth: "standard",
      setResearchDepth: () => undefined,
      send: () => undefined,
      running: false,
      openSource: () => undefined,
      focusArtifact: () => undefined,
      copyArtifact: () => undefined,
      copiedExchangeId: null,
    }));
    const promptIndex = markup.indexOf("Research the sprout outbreak");
    const workIndex = markup.indexOf("Observable agent work");
    const answerIndex = markup.indexOf("Nonsense prep packet");
    const composerIndex = markup.indexOf("Message the research agent");
    expect(promptIndex).toBeGreaterThan(-1);
    expect(workIndex).toBeGreaterThan(promptIndex);
    expect(answerIndex).toBeGreaterThan(workIndex);
    expect(composerIndex).toBeGreaterThan(answerIndex);
    expect(markup).toContain("Verified facts");
    expect(markup).toContain("Surprising details");
    expect(markup).toContain("Past Nonsense coverage");
    expect(markup).toContain("References");
    expect(markup).toContain("FDA");
    expect(markup).not.toContain("web_2786293ce491e6089cc4");
    expect(markup).not.toContain("The packet is ready in the artifact panel.");
    expect(markup).toContain('class="work-line work-line--');
    expect(markup).not.toContain("activity-node");
    expect(markup).not.toMatch(/<time|Agent decision|Research turn started/);
  });

  it("renders every Big Story section inline without inventing a clock", async () => {
    const artifact = await frozenBigStory();
    const exchange = exchangeWithArtifact(artifact);
    const markup = renderToStaticMarkup(createElement(ConversationThread, {
      exchanges: [exchange],
      sources: Object.fromEntries(artifact.source_ledger.map((source) => [source.source_id, source])),
      draft: "",
      setDraft: () => undefined,
      researchDepth: "standard",
      setResearchDepth: () => undefined,
      send: () => undefined,
      running: false,
      openSource: () => undefined,
      focusArtifact: () => undefined,
      copyArtifact: () => undefined,
      copiedExchangeId: null,
    }));
    expect(markup).toContain("Core question");
    expect(markup).toContain("Research brief");
    expect(markup).toContain("Research cards");
    expect(markup).toContain("Editorial priorities");
    expect(markup).toContain("must cover");
    expect(markup).not.toMatch(/[0-9.]+ min|estimated minutes|target minutes/i);
    expect(markup).not.toMatch(/(?:web|archive)_[a-z0-9_]+/);
  });

  it("keeps partial truth while presenting a usable packet and preserves terminal failures", () => {
    expect(outcomeLabel(run("run_partial", "partial"), receipt("run_partial", "partial"), [{ ...activity("run_partial", "read", "Unavailable"), tool: "read_url", status: "unavailable" }])).toBe("Ready · 1 source unavailable");
    expect(outcomeLabel(run("run_failed", "failed"), receipt("run_failed", "failed"), [])).toBe("Failed safely");
    expect(outcomeLabel(run("run_stopped", "stopped"), receipt("run_stopped", "stopped"), [])).toBe("Stopped");
    expect(outcomeLabel(null, null, [], { code: "phase7a_live_not_authorized", message: "Live research is unavailable.", retryable: false })).toBe("Failed safely");
  });

  it("does not leave a pre-stream HTTP failure looking like active research", () => {
    const failedExchange: ResearchExchange = {
      local_id: "local_failed",
      run_id: null,
      user: { id: "user_failed", text: "Research this.", research_depth: "standard", created_at: "2026-08-25T00:00:00Z" },
      run: null,
      activities: [],
      assistant: null,
      artifact: null,
      receipt: null,
      error: { code: "phase7a_live_not_authorized", message: "Live research is unavailable.", retryable: false },
    };
    const markup = renderToStaticMarkup(createElement(ConversationThread, {
      exchanges: [failedExchange],
      sources: {},
      draft: "",
      setDraft: () => undefined,
      researchDepth: "standard",
      setResearchDepth: () => undefined,
      send: () => undefined,
      running: false,
      openSource: () => undefined,
      focusArtifact: () => undefined,
      copyArtifact: () => undefined,
      copiedExchangeId: null,
    }));
    expect(markup).toContain("Research stopped before completion.");
    expect(markup).toContain("Live research is unavailable.");
    expect(markup).not.toContain("Starting research");
  });

  it("groups low-level activity into quiet expandable work lines", () => {
    const activities: Phase7AActivity[] = [
      { ...activity("run_one", "agent_one", "Choosing the next step"), kind: "agent", tool: undefined },
      { ...activity("run_one", "read_one", "Read FDA"), tool: "read_url", detail: "FDA · https://fda.gov/a" },
      { ...activity("run_one", "read_two", "Read AP"), tool: "read_url", detail: "AP · https://apnews.com/b" },
      { ...activity("run_one", "agent_two", "Choosing the next step"), kind: "agent", tool: undefined },
      { ...activity("run_one", "archive_one", "Search archive"), tool: "search_transcripts", detail: "sprout outbreak · 3 matches" },
    ];
    const groups = groupObservableWork(activities);
    expect(groups.map((group) => group.label)).toEqual(["Read 2 sources", "Checked the Nonsense archive"]);
    expect(groups[0]?.detail).toContain("FDA");
    expect(groups[1]?.detail).toContain("3 matches");
  });

  it("renders a natural cited answer and separate deep-research control without a packet", () => {
    const source: BrowserSource = {
      source_id: "web_fda",
      source_type: "web",
      availability: "complete",
      evidence_usable: true,
      title: "FDA outbreak update",
      url: "https://fda.gov/outbreak-update",
      excerpt: "The recall expanded.",
    };
    const exchange: ResearchExchange = {
      local_id: "local_answer",
      run_id: "run_answer",
      user: { id: "user_answer", text: "What changed?", research_depth: "deep", created_at: "2026-08-25T00:00:00Z" },
      run: run("run_answer", "complete"),
      activities: [activity("run_answer", "search_answer", "Searched current outbreak")],
      assistant: {
        message_id: "message_answer",
        run_id: "run_answer",
        text: "**Conclusion:** The recall expanded; <raw HTML> is not executed.",
        source_ids: [source.source_id],
        blocks: [{ text: "**Conclusion:** The recall expanded; <raw HTML> is not executed.", source_ids: [source.source_id] }],
        created_at: "2026-08-25T00:01:00Z",
      },
      artifact: null,
      receipt: { ...receipt("run_answer"), artifact_revision: 0, counts: { ...receipt("run_answer").counts, compositions: 0 } },
      error: null,
    };
    const markup = renderToStaticMarkup(createElement(ConversationThread, {
      exchanges: [exchange],
      sources: { [source.source_id]: source },
      draft: "",
      setDraft: () => undefined,
      researchDepth: "deep",
      setResearchDepth: () => undefined,
      send: () => undefined,
      running: false,
      openSource: () => undefined,
      focusArtifact: () => undefined,
      copyArtifact: () => undefined,
      copiedExchangeId: null,
    }));
    expect(markup).toContain("<strong>Conclusion:</strong> The recall expanded; &lt;raw HTML&gt; is not executed.");
    expect(markup).not.toContain("**Conclusion:**");
    expect(markup).toContain("[1] FDA");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("Deep research");
    expect(markup).not.toContain("Nonsense prep packet");
  });

  it("uses strict client stream validation and responsive static-motion styles", async () => {
    expect(() => phase7aMessageSchema.parse({
      message_id: "message_incomplete",
      run_id: "run_incomplete",
      text: "Missing claim blocks.",
      source_ids: [],
      created_at: "2026-08-25T00:00:00Z",
    })).toThrow();
    const css = await readFile(resolve(root, "src/app/globals.css"), "utf8");
    expect(css).toContain("overflow-x: hidden");
    expect(css).toContain("@media (max-width: 600px)");
    expect(css).toContain(".work-line > summary { min-height: 44px; }");
    expect(css).toContain(".chat-composer .deep-research-toggle { min-height: 44px; }");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".work-line-label__highlight { display: none; }");
    expect(css).not.toContain("content: attr(data-label)");
    expect(css).not.toContain("activity-node");
    expect(css).not.toContain("background-clip: text");
  });
});
