"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/react-ai-sdk";
import {
  Archive,
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
  Plus,
  Radio,
  Search,
  Square,
  UserRound,
  X,
} from "lucide-react";
import { type FormEvent, useState } from "react";
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

function ActivityRail({ activities, run }: { activities: Phase7AActivity[]; run: Phase7ARun | null }) {
  return (
    <section className="activity-rail" aria-label="Agent activity">
      <header className="rail-header">
        <div><span className="eyebrow">AGENT RUN</span><h2>Research tape</h2></div>
        <span className={`run-light run-light--${run?.state ?? "idle"}`} aria-hidden="true" />
      </header>
      <div className="tape-status" aria-live="polite"><span>{statusLabel(run)}</span><p>{run?.summary ?? "Tool calls and agent decisions appear here."}</p></div>
      <ol className="activity-list">
        {activities.length ? activities.map((activity) => (
          <li className={`activity-item activity-item--${activity.status}`} key={activity.id}>
            <span className="activity-node"><ActivityIcon status={activity.status} /></span>
            <div><span className="activity-kind">{toolLabel(activity)}</span><strong>{activity.label}</strong><p>{activity.detail}</p><time>{new Date(activity.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></div>
          </li>
        )) : (
          <li className="activity-empty"><Search aria-hidden="true" /><strong>No turn yet</strong><p>Talk to the agent normally. It decides whether it needs a tool.</p></li>
        )}
      </ol>
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
            <span><Radio aria-hidden="true" /></span>
            <h1>What are we looking into?</h1>
            <p>Drop a topic, links, rough notes, or a half-formed question. The agent can research, search old episodes, answer follow-ups, and make a prep packet when you ask.</p>
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
        {error ? <div className="chat-error" role="alert"><CircleAlert aria-hidden="true" /><div><strong>The turn stopped safely.</strong><p>{error.message}</p></div></div> : null}
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

function SessionRail({ run, receipt, artifact, newResearch }: { run: Phase7ARun | null; receipt: Phase7AReceipt | null; artifact: BrowserArtifact | null; newResearch: () => void }) {
  return <aside className="session-rail" aria-label="Local session"><div className="brand"><span><Radio /></span><div><strong>NONSENSE</strong><small>RESEARCH AGENT</small></div></div><button className="new-research" type="button" onClick={newResearch}><Plus /> New research</button><nav><span className="nav-label">ON THE DESK</span><button className="session-row" type="button"><FileText /><span><strong>{artifact?.working_title ?? "Research conversation"}</strong><small>Ephemeral local session · {statusLabel(run).toLowerCase()}</small></span></button></nav><div className="session-contract"><Archive /><div><strong>Past conversations</strong><p>Searches S3–4. Transcript text has no reliable speaker labels.</p></div></div><div className="cost-receipt"><span>LAST TURN</span><strong>${(receipt?.accounted_cost_usd ?? 0).toFixed(4)}</strong><small>{receipt ? `${receipt.counts.provider_requests} provider · ${receipt.counts.controller_turns} decisions` : "No provider spend"}</small></div></aside>;
}

export function ResearchHarness() {
  const [sessionId, setSessionId] = useState("session_phase7a_local");
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
  const [mobilePanel, setMobilePanel] = useState<"activity" | "workspace">("workspace");

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
    const request: Phase7ARequest = { action: "message", session_id: sessionId, message };
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
    setSessionId(`session_phase7a_${Date.now()}`);
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
        <SessionRail run={run} receipt={receipt} artifact={artifact} newResearch={newResearch} />
        <div className="mobile-switch" role="tablist" aria-label="Workbench panel"><button role="tab" aria-selected={mobilePanel === "activity"} onClick={() => setMobilePanel("activity")}>Activity <span>{activities.length}</span></button><button role="tab" aria-selected={mobilePanel === "workspace"} onClick={() => setMobilePanel("workspace")}>Workspace</button></div>
        <div className={mobilePanel === "activity" ? "mobile-active" : "mobile-hidden"}><ActivityRail activities={activities} run={run} /></div>
        <main className={mobilePanel === "workspace" ? "workspace-main mobile-active" : "workspace-main mobile-hidden"}>
          <header className="workbench-header"><div><span className="eyebrow">RESEARCH CONVERSATION</span><strong>{artifact?.working_title ?? "One agent, a live web, and the Nonsense archive"}</strong></div><div className="header-controls">{artifact ? <button className="artifact-toggle" type="button" onClick={() => setView(view === "chat" ? "artifact" : "chat")}>{view === "chat" ? <FileText /> : <ArrowLeft />}{view === "chat" ? "Artifact" : "Chat"}</button> : null}<span className={`status-chip status-chip--${run?.state ?? "idle"}`}>{statusLabel(run)}</span>{running ? <button className="stop-button" type="button" onClick={stop}><Square /> Stop</button> : null}</div></header>
          <div className="run-tape" aria-hidden="true"><span /><i className={running ? "is-running" : activities.length ? "is-done" : ""} /><span /></div>
          {view === "artifact" && artifact ? <ArtifactView artifact={artifact} receipt={receipt} open={setSourceId} back={() => setView("chat")} /> : <Conversation turns={turns} draft={draft} setDraft={setDraft} send={send} running={running} error={error} openSource={setSourceId} />}
          {selectedSource ? <SourceDrawer source={selectedSource} close={() => setSourceId(null)} /> : null}
        </main>
      </div>
    </AssistantRuntimeProvider>
  );
}
