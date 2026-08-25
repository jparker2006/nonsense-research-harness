import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PHASE_7A_LIMITS } from "../src/lib/phase7a/contracts.ts";

const endpoint = process.env.PHASE7A_LOCAL_URL?.trim() || "http://127.0.0.1:3210/api/chat";
const reportPath = resolve("reports/phase-7a-live.json");

const cases = [
  {
    id: "headlines_sprout_outbreak",
    session_id: "session_phase7a_local",
    expected_mode: "headlines",
    message: `Create an 8-minute Headlines preparation packet about the August 2026 multistate sprout foodborne-illness outbreak. Read both supplied links. Do at most one additional current-web search and read at most one especially useful additional source. Search the Nonsense transcript archive once and open at most one relevant chunk. Then create the validated packet and briefly tell me it is ready. Keep evidence, inference, and open uncertainty separate.

FDA: https://www.fda.gov/food/outbreaks-foodborne-illness/outbreak-investigation-shiga-toxin-producing-e-coli-salmonella-sprouts-august-2026
AP: https://apnews.com/article/alfalfa-sprouts-food-poisoning-ac7701ed353e1e8c0aea8fec04982a26`,
  },
  {
    id: "big_story_bonneville",
    session_id: "session_phase7a_big_story",
    expected_mode: "big_story",
    message: `Create a 24-minute Big Story preparation packet about how vanished Lake Bonneville still organizes the modern Great Basin landscape and how visible evidence changes the way people understand deep time. Read the supplied NASA source. Do at most one additional current-web search and read at most one especially useful additional source. Search the Nonsense transcript archive once and open at most one relevant chunk. Then create the validated packet and briefly tell me it is ready. Keep the outline modular against the clock.

NASA: https://science.nasa.gov/earth/earth-observatory/what-lake-bonneville-left-behind/`,
  },
] as const;

type StreamPart = { type?: string; data?: unknown; [key: string]: unknown };

function parseStream(text: string): StreamPart[] {
  const parts: StreamPart[] = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6);
    if (!payload || payload === "[DONE]") continue;
    try {
      const parsed = JSON.parse(payload);
      if (parsed && typeof parsed === "object") parts.push(parsed as StreamPart);
    } catch {
      // The raw response is preserved in the case failure below.
    }
  }
  return parts;
}

async function runCase(testCase: typeof cases[number]) {
  const startedAt = new Date().toISOString();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phase7a: { action: "message", session_id: testCase.session_id, message: testCase.message } }),
    signal: AbortSignal.timeout(PHASE_7A_LIMITS.wholeTurnTimeoutMs + 15_000),
  });
  const raw = await response.text();
  const parts = parseStream(raw);
  const receipt = [...parts].reverse().find((part) => part.type === "data-receipt")?.data as {
    accounted_cost_usd?: number;
    counts?: { provider_requests?: number; repairs?: number };
    status?: string;
  } | undefined;
  const artifact = [...parts].reverse().find((part) => part.type === "data-artifact")?.data as {
    artifact?: { mode?: string; working_title?: string; source_ledger?: unknown[] };
    revision?: number;
  } | undefined;
  const error = [...parts].reverse().find((part) => part.type === "data-error")?.data;
  const assistant = [...parts].reverse().find((part) => part.type === "data-message")?.data as { text?: string; source_ids?: string[] } | undefined;
  const failures: string[] = [];
  if (!response.ok) failures.push(`http_${response.status}`);
  if (error) failures.push("stream_error");
  if (!receipt) failures.push("missing_receipt");
  if (!artifact) failures.push("missing_artifact");
  if (!assistant) failures.push("missing_assistant_message");
  if (artifact?.artifact?.mode !== testCase.expected_mode) failures.push("artifact_mode_mismatch");
  if ((receipt?.accounted_cost_usd ?? Infinity) > PHASE_7A_LIMITS.costCapUsd) failures.push("cost_cap_exceeded");
  if ((receipt?.counts?.provider_requests ?? Infinity) > PHASE_7A_LIMITS.maxProviderRequests) failures.push("provider_request_cap_exceeded");
  return {
    id: testCase.id,
    session_id: testCase.session_id,
    expected_mode: testCase.expected_mode,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    request_message: testCase.message,
    http_status: response.status,
    cache_control: response.headers.get("cache-control"),
    receipt: receipt ?? null,
    artifact: artifact ?? null,
    assistant_message: assistant ?? null,
    safe_activity: parts.filter((part) => part.type === "data-activity").map((part) => part.data),
    terminal_run: [...parts].reverse().find((part) => part.type === "data-run")?.data ?? null,
    error: error ?? null,
    failures,
  };
}

const report: {
  phase: "7A";
  gate: Record<string, number>;
  endpoint: string;
  automatic_retries: 0;
  started_at: string;
  completed_at?: string;
  cases: Awaited<ReturnType<typeof runCase>>[];
  aggregate_cost_usd?: number;
  aggregate_provider_requests?: number;
  failures: string[];
} = {
  phase: "7A",
  gate: {
    per_turn_cost_cap_usd: PHASE_7A_LIMITS.costCapUsd,
    aggregate_cost_cap_usd: PHASE_7A_LIMITS.liveProofTotalCostCapUsd,
    per_turn_provider_request_cap: PHASE_7A_LIMITS.maxProviderRequests,
    controller_turn_cap: PHASE_7A_LIMITS.maxControllerTurns,
  },
  endpoint,
  automatic_retries: 0,
  started_at: new Date().toISOString(),
  cases: [],
  failures: [],
};

try {
  for (const testCase of cases) {
    const result = await runCase(testCase);
    report.cases.push(result);
    report.failures.push(...result.failures.map((failure) => `${testCase.id}:${failure}`));
  }
} catch (error) {
  report.failures.push(error instanceof Error ? error.message : "phase7a_live_script_failed");
} finally {
  report.aggregate_cost_usd = Number(report.cases.reduce((sum, item) => sum + (item.receipt?.accounted_cost_usd ?? 0), 0).toFixed(8));
  report.aggregate_provider_requests = report.cases.reduce((sum, item) => sum + (item.receipt?.counts?.provider_requests ?? 0), 0);
  if (report.aggregate_cost_usd > PHASE_7A_LIMITS.liveProofTotalCostCapUsd) report.failures.push("aggregate_cost_cap_exceeded");
  report.completed_at = new Date().toISOString();
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

if (report.failures.length) {
  console.error(JSON.stringify({ report: reportPath, failures: report.failures, aggregate_cost_usd: report.aggregate_cost_usd }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ report: reportPath, cases: report.cases.map((item) => ({ id: item.id, status: item.receipt?.status, cost_usd: item.receipt?.accounted_cost_usd, provider_requests: item.receipt?.counts?.provider_requests, artifact: item.artifact?.artifact?.working_title })), aggregate_cost_usd: report.aggregate_cost_usd, aggregate_provider_requests: report.aggregate_provider_requests }, null, 2));
}
