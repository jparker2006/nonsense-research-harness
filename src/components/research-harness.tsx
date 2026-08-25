"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/react-ai-sdk";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  Clipboard,
  ExternalLink,
  FileText,
  LoaderCircle,
  Square,
  UserRound,
  X,
} from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import {
  artifactToMarkdown,
  phase7aActivitySchema,
  phase7aArtifactSchema,
  phase7aErrorSchema,
  phase7aMessageSchema,
  phase7aReceiptSchema,
  phase7aRunSchema,
  phase7aSourceSchema,
  type BrowserArtifact,
  type BrowserSource,
  type ChatTurn,
  type Phase7AActivity,
  type Phase7AError,
  type Phase7AReceipt,
  type Phase7ARequest,
  type Phase7ARun,
  type Phase7AUIMessage,
} from "@/lib/phase7a/client";
import { getOrCreatePhase7ABrowserSessionId } from "@/lib/phase7a/browser-session";

const PHASE7A_TRANSPORT = new AssistantChatTransport<Phase7AUIMessage>({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ messages }) => {
    const last = messages.at(-1);
    const textPart = last?.parts.find((part) => part.type === "text");
    if (!textPart || textPart.type !== "text") throw new Error("phase7a_invalid_request");
    return { body: { phase7a: JSON.parse(textPart.text) } };
  },
});

const STARTERS = [
  "Research this headline from the links I paste and tell me what is actually interesting.",
  "Search past Nonsense conversations for a topic and show me the strongest matches.",
  "Help me explore a possible Big Story. Ask what you need, then research it.",
];

function statusLabel(run: Phase7ARun | null) {
  return run ? run.state.replaceAll("_", " ").toUpperCase() : "READY";
}

function toolLabel(activity: Phase7AActivity) {
  if (!activity.tool) return activity.kind === "agent" ? "Agent decision" : activity.kind;
  return ({
    web_search: "Search current web",
    read_url: "Read source",
    search_transcripts: "Search Nonsense archive",
    open_transcript_chunk: "Open archive passage",
  } as const)[activity.tool];
}

function ActivityIcon({ status }: { status: Phase7AActivity["status"] }) {
  if (status === "running") return <LoaderCircle className="spin" aria-hidden="true" />;
  if (["failed", "unavailable"].includes(status)) return <CircleAlert aria-hidden="true" />;
  if (status === "stopped") return <Square aria-hidden="true" />;
  return <Check aria-hidden="true" />;
}

function ActivityPanel({ activities, run, receipt }: { activities: Phase7AActivity[]; run: Phase7ARun | null; receipt: Phase7AReceipt | null }) {
  if (!run && activities.length === 0) return null;
  const current = activities.at(-1);
  const currentStatus: Phase7AActivity["status"] = current?.status ?? (run?.state === "running" ? "running" : run?.state ?? "complete");
  return (
    <section className="activity-panel" aria-label="Agent activity" aria-live="polite">
      <header className="activity-current">
        <span className={`activity-current-icon activity-current-icon--${currentStatus}`}><ActivityIcon status={currentStatus} /></span>
        <div>
          <strong>{current?.label ?? run?.summary ?? "Research ready"}</strong>
          <span>{current?.detail ?? run?.summary ?? "The agent will show observable work here."}</span>
        </div>
        <div className="activity-receipt">
          <span>{statusLabel(run)}</span>
          <small>{receipt ? `${receipt.counts.provider_requests} requests · $${receipt.accounted_cost_usd.toFixed(4)}` : `${activities.length} ${activities.length === 1 ? "step" : "steps"}`}</small>
        </div>
      </header>
      {activities.length ? <details className="activity-details" open={run?.state === "running" || run?.state === "failed" || undefined}>
        <summary>{activities.length} observable research {activities.length === 1 ? "step" : "steps"}</summary>
        <ol className="activity-list">
          {activities.map((activity) => (
            <li className={`activity-item activity-item--${activity.status}`} key={activity.id}>
              <span className="activity-node"><ActivityIcon status={activity.status} /></span>
              <div><span className="activity-kind">{toolLabel(activity)}</span><strong>{activity.label}</strong><p>{activity.detail}</p><time>{new Date(activity.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></div>
            </li>
          ))}
        </ol>
      </details> : null}
    </section>
  );
}

function CitationButtons({ ids, open }: { ids: string[]; open: (id: string) => void }) {
  if (!ids.length) return null;
  return <span className="citation-row">{ids.map((id) => <button type="button" onClick={() => open(id)} key={id}>{id}</button>)}</span>;
}

function Conversation({
  turns,
  draft,
  setDraft,
  send,
  running,
  error,
  openSource,
}: {
  turns: ChatTurn[];
  draft: string;
  setDraft: (value: string) => void;
  send: (message: string) => void;
  running: boolean;
  error: Phase7AError | null;
  openSource: (id: string) => void;
}) {
  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.trim().length < 1 || running) return;
    send(draft.trim());
    setDraft("");
  }
  return (
    <section className="conversation" aria-label="Research conversation">
      <div className="conversation-scroll">
        {!turns.length ? (
          <div className="chat-empty">
            <h1>What are we looking into?</h1>
            <p>Bring a topic, links, rough notes, or a half-formed question. The agent can research the current web, search old episodes, and make a prep packet when you ask.</p>
            <div className="starter-list">{STARTERS.map((starter) => <button type="button" key={starter} onClick={() => setDraft(starter)}>{starter}<ArrowRight aria-hidden="true" /></button>)}</div>
          </div>
        ) : (
          <ol className="chat-turns">
            {turns.map((turn) => (
              <li className={`chat-turn chat-turn--${turn.role}`} key={turn.id}>
                <span className="chat-avatar">{turn.role === "user" ? <UserRound aria-hidden="true" /> : <Bot aria-hidden="true" />}</span>
                <div><span className="chat-role">{turn.role === "user" ? "You" : "Nonsense agent"}</span><p>{turn.text}</p><CitationButtons ids={turn.source_ids} open={openSource} /></div>
              </li>
            ))}
            {running ? <li className="chat-thinking"><LoaderCircle className="spin" aria-hidden="true" /><span>Working through the next step…</span></li> : null}
          </ol>
        )}
        {error ? <div className="chat-error" role="alert"><CircleAlert aria-hidden="true" /><div><strong>Research stopped before completion.</strong><p>{error.message}</p><small>You can send a follow-up to continue from the research already collected.</small></div></div> : null}
      </div>
      <form className="chat-composer" onSubmit={submit}>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={12_000} rows={3} placeholder="Ask a question, paste links, or request a Headlines / Big Story packet…" disabled={running} aria-label="Message the research agent" />
        <div><small>Enter to add detail freely · the agent chooses tools only when useful</small><button type="submit" disabled={running || !draft.trim()} aria-label="Send message">{running ? <LoaderCircle className="spin" /> : <ArrowRight />}</button></div>
      </form>
    </section>
  );
}

function Outline({ artifact, open }: { artifact: BrowserArtifact; open: (id: string) => void }) {
  const beats = artifact.mode === "headlines" ? artifact.flexible_outline : artifact.modular_outline;
  return <ol className="outline-list">{beats.map((beat, index) => <li key={`${beat.priority}-${index}`}><span className={`priority priority--${beat.priority}`}>{beat.priority.replaceAll("_", " ")}</span><div><p>{beat.text}</p><CitationButtons ids={beat.source_ids} open={open} /></div>{beat.estimated_minutes !== undefined ? <time>{Number(beat.estimated_minutes.toFixed(1))}m</time> : null}</li>)}</ol>;
}

function ArtifactView({ artifact, receipt, open, back }: { artifact: BrowserArtifact; receipt: Phase7AReceipt | null; open: (id: string) => void; back: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copyMarkdown() {
    await navigator.clipboard.writeText(artifactToMarkdown(artifact));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_600);
  }
  const archive = artifact.past_nonsense_coverage;
  return (
    <section className="artifact-workspace" aria-label="Preparation artifact">
      <header className="artifact-toolbar"><div><button className="back-to-chat" type="button" onClick={back}><ArrowLeft /> Chat</button><span className="eyebrow">PREP PACKET</span><span className="revision-label">REV {receipt?.artifact_revision ?? 1}</span></div><div className="toolbar-actions"><button type="button" onClick={copyMarkdown}><Clipboard /> {copied ? "Copied" : "Copy Markdown"}</button></div></header>
      <div className="artifact-scroll"><article className="artifact-document">
        <div className="document-meta"><span>{artifact.mode === "headlines" ? "HEADLINES" : "BIG STORY"}</span><span>{receipt?.status.toUpperCase() ?? "VALIDATED"}</span></div>
        <h1>{artifact.working_title}</h1>
        {artifact.mode === "headlines" ? <><section><h2>What happened</h2><p>{artifact.what_happened.text}</p><CitationButtons ids={artifact.what_happened.source_ids} open={open} /></section><section><h2>Why it matters now</h2><p>{artifact.why_it_matters_now.text}</p><CitationButtons ids={artifact.why_it_matters_now.source_ids} open={open} /></section><section className="argument-block"><h2>The argument</h2><p>{artifact.tension_or_argument.text}</p><CitationButtons ids={artifact.tension_or_argument.source_ids} open={open} /></section></> : <><section className="argument-block"><h2>Core question</h2><p>{artifact.core_question}</p></section><section><h2>Research brief</h2><p>{artifact.research_brief.text}</p><CitationButtons ids={artifact.research_brief.source_ids} open={open} /></section><section><h2>Research cards</h2><div className="research-cards">{artifact.research_cards.map((card, index) => <div key={`${card.role}-${index}`}><span>{card.role.replaceAll("_", " ")}</span><p>{card.text}</p><CitationButtons ids={card.source_ids} open={open} /></div>)}</div></section></>}
        <section><h2>{artifact.mode === "headlines" ? "Flexible outline" : "Modular outline"}</h2><Outline artifact={artifact} open={open} /></section>
        <section><h2>Conversation questions</h2><ul className="question-list">{artifact.conversation_questions.map((question) => <li key={question}>{question}</li>)}</ul></section>
        <section><h2>Past Nonsense coverage</h2>{archive.status === "matches" ? archive.items.map((item) => <blockquote key={item.source_id}>{item.quote}<button type="button" onClick={() => open(item.source_id)}>{item.source_id}</button></blockquote>) : <p>No relevant archive match was found. No speaker attribution was invented.</p>}</section>
        <section className="open-checks"><h2>Open checks</h2><ul>{artifact.uncertainties_and_open_checks.map((item) => <li key={item}>{item}</li>)}</ul></section>
        <section><div className="section-heading"><h2>Source ledger</h2><span>{artifact.source_ledger.length} sources</span></div><div className="source-ledger">{artifact.source_ledger.map((item) => <button type="button" key={item.source_id} onClick={() => open(item.source_id)}><span>{item.source_id}</span><div><strong>{item.title ?? item.source_type}</strong><small>{item.source_type.replaceAll("_", " ")} · {item.availability}</small></div><ChevronRight /></button>)}</div></section>
      </article></div>
    </section>
  );
}

function SourceDrawer({ source, close }: { source: BrowserSource; close: () => void }) {
  return <aside className="source-drawer" aria-label="Source detail"><header><div><span className="eyebrow">SOURCE</span><strong>{source.source_id}</strong></div><button type="button" onClick={close} aria-label="Close source"><X /></button></header><h2>{source.title ?? source.source_type}</h2><dl><div><dt>Type</dt><dd>{source.source_type.replaceAll("_", " ")}</dd></div><div><dt>Status</dt><dd>{source.availability}</dd></div>{source.season ? <div><dt>Archive</dt><dd>Season {source.season}, episode {source.episode_number}</dd></div> : null}</dl>{source.excerpt ? <blockquote>{source.excerpt}</blockquote> : <p>No bounded excerpt is available for this source.</p>}{source.url ? <a href={source.url} target="_blank" rel="noreferrer">Open original <ExternalLink /></a> : null}</aside>;
}

export function ResearchHarness() {
  const sessionId = useRef<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [activities, setActivities] = useState<Phase7AActivity[]>([]);
  const [sources, setSources] = useState<Record<string, BrowserSource>>({});
  const [artifact, setArtifact] = useState<BrowserArtifact | null>(null);
  const [run, setRun] = useState<Phase7ARun | null>(null);
  const [receipt, setReceipt] = useState<Phase7AReceipt | null>(null);
  const [error, setError] = useState<Phase7AError | null>(null);
  const [draft, setDraft] = useState("");
  const [view, setView] = useState<"chat" | "artifact">("chat");
  const [sourceId, setSourceId] = useState<string | null>(null);

  const handleData = (part: { type: string; data: unknown }) => {
    if (part.type === "data-activity") {
      const activity = phase7aActivitySchema.parse(part.data);
      setActivities((current) => [...current.filter((item) => item.id !== activity.id), activity]);
    } else if (part.type === "data-message") {
      const message = phase7aMessageSchema.parse(part.data);
      setTurns((current) => [...current.filter((turn) => turn.id !== message.message_id), { id: message.message_id, role: "assistant", text: message.text, source_ids: message.source_ids }]);
    } else if (part.type === "data-source") {
      const source = phase7aSourceSchema.parse(part.data);
      setSources((current) => ({ ...current, [source.source_id]: source }));
    } else if (part.type === "data-artifact") {
      setArtifact(phase7aArtifactSchema.parse(part.data).artifact);
    } else if (part.type === "data-run") setRun(phase7aRunSchema.parse(part.data));
    else if (part.type === "data-receipt") setReceipt(phase7aReceiptSchema.parse(part.data));
    else if (part.type === "data-error") setError(phase7aErrorSchema.parse(part.data));
  };

  const runtime = useChatRuntime<Phase7AUIMessage>({
    transport: PHASE7A_TRANSPORT,
    onData: handleData,
    onError: () => setError({ code: "phase7a_request_failed", message: "The connection ended safely. No automatic retry was started.", retryable: true }),
  });
  const running = run?.state === "running";

  function send(message: string) {
    const activeSessionId = getOrCreatePhase7ABrowserSessionId(sessionId);
    const request: Phase7ARequest = { action: "message", session_id: activeSessionId, message };
    setTurns((current) => [...current, { id: `local_${Date.now()}`, role: "user", text: message, source_ids: [] }]);
    setActivities([]);
    setReceipt(null);
    setError(null);
    setView("chat");
    runtime.thread.append({ role: "user", content: [{ type: "text", text: JSON.stringify(request) }] });
  }

  function stop() {
    runtime.thread.cancelRun();
    setRun((current) => current ? { ...current, state: "stopped", summary: "Research turn stopped by you" } : current);
  }

  function newResearch() {
    if (running) return;
    sessionId.current = null;
    setTurns([]);
    setActivities([]);
    setSources({});
    setArtifact(null);
    setRun(null);
    setReceipt(null);
    setError(null);
    setDraft("");
    setView("chat");
  }

  const selectedSource = sourceId ? sources[sourceId] ?? artifact?.source_ledger.find((source) => source.source_id === sourceId) : undefined;
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="workbench">
        <header className="workbench-header">
          <div className="brand-lockup"><span className="brand-mark" aria-hidden="true">N</span><div><strong>Nonsense</strong><small>Research desk</small></div></div>
          <div className="desk-title"><strong>{artifact?.working_title ?? "Research conversation"}</strong><span>{run?.summary ?? "Current web and the S3–4 archive"}</span></div>
          <div className="header-controls">
            {receipt ? <span className="turn-receipt">${receipt.accounted_cost_usd.toFixed(4)} <small>{receipt.counts.provider_requests} req</small></span> : null}
            {artifact ? <button className="artifact-toggle" type="button" onClick={() => setView(view === "chat" ? "artifact" : "chat")}>{view === "chat" ? <FileText /> : <ArrowLeft />}{view === "chat" ? "Prep packet" : "Conversation"}</button> : null}
            <button className="new-research" type="button" onClick={newResearch} disabled={running} aria-label="New research"><span className="new-research-icon" aria-hidden="true">+</span><span className="new-research-label">New research</span></button>
            {running ? <button className="stop-button" type="button" onClick={stop}><Square /> Stop</button> : <span className={`status-chip status-chip--${run?.state ?? "idle"}`}>{statusLabel(run)}</span>}
          </div>
        </header>
        <main className="workspace-main">
          <ActivityPanel activities={activities} run={run} receipt={receipt} />
          {view === "artifact" && artifact ? <ArtifactView artifact={artifact} receipt={receipt} open={setSourceId} back={() => setView("chat")} /> : <Conversation turns={turns} draft={draft} setDraft={setDraft} send={send} running={running} error={error} openSource={setSourceId} />}
          {selectedSource ? <SourceDrawer source={selectedSource} close={() => setSourceId(null)} /> : null}
        </main>
      </div>
    </AssistantRuntimeProvider>
  );
}
