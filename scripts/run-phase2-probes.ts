import { mkdir, writeFile } from "node:fs/promises";
import {
  PHASE_2_LIMITS,
  buildStructuredRequest,
  buildToolCallRequest,
  buildToolResultRequest,
  buildWebSearchRequest,
  executeDoubleNumberProbe,
  runOpenRouterRequest,
  validateStructuredProbe,
  type Phase2StreamResult,
} from "../src/lib/openrouter-phase2.ts";

type ProbeRecord = {
  name: string;
  model?: string;
  provider?: string;
  finishReason?: string;
  firstEventMs: number;
  elapsedMs: number;
  usage?: Phase2StreamResult["usage"];
  citations?: Phase2StreamResult["citations"];
};

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
if (!apiKey) {
  console.error("OPENROUTER_API_KEY is missing. No request was sent.");
  process.exitCode = 2;
} else {
  let requests = 0;
  let cost = 0;
  const probes: ProbeRecord[] = [];

  const run = async (name: string, request: Parameters<typeof runOpenRouterRequest>[1]) => {
    if (requests >= PHASE_2_LIMITS.maxProviderRequests) {
      throw new Error("Phase 2 provider-request limit reached.");
    }
    requests += 1;
    const result = await runOpenRouterRequest(apiKey, request);
    cost += result.usage?.cost ?? 0;
    if (cost > PHASE_2_LIMITS.hardDollarCap) {
      throw new Error(`Phase 2 dollar cap exceeded: $${cost.toFixed(6)}`);
    }
    probes.push({
      name,
      model: result.model,
      provider: result.provider,
      finishReason: result.finishReason,
      firstEventMs: Number(result.firstEventMs.toFixed(1)),
      elapsedMs: Number(result.elapsedMs.toFixed(1)),
      usage: result.usage,
      citations: result.citations.length > 0 ? result.citations : undefined,
    });
    return result;
  };

  const structured = await run("structured-output", buildStructuredRequest());
  validateStructuredProbe(structured.text);

  const toolCallResult = await run("local-tool-call", buildToolCallRequest());
  if (toolCallResult.toolCalls.length !== 1) {
    throw new Error(`Expected one local tool call; received ${toolCallResult.toolCalls.length}.`);
  }
  const doubled = executeDoubleNumberProbe(toolCallResult.toolCalls[0]);
  const toolFinal = await run(
    "local-tool-result",
    buildToolResultRequest(toolCallResult.toolCalls[0], doubled),
  );
  if (!toolFinal.text.includes("42")) throw new Error("Tool-result probe did not acknowledge 42.");

  const webSearch = await run("web-search", buildWebSearchRequest());
  const searchCount = webSearch.usage?.server_tool_use?.web_search_requests ?? 0;
  if (searchCount !== 1) throw new Error(`Expected one web search; recorded ${searchCount}.`);
  if (webSearch.citations.length === 0) throw new Error("Web-search probe returned no citations.");

  const report = {
    phase: 2,
    status: "passed",
    createdAt: new Date().toISOString(),
    model: PHASE_2_LIMITS.model,
    requestCount: requests,
    totalCostUsd: Number(cost.toFixed(8)),
    hardDollarCapUsd: PHASE_2_LIMITS.hardDollarCap,
    probes,
  };

  await mkdir("reports", { recursive: true });
  await writeFile("reports/phase-2-live.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}
