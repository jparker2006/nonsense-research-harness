import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createResearchChatRoute } from "../src/app/api/chat/route.ts";
import { DELETE as deleteThread, GET as loadThread } from "../src/app/api/threads/[id]/route.ts";
import { GET as listThreads } from "../src/app/api/threads/route.ts";
import type { ResearchAgentDependencies } from "../src/lib/research/agent.ts";
import { clearResearchWorkspacesForTest } from "../src/lib/research/session-store.ts";
import { emptyThreadSnapshot } from "../src/lib/threads/snapshot.ts";
import { setThreadStoreBindingForTest, type ThreadStoreBinding } from "../src/lib/threads/factory.ts";
import { MemoryThreadStore, type ThreadStore } from "../src/lib/threads/store.ts";
import { projectThreadRecord } from "../src/lib/threads/client.ts";
import { fixtureTools } from "./research-fixtures.ts";

const THREAD_ID = "33333333-3333-4333-8333-333333333333";
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

function toolCall(id: string, name: string, input: unknown) {
  return { type: "tool-call" as const, toolCallId: id, toolName: name, input: JSON.stringify(input) };
}

function completedModel(answer: string) {
  return new MockLanguageModelV4({ doGenerate: [
    modelStep([toolCall("goal", "set_research_goal", { objective: "Answer the question.", deliverable: "answer", plan: ["Answer from the saved research context"] })]),
    modelStep([toolCall("answer", "submit_answer", { paragraphs: [{ markdown: answer, citations: [] }] })]),
  ] });
}

function dependencies(model: MockLanguageModelV4): ResearchAgentDependencies {
  return {
    model,
    modelId: "openai/gpt-5.6-luna",
    tools: fixtureTools(),
    now: () => new Date("2026-08-28T12:00:00.000Z"),
  };
}

function request(message: string) {
  return new Request("http://local.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ research: { action: "message", session_id: THREAD_ID, message, research_depth: "standard" } }),
  });
}

describe("durable Research Thread route", () => {
  beforeEach(() => clearResearchWorkspacesForTest());
  afterEach(() => setThreadStoreBindingForTest(undefined));

  it("creates on the first message before model work, saves terminal state, and resumes after process memory is cleared", async () => {
    const backing = new MemoryThreadStore();
    const operations: string[] = [];
    const store: ThreadStore = {
      create(input) { operations.push("create"); return backing.create(input); },
      list(limit) { operations.push("list"); return backing.list(limit); },
      load(id) { operations.push("load"); return backing.load(id); },
      save(input) { operations.push("save"); return backing.save(input); },
      delete(id) { operations.push("delete"); return backing.delete(id); },
    };
    const binding: ThreadStoreBinding = { store, durable: true, warning: null };
    const firstModel = completedModel("The first answer is saved.");
    const firstRoute = createResearchChatRoute({
      threadStoreBinding: binding,
      dependencies: () => {
        expect(operations).toContain("create");
        return dependencies(firstModel);
      },
    });
    const firstStream = await (await firstRoute(request("What changed?"))).text();
    expect(firstStream).toContain("The first answer is saved.");
    expect(firstStream).toContain('"durable":true');
    const firstRecord = await backing.load(THREAD_ID);
    expect(firstRecord?.snapshot.conversation.map((turn) => turn.role)).toEqual(["user", "assistant"]);
    expect(firstRecord?.snapshot.checkpoint).toBe("terminal");
    expect(firstRecord?.revision).toBeGreaterThan(1);

    clearResearchWorkspacesForTest();
    const followupModel = completedModel("The follow-up used the durable thread.");
    const secondRoute = createResearchChatRoute({ dependencies: () => dependencies(followupModel), threadStoreBinding: binding });
    const secondStream = await (await secondRoute(request("What should I watch next?"))).text();
    expect(secondStream).toContain("The follow-up used the durable thread.");
    expect(JSON.stringify(followupModel.doGenerateCalls[0]?.prompt)).toContain("The first answer is saved.");
    expect((await backing.load(THREAD_ID))?.snapshot.conversation.map((turn) => turn.role)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  it("preserves an unmatched user checkpoint as interrupted and never auto-runs it on hydration", async () => {
    const backing = new MemoryThreadStore();
    let providerCalls = 0;
    const route = createResearchChatRoute({
      dependencies: () => {
        providerCalls += 1;
        throw new Error("process interrupted before provider work");
      },
      threadStoreBinding: { store: backing, durable: true, warning: null },
    });
    const stream = await (await route(request("Start this research."))).text();
    expect(stream).toContain("research_request_failed");
    const record = await backing.load(THREAD_ID);
    expect(record?.snapshot.checkpoint).toBe("user");
    const projected = projectThreadRecord(record!, { durable: true, warning: null });
    expect(projected.exchanges[0]).toMatchObject({ run: { state: "stopped" }, error: { code: "research_run_interrupted" } });
    expect(providerCalls).toBe(1);
  });

  it("keeps the paid answer visible and labels history unavailable when terminal persistence fails", async () => {
    const backing = new MemoryThreadStore();
    let saves = 0;
    const store: ThreadStore = {
      create: (input) => backing.create(input),
      list: (limit) => backing.list(limit),
      load: (id) => backing.load(id),
      save: async () => { saves += 1; throw Object.assign(new Error("database unavailable"), { code: "08006" }); },
      delete: (id) => backing.delete(id),
    };
    const route = createResearchChatRoute({
      dependencies: () => dependencies(completedModel("The supported answer remains in the browser.")),
      threadStoreBinding: { store, durable: true, warning: null },
    });
    const stream = await (await route(request("Answer even if saving fails."))).text();
    expect(saves).toBeGreaterThan(0);
    expect(stream).toContain("The supported answer remains in the browser.");
    expect(stream).toContain('"durable":false');
    expect(stream).toContain("History is temporarily unavailable");
  });

  it("lists, loads, and hard-deletes through the narrow API without exposing database configuration", async () => {
    const backing = new MemoryThreadStore();
    await backing.create({ id: THREAD_ID, title: "Saved topic", snapshot: emptyThreadSnapshot(THREAD_ID) });
    setThreadStoreBindingForTest({ store: backing, durable: true, warning: null });
    const listResponse = await listThreads();
    const listText = await listResponse.text();
    expect(listText).toContain("Saved topic");
    expect(listText).not.toContain("DATABASE_URL");
    expect(listText).not.toContain('"snapshot"');

    const context = { params: Promise.resolve({ id: THREAD_ID }) };
    const loaded = await loadThread(new Request("http://local.test/api/threads/id"), context);
    expect((await loaded.json()).thread.snapshot.thread_id).toBe(THREAD_ID);
    expect((await deleteThread(new Request("http://local.test/api/threads/id", { method: "DELETE" }), context)).status).toBe(204);
    expect(await backing.load(THREAD_ID)).toBeNull();
  });
});
