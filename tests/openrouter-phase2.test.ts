import { describe, expect, it, vi } from "vitest";
import {
  PHASE_2_LIMITS,
  PHASE_2_LIVE_CALLS_DISABLED,
  buildStructuredRequest,
  buildToolCallRequest,
  buildWebSearchRequest,
  executeDoubleNumberProbe,
  readOpenRouterStream,
  runOpenRouterRequest,
  validateStructuredProbe,
  validateWebSearchProbe,
} from "../src/lib/openrouter-phase2";

function streamResponse(events: unknown[]): Response {
  const encoder = new TextEncoder();
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

describe("Phase 2 OpenRouter boundary", () => {
  it("freezes the light/heavy split, exact routing rules, and bounded requests", () => {
    const structured = buildStructuredRequest();
    const tool = buildToolCallRequest();
    const web = buildWebSearchRequest();

    expect(PHASE_2_LIMITS.models.light).toMatchObject({
      id: "openai/gpt-5.6-luna",
      reasoningEffort: "max",
      zdr: false,
    });
    expect(PHASE_2_LIMITS.models.heavy).toMatchObject({
      id: "x-ai/grok-4.6",
      reasoningEffort: "medium",
      zdr: true,
    });
    expect(PHASE_2_LIMITS.maxProviderRequests).toBe(4);
    expect(PHASE_2_LIMITS.approvedPhaseBudgetUsd).toBe(1);
    expect(PHASE_2_LIMITS.approvedRepairBudgetUsd).toBe(0.01);
    expect(PHASE_2_LIMITS.approvedWebRepairBudgetUsd).toBe(0.25);
    expect(PHASE_2_LIVE_CALLS_DISABLED).toBe(true);
    expect(structured.provider).toMatchObject({
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: "deny",
      zdr: false,
      max_price: { prompt: 0.2, completion: 1.2 },
    });
    expect(structured.model).toBe(PHASE_2_LIMITS.models.light.id);
    expect(structured.reasoning).toEqual({ effort: "max", exclude: true });
    expect(structured.response_format).toBeDefined();
    expect(tool.model).toBe(PHASE_2_LIMITS.models.light.id);
    expect(JSON.stringify(tool.messages)).toContain("reply with exactly the numeric result");
    expect(tool.tool_choice).toEqual({ type: "function", function: { name: "double_number" } });
    expect(web.model).toBe(PHASE_2_LIMITS.models.heavy.id);
    expect(web.reasoning).toEqual({ effort: "medium", exclude: true });
    expect(web.provider.zdr).toBe(true);
    expect(web.provider.max_price).toEqual({ prompt: 2, completion: 6 });
    expect(web.max_tool_calls).toBe(1);
    expect(JSON.stringify(web)).toContain('"engine":"native"');
    expect(JSON.stringify(web)).toContain('"allowed_domains":["openrouter.ai"]');
  });

  it("reassembles streamed text, tool arguments, citations, usage, and completion", async () => {
    const response = streamResponse([
      {
        id: "generation-1",
        model: PHASE_2_LIMITS.models.light.id,
        provider: "xAI",
        choices: [
          {
            delta: {
              content: "Forty-",
              tool_calls: [
                { index: 0, id: "call-1", function: { name: "double_", arguments: '{"value":' } },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              content: "two",
              tool_calls: [{ index: 0, function: { name: "number", arguments: "21}" } }],
              annotations: [
                {
                  type: "url_citation",
                  url_citation: { url: "https://openrouter.ai/docs/example", title: "Example" },
                },
              ],
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 4,
          total_tokens: 14,
          cost: 0.00002,
          server_tool_use: { web_search_requests: 1 },
        },
      },
    ]);

    const result = await readOpenRouterStream(response);
    expect(result.text).toBe("Forty-two");
    expect(result.toolCalls[0]).toMatchObject({
      id: "call-1",
      function: { name: "double_number", arguments: '{"value":21}' },
    });
    expect(result.citations).toEqual([
      { url: "https://openrouter.ai/docs/example", title: "Example" },
    ]);
    expect(result.usage?.cost).toBe(0.00002);
    expect(result.done).toBe(true);
  });

  it("validates the frozen structured and local-tool contracts", () => {
    expect(
      validateStructuredProbe(
        JSON.stringify({ title: "Hoverboards", angle: "Budget", questions: ["Why?", "Who pays?"] }),
      ),
    ).toMatchObject({ title: "Hoverboards" });
    expect(
      executeDoubleNumberProbe({
        id: "call-1",
        type: "function",
        function: { name: "double_number", arguments: '{"value":21}' },
      }),
    ).toBe(42);
  });

  it("accepts cited web-search evidence when OpenRouter omits its usage counter", () => {
    expect(
      validateWebSearchProbe({
        citations: [{ url: "https://openrouter.ai/docs/guides/features/server-tools/web-search" }],
        usage: { prompt_tokens: 100 },
      }),
    ).toEqual({
      searchCount: 1,
      source: "citations-and-request-bound",
      citationCount: 1,
    });

    expect(() =>
      validateWebSearchProbe({
        citations: [{ url: "https://openrouter.ai/docs/example" }],
        usage: { server_tool_use: { web_search_requests: 2 } },
      }),
    ).toThrow("recorded 2");
  });

  it("fails before fetch when the server-side key is absent", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    await expect(runOpenRouterRequest("", buildStructuredRequest(), fetchSpy)).rejects.toThrow(
      "No request was sent",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps provider calls disabled after the proof", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    await expect(
      runOpenRouterRequest("synthetic-test-key", buildStructuredRequest(), fetchSpy),
    ).rejects.toThrow("compatibility proof completed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

});
