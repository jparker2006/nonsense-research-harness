export const PHASE_2_LIMITS = Object.freeze({
  model: "x-ai/grok-4.3",
  endpoint: "https://openrouter.ai/api/v1/chat/completions",
  maxProviderRequests: 4,
  maxOutputTokens: Object.freeze({
    structured: 256,
    toolCall: 128,
    toolResult: 256,
    webSearch: 384,
  }),
  maxWebSearches: 1,
  maxWebResults: 3,
  maxWebCharactersPerResult: 1_200,
  requestTimeoutMs: 45_000,
  hardDollarCap: 0.03,
  maxPricePerMillion: Object.freeze({
    prompt: 1.25,
    completion: 2.5,
  }),
});

export const PHASE_2_PROVIDER_POLICY = Object.freeze({
  allow_fallbacks: false,
  require_parameters: true,
  data_collection: "deny" as const,
  zdr: true,
  max_price: PHASE_2_LIMITS.maxPricePerMillion,
});

export type Phase2Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Phase2ToolCall[];
};

export type Phase2ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type Phase2Request = {
  model: string;
  messages: Phase2Message[];
  stream: true;
  max_tokens: number;
  provider: typeof PHASE_2_PROVIDER_POLICY;
  [key: string]: unknown;
};

export type Phase2Citation = {
  url: string;
  title?: string;
};

export type Phase2Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  server_tool_use?: {
    web_search_requests?: number;
  };
};

export type Phase2StreamResult = {
  id?: string;
  model?: string;
  provider?: string;
  text: string;
  toolCalls: Phase2ToolCall[];
  citations: Phase2Citation[];
  usage?: Phase2Usage;
  finishReason?: string;
  firstEventMs: number;
  elapsedMs: number;
  done: boolean;
};

type ToolCallAccumulator = {
  id: string;
  name: string;
  arguments: string;
};

function baseRequest(messages: Phase2Message[], maxTokens: number): Phase2Request {
  return {
    model: PHASE_2_LIMITS.model,
    messages,
    stream: true,
    max_tokens: maxTokens,
    provider: PHASE_2_PROVIDER_POLICY,
  };
}

export function buildStructuredRequest(): Phase2Request {
  return {
    ...baseRequest(
      [
        {
          role: "user",
          content:
            "Create a tiny preparation card for the fictional topic 'municipal hoverboard lanes'. Return only the required structured object.",
        },
      ],
      PHASE_2_LIMITS.maxOutputTokens.structured,
    ),
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "phase_2_preparation_card",
        strict: true,
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            angle: { type: "string" },
            questions: {
              type: "array",
              items: { type: "string" },
              minItems: 2,
              maxItems: 2,
            },
          },
          required: ["title", "angle", "questions"],
          additionalProperties: false,
        },
      },
    },
  };
}

export function buildToolCallRequest(): Phase2Request {
  return {
    ...baseRequest(
      [
        {
          role: "user",
          content:
            "Use the double_number tool exactly once with the integer 21. Do not calculate or answer directly.",
        },
      ],
      PHASE_2_LIMITS.maxOutputTokens.toolCall,
    ),
    tools: [
      {
        type: "function",
        function: {
          name: "double_number",
          description: "Doubles one integer for the Phase 2 compatibility probe.",
          parameters: {
            type: "object",
            properties: {
              value: { type: "integer" },
            },
            required: ["value"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: {
      type: "function",
      function: { name: "double_number" },
    },
  };
}

export function buildToolResultRequest(toolCall: Phase2ToolCall, doubled: number): Phase2Request {
  return {
    ...baseRequest(
      [
        {
          role: "user",
          content:
            "Use the double_number tool exactly once with the integer 21. Do not calculate or answer directly.",
        },
        {
          role: "assistant",
          content: null,
          tool_calls: [toolCall],
        },
        {
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ value: doubled }),
        },
      ],
      PHASE_2_LIMITS.maxOutputTokens.toolResult,
    ),
    tool_choice: "none",
  };
}

export function buildWebSearchRequest(): Phase2Request {
  return {
    ...baseRequest(
      [
        {
          role: "user",
          content:
            "Search the official OpenRouter documentation for its web-search server tool. State one documented configuration limit and cite the official page.",
        },
      ],
      PHASE_2_LIMITS.maxOutputTokens.webSearch,
    ),
    tools: [
      {
        type: "openrouter:web_search",
        parameters: {
          engine: "exa",
          mode: "instant",
          max_results: PHASE_2_LIMITS.maxWebResults,
          max_uses: PHASE_2_LIMITS.maxWebSearches,
          max_total_results: PHASE_2_LIMITS.maxWebResults,
          max_characters: PHASE_2_LIMITS.maxWebCharactersPerResult,
          allowed_domains: ["openrouter.ai"],
        },
      },
    ],
    max_tool_calls: PHASE_2_LIMITS.maxWebSearches,
  };
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseUsage(value: unknown): Phase2Usage | undefined {
  const usage = objectValue(value);
  if (!usage) return undefined;

  const serverToolUse = objectValue(usage.server_tool_use);
  return {
    prompt_tokens: numberValue(usage.prompt_tokens),
    completion_tokens: numberValue(usage.completion_tokens),
    total_tokens: numberValue(usage.total_tokens),
    cost: numberValue(usage.cost),
    server_tool_use: serverToolUse
      ? { web_search_requests: numberValue(serverToolUse.web_search_requests) }
      : undefined,
  };
}

export async function readOpenRouterStream(
  response: Response,
  startedAt = performance.now(),
): Promise<Phase2StreamResult> {
  if (!response.ok) {
    const errorBody = (await response.text()).slice(0, 500);
    throw new Error(`OpenRouter request failed (${response.status}): ${errorBody}`);
  }
  if (!response.body) throw new Error("OpenRouter returned no response stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventData: string[] = [];
  let firstEventMs = 0;
  let done = false;
  let text = "";
  let id: string | undefined;
  let model: string | undefined;
  let provider: string | undefined;
  let usage: Phase2Usage | undefined;
  let finishReason: string | undefined;
  const citations: Phase2Citation[] = [];
  const toolCallParts = new Map<number, ToolCallAccumulator>();

  const consumeEvent = () => {
    if (eventData.length === 0) return;
    const payload = eventData.join("\n");
    eventData = [];
    if (payload === "[DONE]") {
      done = true;
      return;
    }

    const chunk = objectValue(JSON.parse(payload));
    if (!chunk) return;
    id = stringValue(chunk.id) ?? id;
    model = stringValue(chunk.model) ?? model;
    provider = stringValue(chunk.provider) ?? provider;
    usage = parseUsage(chunk.usage) ?? usage;

    const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
    for (const rawChoice of choices) {
      const choice = objectValue(rawChoice);
      if (!choice) continue;
      finishReason = stringValue(choice.finish_reason) ?? finishReason;
      const delta = objectValue(choice.delta);
      if (!delta) continue;
      text += stringValue(delta.content) ?? "";

      const rawAnnotations = Array.isArray(delta.annotations) ? delta.annotations : [];
      for (const rawAnnotation of rawAnnotations) {
        const annotation = objectValue(rawAnnotation);
        const urlCitation = objectValue(annotation?.url_citation);
        const url = stringValue(urlCitation?.url);
        if (url) citations.push({ url, title: stringValue(urlCitation?.title) });
      }

      const rawToolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
      for (const rawToolCall of rawToolCalls) {
        const toolCall = objectValue(rawToolCall);
        const index = numberValue(toolCall?.index);
        if (index === undefined) continue;
        const existing = toolCallParts.get(index) ?? { id: "", name: "", arguments: "" };
        const functionPart = objectValue(toolCall?.function);
        existing.id += stringValue(toolCall?.id) ?? "";
        existing.name += stringValue(functionPart?.name) ?? "";
        existing.arguments += stringValue(functionPart?.arguments) ?? "";
        toolCallParts.set(index, existing);
      }
    }
  };

  const consumeLine = (rawLine: string) => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line === "") {
      consumeEvent();
    } else if (line.startsWith("data:")) {
      eventData.push(line.slice(5).trimStart());
    }
  };

  while (true) {
    const { value, done: readerDone } = await reader.read();
    if (readerDone) break;
    if (firstEventMs === 0) firstEventMs = performance.now() - startedAt;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      consumeLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }

  buffer += decoder.decode();
  if (buffer) consumeLine(buffer);
  consumeEvent();

  const toolCalls = [...toolCallParts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, part]) => ({
      id: part.id,
      type: "function" as const,
      function: { name: part.name, arguments: part.arguments },
    }));

  return {
    id,
    model,
    provider,
    text,
    toolCalls,
    citations: citations.filter(
      (citation, index, all) => all.findIndex((other) => other.url === citation.url) === index,
    ),
    usage,
    finishReason,
    firstEventMs,
    elapsedMs: performance.now() - startedAt,
    done,
  };
}

export async function runOpenRouterRequest(
  apiKey: string,
  request: Phase2Request,
  fetchImplementation: typeof fetch = fetch,
): Promise<Phase2StreamResult> {
  if (!apiKey.trim()) throw new Error("OPENROUTER_API_KEY is missing. No request was sent.");
  const startedAt = performance.now();
  const response = await fetchImplementation(PHASE_2_LIMITS.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Nonsense Research Harness Phase 2",
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(PHASE_2_LIMITS.requestTimeoutMs),
  });
  return readOpenRouterStream(response, startedAt);
}

export function validateStructuredProbe(text: string): {
  title: string;
  angle: string;
  questions: [string, string];
} {
  const parsed = objectValue(JSON.parse(text));
  if (!parsed) throw new Error("Structured probe did not return an object.");
  const title = stringValue(parsed.title);
  const angle = stringValue(parsed.angle);
  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
  if (!title || !angle || questions.length !== 2 || !questions.every((item) => typeof item === "string")) {
    throw new Error("Structured probe failed the frozen schema.");
  }
  return { title, angle, questions: [questions[0] as string, questions[1] as string] };
}

export function executeDoubleNumberProbe(toolCall: Phase2ToolCall): number {
  if (toolCall.function.name !== "double_number") {
    throw new Error(`Unexpected tool: ${toolCall.function.name || "unnamed"}`);
  }
  const argumentsValue = objectValue(JSON.parse(toolCall.function.arguments));
  const value = numberValue(argumentsValue?.value);
  if (!Number.isInteger(value) || value !== 21) {
    throw new Error("Tool probe did not request the frozen integer 21.");
  }
  return value * 2;
}
