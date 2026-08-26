import type {
  BrowserArtifact,
  BrowserSource,
  Phase7AActivity,
  Phase7AAssistantMessage,
  Phase7AError,
  Phase7AResearchDepth,
  Phase7AReceipt,
  Phase7ARun,
} from "./client.ts";

export type BrowserArtifactPayload = {
  run_id: string;
  revision: number;
  artifact: BrowserArtifact;
};

export type ResearchExchange = {
  local_id: string;
  run_id: string | null;
  user: { id: string; text: string; research_depth: Phase7AResearchDepth; created_at: string };
  run: Phase7ARun | null;
  activities: Phase7AActivity[];
  assistant: Phase7AAssistantMessage | null;
  artifact: BrowserArtifactPayload | null;
  receipt: Phase7AReceipt | null;
  error: Phase7AError | null;
};

export type ResearchConversationState = {
  exchanges: ResearchExchange[];
  sources: Record<string, BrowserSource>;
  active_exchange_id: string | null;
};

export type ResearchConversationAction =
  | { type: "start"; local_id: string; text: string; research_depth: Phase7AResearchDepth; created_at: string }
  | { type: "run"; run: Phase7ARun }
  | { type: "activity"; activity: Phase7AActivity }
  | { type: "assistant"; message: Phase7AAssistantMessage }
  | { type: "artifact"; payload: BrowserArtifactPayload }
  | { type: "receipt"; receipt: Phase7AReceipt }
  | { type: "source"; source: BrowserSource }
  | { type: "error"; error: Phase7AError; terminal?: boolean }
  | { type: "stop_requested" }
  | { type: "reset" };

export function createResearchConversationState(): ResearchConversationState {
  return { exchanges: [], sources: {}, active_exchange_id: null };
}

function updateExchange(
  state: ResearchConversationState,
  predicate: (exchange: ResearchExchange) => boolean,
  update: (exchange: ResearchExchange) => ResearchExchange,
): ResearchConversationState {
  let matched = false;
  const exchanges = state.exchanges.map((exchange) => {
    if (!predicate(exchange)) return exchange;
    matched = true;
    return update(exchange);
  });
  return matched ? { ...state, exchanges } : state;
}

function updateRunExchange(
  state: ResearchConversationState,
  runId: string,
  update: (exchange: ResearchExchange) => ResearchExchange,
): ResearchConversationState {
  return updateExchange(state, (exchange) => exchange.run_id === runId, update);
}

export function researchConversationReducer(
  state: ResearchConversationState,
  action: ResearchConversationAction,
): ResearchConversationState {
  if (action.type === "reset") return createResearchConversationState();

  if (action.type === "start") {
    if (state.active_exchange_id) return state;
    const exchange: ResearchExchange = {
      local_id: action.local_id,
      run_id: null,
      user: { id: `user_${action.local_id}`, text: action.text, research_depth: action.research_depth, created_at: action.created_at },
      run: null,
      activities: [],
      assistant: null,
      artifact: null,
      receipt: null,
      error: null,
    };
    return { ...state, exchanges: [...state.exchanges, exchange], active_exchange_id: exchange.local_id };
  }

  if (action.type === "source") {
    return { ...state, sources: { ...state.sources, [action.source.source_id]: action.source } };
  }

  if (action.type === "run") {
    const existing = state.exchanges.find((exchange) => exchange.run_id === action.run.run_id);
    const targetId = existing?.local_id ?? state.active_exchange_id;
    if (!targetId) return state;
    const next = updateExchange(state, (exchange) => exchange.local_id === targetId, (exchange) => ({
      ...exchange,
      run_id: action.run.run_id,
      run: action.run,
    }));
    return action.run.state === "running"
      ? { ...next, active_exchange_id: targetId }
      : { ...next, active_exchange_id: next.active_exchange_id === targetId ? null : next.active_exchange_id };
  }

  if (action.type === "activity") {
    return updateRunExchange(state, action.activity.run_id, (exchange) => {
      const index = exchange.activities.findIndex((item) => item.id === action.activity.id);
      if (index < 0) return { ...exchange, activities: [...exchange.activities, action.activity] };
      const activities = [...exchange.activities];
      activities[index] = action.activity;
      return { ...exchange, activities };
    });
  }

  if (action.type === "assistant") {
    return updateRunExchange(state, action.message.run_id, (exchange) => ({ ...exchange, assistant: action.message }));
  }

  if (action.type === "artifact") {
    return updateRunExchange(state, action.payload.run_id, (exchange) => ({ ...exchange, artifact: action.payload }));
  }

  if (action.type === "receipt") {
    return updateRunExchange(state, action.receipt.run_id, (exchange) => ({ ...exchange, receipt: action.receipt }));
  }

  if (action.type === "error") {
    const runId = action.error.run_id;
    const target = runId
      ? state.exchanges.find((exchange) => exchange.run_id === runId)?.local_id
      : state.active_exchange_id;
    if (!target) return state;
    const next = updateExchange(state, (exchange) => exchange.local_id === target, (exchange) => ({ ...exchange, error: action.error }));
    return action.terminal
      ? { ...next, active_exchange_id: next.active_exchange_id === target ? null : next.active_exchange_id }
      : next;
  }

  if (action.type === "stop_requested") {
    if (!state.active_exchange_id) return state;
    return updateExchange(state, (exchange) => exchange.local_id === state.active_exchange_id, (exchange) => ({
      ...exchange,
      run: exchange.run ? { ...exchange.run, state: "stopped", summary: "Stopping this research turn" } : exchange.run,
    }));
  }

  return state;
}

export function activeResearchExchange(state: ResearchConversationState): ResearchExchange | null {
  if (!state.active_exchange_id) return null;
  return state.exchanges.find((exchange) => exchange.local_id === state.active_exchange_id) ?? null;
}

export function exchangeCreatedArtifact(exchange: ResearchExchange): boolean {
  return Boolean(exchange.artifact && exchange.receipt && exchange.receipt.counts.compositions > 0);
}
