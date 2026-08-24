import { describe, expect, it, vi } from "vitest";
import {
  PHASE_5_LIVE_CALLS_DISABLED,
  PHASE_5_MODEL_REQUEST_TIMEOUT_MS,
  createOpenRouterPhase5Model,
} from "../src/lib/phase5/model.ts";
import {
  PHASE_5_LIMITS,
  bigStoryGeneratedArtifactSchema,
  type BigStoryArtifact,
  type EvidenceSource,
  type Phase5Input,
} from "../src/lib/phase5/contracts.ts";
import { fixturePlan, validArtifact } from "./phase5-fixtures.ts";

function streamResponse(model: string, value: unknown, cost = 0.002): Response {
  const events = [
    {
      id: "gen_phase5_fixture",
      model,
      provider: model.startsWith("openai/") ? "OpenAI" : "xAI",
      choices: [{ delta: { content: JSON.stringify(value) }, finish_reason: "stop" }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        cost,
      },
    },
  ];
  const body = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function malformedStreamResponse(model: string): Response {
  const event = {
    model,
    provider: "xAI",
    choices: [{ delta: { content: "{not valid json" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14, cost: 0.001 },
  };
  return new Response(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`);
}

function diagnosticStreamResponse(options: {
  content: string;
  finishReason: string;
  reasoningTokens?: number;
}): Response {
  const event = {
    id: "gen_phase5_diagnostic",
    model: "x-ai/grok-4.6",
    provider: "xAI",
    choices: [{ delta: { content: options.content }, finish_reason: options.finishReason }],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
      cost: 0.001,
      completion_tokens_details: { reasoning_tokens: options.reasoningTokens ?? 12 },
    },
  };
  return new Response(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`);
}

const input: Phase5Input = {
  mode: "headlines",
  topic: "Old infrastructure",
  links: [],
  notes: "",
  target_minutes: 6,
};

const evidence: EvidenceSource[] = [
  {
    source_id: "web_fixture",
    source_type: "web",
    availability: "complete",
    evidence_usable: true,
    title: "Current source",
    url: "https://example.com/current",
    retrieved_at: "2026-08-24T08:00:00.000Z",
    excerpt: "Current source excerpt.",
    content: "Current source excerpt with enough detail to compose the fixture.",
  },
];

describe("Phase 5 pinned OpenRouter model adapter", () => {
  it("routes only the research plan to Luna/max with strict structured output", async () => {
    const fetchSpy = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: "openai/gpt-5.6-luna",
        stream: true,
        max_tokens: 1024,
        reasoning: { effort: "max", exclude: true },
        provider: {
          allow_fallbacks: false,
          require_parameters: true,
          data_collection: "deny",
          zdr: false,
          max_price: { prompt: 0.2, completion: 1.2 },
        },
        response_format: { type: "json_schema", json_schema: { strict: true, name: "phase5_research_plan" } },
      });
      expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
      expect(body).not.toHaveProperty("tools");
      return streamResponse("openai/gpt-5.6-luna", fixturePlan);
    });
    const adapter = createOpenRouterPhase5Model({
      apiKey: "synthetic",
      liveAuthorized: true,
      fetchImpl: fetchSpy,
    });
    const result = await adapter.plan(input);
    expect(result.value).toEqual(fixturePlan);
    expect(result.receipt).toMatchObject({ model: "openai/gpt-5.6-luna", cost_usd: 0.002 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("routes composition and repair only to Grok/medium with the mode schema", async () => {
    let calls = 0;
    const fetchSpy = vi.fn<typeof fetch>(async (_url, init) => {
      calls += 1;
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: "x-ai/grok-4.6",
        max_tokens: 12000,
        reasoning: { effort: "medium", exclude: true },
        provider: {
          allow_fallbacks: false,
          data_collection: "deny",
          zdr: true,
          max_price: { prompt: 2, completion: 6 },
        },
      });
      expect(body.response_format.json_schema.name).toBe(
        calls === 1 ? "phase5_headlines_artifact" : "phase5_headlines_artifact_repair",
      );
      expect(body.response_format.json_schema.schema.properties).not.toHaveProperty("source_ledger");
      const prompt = body.messages[0].content as string;
      expect(prompt.match(/Current source excerpt with enough detail to compose the fixture\./g)).toHaveLength(1);
      expect(prompt).not.toContain('"excerpt":');
      return streamResponse("x-ai/grok-4.6", validArtifact(input, evidence), 0.01);
    });
    const adapter = createOpenRouterPhase5Model({
      apiKey: "synthetic",
      liveAuthorized: true,
      fetchImpl: fetchSpy,
    });
    await adapter.compose(input, fixturePlan, evidence);
    await adapter.repair(input, fixturePlan, evidence, {}, ["schema:artifact:bad"]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("fails before fetch without a key or explicit live authority", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    await expect(
      createOpenRouterPhase5Model({ liveAuthorized: true, fetchImpl: fetchSpy }).plan(input),
    ).rejects.toThrow("phase5_missing_key");
    await expect(
      createOpenRouterPhase5Model({ apiKey: "synthetic", liveAuthorized: false, fetchImpl: fetchSpy }).plan(input),
    ).rejects.toThrow("phase5_live_not_authorized");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects route mismatch through injected test transport while production live calls remain statically locked", async () => {
    const adapter = createOpenRouterPhase5Model({
      apiKey: "synthetic",
      liveAuthorized: true,
      fetchImpl: async () => streamResponse("other/model", fixturePlan),
    });
    await expect(adapter.plan(input)).rejects.toThrow("phase5_route_mismatch");
    expect(PHASE_5_LIVE_CALLS_DISABLED).toBe(true);
  });

  it("sanitizes provider failure and never retries", async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () =>
      new Response('{"error":{"message":"SECRET upstream detail"}}', { status: 500 }),
    );
    const adapter = createOpenRouterPhase5Model({
      apiKey: "synthetic",
      liveAuthorized: true,
      fetchImpl: fetchSpy,
    });
    await expect(adapter.plan(input)).rejects.toThrow("phase5_model_unavailable");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("uses the smaller workflow deadline and never exceeds its request ceiling", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const adapter = createOpenRouterPhase5Model({
      apiKey: "synthetic",
      liveAuthorized: true,
      fetchImpl: async () => streamResponse("openai/gpt-5.6-luna", fixturePlan),
    });
    await adapter.plan(input, { timeoutMs: 12_345 });
    await adapter.plan(input, { timeoutMs: PHASE_5_MODEL_REQUEST_TIMEOUT_MS + 1_000 });
    expect(timeoutSpy).toHaveBeenNthCalledWith(1, 12_345);
    expect(timeoutSpy).toHaveBeenNthCalledWith(2, PHASE_5_MODEL_REQUEST_TIMEOUT_MS);
    timeoutSpy.mockRestore();
  });

  it("preserves a malformed composer receipt and returns an invalid value for deterministic repair", async () => {
    const adapter = createOpenRouterPhase5Model({
      apiKey: "synthetic",
      liveAuthorized: true,
      fetchImpl: async () => malformedStreamResponse("x-ai/grok-4.6"),
    });
    const result = await adapter.compose(input, fixturePlan, evidence);
    expect(result.value).toBeNull();
    expect(result).toMatchObject({
      output_status: "invalid_json",
      receipt: {
        model: "x-ai/grok-4.6",
        cost_usd: 0.001,
        finish_reason: "stop",
        response_characters: 15,
        output_status: "invalid_json",
      },
    });
  });

  it.each([
    ["empty", "", "stop"],
    ["truncated", '{"mode":"big_story"', "length"],
    ["incomplete", "{}", "content_filter"],
  ] as const)("classifies %s output without storing raw failed text", async (expected, content, finishReason) => {
    const adapter = createOpenRouterPhase5Model({
      apiKey: "synthetic",
      liveAuthorized: true,
      fetchImpl: async () => diagnosticStreamResponse({ content, finishReason }),
    });
    const result = await adapter.compose(input, fixturePlan, evidence);
    expect(result).toMatchObject({
      value: null,
      output_status: expected,
      receipt: {
        generation_id: "gen_phase5_diagnostic",
        finish_reason: finishReason,
        response_characters: content.length,
        output_status: expected,
        reasoning_tokens: 12,
      },
    });
    expect(result.receipt).not.toHaveProperty("text");
  });

  it("keeps a maximum-shape compact Big Story draft inside the 12k response envelope", () => {
    const base = validArtifact({ ...input, mode: "big_story", target_minutes: 28 }, evidence);
    if (base.mode !== "big_story") throw new Error("fixture mode mismatch");
    const draft = structuredClone(base);
    delete (draft as Partial<BigStoryArtifact>).source_ledger;
    const sourceIds = [evidence[0]!.source_id];
    const roles: BigStoryArtifact["research_cards"][number]["role"][] = [
      "background",
      "key_evidence",
      "force",
      "interpretation",
      "surprise",
      "recommendation_lead",
    ];
    draft.research_cards = Array.from({ length: 10 }, (_, index) => ({
      role: roles[index % roles.length]!,
      text: "x".repeat(1_200),
      source_ids: sourceIds,
    }));
    draft.modular_outline = Array.from({ length: 10 }, (_, index) => ({
      priority: index === 0 ? "must_have" as const : index === 9 ? "cut_first" as const : "use_if_time" as const,
      text: "y".repeat(800),
      source_ids: sourceIds,
      estimated_minutes: 2.8,
    }));
    draft.conversation_questions = Array.from({ length: 8 }, () => "q".repeat(500));
    draft.uncertainties_and_open_checks = Array.from({ length: 8 }, () => "u".repeat(500));
    const parsed = bigStoryGeneratedArtifactSchema.parse(draft);
    expect(JSON.stringify(parsed).length).toBeLessThan(PHASE_5_LIMITS.grokMaxOutputTokens * 4);
  });
});
