import { mkdir, writeFile } from "node:fs/promises";
import {
  PHASE_2_LIMITS,
  PHASE_2_LIVE_CALLS_DISABLED,
  buildStructuredRequest,
  buildToolCallRequest,
  buildToolResultRequest,
  buildWebSearchRequest,
  executeDoubleNumberProbe,
  runOpenRouterRequest,
  validateStructuredProbe,
  validateWebSearchProbe,
  type Phase2WebSearchEvidence,
  type Phase2StreamResult,
} from "../src/lib/openrouter-phase2.ts";

type ProbeRecord = {
  name: string;
  requestedModel: string;
  reasoningEffort: "max" | "medium";
  model?: string;
  provider?: string;
  finishReason?: string;
  firstEventMs: number;
  elapsedMs: number;
  usage?: Phase2StreamResult["usage"];
  citations?: Phase2StreamResult["citations"];
  textPreview?: string;
  toolCalls?: Phase2StreamResult["toolCalls"];
  webSearchEvidence?: Phase2WebSearchEvidence;
};

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
if (!apiKey) {
  console.error("OPENROUTER_API_KEY is missing. No request was sent.");
  process.exitCode = 2;
} else {
  const repairMode = process.argv.includes("--repair");
  const webOnlyMode = process.argv.includes("--web-only");
  const requestLimit = webOnlyMode ? 1 : repairMode ? 3 : PHASE_2_LIMITS.maxProviderRequests;
  const dollarCap = webOnlyMode
    ? PHASE_2_LIMITS.approvedWebRepairBudgetUsd
    : repairMode
      ? PHASE_2_LIMITS.approvedRepairBudgetUsd
      : PHASE_2_LIMITS.approvedPhaseBudgetUsd;
  let requests = 0;
  let cost = 0;
  const probes: ProbeRecord[] = [];

  const run = async (name: string, request: Parameters<typeof runOpenRouterRequest>[1]) => {
    if (requests >= requestLimit) {
      throw new Error("Phase 2 provider-request limit reached.");
    }
    requests += 1;
    const result = await runOpenRouterRequest(apiKey, request);
    if (
      !result.model ||
      (result.model !== request.model && !result.model.startsWith(`${request.model}-`))
    ) {
      throw new Error(
        `Model mismatch for ${name}: expected ${request.model}, received ${result.model ?? "unknown"}.`,
      );
    }
    cost += result.usage?.cost ?? 0;
    probes.push({
      name,
      requestedModel: request.model,
      reasoningEffort: request.reasoning.effort,
      model: result.model,
      provider: result.provider,
      finishReason: result.finishReason,
      firstEventMs: Number(result.firstEventMs.toFixed(1)),
      elapsedMs: Number(result.elapsedMs.toFixed(1)),
      usage: result.usage,
      citations: result.citations.length > 0 ? result.citations : undefined,
      textPreview: result.text ? result.text.slice(0, 500) : undefined,
      toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
    });
    if (cost > dollarCap) {
      throw new Error(`Phase 2 approved budget exceeded after provider charge: $${cost.toFixed(6)}`);
    }
    return result;
  };

  const makeReport = (status: "passed" | "failed", error?: string) => ({
    phase: 2,
    mode: webOnlyMode ? "grok-native-web-only" : repairMode ? "repair-after-structured" : "full",
    status,
    createdAt: new Date().toISOString(),
    models: PHASE_2_LIMITS.models,
    requestCount: requests,
    requestLimit,
    totalCostUsd: Number(cost.toFixed(8)),
    approvedRunBudgetUsd: dollarCap,
    approvedPhaseBudgetUsd: PHASE_2_LIMITS.approvedPhaseBudgetUsd,
    providerSideHardLimitVerified: false,
    liveCallsDisabled: PHASE_2_LIVE_CALLS_DISABLED,
    probes,
    error,
  });

  await mkdir("reports", { recursive: true });
  try {
    if (!repairMode && !webOnlyMode) {
      const structured = await run("structured-output", buildStructuredRequest());
      validateStructuredProbe(structured.text);
    }

    if (!webOnlyMode) {
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
    }

    const webSearch = await run("web-search", buildWebSearchRequest());
    const webSearchEvidence = validateWebSearchProbe(webSearch);
    const webSearchRecord = probes.findLast((probe) => probe.name === "web-search");
    if (webSearchRecord) webSearchRecord.webSearchEvidence = webSearchEvidence;

    const report = makeReport("passed");
    const reportPath = webOnlyMode
      ? "reports/phase-2-web-repair.json"
      : repairMode
        ? "reports/phase-2-repair.json"
        : "reports/phase-2-live.json";
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown Phase 2 error";
    const report = makeReport("failed", message);
    const reportPath = webOnlyMode
      ? "reports/phase-2-web-repair.json"
      : repairMode
        ? "reports/phase-2-repair.json"
        : "reports/phase-2-live.json";
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  }
}
