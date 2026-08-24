"use client";

import {
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import {
  Archive,
  ArrowUp,
  Check,
  ChevronDown,
  CircleAlert,
  FileSearch,
  Link2,
  LoaderCircle,
  MessageSquareText,
  Plus,
  Radio,
  Search,
  Square,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type {
  ActivityEvent,
  MockArtifact,
  NonsenseUIMessage,
  RunEvent,
} from "@/lib/mock-run";

const TOOL_LABELS: Record<string, string> = {
  read_url: "Read source",
  web_search: "Search the web",
  search_transcripts: "Search the archive",
};

const ActivityTool: ToolCallMessagePartComponent = ({
  toolName,
  args,
  argsText,
  result,
  status,
}) => {
  const running = status.type === "running";
  const failed = status.type === "incomplete";
  const label = TOOL_LABELS[toolName] ?? toolName;

  return (
    <details className={`tool-card ${failed ? "tool-card--error" : ""}`} open={running || failed}>
      <summary>
        <span className="tool-icon" aria-hidden="true">
          {running ? <LoaderCircle className="spin" /> : failed ? <CircleAlert /> : <Check />}
        </span>
        <span className="tool-name">{label}</span>
        <span className={`tool-status tool-status--${failed ? "error" : running ? "running" : "complete"}`}>
          {failed ? "unavailable" : running ? "working" : "complete"}
        </span>
        <ChevronDown className="tool-chevron" aria-hidden="true" />
      </summary>
      <div className="tool-details">
        <div>
          <span>Safe input</span>
          <pre>{argsText || JSON.stringify(args, null, 2)}</pre>
        </div>
        {result !== undefined ? (
          <div>
            <span>Result</span>
            <pre>{typeof result === "string" ? result : JSON.stringify(result, null, 2)}</pre>
          </div>
        ) : null}
        {failed ? (
          <p className="tool-error-copy">
            {status.reason === "error" ? String(status.error ?? "The source was unavailable.") : "The tool did not finish."}
          </p>
        ) : null}
      </div>
    </details>
  );
};

const UserMessage = () => (
  <MessagePrimitive.Root className="user-turn">
    <span className="turn-label">YOU</span>
    <MessagePrimitive.Parts />
  </MessagePrimitive.Root>
);

const AssistantMessage = () => (
  <MessagePrimitive.Root className="assistant-turn">
    <span className="turn-label">RESEARCH DESK</span>
    <MessagePrimitive.Parts
      components={{
        Text: ({ text }) => <p className="assistant-copy">{text}</p>,
        tools: { Fallback: ActivityTool },
        data: {
          by_name: {
            activity: () => null,
            artifact: () => null,
            run: () => null,
          },
        },
      }}
    />
  </MessagePrimitive.Root>
);

function Composer() {
  return (
    <ComposerPrimitive.Root className="composer">
      <ComposerPrimitive.Input
        className="composer-input"
        aria-label="Research request"
        placeholder="Give the desk a topic, link, or rough note…"
      />
      <AuiIf condition={(state) => !state.thread.isRunning}>
        <ComposerPrimitive.Send className="composer-action" aria-label="Start research">
          <ArrowUp />
        </ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf condition={(state) => state.thread.isRunning}>
        <ComposerPrimitive.Cancel className="composer-action composer-action--stop" aria-label="Stop research">
          <Square />
        </ComposerPrimitive.Cancel>
      </AuiIf>
    </ComposerPrimitive.Root>
  );
}

function ArtifactPanel({ artifact }: { artifact: MockArtifact | null }) {
  return (
    <aside className="artifact-panel" aria-label="Research artifact">
      <header className="panel-header artifact-header">
        <div>
          <span className="eyebrow">OUTPUT</span>
          <h2>Rundown</h2>
        </div>
        <span className="editable-badge">editable</span>
      </header>
      {artifact ? (
        <article className="artifact-sheet" contentEditable suppressContentEditableWarning spellCheck>
          <div className="artifact-kicker">HEADLINES · WORKING DRAFT</div>
          <h3>{artifact.title}</h3>
          <section>
            <h4>What happened</h4>
            <p>{artifact.setup}</p>
          </section>
          <section className="tension-block">
            <h4>The argument</h4>
            <p>{artifact.tension}</p>
          </section>
          <section>
            <h4>Flexible outline</h4>
            <ol className="beat-list">
              {artifact.beats.map((beat, index) => (
                <li key={`${beat.priority}-${index}`}>
                  <span className={`priority priority--${beat.priority}`}>{beat.priority.replaceAll("_", " ")}</span>
                  <p>{beat.text}</p>
                  <span className="citations">{beat.sourceIds.join(" · ")}</span>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h4>Past Nonsense coverage</h4>
            <p>{artifact.archiveNote}</p>
          </section>
          <section className="open-check">
            <h4>Open check</h4>
            <p>{artifact.openCheck}</p>
          </section>
          <section>
            <h4>Sources</h4>
            <div className="source-list">
              {artifact.sources.map((source) => (
                <div className="source-row" key={source.id}>
                  <span>{source.id}</span>
                  <div>
                    <strong>{source.label}</strong>
                    <small>{source.note}</small>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </article>
      ) : (
        <div className="artifact-empty">
          <MessageSquareText aria-hidden="true" />
          <h3>The outline lands here.</h3>
          <p>Run the fixture to prove that streamed research can fill a separate, editable artifact.</p>
        </div>
      )}
    </aside>
  );
}

function WorkspaceSidebar() {
  return (
    <aside className="workspace-sidebar" aria-label="Workspaces">
      <div className="brand-lockup">
        <div className="brand-mark"><Radio aria-hidden="true" /></div>
        <div>
          <strong>NONSENSE</strong>
          <span>RESEARCH DESK</span>
        </div>
      </div>
      <button className="new-story" type="button" disabled title="Workspace creation arrives after the stack spike">
        <Plus aria-hidden="true" /> New story
      </button>
      <nav aria-label="Recent workspaces">
        <span className="nav-label">ON THE DESK</span>
        <button className="workspace-row workspace-row--active" type="button">
          <FileSearch aria-hidden="true" />
          <span><strong>Legacy tech</strong><small>Headlines · mock</small></span>
        </button>
        <button className="workspace-row" type="button" disabled>
          <Archive aria-hidden="true" />
          <span><strong>Platform decay</strong><small>Big Story · sample</small></span>
        </button>
      </nav>
      <div className="sidebar-note">
        <span>PHASE 1</span>
        <p>Local fixture only. No provider key, model call, transcript read, or spend.</p>
      </div>
    </aside>
  );
}

export function ResearchHarness() {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [artifact, setArtifact] = useState<MockArtifact | null>(null);
  const [run, setRun] = useState<RunEvent | null>(null);

  const handleData = useCallback((part: { type: string; data: unknown }) => {
    if (part.type === "data-activity") {
      const activity = part.data as ActivityEvent;
      setActivities((current) => {
        const next = current.filter((item) => item.id !== activity.id);
        return [...next, activity];
      });
    }
    if (part.type === "data-artifact") setArtifact(part.data as MockArtifact);
    if (part.type === "data-run") setRun(part.data as RunEvent);
  }, []);

  const runtime = useChatRuntime<NonsenseUIMessage>({ onData: handleData });
  const completedCount = useMemo(
    () => activities.filter((activity) => activity.status !== "running").length,
    [activities],
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="app-shell">
        <WorkspaceSidebar />
        <main className="research-console">
          <header className="console-header">
            <div>
              <span className="eyebrow">HEADLINES WORKSPACE</span>
              <h1>When old technology refuses to die</h1>
            </div>
            <div className="run-receipt" aria-live="polite">
              <span className={run?.state === "run_started" ? "live-dot live-dot--running" : "live-dot"} />
              <div><strong>{run?.state === "run_started" ? "RUNNING" : run?.state === "run_completed" ? "READY" : "LOCAL MOCK"}</strong><small>$0.00 · {completedCount}/3 tools</small></div>
            </div>
          </header>
          <div className="tape-strip" aria-label="Run status">
            <span>RUN TAPE</span>
            <div className="tape-line">
              {[0, 1, 2].map((index) => {
                const activity = activities[index];
                return <i key={index} className={activity ? `tape-stop tape-stop--${activity.status}` : "tape-stop"} />;
              })}
            </div>
            <span>{run?.summary ?? "Standing by"}</span>
          </div>
          <ThreadPrimitive.Root className="thread-root">
            <ThreadPrimitive.Viewport className="thread-viewport" turnAnchor="top">
              <AuiIf condition={(state) => state.thread.isEmpty}>
                <section className="welcome-state">
                  <span className="welcome-icon"><Search aria-hidden="true" /></span>
                  <p className="eyebrow">DETERMINISTIC STACK TEST</p>
                  <h2>Watch the desk work before we give it a brain.</h2>
                  <p>This fixture streams successful tools, a safe failure, a written summary, and an editable rundown through the production UI path.</p>
                  <ThreadPrimitive.Suggestion
                    className="fixture-button"
                    prompt="Research this sample headline and build a flexible outline."
                    send
                  >
                    <Radio aria-hidden="true" /> Run the $0 fixture
                  </ThreadPrimitive.Suggestion>
                  <div className="fixture-contract">
                    <span><Link2 aria-hidden="true" /> supplied link</span>
                    <span><Archive aria-hidden="true" /> transcript search</span>
                    <span><CircleAlert aria-hidden="true" /> honest failure</span>
                  </div>
                </section>
              </AuiIf>
              <ThreadPrimitive.Messages
                components={{ UserMessage, AssistantMessage }}
              />
              <ThreadPrimitive.ViewportFooter className="composer-dock">
                <Composer />
                <p>Phase 1 uses fixtures only. Output is not research.</p>
              </ThreadPrimitive.ViewportFooter>
            </ThreadPrimitive.Viewport>
          </ThreadPrimitive.Root>
        </main>
        <ArtifactPanel artifact={artifact} />
      </div>
    </AssistantRuntimeProvider>
  );
}
