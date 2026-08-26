import {
  ArrowLeft,
  ArrowRight,
  Bot,
  ChevronRight,
  CircleAlert,
  Clipboard,
  ExternalLink,
  FileText,
  LoaderCircle,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { BrowserArtifact, BrowserSource, Phase7AResearchDepth } from "@/lib/phase7a/client";
import type { ResearchExchange } from "@/lib/phase7a/client-state";
import { exchangeCreatedArtifact } from "@/lib/phase7a/client-state";
import {
  buildSourceReferences,
  groupObservableWork,
  humanizeMachineReferences,
  limitationLabel,
  outcomeLabel,
  referenceMap,
  referencesForArtifact,
  researchReceiptSummary,
  sourcePublisher,
  type SourceReference,
} from "@/lib/phase7a/presentation";

export const RESEARCH_STARTERS = [
  "Research this headline from the links I paste and tell me what is actually interesting.",
  "Search past Nonsense conversations for a topic and show me the strongest matches.",
  "Help me explore a possible Big Story. Ask what you need, then research it.",
];

export function AgentWork({ exchange }: { exchange: ResearchExchange }) {
  if (!exchange.run && exchange.activities.length === 0) {
    if (exchange.error) return null;
    return <div className="agent-pending" role="status"><LoaderCircle className="spin" aria-hidden="true" />Starting research…</div>;
  }
  const run = exchange.run;
  const groups = groupObservableWork(exchange.activities, run?.state === "running");
  const terminal = Boolean(run && run.state !== "running");
  return (
    <section className="agent-work" aria-label="Observable agent work">
      <span className="sr-only" aria-live="polite">{groups.find((group) => group.status === "running")?.label ?? outcomeLabel(run, exchange.receipt, exchange.activities, exchange.error)}</span>
      <div className="agent-work-list">
        {groups.map((group) => (
          <details className={`work-line work-line--${group.status}`} key={group.id} open={["failed", "unavailable", "stopped"].includes(group.status) || undefined}>
            <summary>
              <span className={group.status === "running" ? "work-line-label work-line-label--active" : "work-line-label"} data-label={group.status === "running" ? group.label : undefined}>{group.label}</span>
              {group.status === "failed" || group.status === "unavailable" || group.status === "stopped" ? <span className="work-line-status">{group.status}</span> : null}
              <ChevronRight aria-hidden="true" />
            </summary>
            <p>{group.detail || "No additional public detail."}</p>
          </details>
        ))}
      </div>
      {terminal && exchange.receipt ? <div className="agent-work-summary">{researchReceiptSummary(exchange.receipt)}</div> : null}
      {exchange.receipt?.limitations.length ? (
        <details className="agent-limitations"><summary>Limitations · {exchange.receipt.limitations.length}</summary><ul>{exchange.receipt.limitations.map((item) => <li key={item}>{limitationLabel(item)}</li>)}</ul></details>
      ) : null}
    </section>
  );
}

function CitationButtons({ ids, references, open }: { ids: string[]; references: SourceReference[]; open: (id: string, references: SourceReference[]) => void }) {
  if (!ids.length) return null;
  const map = referenceMap(references);
  return (
    <span className="citation-row">
      {[...new Set(ids)].map((id) => {
        const reference = map.get(id);
        if (!reference) return null;
        return <button type="button" title={reference.accessible_label} aria-label={reference.accessible_label} onClick={() => open(id, references)} key={id}>[{reference.number}] {reference.publisher}</button>;
      })}
    </span>
  );
}

function SourcedList({ items, references, open }: { items: Array<{ text: string; source_ids: string[] }>; references: SourceReference[]; open: (id: string, references: SourceReference[]) => void }) {
  return <ul className="fact-list">{items.map((item, index) => <li key={`${item.text}-${index}`}><p>{humanizeMachineReferences(item.text, references)}</p><CitationButtons ids={item.source_ids} references={references} open={open} /></li>)}</ul>;
}

function Outline({ artifact, references, open }: { artifact: BrowserArtifact; references: SourceReference[]; open: (id: string, references: SourceReference[]) => void }) {
  const beats = artifact.mode === "headlines" ? artifact.flexible_outline : artifact.modular_outline;
  return (
    <ol className="outline-list">
      {beats.map((beat, index) => (
        <li key={`${beat.priority}-${index}`}>
          <span className={`priority priority--${beat.priority}`}>{beat.priority.replaceAll("_", " ")}</span>
          <div><p>{humanizeMachineReferences(beat.text, references)}</p><CitationButtons ids={beat.source_ids} references={references} open={open} /></div>
        </li>
      ))}
    </ol>
  );
}

function ReferenceList({ references, open }: { references: SourceReference[]; open: (id: string, references: SourceReference[]) => void }) {
  return (
    <ol className="reference-list">
      {references.map((reference) => (
        <li key={reference.source_id}>
          <button type="button" onClick={() => open(reference.source_id, references)} aria-label={`Inspect ${reference.accessible_label}`}>
            <span>[{reference.number}]</span>
            <div><strong>{reference.title}</strong><small>{reference.publisher} · {reference.source.availability.replaceAll("_", " ")}</small></div>
            <ChevronRight aria-hidden="true" />
          </button>
          {reference.url ? <a href={reference.url} target="_blank" rel="noreferrer" aria-label={`Open ${reference.title} in a new tab`}><ExternalLink aria-hidden="true" /></a> : null}
        </li>
      ))}
    </ol>
  );
}

export function ArtifactContent({ artifact, sources, openSource, expanded = false }: { artifact: BrowserArtifact; sources: Record<string, BrowserSource>; openSource: (id: string, references: SourceReference[]) => void; expanded?: boolean }) {
  const references = referencesForArtifact(artifact, sources);
  const readable = (text: string) => humanizeMachineReferences(text, references);
  const archive = artifact.past_nonsense_coverage;
  const bigStoryInterpretation = artifact.mode === "big_story" ? artifact.research_cards.find((card) => card.role === "interpretation") : null;
  const archiveContent = archive.status === "matches" ? archive.items.map((item) => {
    const reference = referenceMap(references).get(item.source_id);
    return <blockquote key={item.source_id}><p>{readable(item.quote)}</p>{reference ? <button type="button" onClick={() => openSource(item.source_id, references)}>[{reference.number}] {reference.publisher} · {reference.title}</button> : null}</blockquote>;
  }) : <p>No relevant archive match was found. No speaker attribution was invented.</p>;
  return (
    <div className="artifact-content">
      {artifact.mode === "headlines" ? (
        <>
          <section><h2>What happened</h2><p>{readable(artifact.what_happened.text)}</p><CitationButtons ids={artifact.what_happened.source_ids} references={references} open={openSource} /></section>
          <section><h2>Why it matters now</h2><p>{readable(artifact.why_it_matters_now.text)}</p><CitationButtons ids={artifact.why_it_matters_now.source_ids} references={references} open={openSource} /></section>
          <section className="argument-block"><h2>The argument</h2><p>{readable(artifact.tension_or_argument.text)}</p><CitationButtons ids={artifact.tension_or_argument.source_ids} references={references} open={openSource} /></section>
        </>
      ) : (
        <>
          <section className="argument-block"><h2>Core question</h2><p>{readable(artifact.core_question)}</p></section>
          <section><h2>Research brief</h2><p>{readable(artifact.research_brief.text)}</p><CitationButtons ids={artifact.research_brief.source_ids} references={references} open={openSource} /></section>
          {bigStoryInterpretation ? <section className="argument-block"><h2>Key interpretation</h2><p>{readable(bigStoryInterpretation.text)}</p><CitationButtons ids={bigStoryInterpretation.source_ids} references={references} open={openSource} /></section> : null}
        </>
      )}
      <section><h2>Editorial priorities</h2><Outline artifact={artifact} references={references} open={openSource} /></section>
      <section><h2>Conversation questions</h2><ul className="question-list">{artifact.conversation_questions.map((question) => <li key={question}>{readable(question)}</li>)}</ul></section>
      <details className="packet-details supporting-research" open={expanded || undefined}>
        <summary>Supporting research <span>{artifact.mode === "headlines" ? artifact.verified_facts.length + artifact.surprising_details.length + archive.items.length : artifact.research_cards.length + archive.items.length}</span></summary>
        <div className="supporting-research-content">
          {artifact.mode === "headlines" ? <><section><h2>Verified facts</h2><SourcedList items={artifact.verified_facts} references={references} open={openSource} /></section><section><h2>Surprising details</h2><SourcedList items={artifact.surprising_details} references={references} open={openSource} /></section></> : <section><h2>Research cards</h2><div className="research-cards">{artifact.research_cards.map((card, index) => <div key={`${card.role}-${index}`}><span>{card.role.replaceAll("_", " ")}</span><p>{readable(card.text)}</p><CitationButtons ids={card.source_ids} references={references} open={openSource} /></div>)}</div></section>}
          <section><h2>Past Nonsense coverage</h2>{archiveContent}</section>
        </div>
      </details>
      <details className="packet-details open-checks" open={expanded || undefined}><summary>Open checks <span>{artifact.uncertainties_and_open_checks.length}</span></summary><ul>{artifact.uncertainties_and_open_checks.map((item) => <li key={item}>{readable(item)}</li>)}</ul></details>
      <details className="packet-details references"><summary>References <span>{references.length}</span></summary><ReferenceList references={references} open={openSource} /></details>
    </div>
  );
}

export function ArtifactAnswer({ exchange, sources, openSource, focus, copy, copied }: { exchange: ResearchExchange; sources: Record<string, BrowserSource>; openSource: (id: string, references: SourceReference[]) => void; focus: () => void; copy: () => void; copied: boolean }) {
  if (!exchange.artifact) return null;
  const { artifact, revision } = exchange.artifact;
  return (
    <article className="assistant-answer artifact-answer" aria-label="Nonsense prep packet" data-answer-id={exchange.artifact.run_id}>
      <header className="answer-heading">
        <span className="chat-avatar"><Bot aria-hidden="true" /></span>
        <div><span className="chat-role">Nonsense agent</span><span className="document-kicker">{artifact.mode === "headlines" ? "Headlines prep packet" : "Big Story prep packet"} · revision {revision}</span></div>
      </header>
      <div className="answer-document">
        <div className="answer-title-row"><h1>{artifact.working_title}</h1><div className="answer-actions"><button type="button" onClick={copy}><Clipboard aria-hidden="true" />{copied ? "Copied" : "Copy"}</button><button type="button" onClick={focus}><FileText aria-hidden="true" />Focus</button></div></div>
        <ArtifactContent artifact={artifact} sources={sources} openSource={openSource} />
      </div>
    </article>
  );
}

function AssistantMessage({ exchange, references, openSource }: { exchange: ResearchExchange; references: SourceReference[]; openSource: (id: string, references: SourceReference[]) => void }) {
  if (!exchange.assistant) return null;
  return (
    <article className="assistant-answer assistant-message" data-answer-id={exchange.assistant.run_id}>
      <header className="answer-heading"><span className="chat-avatar"><Bot aria-hidden="true" /></span><div><span className="chat-role">Nonsense agent</span></div></header>
      <div className="assistant-prose">
        {exchange.assistant.blocks.map((block, index) => <div className="assistant-block" key={`${exchange.assistant!.message_id}-${index}`}><p>{humanizeMachineReferences(block.text, references)}</p><CitationButtons ids={block.source_ids} references={references} open={openSource} /></div>)}
        {references.length ? <details className="answer-references"><summary>Sources <span>{references.length}</span></summary><ReferenceList references={references} open={openSource} /></details> : null}
      </div>
    </article>
  );
}

export function ConversationThread({ exchanges, sources, draft, setDraft, researchDepth, setResearchDepth, send, running, openSource, focusArtifact, copyArtifact, copiedExchangeId }: {
  exchanges: ResearchExchange[];
  sources: Record<string, BrowserSource>;
  draft: string;
  setDraft: (value: string) => void;
  researchDepth: Phase7AResearchDepth;
  setResearchDepth: (value: Phase7AResearchDepth) => void;
  send: (message: string, researchDepth: Phase7AResearchDepth) => void;
  running: boolean;
  openSource: (id: string, references: SourceReference[]) => void;
  focusArtifact: (localId: string) => void;
  copyArtifact: (exchange: ResearchExchange) => void;
  copiedExchangeId: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const positionedAnswer = useRef<string | null>(null);
  const observedStreamVersion = useRef<string | null>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const [newContentBelow, setNewContentBelow] = useState(false);
  const latest = exchanges.at(-1);
  const answerKey = latest?.artifact?.run_id ?? latest?.assistant?.run_id ?? null;
  const streamVersion = exchanges.map((exchange) => [
    exchange.local_id,
    exchange.run?.state,
    exchange.activities.map((item) => `${item.id}:${item.status}:${item.detail}`).join("|"),
    exchange.assistant?.message_id,
    exchange.artifact?.revision,
    exchange.error?.code,
  ].join(":")).join(";");

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const hasNewContent = observedStreamVersion.current !== null && observedStreamVersion.current !== streamVersion;
    observedStreamVersion.current = streamVersion;
    if (!autoFollow) {
      if (hasNewContent) setNewContentBelow(true);
      return;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = window.requestAnimationFrame(() => {
      if (answerKey && positionedAnswer.current !== answerKey) {
        const answer = [...container.querySelectorAll<HTMLElement>("[data-answer-id]")]
          .find((candidate) => candidate.dataset.answerId === answerKey);
        if (answer) {
          answer.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
          positionedAnswer.current = answerKey;
          setNewContentBelow(false);
          return;
        }
      }
      container.scrollTo({ top: container.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
      setNewContentBelow(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [answerKey, autoFollow, streamVersion]);

  function handleScroll() {
    const container = scrollRef.current;
    if (!container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 120;
    setAutoFollow(nearBottom);
    if (nearBottom) setNewContentBelow(false);
  }

  function jumpToLatest() {
    const container = scrollRef.current;
    if (!container) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setAutoFollow(true);
    setNewContentBelow(false);
    container.scrollTo({ top: container.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || running) return;
    setAutoFollow(true);
    setNewContentBelow(false);
    send(draft.trim(), researchDepth);
    setDraft("");
  }
  return (
    <section className="conversation" aria-label="Research conversation">
      <div className="conversation-scroll" ref={scrollRef} onScroll={handleScroll}>
        {!exchanges.length ? (
          <div className="chat-empty">
            <h1>What are we looking into?</h1>
            <p>Bring a topic, links, rough notes, or a half-formed question. The agent can research the current web, search old episodes, and make a prep packet when you ask.</p>
            <div className="starter-list">{RESEARCH_STARTERS.map((starter) => <button type="button" key={starter} onClick={() => setDraft(starter)}>{starter}<ArrowRight aria-hidden="true" /></button>)}</div>
          </div>
        ) : (
          <ol className="chat-exchanges">
            {exchanges.map((exchange) => {
              const createdArtifact = exchangeCreatedArtifact(exchange);
              const references = exchange.artifact
                ? referencesForArtifact(exchange.artifact.artifact, sources)
                : buildSourceReferences(exchange.assistant?.source_ids ?? [], sources);
              return (
                <li className="chat-exchange" key={exchange.local_id}>
                  <article className="chat-turn chat-turn--user"><span className="chat-avatar"><UserRound aria-hidden="true" /></span><div><span className="chat-role">You{exchange.user.research_depth === "deep" ? <span className="deep-research-badge">Deep research</span> : null}</span><p>{exchange.user.text}</p></div></article>
                  <AgentWork exchange={exchange} />
                  {exchange.error ? <div className="chat-error" role="alert"><CircleAlert aria-hidden="true" /><div><strong>Research stopped before completion.</strong><p>{exchange.error.message}</p><small>No automatic retry was started. Send a follow-up when you want to continue.</small></div></div> : null}
                  {createdArtifact ? <ArtifactAnswer exchange={exchange} sources={sources} openSource={openSource} focus={() => focusArtifact(exchange.local_id)} copy={() => copyArtifact(exchange)} copied={copiedExchangeId === exchange.local_id} /> : <AssistantMessage exchange={exchange} references={references} openSource={openSource} />}
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {newContentBelow ? <button className="jump-to-latest" type="button" onClick={jumpToLatest}>Jump to latest <ArrowRight aria-hidden="true" /></button> : null}
      <form className="chat-composer" onSubmit={submit}>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} maxLength={12_000} rows={3} placeholder="Ask a question, paste links, or request a Headlines / Big Story packet…" disabled={running} aria-label="Message the research agent" />
        <div className="composer-controls"><div><button className="deep-research-toggle" type="button" aria-pressed={researchDepth === "deep"} disabled={running} onClick={() => setResearchDepth(researchDepth === "deep" ? "standard" : "deep")}><Search aria-hidden="true" />Deep research</button><small>Enter to send · Shift + Enter for a new line</small></div><button className="send-button" type="submit" disabled={running || !draft.trim()} aria-label="Send message">{running ? <LoaderCircle className="spin" /> : <ArrowRight />}</button></div>
      </form>
    </section>
  );
}

export function FocusArtifactView({ exchange, sources, openSource, back, copy, copied }: { exchange: ResearchExchange; sources: Record<string, BrowserSource>; openSource: (id: string, references: SourceReference[]) => void; back: () => void; copy: () => void; copied: boolean }) {
  if (!exchange.artifact) return null;
  const artifact = exchange.artifact.artifact;
  return (
    <section className="artifact-workspace" aria-label="Focused preparation artifact">
      <header className="artifact-toolbar"><div><button className="back-to-chat" type="button" onClick={back}><ArrowLeft aria-hidden="true" />Chat</button><span className="eyebrow">PREP PACKET</span><span className="revision-label">REV {exchange.artifact.revision}</span></div><div className="toolbar-actions"><button type="button" onClick={copy}><Clipboard aria-hidden="true" />{copied ? "Copied" : "Copy Markdown"}</button></div></header>
      <div className="artifact-scroll"><article className="artifact-document"><div className="document-meta"><span>{artifact.mode === "headlines" ? "HEADLINES" : "BIG STORY"}</span><span>{outcomeLabel(exchange.run, exchange.receipt, exchange.activities)}</span></div><h1>{artifact.working_title}</h1><ArtifactContent artifact={artifact} sources={sources} openSource={openSource} expanded /></article></div>
    </section>
  );
}

export function SourceDrawer({ source, reference, close }: { source: BrowserSource; reference: SourceReference | null; close: () => void }) {
  const label = reference ? `[${reference.number}] ${reference.publisher}` : sourcePublisher(source);
  return (
    <div className="source-overlay" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) close(); }}>
      <aside className="source-drawer" role="dialog" aria-modal="true" aria-labelledby="source-drawer-title">
        <header><div><span className="eyebrow">SOURCE</span><strong>{label}</strong></div><button type="button" onClick={close} aria-label="Close source" autoFocus><X aria-hidden="true" /></button></header>
        <h2 id="source-drawer-title">{source.title ?? (source.source_type === "archive" ? "Nonsense episode" : "Web source")}</h2>
        <dl><div><dt>Type</dt><dd>{source.source_type.replaceAll("_", " ")}</dd></div><div><dt>Status</dt><dd>{source.availability.replaceAll("_", " ")}</dd></div>{source.season ? <div><dt>Archive</dt><dd>Season {source.season}{source.episode_number ? `, episode ${source.episode_number}` : ""}</dd></div> : null}</dl>
        {source.excerpt ? <blockquote>{source.excerpt}</blockquote> : <p>No bounded excerpt is available for this source.</p>}
        {source.url ? <a href={source.url} target="_blank" rel="noreferrer">Open original <ExternalLink aria-hidden="true" /></a> : null}
      </aside>
    </div>
  );
}
