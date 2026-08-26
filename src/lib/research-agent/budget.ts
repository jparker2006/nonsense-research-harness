import { randomUUID } from "node:crypto";
import {
  RESEARCH_AGENT_LIMITS,
  researchUsageReceiptSchema,
  type ResearchDepth,
  type ResearchUsageReceipt,
} from "./contracts.ts";

export type BudgetRole = ResearchUsageReceipt["role"];

type Reservation = {
  id: string;
  role: BudgetRole;
  action: string;
  model?: string;
  amount: number;
  requests: number;
  fallback: boolean;
};

export class ResearchBudget {
  readonly depth: ResearchDepth;
  readonly targetUsd: number;
  readonly ceilingUsd: number;
  readonly answerReserveUsd: number;
  readonly maxProviderRequests: number;
  private accounted = 0;
  private requestCount = 0;
  private active = new Map<string, Reservation>();
  private receipts: ResearchUsageReceipt[] = [];

  constructor(depth: ResearchDepth, overrides: { ceilingUsd?: number; maxProviderRequests?: number } = {}) {
    const policy = RESEARCH_AGENT_LIMITS.budgets[depth];
    this.depth = depth;
    this.targetUsd = policy.targetUsd;
    this.ceilingUsd = Math.min(policy.ceilingUsd, Math.max(0.01, overrides.ceilingUsd ?? policy.ceilingUsd));
    this.answerReserveUsd = Math.min(policy.answerReserveUsd, this.ceilingUsd);
    this.maxProviderRequests = Math.min(
      RESEARCH_AGENT_LIMITS.maxProviderRequests,
      Math.max(1, Math.floor(overrides.maxProviderRequests ?? RESEARCH_AGENT_LIMITS.maxProviderRequests)),
    );
  }

  get accountedCostUsd(): number {
    return Number(this.accounted.toFixed(8));
  }

  get providerRequests(): number {
    return this.requestCount;
  }

  get targetReached(): boolean {
    return this.accounted + this.activeReserved >= this.targetUsd;
  }

  get activeReserved(): number {
    return [...this.active.values()].reduce((sum, reservation) => sum + reservation.amount, 0);
  }

  get availableForResearchUsd(): number {
    return Math.max(0, this.ceilingUsd - this.answerReserveUsd - this.accounted - this.activeReserved);
  }

  reserve(input: {
    role: BudgetRole;
    action: string;
    amount: number;
    requests?: number;
    model?: string;
    allowAnswerReserve?: boolean;
    fallback?: boolean;
  }): string {
    const requests = input.requests ?? 1;
    if (this.requestCount + requests > this.maxProviderRequests) throw new Error("research_provider_request_limit");
    const boundary = input.allowAnswerReserve ? this.ceilingUsd : this.ceilingUsd - this.answerReserveUsd;
    if (this.accounted + this.activeReserved + input.amount > boundary + 1e-9) {
      throw new Error(input.allowAnswerReserve ? "research_budget_exhausted" : "research_answer_reserve_protected");
    }
    const id = `reservation_${randomUUID()}`;
    this.active.set(id, {
      id,
      role: input.role,
      action: input.action,
      model: input.model,
      amount: input.amount,
      requests,
      fallback: input.fallback === true,
    });
    this.requestCount += requests;
    return id;
  }

  settle(id: string, receipt: {
    provider?: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost_usd?: number;
  } = {}): ResearchUsageReceipt {
    const reservation = this.active.get(id);
    if (!reservation) throw new Error("research_budget_reservation_not_found");
    const finiteNonnegative = (value: number | undefined) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
    const tokenCount = (value: number | undefined) => {
      const normalized = finiteNonnegative(value);
      return normalized === undefined ? undefined : Math.floor(normalized);
    };
    const reportedCost = finiteNonnegative(receipt.cost_usd);
    const cost = reportedCost ?? reservation.amount;
    const parsed = researchUsageReceiptSchema.parse({
      usage_id: `usage_${randomUUID()}`,
      role: reservation.role,
      action: reservation.action,
      model: reservation.model,
      provider: typeof receipt.provider === "string" && receipt.provider.length <= 160
        ? receipt.provider
        : undefined,
      prompt_tokens: tokenCount(receipt.prompt_tokens),
      completion_tokens: tokenCount(receipt.completion_tokens),
      total_tokens: tokenCount(receipt.total_tokens),
      reported_cost_usd: reportedCost,
      accounted_cost_usd: Number(cost.toFixed(8)),
      receipt_missing: reportedCost === undefined,
      fallback: reservation.fallback,
    });
    // Commit only after validation. A malformed provider receipt can never
    // strand a reservation or poison total accounting with NaN.
    this.active.delete(id);
    this.accounted += cost;
    this.receipts.push(parsed);
    return parsed;
  }

  fail(id: string): ResearchUsageReceipt {
    return this.settle(id);
  }

  cancel(id: string): void {
    const reservation = this.active.get(id);
    if (!reservation) throw new Error("research_budget_reservation_not_found");
    this.active.delete(id);
    this.requestCount = Math.max(0, this.requestCount - reservation.requests);
  }

  allReceipts(): ResearchUsageReceipt[] {
    return structuredClone(this.receipts);
  }

  snapshot() {
    return {
      depth: this.depth,
      target_usd: this.targetUsd,
      ceiling_usd: this.ceilingUsd,
      answer_reserve_usd: this.answerReserveUsd,
      accounted_cost_usd: this.accountedCostUsd,
      active_reserved_usd: Number(this.activeReserved.toFixed(8)),
      available_for_research_usd: Number(this.availableForResearchUsd.toFixed(8)),
      provider_requests: this.providerRequests,
      max_provider_requests: this.maxProviderRequests,
      target_reached: this.targetReached,
    };
  }
}
