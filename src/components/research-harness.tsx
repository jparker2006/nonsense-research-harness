"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { Square } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { HistoryButton, ResearchHistory } from "@/components/research-history";
import { ConversationThread, FocusArtifactView, SourceDrawer } from "@/components/research-thread";
import { getOrCreateResearchBrowserSessionId } from "@/lib/research/browser-session";
import {
  researchActivitySchema,
  researchArtifactSchema,
  researchErrorSchema,
  researchMessageSchema,
  researchReceiptSchema,
  researchRunSchema,
  researchSourceSchema,
  researchThreadStatusSchema,
  type BrowserSource,
  type ResearchDepth,
  type ResearchRequest,
  type ResearchUIMessage,
} from "@/lib/research/client";
import {
  createResearchConversationState,
  researchConversationReducer,
  type ResearchExchange,
} from "@/lib/research/client-state";
import { artifactToReadableMarkdown, outcomeLabel, type SourceReference } from "@/lib/research/presentation";
import type { ResearchThreadMetadata } from "@/lib/threads/contracts";
import {
  mergeThreadMetadata,
  projectThreadRecord,
  threadListResponseSchema,
  threadLoadResponseSchema,
} from "@/lib/threads/client";

const RESEARCH_TRANSPORT = new AssistantChatTransport<ResearchUIMessage>({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ messages }) => {
    const last = messages.at(-1);
    const textPart = last?.parts.find((part) => part.type === "text");
    if (!textPart || textPart.type !== "text") throw new Error("research_invalid_request");
    return { body: { research: JSON.parse(textPart.text) } };
  },
});

type SelectedSource = { id: string; references: SourceReference[] };

export function ResearchHarness() {
  const sessionId = useRef<string | null>(null);
  const sourceReturnFocus = useRef<HTMLElement | null>(null);
  const initialized = useRef(false);
  const [state, dispatch] = useReducer(researchConversationReducer, undefined, createResearchConversationState);
  const [draft, setDraft] = useState("");
  const [researchDepth, setResearchDepth] = useState<ResearchDepth>("standard");
  const [focusExchangeId, setFocusExchangeId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<SelectedSource | null>(null);
  const [copiedExchangeId, setCopiedExchangeId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ResearchThreadMetadata[]>([]);
  const [historyWarning, setHistoryWarning] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  function handleData(part: { type: string; data: unknown }) {
    if (part.type === "data-activity") dispatch({ type: "activity", activity: researchActivitySchema.parse(part.data) });
    else if (part.type === "data-message") dispatch({ type: "assistant", message: researchMessageSchema.parse(part.data) });
    else if (part.type === "data-source") dispatch({ type: "source", source: researchSourceSchema.parse(part.data) });
    else if (part.type === "data-artifact") dispatch({ type: "artifact", payload: researchArtifactSchema.parse(part.data) });
    else if (part.type === "data-run") dispatch({ type: "run", run: researchRunSchema.parse(part.data) });
    else if (part.type === "data-receipt") dispatch({ type: "receipt", receipt: researchReceiptSchema.parse(part.data) });
    else if (part.type === "data-error") dispatch({ type: "error", error: researchErrorSchema.parse(part.data) });
    else if (part.type === "data-thread") {
      const thread = researchThreadStatusSchema.parse(part.data);
      dispatch({ type: "thread", thread });
      setActiveThreadId(thread.thread_id);
      setHistoryWarning(thread.warning);
      setThreads((current) => mergeThreadMetadata(current, thread));
    }
  }

  const runtime = useChatRuntime<ResearchUIMessage>({
    transport: RESEARCH_TRANSPORT,
    onData: handleData,
    onError: () => dispatch({
      type: "error",
      terminal: true,
      error: { code: "research_request_failed", message: "The connection ended safely. No automatic retry was started.", retryable: true },
    }),
  });

  const running = Boolean(state.active_exchange_id);
  const latestExchange = state.exchanges.at(-1) ?? null;
  const latestArtifactExchange = [...state.exchanges].reverse().find((exchange) => exchange.artifact) ?? null;
  const focusedExchange = focusExchangeId ? state.exchanges.find((exchange) => exchange.local_id === focusExchangeId) ?? null : null;
  const setThreadNavigation = useCallback((id: string | null, replace = false) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("thread", id);
    else url.searchParams.delete("thread");
    window.history[replace ? "replaceState" : "pushState"]({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const refreshThreads = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/threads", { cache: "no-store" });
      const payload = threadListResponseSchema.parse(await response.json());
      setThreads(payload.threads);
      setHistoryWarning(payload.warning);
    } catch {
      setHistoryWarning("History is temporarily unavailable. Current answers remain visible in this browser.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const hydrateThread = useCallback(async (id: string, replaceNavigation = false) => {
    setLoadingThreadId(id);
    try {
      const response = await fetch(`/api/threads/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 404 ? "thread_not_found" : "thread_history_unavailable");
      const payload = threadLoadResponseSchema.parse(await response.json());
      sessionId.current = payload.thread.id;
      setActiveThreadId(payload.thread.id);
      dispatch({ type: "hydrate", state: projectThreadRecord(payload.thread, payload) });
      setHistoryWarning(payload.warning);
      setThreadNavigation(payload.thread.id, replaceNavigation);
      setFocusExchangeId(null);
      setSelectedSource(null);
      setConfirmDeleteId(null);
      setHistoryOpen(false);
    } catch (error) {
      if (error instanceof Error && error.message === "thread_not_found") {
        sessionId.current = null;
        setActiveThreadId(null);
        dispatch({ type: "reset" });
        setThreadNavigation(null, true);
        setThreads((current) => current.filter((thread) => thread.id !== id));
        setHistoryWarning("That research thread no longer exists.");
        return;
      }
      setHistoryWarning("History is temporarily unavailable. Current answers remain visible in this browser.");
    } finally {
      setLoadingThreadId(null);
    }
  }, [setThreadNavigation]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void refreshThreads();
    const requested = new URL(window.location.href).searchParams.get("thread");
    if (requested && /^[a-f0-9-]{36}$/i.test(requested)) {
      window.setTimeout(() => void hydrateThread(requested, true), 0);
    }
  }, [hydrateThread, refreshThreads]);

  useEffect(() => {
    function navigateFromHistory() {
      if (running) {
        setThreadNavigation(activeThreadId, true);
        return;
      }
      const requested = new URL(window.location.href).searchParams.get("thread");
      if (requested && /^[a-f0-9-]{36}$/i.test(requested)) void hydrateThread(requested, true);
      else {
        sessionId.current = null;
        setActiveThreadId(null);
        dispatch({ type: "reset" });
      }
    }
    window.addEventListener("popstate", navigateFromHistory);
    return () => window.removeEventListener("popstate", navigateFromHistory);
  }, [activeThreadId, hydrateThread, running, setThreadNavigation]);

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

  function send(message: string, selectedDepth: ResearchDepth) {
    if (running) return;
    const isNewThread = sessionId.current === null;
    const activeSessionId = getOrCreateResearchBrowserSessionId(sessionId);
    setActiveThreadId(activeSessionId);
    if (isNewThread) setThreadNavigation(activeSessionId);
    const localId = `local_${crypto.randomUUID()}`;
    const request: ResearchRequest = { action: "message", session_id: activeSessionId, message, research_depth: selectedDepth };
    dispatch({ type: "start", local_id: localId, text: message, research_depth: selectedDepth, created_at: new Date().toISOString() });
    setFocusExchangeId(null);
    setResearchDepth("standard");
    runtime.thread.append({ role: "user", content: [{ type: "text", text: JSON.stringify(request) }] });
  }

  function stop() {
    dispatch({ type: "stop_requested" });
    runtime.thread.cancelRun();
  }

  function newResearch() {
    if (running) return;
    sessionId.current = null;
    setActiveThreadId(null);
    dispatch({ type: "reset" });
    setDraft("");
    setResearchDepth("standard");
    setFocusExchangeId(null);
    setSelectedSource(null);
    setCopiedExchangeId(null);
    setConfirmDeleteId(null);
    setHistoryOpen(false);
    setThreadNavigation(null);
  }

  async function deleteThread(id: string) {
    if (running) return;
    try {
      const response = await fetch(`/api/threads/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) throw new Error("thread_delete_failed");
      setThreads((current) => current.filter((thread) => thread.id !== id));
      setConfirmDeleteId(null);
      if (activeThreadId === id) newResearch();
    } catch {
      setHistoryWarning("That thread could not be deleted. Your saved research was left unchanged.");
    }
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
  const headerLabel = loadingThreadId ? "Opening…" : latestExchange ? outcomeLabel(latestExchange.run, latestExchange.receipt, latestExchange.activities, latestExchange.error) : "Ready";
  const headerState = latestExchange?.run?.state ?? (latestExchange?.error ? "failed" : "idle");

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="workbench">
        <header className="workbench-header">
          <div className="brand-lockup"><span className="brand-mark" aria-hidden="true">N</span><div><strong>Nonsense</strong><small>Research desk</small></div></div>
          <div className="desk-title"><strong>{latestArtifactExchange?.artifact?.artifact.working_title ?? "Research conversation"}</strong><span>{latestExchange?.run?.summary ?? "Current web and the S3–4 archive"}</span></div>
          <div className="header-controls">
            {latestExchange?.receipt ? <span className="turn-receipt">${latestExchange.receipt.accounted_cost_usd.toFixed(4)} <small>{latestExchange.receipt.counts.provider_requests} req</small></span> : null}
            <HistoryButton open={() => setHistoryOpen(true)} disabled={running} />
            <button className="new-research" type="button" onClick={newResearch} disabled={running} aria-label="New research"><span className="new-research-icon" aria-hidden="true">+</span><span className="new-research-label">New research</span></button>
            {running ? <button className="stop-button" type="button" onClick={stop}><Square aria-hidden="true" />Stop</button> : <span className={`status-chip status-chip--${headerState}`}>{headerLabel}</span>}
          </div>
        </header>
        <div className="workbench-body">
          <ResearchHistory threads={threads} activeThreadId={activeThreadId} close={() => setHistoryOpen(false)} drawerOpen={historyOpen} newResearch={newResearch} openThread={(id) => { if (!running) void hydrateThread(id); }} requestDelete={setConfirmDeleteId} confirmDeleteId={confirmDeleteId} confirmDelete={(id) => void deleteThread(id)} cancelDelete={() => setConfirmDeleteId(null)} running={running} loading={historyLoading || loadingThreadId !== null} warning={historyWarning} />
          <main className="workspace-main">
            {historyWarning ? <div className="persistence-banner" role="status">{historyWarning}</div> : null}
            {focusedExchange?.artifact ? (
              <FocusArtifactView exchange={focusedExchange} sources={state.sources} openSource={openSource} back={() => setFocusExchangeId(null)} copy={() => copyArtifact(focusedExchange)} copied={copiedExchangeId === focusedExchange.local_id} />
            ) : (
              <ConversationThread exchanges={state.exchanges} sources={state.sources} draft={draft} setDraft={setDraft} researchDepth={researchDepth} setResearchDepth={setResearchDepth} send={send} running={running} openSource={openSource} focusArtifact={setFocusExchangeId} copyArtifact={copyArtifact} copiedExchangeId={copiedExchangeId} />
            )}
            {selectedSourceRecord ? <SourceDrawer source={selectedSourceRecord} reference={selectedReference} close={closeSource} /> : null}
          </main>
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}
