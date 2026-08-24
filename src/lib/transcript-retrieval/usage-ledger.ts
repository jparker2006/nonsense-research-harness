import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PHASE_3_PROVIDER_LIMITS, type ProviderReceipt } from "./providers.ts";

export type Phase3RequestKind = "embedding" | "rerank";

export type Phase3UsageEvent = {
  request_number: number;
  purpose: string;
  kind: Phase3RequestKind;
  model: string;
  provider: string;
  status: "started" | "succeeded" | "failed";
  latency_ms: number | null;
  prompt_tokens: number | null;
  total_tokens: number | null;
  cost_usd: number;
  provider_request_id: string | null;
  failure_kind: string | null;
};

export type Phase3UsageLedgerData = {
  schema_version: "1.0";
  approved_budget_usd: number;
  maximum_provider_requests: number;
  provider_requests: number;
  cumulative_cost_usd: number;
  events: Phase3UsageEvent[];
};

function emptyLedger(): Phase3UsageLedgerData {
  return {
    schema_version: "1.0",
    approved_budget_usd: PHASE_3_PROVIDER_LIMITS.approvedBudgetUsd,
    maximum_provider_requests: PHASE_3_PROVIDER_LIMITS.maxProviderRequests,
    provider_requests: 0,
    cumulative_cost_usd: 0,
    events: [],
  };
}

export class Phase3UsageLedger {
  readonly path: string;
  private data: Phase3UsageLedgerData;

  constructor(root = process.cwd()) {
    this.path = resolve(root, "reports/phase-3-usage.json");
    try {
      this.data = JSON.parse(readFileSync(this.path, "utf8")) as Phase3UsageLedgerData;
    } catch (error) {
      const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
      if (!missing) throw error;
      this.data = emptyLedger();
    }
    this.assertValid();
  }

  private assertValid() {
    if (
      this.data.approved_budget_usd !== PHASE_3_PROVIDER_LIMITS.approvedBudgetUsd ||
      this.data.maximum_provider_requests !== PHASE_3_PROVIDER_LIMITS.maxProviderRequests ||
      this.data.provider_requests !== this.data.events.length ||
      !Number.isFinite(this.data.cumulative_cost_usd) ||
      this.data.cumulative_cost_usd < 0
    ) {
      throw new Error("Phase 3 usage ledger is malformed or its approved limits drifted.");
    }
  }

  private save() {
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(this.data, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, this.path);
  }

  snapshot(): Phase3UsageLedgerData {
    return structuredClone(this.data);
  }

  reserve(input: {
    purpose: string;
    kind: Phase3RequestKind;
    model: string;
    provider: string;
  }): number {
    if (this.data.cumulative_cost_usd > this.data.approved_budget_usd) {
      throw new Error("Phase 3 budget was crossed; no further provider request is permitted.");
    }
    if (this.data.provider_requests >= this.data.maximum_provider_requests) {
      throw new Error("Phase 3 provider request limit reached; no request was sent.");
    }
    const requestNumber = this.data.provider_requests + 1;
    this.data.events.push({
      request_number: requestNumber,
      purpose: input.purpose,
      kind: input.kind,
      model: input.model,
      provider: input.provider,
      status: "started",
      latency_ms: null,
      prompt_tokens: null,
      total_tokens: null,
      cost_usd: 0,
      provider_request_id: null,
      failure_kind: null,
    });
    this.data.provider_requests = this.data.events.length;
    this.save();
    return requestNumber;
  }

  succeed(requestNumber: number, receipt: ProviderReceipt) {
    const event = this.data.events[requestNumber - 1];
    if (!event || event.status !== "started") throw new Error("Usage event cannot be completed twice.");
    const cost = receipt.reportedCostUsd ?? receipt.calculatedCostUsd;
    event.status = "succeeded";
    event.latency_ms = Math.round(receipt.latencyMs * 100) / 100;
    event.prompt_tokens = receipt.usage.prompt_tokens ?? null;
    event.total_tokens = receipt.usage.total_tokens ?? null;
    event.cost_usd = cost;
    event.provider_request_id = receipt.requestId ?? null;
    this.data.cumulative_cost_usd += cost;
    this.save();
    if (this.data.cumulative_cost_usd > this.data.approved_budget_usd) {
      throw new Error("Phase 3 budget crossed on the last response; execution is stopped.");
    }
  }

  fail(requestNumber: number, failureKind: string, latencyMs: number) {
    const event = this.data.events[requestNumber - 1];
    if (!event || event.status !== "started") throw new Error("Usage event cannot be completed twice.");
    event.status = "failed";
    event.failure_kind = failureKind.slice(0, 80);
    event.latency_ms = Math.round(latencyMs * 100) / 100;
    this.save();
  }
}
