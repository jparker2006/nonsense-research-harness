import { describe, expect, it, vi } from "vitest";
import {
  PHASE_2_LIMITS,
  buildStructuredRequest,
  buildToolCallRequest,
  buildWebSearchRequest,
  executeDoubleNumberProbe,
  readOpenRouterStream,
  runOpenRouterRequest,
  validateStructuredProbe,
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
  it("freezes one model, exact routing rules, and bounded requests", () => {
    const structured = buildStructuredRequest();
    const tool = buildToolCallRequest();
    const web = buildWebSearchRequest();

    expect(PHASE_2_LIMITS.model).toBe("x-ai/grok-4.3");
    expect(PHASE_2_LIMITS.maxProviderRequests).toBe(4);
    expect(PHASE_2_LIMITS.hardDollarCap).toBe(0.03);
    expect(structured.provider).toMatchObject({
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: "deny",
      zdr: true,
      max_price: { prompt: 1.25, completion: 2.5 },
    });
    expect(structured.response_format).toBeDefined();
    expect(tool.tool_choice).toEqual({ type: "function", function: { name: "double_number" } });
    expect(web.max_tool_calls).toBe(1);
    expect(JSON.stringify(web)).toContain('"max_total_results":3');
    expect(JSON.stringify(web)).toContain('"max_characters":1200');
  });

  it("reassembles streamed text, tool arguments, citations, usage, and completion", async () => {
    const response = streamResponse([
      {
        id: "generation-1",
        model: PHASE_2_LIMITS.model,
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

  it("fails before fetch when the server-side key is absent", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    await expect(runOpenRouterRequest("", buildStructuredRequest(), fetchSpy)).rejects.toThrow(
      "No request was sent",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
