import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { PHASE_5_MODELS } from "../phase5/contracts.ts";
import {
  answerSubmissionSchema,
  managerPlanSchema,
  managerReviewSchema,
  type AnswerSubmission,
  type ManagerPlan,
  type ManagerReview,
} from "./contracts.ts";
import { RESEARCH_FALLBACK_PROMPT, RESEARCH_SYSTEM_PROMPT } from "./prompts.ts";

export type ResearchModelReceipt = {
  model: string;
  provider?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost_usd?: number;
  requests: number;
  finish_reason?: string;
};

export type ResearchModelResult<T> = {
  value: T;
  receipt: ResearchModelReceipt;
};

export type ResearchManagerAdapter = {
  readonly modelId: string;
  readonly fallback: boolean;
  plan(prompt: string, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<ResearchModelResult<ManagerPlan>>;
  review(prompt: string, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<ResearchModelResult<ManagerReview>>;
  answer(prompt: string, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<ResearchModelResult<AnswerSubmission>>;
};

type ModelConfig = (typeof PHASE_5_MODELS)[keyof typeof PHASE_5_MODELS];

function openRouterMetadata(result: { steps: Array<{ providerMetadata?: unknown }> }) {
  let cost = 0;
  let sawCost = false;
  let provider: string | undefined;
  for (const step of result.steps) {
    const providerMetadata = step.providerMetadata as { openrouter?: unknown } | undefined;
    const metadata = providerMetadata?.openrouter as {
      provider?: string;
      usage?: { cost?: number };
    } | undefined;
    if (metadata?.provider) provider = metadata.provider;
    if (typeof metadata?.usage?.cost === "number") {
      cost += metadata.usage.cost;
      sawCost = true;
    }
  }
  return { provider, cost_usd: sawCost ? Number(cost.toFixed(8)) : undefined };
}

function receiptFromResult(result: {
  steps: Array<{ providerMetadata?: unknown }>;
  usage: { inputTokens?: number; outputTokens?: number };
  finishReason: string;
}, model: string): ResearchModelReceipt {
  const metadata = openRouterMetadata(result);
  const input = result.usage.inputTokens;
  const output = result.usage.outputTokens;
  return {
    model,
    provider: metadata.provider,
    prompt_tokens: input,
    completion_tokens: output,
    total_tokens: input !== undefined && output !== undefined ? input + output : undefined,
    cost_usd: metadata.cost_usd,
    requests: result.steps.length,
    finish_reason: result.finishReason,
  };
}

function combinedSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(Math.max(1, timeoutMs));
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export function createOpenRouterResearchModel(apiKey: string, model: ModelConfig) {
  return createOpenRouter({
    apiKey,
    compatibility: "strict",
    appName: "Nonsense Research Harness",
    extraBody: {
      provider: {
        allow_fallbacks: false,
        require_parameters: true,
        data_collection: "deny",
        zdr: model.zdr,
        max_price: model.maxPricePerMillion,
      },
      usage: { include: true },
    },
  });
}

async function structuredCall<T>(input: {
  apiKey: string;
  model: ModelConfig;
  fallback: boolean;
  prompt: string;
  schema: Parameters<typeof Output.object<T>>[0]["schema"];
  schemaName: string;
  maxOutputTokens: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<ResearchModelResult<T>> {
  const provider = createOpenRouterResearchModel(input.apiKey, input.model);
  const result = await generateText({
    model: provider.chat(input.model.id, {
      extraBody: { reasoning: { effort: input.model.reasoningEffort, exclude: true } },
      usage: { include: true },
    }),
    instructions: `${RESEARCH_SYSTEM_PROMPT}${input.fallback ? `\n\n${RESEARCH_FALLBACK_PROMPT}` : ""}`,
    prompt: input.prompt,
    output: Output.object({ schema: input.schema, name: input.schemaName }),
    maxRetries: 0,
    maxOutputTokens: input.maxOutputTokens,
    abortSignal: combinedSignal(input.signal, input.timeoutMs ?? 120_000),
  });
  return {
    value: result.output as T,
    receipt: receiptFromResult(result, input.model.id),
  };
}

export function createOpenRouterManager(options: {
  apiKey: string;
  fallback?: boolean;
}): ResearchManagerAdapter {
  const fallback = options.fallback === true;
  const model = fallback ? PHASE_5_MODELS.light : PHASE_5_MODELS.heavy;
  return {
    modelId: model.id,
    fallback,
    plan: (prompt, callOptions) => structuredCall({
      apiKey: options.apiKey,
      model,
      fallback,
      prompt,
      schema: managerPlanSchema,
      schemaName: "nonsense_research_plan",
      maxOutputTokens: fallback ? 5_000 : 8_000,
      ...callOptions,
    }),
    review: (prompt, callOptions) => structuredCall({
      apiKey: options.apiKey,
      model,
      fallback,
      prompt,
      schema: managerReviewSchema,
      schemaName: "nonsense_research_review",
      maxOutputTokens: fallback ? 4_000 : 6_000,
      ...callOptions,
    }),
    answer: (prompt, callOptions) => structuredCall({
      apiKey: options.apiKey,
      model,
      fallback,
      prompt,
      schema: answerSubmissionSchema,
      schemaName: "nonsense_research_answer",
      maxOutputTokens: fallback ? 5_000 : 8_000,
      ...callOptions,
    }),
  };
}

export function isTransientResearchError(error: unknown): boolean {
  if (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name)) return error.name === "TimeoutError";
  if (!error || typeof error !== "object") return false;
  const value = error as { statusCode?: unknown; status?: unknown; isRetryable?: unknown; message?: unknown; name?: unknown };
  if (value.isRetryable === true) return true;
  const status = typeof value.statusCode === "number" ? value.statusCode : typeof value.status === "number" ? value.status : undefined;
  if (status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500)) return true;
  const text = `${String(value.name ?? "")} ${String(value.message ?? "")}`.toLowerCase();
  return /timeout|timed out|econnreset|fetch failed|network|temporar|rate limit|overloaded|unavailable/.test(text);
}
