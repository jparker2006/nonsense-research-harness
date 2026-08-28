import { describe, expect, it, vi } from "vitest";
import { createResearchBrowserSessionId } from "../src/lib/research/browser-session.ts";
import { createResearchWorkspace } from "../src/lib/research/session-store.ts";
import { deriveThreadTitle } from "../src/lib/threads/contracts.ts";
import { researchThreadRecordSchema, researchThreadSnapshotSchema } from "../src/lib/threads/contracts.ts";
import { projectThreadRecord } from "../src/lib/threads/client.ts";
import {
  appendPendingUser,
  checkpointThreadSnapshot,
  emptyThreadSnapshot,
  workspaceFromThreadSnapshot,
} from "../src/lib/threads/snapshot.ts";
import {
  MemoryThreadStore,
  ThreadConflictError,
  isTransientDatabaseError,
  withDatabaseRetry,
} from "../src/lib/threads/store.ts";

const THREAD_ONE = "11111111-1111-4111-8111-111111111111";
const THREAD_TWO = "22222222-2222-4222-8222-222222222222";

describe("Research Thread store", () => {
  it("creates lazily, lists by update time, loads, revisions safely, detects stale writes, and deletes", async () => {
    const store = new MemoryThreadStore();
    expect(await store.list()).toEqual([]);

    const firstSnapshot = appendPendingUser(emptyThreadSnapshot(THREAD_ONE), {
      runId: "run_one",
      message: "What changed in food regulation?",
      depth: "standard",
      createdAt: "2026-08-28T00:00:00.000Z",
    });
    const first = await store.create({ id: THREAD_ONE, title: deriveThreadTitle("What changed in food regulation?"), snapshot: firstSnapshot });
    const second = await store.create({ id: THREAD_TWO, title: "Second topic", snapshot: emptyThreadSnapshot(THREAD_TWO) });
    expect((await store.list()).map((item) => item.id)).toEqual([THREAD_TWO, THREAD_ONE]);

    const updated = await store.save({ id: THREAD_ONE, expectedRevision: first.revision, snapshot: { ...first.snapshot, checkpoint: "evidence" } });
    expect(updated.revision).toBe(first.revision + 1);
    expect((await store.list())[0]?.id).toBe(THREAD_ONE);
    await expect(store.save({ id: THREAD_ONE, expectedRevision: first.revision, snapshot: first.snapshot })).rejects.toBeInstanceOf(ThreadConflictError);
    expect((await store.load(THREAD_ONE))?.revision).toBe(updated.revision);
    expect(await store.delete(THREAD_TWO)).toBe(true);
    expect(await store.load(THREAD_TWO)).toBeNull();
    expect(await store.delete(THREAD_TWO)).toBe(false);
    expect(second.revision).toBe(1);
  });

  it("stores only bounded product state and restores provider-neutral context", () => {
    const base = appendPendingUser(emptyThreadSnapshot(THREAD_ONE), {
      runId: "run_sanitized",
      message: "Connect this to past Nonsense coverage.",
      depth: "deep",
      createdAt: "2026-08-28T00:00:00.000Z",
    });
    const workspace = createResearchWorkspace(THREAD_ONE);
    workspace.agent_messages = [{ role: "assistant", private_reasoning: "never persist this" }];
    workspace.run_traces = [{ private_prompt: "internal system prompt must not persist" }] as never;
    workspace.candidates = [{
      source_id: "candidate_secret",
      url: "https://example.com/candidate",
      title: "Unread candidate",
      excerpt: "candidate snippet must not persist",
      query: "private candidate query",
    }];
    workspace.evidence = [{
      source_id: "archive_chunk_fixture",
      source_type: "archive",
      availability: "complete",
      evidence_usable: true,
      title: "A prior Nonsense episode",
      excerpt: "Exact prior passage",
      content: "Exact prior passage with enough context to cite later.",
      episode_id: "episode_fixture",
      segment_id: "segment_fixture",
      chunk_id: "chunk_fixture",
      season: 4,
      episode_number: 8,
    }, {
      source_id: "web_fixture",
      source_type: "web",
      availability: "complete",
      evidence_usable: true,
      title: "Current source",
      url: "https://example.com/current",
      excerpt: "x".repeat(3_000),
      content: "x".repeat(3_000),
    }];

    const snapshot = checkpointThreadSnapshot(base, workspace, "run_sanitized");
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("private_reasoning");
    expect(serialized).not.toContain("candidate snippet");
    expect(serialized).not.toContain("private candidate query");
    expect(serialized).not.toContain("agent_messages");
    expect(serialized).not.toContain("internal system prompt");
    expect(serialized).not.toContain("run_traces");
    expect(serialized).not.toContain("DATABASE_URL");
    expect(snapshot.trusted_sources.find((source) => source.source_id === "web_fixture")?.excerpt).toHaveLength(2_000);
    expect(snapshot.archive_passages[0]?.exact_text).toBe("Exact prior passage with enough context to cite later.");

    const restored = workspaceFromThreadSnapshot(snapshot);
    expect(restored.agent_messages).toEqual([]);
    expect(restored.candidates).toEqual([]);
    expect(restored.evidence.find((source) => source.source_id === "archive_chunk_fixture")?.content).toBe(snapshot.archive_passages[0]?.exact_text);
  });

  it("retries a transient database operation once and never retries deterministic errors", async () => {
    const transient = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("temporary connection failure"), { code: "08006" }))
      .mockResolvedValueOnce("ok");
    await expect(withDatabaseRetry(transient)).resolves.toBe("ok");
    expect(transient).toHaveBeenCalledTimes(2);

    const deterministic = vi.fn().mockRejectedValue(new ThreadConflictError());
    await expect(withDatabaseRetry(deterministic)).rejects.toBeInstanceOf(ThreadConflictError);
    expect(deterministic).toHaveBeenCalledTimes(1);
    expect(isTransientDatabaseError({ status: 503 })).toBe(true);
    expect(isTransientDatabaseError({ status: 401 })).toBe(false);
  });

  it("uses genuine UUIDs and deterministic compact titles", () => {
    expect(createResearchBrowserSessionId(() => "123e4567-e89b-42d3-a456-426614174000")).toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(() => createResearchBrowserSessionId(() => "not-a-uuid")).toThrow("research_invalid_session_id");
    expect(deriveThreadTitle(`Read https://example.com and ${"explain this ".repeat(10)}`).length).toBeLessThanOrEqual(72);
  });

  it("hydrates citations, the current artifact, receipts, and interrupted work without private runtime state", () => {
    const source = {
      source_id: "web_persisted",
      source_type: "web" as const,
      availability: "complete" as const,
      evidence_usable: true,
      title: "Persisted official source",
      url: "https://example.com/persisted",
      excerpt: "The exact bounded evidence excerpt.",
    };
    const artifact = {
      mode: "headlines" as const,
      working_title: "A durable research brief",
      past_nonsense_coverage: { status: "no_relevant_archive_match" as const, items: [] },
      conversation_questions: ["What changed?", "What remains unresolved?"],
      uncertainties_and_open_checks: ["The implementation date remains open."],
      source_ledger: [source],
      what_happened: { text: "The rule changed.", source_ids: [source.source_id] },
      why_it_matters_now: { text: "Implementation begins soon.", source_ids: [source.source_id] },
      verified_facts: [{ text: "The source confirms the change.", source_ids: [source.source_id] }],
      tension_or_argument: { text: "The headline is broader than the operative text.", source_ids: [source.source_id] },
      surprising_details: [],
      flexible_outline: [
        { priority: "essential" as const, text: "Lead with the operative change.", source_ids: [source.source_id] },
        { priority: "strong" as const, text: "Explain the practical effect.", source_ids: [source.source_id] },
        { priority: "optional" as const, text: "Name the remaining uncertainty.", source_ids: [source.source_id] },
      ],
    };
    const counts = { agent_steps: 2, provider_requests: 2, model_requests: 2, exa_search_requests: 0, web_searches: 0, url_reads: 0, transcript_searches: 0, transcript_opens: 0, artifact_completions: 1, artifact_calls: 1, repairs: 0 };
    const snapshot = researchThreadSnapshotSchema.parse({
      ...emptyThreadSnapshot(THREAD_ONE),
      conversation: [
        { turn_id: "turn_user", role: "user", text: "Write the brief.", research_depth: "standard", run_id: "run_complete", created_at: "2026-08-28T00:00:00.000Z" },
        { turn_id: "turn_assistant", role: "assistant", text: "The operative change is narrow.", blocks: [{ text: "The operative change is narrow.", source_ids: [source.source_id] }], source_ids: [source.source_id], run_id: "run_complete", created_at: "2026-08-28T00:00:10.000Z" },
        { turn_id: "turn_interrupted", role: "user", text: "Follow that thread.", research_depth: "deep", run_id: "run_interrupted", created_at: "2026-08-28T00:01:00.000Z" },
      ],
      trusted_sources: [source],
      artifact,
      artifact_revision: 1,
      artifact_run_id: "run_complete",
      receipts: [{ run_id: "run_complete", status: "complete", counts, accounted_cost_usd: 0.02, elapsed_ms: 10_000, limitations: [], artifact_revision: 1 }],
      checkpoint: "user",
    });
    const record = researchThreadRecordSchema.parse({
      id: THREAD_ONE,
      title: "Write the brief",
      revision: 4,
      created_at: "2026-08-28T00:00:00.000Z",
      updated_at: "2026-08-28T00:01:00.000Z",
      snapshot,
    });
    const projected = projectThreadRecord(record, { durable: true, warning: null });
    expect(projected.exchanges).toHaveLength(2);
    expect(projected.exchanges[0]).toMatchObject({
      assistant: { source_ids: [source.source_id] },
      artifact: { revision: 1 },
      receipt: { status: "complete" },
      run: { state: "complete" },
    });
    expect(projected.sources[source.source_id]?.excerpt).toBe(source.excerpt);
    expect(projected.exchanges[1]).toMatchObject({
      assistant: null,
      run: { state: "stopped" },
      error: { code: "research_run_interrupted" },
    });
    expect(projected.active_exchange_id).toBeNull();
  });
});
