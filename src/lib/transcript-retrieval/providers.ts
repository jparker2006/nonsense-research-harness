export const PHASE_3_PROVIDER_LIMITS = Object.freeze({
  embedding: Object.freeze({
    endpoint: "https://openrouter.ai/api/v1/embeddings",
    model: "openai/text-embedding-3-small",
    provider: "azure",
    maxInputs: 64,
    pricePerMillionTokens: 0.02,
  }),
  rerank: Object.freeze({
    endpoint: "https://openrouter.ai/api/v1/rerank",
    model: "qwen/qwen3-reranker-8b",
    provider: "fireworks",
    maxDocuments: 20,
    pricePerMillionTokens: 0.2,
  }),
  requestTimeoutMs: 45_000,
  approvedBudgetUsd: 0.5,
  maxProviderRequests: 40,
});

type ProviderPolicy = {
  order: string[];
  allow_fallbacks: false;
  require_parameters: true;
  data_collection: "deny";
  zdr: true;
  max_price: { prompt: number; completion: number };
};

export type ProviderUsage = {
  prompt_tokens?: number;
  total_tokens?: number;
  search_units?: number;
  cost?: number;
};

export type ProviderReceipt = {
  requestId?: string;
  model: string;
  provider?: string;
  latencyMs: number;
  usage: ProviderUsage;
  reportedCostUsd?: number;
  calculatedCostUsd: number;
};

export type EmbeddingBatchResult = {
  vectors: number[][];
  receipt: ProviderReceipt;
};

export type RerankItem = {
  index: number;
  relevanceScore: number;
};

export type RerankBatchResult = {
  results: RerankItem[];
  receipt: ProviderReceipt;
};

export class Phase3ProviderError extends Error {
  readonly kind: "configuration" | "policy" | "http" | "response" | "timeout";
  readonly status?: number;

  constructor(
    kind: Phase3ProviderError["kind"],
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = "Phase3ProviderError";
    this.kind = kind;
    this.status = status;
  }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseUsage(value: unknown): ProviderUsage {
  const usage = objectValue(value);
  return {
    prompt_tokens: numberValue(usage?.prompt_tokens),
    total_tokens: numberValue(usage?.total_tokens),
    search_units: numberValue(usage?.search_units),
    cost: numberValue(usage?.cost),
  };
}

function providerPolicy(provider: string, promptPrice: number): ProviderPolicy {
  return {
    order: [provider],
    allow_fallbacks: false,
    require_parameters: true,
    data_collection: "deny",
    zdr: true,
    max_price: { prompt: promptPrice, completion: 0 },
  };
}

function assertLiveAuthority(apiKey: string) {
  if (!apiKey.trim()) {
    throw new Phase3ProviderError("configuration", "OPENROUTER_API_KEY is missing. No request was sent.");
  }
  if (
    process.env.PHASE3_EXECUTE_LIVE !== "approved" &&
    process.env.PHASE5_EXECUTE_LIVE !== "approved"
  ) {
    throw new Phase3ProviderError(
      "policy",
      "Explicit live authority is required: PHASE3_EXECUTE_LIVE=approved or PHASE5_EXECUTE_LIVE=approved. No request was sent.",
    );
  }
}

async function requestJson(
  endpoint: string,
  apiKey: string,
  body: Record<string, unknown>,
  fetchImplementation: typeof fetch,
): Promise<{ payload: Record<string, unknown>; latencyMs: number }> {
  assertLiveAuthority(apiKey);
  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetchImplementation(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Nonsense Research Harness Phase 3",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PHASE_3_PROVIDER_LIMITS.requestTimeoutMs),
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    throw new Phase3ProviderError(
      timeout ? "timeout" : "http",
      timeout ? "OpenRouter request timed out." : "OpenRouter request could not be completed.",
    );
  }
  const latencyMs = performance.now() - startedAt;
  if (!response.ok) {
    await response.text();
    throw new Phase3ProviderError(
      "http",
      `OpenRouter request failed with HTTP ${response.status}.`,
      response.status,
    );
  }
  const payload = objectValue(await response.json());
  if (!payload) throw new Phase3ProviderError("response", "OpenRouter returned an invalid JSON object.");
  return { payload, latencyMs };
}

function makeReceipt(
  payload: Record<string, unknown>,
  latencyMs: number,
  expectedModel: string,
  pricePerMillion: number,
): ProviderReceipt {
  const model = stringValue(payload.model);
  const providerNativeModel = expectedModel.split("/").at(-1);
  const acceptedModel = model !== undefined && (
    model === expectedModel ||
    model.startsWith(`${expectedModel}-`) ||
    model === providerNativeModel ||
    (providerNativeModel !== undefined && model.endsWith(`/${providerNativeModel}`))
  );
  if (!model || !acceptedModel) {
    throw new Phase3ProviderError("response", "OpenRouter returned an unexpected model identifier.");
  }
  const usage = parseUsage(payload.usage);
  const billableTokens = usage.total_tokens ?? usage.prompt_tokens ?? 0;
  return {
    requestId: stringValue(payload.id),
    model,
    provider: stringValue(payload.provider),
    latencyMs,
    usage,
    reportedCostUsd: usage.cost,
    calculatedCostUsd: usage.cost ?? (billableTokens * pricePerMillion) / 1_000_000,
  };
}

export async function embedTexts(
  apiKey: string,
  inputs: string[],
  fetchImplementation: typeof fetch = fetch,
): Promise<EmbeddingBatchResult> {
  if (inputs.length < 1 || inputs.length > PHASE_3_PROVIDER_LIMITS.embedding.maxInputs) {
    throw new Phase3ProviderError(
      "configuration",
      `Embedding input count must be between 1 and ${PHASE_3_PROVIDER_LIMITS.embedding.maxInputs}.`,
    );
  }
  if (inputs.some((input) => !input.trim())) {
    throw new Phase3ProviderError("configuration", "Embedding inputs must be non-empty.");
  }
  const config = PHASE_3_PROVIDER_LIMITS.embedding;
  const { payload, latencyMs } = await requestJson(
    config.endpoint,
    apiKey,
    {
      model: config.model,
      input: inputs,
      encoding_format: "float",
      provider: providerPolicy(config.provider, config.pricePerMillionTokens),
    },
    fetchImplementation,
  );
  const data = Array.isArray(payload.data) ? payload.data : [];
  if (data.length !== inputs.length) {
    throw new Phase3ProviderError("response", "Embedding response count did not match the request.");
  }
  const vectors = data
    .map((raw) => objectValue(raw))
    .sort((left, right) => (numberValue(left?.index) ?? -1) - (numberValue(right?.index) ?? -1))
    .map((item) => {
      const embedding = Array.isArray(item?.embedding) ? item.embedding : [];
      if (embedding.length === 0 || !embedding.every((value) => numberValue(value) !== undefined)) {
        throw new Phase3ProviderError("response", "Embedding response contained an invalid vector.");
      }
      return embedding as number[];
    });
  const dimensions = vectors[0]?.length ?? 0;
  if (vectors.some((vector) => vector.length !== dimensions)) {
    throw new Phase3ProviderError("response", "Embedding vector dimensions were inconsistent.");
  }
  return {
    vectors,
    receipt: makeReceipt(payload, latencyMs, config.model, config.pricePerMillionTokens),
  };
}

export async function rerankDocuments(
  apiKey: string,
  query: string,
  documents: string[],
  topN = documents.length,
  fetchImplementation: typeof fetch = fetch,
): Promise<RerankBatchResult> {
  const config = PHASE_3_PROVIDER_LIMITS.rerank;
  if (!query.trim()) throw new Phase3ProviderError("configuration", "Rerank query must be non-empty.");
  if (documents.length < 1 || documents.length > config.maxDocuments) {
    throw new Phase3ProviderError(
      "configuration",
      `Rerank document count must be between 1 and ${config.maxDocuments}.`,
    );
  }
  if (!Number.isInteger(topN) || topN < 1 || topN > documents.length) {
    throw new Phase3ProviderError("configuration", "Rerank topN is invalid.");
  }
  const { payload, latencyMs } = await requestJson(
    config.endpoint,
    apiKey,
    {
      model: config.model,
      query,
      documents,
      top_n: topN,
      provider: providerPolicy(config.provider, config.pricePerMillionTokens),
    },
    fetchImplementation,
  );
  const rawResults = Array.isArray(payload.results) ? payload.results : [];
  const results = rawResults.map((raw) => {
    const item = objectValue(raw);
    const index = numberValue(item?.index);
    const relevanceScore = numberValue(item?.relevance_score);
    if (!Number.isInteger(index) || index === undefined || index < 0 || index >= documents.length) {
      throw new Phase3ProviderError("response", "Rerank response contained an invalid document index.");
    }
    if (relevanceScore === undefined) {
      throw new Phase3ProviderError("response", "Rerank response contained an invalid relevance score.");
    }
    return { index, relevanceScore };
  });
  if (results.length === 0) throw new Phase3ProviderError("response", "Rerank response was empty.");
  return {
    results,
    receipt: makeReceipt(payload, latencyMs, config.model, config.pricePerMillionTokens),
  };
}
