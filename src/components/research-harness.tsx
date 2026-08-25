"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { Square } from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";
import { ConversationThread, FocusArtifactView, SourceDrawer } from "@/components/research-thread";
import { getOrCreatePhase7ABrowserSessionId } from "@/lib/phase7a/browser-session";
import {
  phase7aActivitySchema,
  phase7aArtifactSchema,
  phase7aErrorSchema,
  phase7aMessageSchema,
  phase7aReceiptSchema,
  phase7aRunSchema,
  phase7aSourceSchema,
  type BrowserSource,
  type Phase7ARequest,
  type Phase7AUIMessage,
} from "@/lib/phase7a/client";
import {
  createResearchConversationState,
  researchConversationReducer,
  type ResearchExchange,
} from "@/lib/phase7a/client-state";
import { artifactToReadableMarkdown, outcomeLabel, type SourceReference } from "@/lib/phase7a/presentation";

const PHASE7A_TRANSPORT = new AssistantChatTransport<Phase7AUIMessage>({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ messages }) => {
    const last = messages.at(-1);
    const textPart = last?.parts.find((part) => part.type === "text");
    if (!textPart || textPart.type !== "text") throw new Error("phase7a_invalid_request");
    return { body: { phase7a: JSON.parse(textPart.text) } };
  },
});

type SelectedSource = { id: string; references: SourceReference[] };

export function ResearchHarness() {
  const sessionId = useRef<string | null>(null);
  const sourceReturnFocus = useRef<HTMLElement | null>(null);
  const [state, dispatch] = useReducer(researchConversationReducer, undefined, createResearchConversationState);
  const [draft, setDraft] = useState("");
  const [focusExchangeId, setFocusExchangeId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<SelectedSource | null>(null);
  const [copiedExchangeId, setCopiedExchangeId] = useState<string | null>(null);

  function handleData(part: { type: string; data: unknown }) {
    if (part.type === "data-activity") dispatch({ type: "activity", activity: phase7aActivitySchema.parse(part.data) });
    else if (part.type === "data-message") dispatch({ type: "assistant", message: phase7aMessageSchema.parse(part.data) });
    else if (part.type === "data-source") dispatch({ type: "source", source: phase7aSourceSchema.parse(part.data) });
    else if (part.type === "data-artifact") dispatch({ type: "artifact", payload: phase7aArtifactSchema.parse(part.data) });
    else if (part.type === "data-run") dispatch({ type: "run", run: phase7aRunSchema.parse(part.data) });
    else if (part.type === "data-receipt") dispatch({ type: "receipt", receipt: phase7aReceiptSchema.parse(part.data) });
    else if (part.type === "data-error") dispatch({ type: "error", error: phase7aErrorSchema.parse(part.data) });
  }

  const runtime = useChatRuntime<Phase7AUIMessage>({
    transport: PHASE7A_TRANSPORT,
    onData: handleData,
    onError: () => dispatch({
      type: "error",
      terminal: true,
      error: { code: "phase7a_request_failed", message: "The connection ended safely. No automatic retry was started.", retryable: true },
    }),
  });

  const running = Boolean(state.active_exchange_id);
  const latestExchange = state.exchanges.at(-1) ?? null;
  const latestArtifactExchange = [...state.exchanges].reverse().find((exchange) => exchange.artifact) ?? null;
  const focusedExchange = focusExchangeId ? state.exchanges.find((exchange) => exchange.local_id === focusExchangeId) ?? null : null;

  useEffect(() => {
    if (!selectedSource) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setSelectedSource(null);
      window.setTimeout(() => sourceReturnFocus.current?.focus(), 0);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedSource]);

  function send(message: string) {
    if (running) return;
    const activeSessionId = getOrCreatePhase7ABrowserSessionId(sessionId);
    const localId = `local_${crypto.randomUUID()}`;
    const request: Phase7ARequest = { action: "message", session_id: activeSessionId, message };
    dispatch({ type: "start", local_id: localId, text: message, created_at: new Date().toISOString() });
    setFocusExchangeId(null);
    runtime.thread.append({ role: "user", content: [{ type: "text", text: JSON.stringify(request) }] });
  }

  function stop() {
    dispatch({ type: "stop_requested" });
    runtime.thread.cancelRun();
  }

  function newResearch() {
    if (running) return;
    sessionId.current = null;
    dispatch({ type: "reset" });
    setDraft("");
    setFocusExchangeId(null);
    setSelectedSource(null);
    setCopiedExchangeId(null);
  }

  function openSource(id: string, references: SourceReference[]) {
    sourceReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedSource({ id, references });
  }

  function closeSource() {
    setSelectedSource(null);
    window.setTimeout(() => sourceReturnFocus.current?.focus(), 0);
  }

  async function copyArtifact(exchange: ResearchExchange) {
    if (!exchange.artifact) return;
    await navigator.clipboard.writeText(artifactToReadableMarkdown(exchange.artifact.artifact));
    setCopiedExchangeId(exchange.local_id);
    window.setTimeout(() => setCopiedExchangeId((current) => current === exchange.local_id ? null : current), 1_600);
  }

  const selectedReference = selectedSource?.references.find((reference) => reference.source_id === selectedSource.id) ?? null;
  const selectedSourceRecord: BrowserSource | null = selectedSource
    ? state.sources[selectedSource.id] ?? selectedReference?.source ?? null
    : null;
  const headerLabel = latestExchange ? outcomeLabel(latestExchange.run, latestExchange.receipt, latestExchange.activities) : "Ready";

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="workbench">
        <header className="workbench-header">
          <div className="brand-lockup"><span className="brand-mark" aria-hidden="true">N</span><div><strong>Nonsense</strong><small>Research desk</small></div></div>
          <div className="desk-title"><strong>{latestArtifactExchange?.artifact?.artifact.working_title ?? "Research conversation"}</strong><span>{latestExchange?.run?.summary ?? "Current web and the S3–4 archive"}</span></div>
          <div className="header-controls">
            {latestExchange?.receipt ? <span className="turn-receipt">${latestExchange.receipt.accounted_cost_usd.toFixed(4)} <small>{latestExchange.receipt.counts.provider_requests} req</small></span> : null}
            <button className="new-research" type="button" onClick={newResearch} disabled={running} aria-label="New research"><span className="new-research-icon" aria-hidden="true">+</span><span className="new-research-label">New research</span></button>
            {running ? <button className="stop-button" type="button" onClick={stop}><Square aria-hidden="true" />Stop</button> : <span className={`status-chip status-chip--${latestExchange?.run?.state ?? "idle"}`}>{headerLabel}</span>}
          </div>
        </header>
        <main className="workspace-main">
          {focusedExchange?.artifact ? (
            <FocusArtifactView exchange={focusedExchange} sources={state.sources} openSource={openSource} back={() => setFocusExchangeId(null)} copy={() => copyArtifact(focusedExchange)} copied={copiedExchangeId === focusedExchange.local_id} />
          ) : (
            <ConversationThread exchanges={state.exchanges} sources={state.sources} draft={draft} setDraft={setDraft} send={send} running={running} openSource={openSource} focusArtifact={setFocusExchangeId} copyArtifact={copyArtifact} copiedExchangeId={copiedExchangeId} />
          )}
          {selectedSourceRecord ? <SourceDrawer source={selectedSourceRecord} reference={selectedReference} close={closeSource} /> : null}
        </main>
      </div>
    </AssistantRuntimeProvider>
  );
}
