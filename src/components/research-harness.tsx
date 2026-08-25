"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/react-ai-sdk";
import {
  Archive,
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  Clipboard,
  Clock3,
  ExternalLink,
  FileText,
  LoaderCircle,
  Pencil,
  Radio,
  RotateCcw,
  Search,
  Square,
  X,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  phase6ActivitySchema,
  phase6ArtifactSchema,
  phase6ErrorSchema,
  phase6ReceiptSchema,
  phase6RunSchema,
  artifactToMarkdown,
  type BrowserArtifact,
  type Phase6Activity,
  type Phase6Error,
  type Phase6Receipt,
  type Phase6Request,
  type Phase6Run,
  type Phase6UIMessage,
  type Phase6Input,
} from "@/lib/phase6/client";
import { PHASE_6_FROZEN_HEADLINES_CASE } from "@/lib/phase6/frozen-case";

const SESSION_ID = "session_phase6_local";
const DEFAULT_INPUT: Phase6Input = {
  ...PHASE_6_FROZEN_HEADLINES_CASE,
  links: [...PHASE_6_FROZEN_HEADLINES_CASE.links],
};

const PHASE6_TRANSPORT = new AssistantChatTransport<Phase6UIMessage>({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ messages }) => {
    const last = messages.at(-1);
    const textPart = last?.parts.find((part) => part.type === "text");
    if (!textPart || textPart.type !== "text") throw new Error("phase6_invalid_request");
    return { body: { phase6: JSON.parse(textPart.text) } };
  },
});

function statusLabel(run: Phase6Run | null) {
  if (!run) return "READY";
  return run.state.replaceAll("_", " ").toUpperCase();
}

function toolLabel(tool?: Phase6Activity["tool"]) {
  return ({
    web_search: "Search current web",
    read_url: "Read source",
    search_transcripts: "Search Nonsense archive",
    open_transcript_chunk: "Open archive passage",
  } as const)[tool ?? "web_search"] ?? "Agent step";
}

function ActivityIcon({ status }: { status: Phase6Activity["status"] }) {
  if (status === "running") return <LoaderCircle className="spin" aria-hidden="true" />;
  if (["failed", "unavailable"].includes(status)) return <CircleAlert aria-hidden="true" />;
  if (status === "stopped") return <Square aria-hidden="true" />;
  return <Check aria-hidden="true" />;
}

function ActivityRail({ activities, run }: { activities: Phase6Activity[]; run: Phase6Run | null }) {
  return (
    <section className="activity-rail" aria-label="Agent activity">
      <header className="rail-header">
        <div><span className="eyebrow">AGENT RUN</span><h2>Research tape</h2></div>
        <span className={`run-light run-light--${run?.state ?? "idle"}`} aria-hidden="true" />
      </header>
      <div className="tape-status" aria-live="polite">
        <span>{statusLabel(run)}</span>
        <p>{run?.summary ?? "Give the desk one story to investigate."}</p>
      </div>
      <ol className="activity-list">
        {activities.length ? activities.map((activity) => (
          <li className={`activity-item activity-item--${activity.status}`} key={activity.id}>
            <span className="activity-node"><ActivityIcon status={activity.status} /></span>
            <div>
              <span className="activity-kind">{activity.tool ? toolLabel(activity.tool) : activity.kind}</span>
              <strong>{activity.label}</strong>
              <p>{activity.detail}</p>
              <time>{new Date(activity.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
            </div>
          </li>
        )) : (
          <li className="activity-empty">
            <Search aria-hidden="true" />
            <strong>No run yet</strong>
            <p>Tool calls will appear here as the agent works.</p>
          </li>
        )}
      </ol>
    </section>
  );
}

function Intake({ onStart, disabled }: { onStart: (input: Phase6Input) => void; disabled: boolean }) {
  const [mode, setMode] = useState<Phase6Input["mode"]>(DEFAULT_INPUT.mode);
  const [topic, setTopic] = useState(DEFAULT_INPUT.topic);
  const [links, setLinks] = useState(DEFAULT_INPUT.links.join("\n"));
  const [notes, setNotes] = useState(DEFAULT_INPUT.notes);
  const [minutes, setMinutes] = useState(String(DEFAULT_INPUT.target_minutes));

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsedMinutes = Number(minutes);
    onStart({
      mode,
      topic,
      links: links.split(/\n|,/).map((value) => value.trim()).filter(Boolean).slice(0, 3),
      notes,
      ...(Number.isFinite(parsedMinutes) && parsedMinutes > 0 ? { target_minutes: parsedMinutes } : {}),
    });
  }

  return (
    <form className="intake-card" onSubmit={submit}>
      <div className="intake-heading">
        <span className="intake-mark"><Radio aria-hidden="true" /></span>
        <div><span className="eyebrow">ONE STORY AT A TIME</span><h2>Bring the mess. Get a usable prep packet.</h2></div>
      </div>
      <p className="intake-deck">Give the agent a topic, up to three links, and the scraps you already have. It researches the current web, checks past Nonsense coverage, and structures the result against the clock.</p>
      <fieldset className="mode-switch">
        <legend>Episode format</legend>
        <label><input type="radio" name="mode" value="headlines" checked={mode === "headlines"} onChange={() => setMode("headlines")} /> Headlines</label>
        <label><input type="radio" name="mode" value="big_story" checked={mode === "big_story"} onChange={() => setMode("big_story")} /> Big Story</label>
      </fieldset>
      <label className="field"><span>Topic</span><textarea value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={500} rows={2} required /></label>
      <div className="field-grid">
        <label className="field"><span>Links <small>one per line · optional</small></span><textarea value={links} onChange={(event) => setLinks(event.target.value)} rows={3} /></label>
        <label className="field"><span>Rough notes <small>optional</small></span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={8000} rows={3} /></label>
      </div>
      <div className="intake-footer">
        <label className="minutes-field"><Clock3 aria-hidden="true" /><span>Minutes</span><input inputMode="decimal" value={minutes} onChange={(event) => setMinutes(event.target.value)} aria-label="Target minutes" /></label>
        <button className="primary-button" type="submit" disabled={disabled || topic.trim().length < 3}>
          {disabled ? <LoaderCircle className="spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />} Research this story
        </button>
      </div>
      <p className="fixture-note">Local fixture is the default. Provider access is locked unless an exact live proof is authorized.</p>
    </form>
  );
}

function CitationButtons({ ids, open }: { ids: string[]; open: (id: string) => void }) {
  return <span className="citation-row">{ids.map((id) => <button type="button" onClick={() => open(id)} key={id}>{id}</button>)}</span>;
}

function Outline({ artifact, open }: { artifact: BrowserArtifact; open: (id: string) => void }) {
  const beats = artifact.mode === "headlines" ? artifact.flexible_outline : artifact.modular_outline;
  return (
    <ol className="outline-list">
      {beats.map((beat, index) => (
        <li key={`${beat.priority}-${index}`}>
          <span className={`priority priority--${beat.priority}`}>{beat.priority.replaceAll("_", " ")}</span>
          <div><p>{beat.text}</p><CitationButtons ids={beat.source_ids} open={open} /></div>
          {beat.estimated_minutes !== undefined ? <time>{Number(beat.estimated_minutes.toFixed(1))}m</time> : null}
        </li>
      ))}
    </ol>
  );
}

function ArtifactWorkspace({
  artifact,
  receipt,
  error,
  running,
  onRetry,
  onFollowUp,
}: {
  artifact: BrowserArtifact | null;
  receipt: Phase6Receipt | null;
  error: Phase6Error | null;
  running: boolean;
  onRetry: () => void;
  onFollowUp: (instruction: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BrowserArtifact | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [instruction, setInstruction] = useState("");
  const shown = draft ?? artifact;
  const source = shown?.source_ledger.find((item) => item.source_id === sourceId);

  function beginEdit() {
    if (!artifact) return;
    setDraft(structuredClone(artifact));
    setEditing(true);
  }

  function updateTitle(value: string) {
    if (draft) setDraft({ ...draft, working_title: value });
  }

  async function copyMarkdown() {
    if (!shown) return;
    await navigator.clipboard.writeText(artifactToMarkdown(shown));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function submitFollowUp(event: FormEvent) {
    event.preventDefault();
    if (instruction.trim().length < 3) return;
    onFollowUp(instruction.trim());
    setInstruction("");
  }

  if (!shown) {
    return (
      <section className="artifact-workspace" aria-label="Preparation artifact">
        <header className="artifact-toolbar"><span className="eyebrow">PREP PACKET</span><span className="draft-state">WAITING</span></header>
        <div className="artifact-stage">
          {error ? (
            <div className="error-state" role="alert"><CircleAlert aria-hidden="true" /><h2>The run stopped safely.</h2><p>{error.message}</p>{error.retryable ? <button type="button" onClick={onRetry}><RotateCcw aria-hidden="true" /> Retry manually</button> : null}</div>
          ) : <div className="artifact-ghost"><FileText aria-hidden="true" /><h2>The prep packet lands here.</h2><p>Research stays visible on the left while the useful artifact takes over this workspace.</p></div>}
        </div>
      </section>
    );
  }

  const archive = shown.past_nonsense_coverage;
  return (
    <section className="artifact-workspace" aria-label="Preparation artifact">
      <header className="artifact-toolbar">
        <div><span className="eyebrow">PREP PACKET</span><span className="revision-label">REV {receipt?.revision ?? 1}</span></div>
        <div className="toolbar-actions">
          {editing ? <button type="button" onClick={() => setEditing(false)}><Check aria-hidden="true" /> Done</button> : <button type="button" onClick={beginEdit}><Pencil aria-hidden="true" /> Edit</button>}
          <button type="button" onClick={copyMarkdown}><Clipboard aria-hidden="true" /> {copied ? "Copied" : "Copy Markdown"}</button>
        </div>
      </header>
      <div className="artifact-scroll">
        {error ? (
          <div className="artifact-error-banner" role="alert">
            <CircleAlert aria-hidden="true" />
            <div><strong>The last action failed safely.</strong><span>{error.message} The prior valid packet is still shown below.</span></div>
            {error.retryable ? <button type="button" onClick={onRetry}><RotateCcw aria-hidden="true" /> Retry manually</button> : null}
          </div>
        ) : null}
        <article className="artifact-document">
          <div className="document-meta"><span>{shown.mode === "headlines" ? "HEADLINES" : "BIG STORY"}</span><span>{receipt?.status.toUpperCase() ?? "DRAFT"}</span></div>
          {editing ? <textarea className="title-editor" value={shown.working_title} onChange={(event) => updateTitle(event.target.value)} maxLength={240} aria-label="Working title" /> : <h1>{shown.working_title}</h1>}
          {shown.mode === "headlines" ? (
            <>
              <section><h2>What happened</h2><p>{shown.what_happened.text}</p><CitationButtons ids={shown.what_happened.source_ids} open={setSourceId} /></section>
              <section><h2>Why it matters now</h2><p>{shown.why_it_matters_now.text}</p><CitationButtons ids={shown.why_it_matters_now.source_ids} open={setSourceId} /></section>
              <section className="argument-block"><h2>The argument</h2><p>{shown.tension_or_argument.text}</p><CitationButtons ids={shown.tension_or_argument.source_ids} open={setSourceId} /></section>
            </>
          ) : (
            <>
              <section className="argument-block"><h2>Core question</h2><p>{shown.core_question}</p></section>
              <section><h2>Research brief</h2><p>{shown.research_brief.text}</p><CitationButtons ids={shown.research_brief.source_ids} open={setSourceId} /></section>
              <section><h2>Research cards</h2><div className="research-cards">{shown.research_cards.map((card, index) => <div key={`${card.role}-${index}`}><span>{card.role.replaceAll("_", " ")}</span><p>{card.text}</p><CitationButtons ids={card.source_ids} open={setSourceId} /></div>)}</div></section>
            </>
          )}
          <section><h2>{shown.mode === "headlines" ? "Flexible outline" : "Modular outline"}</h2><Outline artifact={shown} open={setSourceId} /></section>
          <section><h2>Conversation questions</h2><ul className="question-list">{shown.conversation_questions.map((question) => <li key={question}>{question}</li>)}</ul></section>
          <section><h2>Past Nonsense coverage</h2>{archive.status === "matches" ? archive.items.map((item) => <blockquote key={item.source_id}>{item.quote}<button type="button" onClick={() => setSourceId(item.source_id)}>{item.source_id}</button></blockquote>) : <p>No relevant archive match was found. No speaker attribution was invented.</p>}</section>
          <section className="open-checks"><h2>Open checks</h2><ul>{shown.uncertainties_and_open_checks.map((item) => <li key={item}>{item}</li>)}</ul></section>
          <section><div className="section-heading"><h2>Source ledger</h2><span>{shown.source_ledger.length} sources</span></div><div className="source-ledger">{shown.source_ledger.map((item) => <button type="button" key={item.source_id} onClick={() => setSourceId(item.source_id)}><span>{item.source_id}</span><div><strong>{item.title ?? item.source_type}</strong><small>{item.source_type.replaceAll("_", " ")} · {item.availability}</small></div><ChevronRight aria-hidden="true" /></button>)}</div></section>
        </article>
        <form className="follow-up" onSubmit={submitFollowUp}><label htmlFor="follow-up">Refine this packet</label><div><input id="follow-up" value={instruction} onChange={(event) => setInstruction(event.target.value)} maxLength={1200} placeholder="Make the argument sharper, cut repetition…" disabled={running} /><button type="submit" aria-label="Apply follow-up" disabled={running || instruction.trim().length < 3}><ArrowRight aria-hidden="true" /></button></div><small>Follow-ups restructure this evidence only; they do not research new claims.</small></form>
      </div>
      {source ? <aside className="source-drawer" aria-label="Source detail"><header><div><span className="eyebrow">SOURCE</span><strong>{source.source_id}</strong></div><button type="button" onClick={() => setSourceId(null)} aria-label="Close source"><X /></button></header><h2>{source.title ?? source.source_type}</h2><dl><div><dt>Type</dt><dd>{source.source_type.replaceAll("_", " ")}</dd></div><div><dt>Status</dt><dd>{source.availability}</dd></div>{source.season ? <div><dt>Archive</dt><dd>Season {source.season}, episode {source.episode_number}</dd></div> : null}</dl>{source.excerpt ? <blockquote>{source.excerpt}</blockquote> : <p>No excerpt is exposed for this source.</p>}{source.url ? <a href={source.url} target="_blank" rel="noreferrer">Open original <ExternalLink aria-hidden="true" /></a> : null}</aside> : null}
    </section>
  );
}

function SessionRail({ run, receipt }: { run: Phase6Run | null; receipt: Phase6Receipt | null }) {
  return (
    <aside className="session-rail" aria-label="Local session">
      <div className="brand"><span><Radio aria-hidden="true" /></span><div><strong>NONSENSE</strong><small>RESEARCH DESK</small></div></div>
      <nav><span className="nav-label">ON THE DESK</span><button className="session-row" type="button"><FileText aria-hidden="true" /><span><strong>{run?.mode === "big_story" ? "Big Story" : "Headlines"}</strong><small>Local session · {statusLabel(run).toLowerCase()}</small></span></button></nav>
      <div className="session-contract"><Archive aria-hidden="true" /><div><strong>Past conversations</strong><p>S3–4 archive search. No speaker labels or invented attribution.</p></div></div>
      <div className="cost-receipt"><span>RUN RECEIPT</span><strong>${(receipt?.accounted_cost_usd ?? 0).toFixed(4)}</strong><small>{receipt ? `${receipt.counts.web_searches} web · ${receipt.counts.transcript_searches} archive` : "No provider spend"}</small></div>
    </aside>
  );
}

export function ResearchHarness() {
  const [activities, setActivities] = useState<Phase6Activity[]>([]);
  const [artifact, setArtifact] = useState<BrowserArtifact | null>(null);
  const [run, setRun] = useState<Phase6Run | null>(null);
  const [receipt, setReceipt] = useState<Phase6Receipt | null>(null);
  const [error, setError] = useState<Phase6Error | null>(null);
  const [lastInput, setLastInput] = useState<Phase6Input>(DEFAULT_INPUT);
  const [mobilePanel, setMobilePanel] = useState<"activity" | "artifact">("artifact");

  const handleData = (part: { type: string; data: unknown }) => {
    if (part.type === "data-activity") {
      const activity = phase6ActivitySchema.parse(part.data);
      setActivities((current) => [...current.filter((item) => item.id !== activity.id), activity]);
    } else if (part.type === "data-artifact") {
      setArtifact(phase6ArtifactSchema.parse(part.data).artifact);
      setMobilePanel("artifact");
    } else if (part.type === "data-run") setRun(phase6RunSchema.parse(part.data));
    else if (part.type === "data-receipt") setReceipt(phase6ReceiptSchema.parse(part.data));
    else if (part.type === "data-error") {
      const nextError = phase6ErrorSchema.parse(part.data);
      setError(nextError);
      setRun((current) => current ? { ...current, state: "failed", summary: nextError.message } : current);
    }
  };

  const runtime = useChatRuntime<Phase6UIMessage>({ transport: PHASE6_TRANSPORT, onData: handleData, onError: () => setError({ code: "phase6_request_failed", message: "The connection ended safely. Use manual retry if you want to run it again.", retryable: true }) });
  const running = run?.state === "running";

  function send(request: Phase6Request) {
    setError(null);
    if (request.action !== "follow_up") {
      setActivities([]);
      setReceipt(null);
    }
    runtime.thread.append({ role: "user", content: [{ type: "text", text: JSON.stringify(request) }] });
  }

  function start(input: Phase6Input) {
    setLastInput(input);
    send({ action: "start", session_id: SESSION_ID, input });
  }

  function retry() {
    send({ action: "retry", session_id: SESSION_ID, input: lastInput });
  }

  function followUp(instruction: string) {
    send({ action: "follow_up", session_id: SESSION_ID, instruction });
  }

  function stop() {
    runtime.thread.cancelRun();
    setRun((current) => current ? { ...current, state: "stopped", summary: "Run stopped by you" } : current);
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="workbench">
        <SessionRail run={run} receipt={receipt} />
        <div className="mobile-switch" role="tablist" aria-label="Workbench panel"><button role="tab" aria-selected={mobilePanel === "activity"} onClick={() => setMobilePanel("activity")}>Activity <span>{activities.length}</span></button><button role="tab" aria-selected={mobilePanel === "artifact"} onClick={() => setMobilePanel("artifact")}>Artifact</button></div>
        <div className={mobilePanel === "activity" ? "mobile-active" : "mobile-hidden"}><ActivityRail activities={activities} run={run} /></div>
        <main className={mobilePanel === "artifact" ? "workspace-main mobile-active" : "workspace-main mobile-hidden"}>
          <header className="workbench-header"><div><span className="eyebrow">{lastInput.mode === "headlines" ? "HEADLINES" : "BIG STORY"}</span><strong>{lastInput.topic}</strong></div><div className="header-controls"><span className={`status-chip status-chip--${run?.state ?? "idle"}`}>{statusLabel(run)}</span>{running ? <button className="stop-button" type="button" onClick={stop}><Square aria-hidden="true" /> Stop</button> : run?.state === "stopped" || error?.retryable ? <button className="retry-button" type="button" onClick={retry}><RotateCcw aria-hidden="true" /> Retry</button> : null}</div></header>
          <div className="run-tape" aria-hidden="true"><span /><i className={running ? "is-running" : activities.length ? "is-done" : ""} /><span /></div>
          {artifact || error ? <ArtifactWorkspace key={receipt?.revision ?? 0} artifact={artifact} receipt={receipt} error={error} running={running} onRetry={retry} onFollowUp={followUp} /> : <div className="intake-stage"><Intake onStart={start} disabled={running} /></div>}
        </main>
      </div>
    </AssistantRuntimeProvider>
  );
}
