"use client";

import { Menu, Plus, Trash2, X } from "lucide-react";
import type { ResearchThreadMetadata } from "@/lib/threads/contracts";

function updatedLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved research";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export function HistoryButton({ open, disabled }: { open: () => void; disabled: boolean }) {
  return <button className="history-button" type="button" onClick={open} disabled={disabled} aria-label="Open research history"><Menu aria-hidden="true" /><span>History</span></button>;
}

export function ResearchHistory({
  threads,
  activeThreadId,
  close,
  drawerOpen,
  newResearch,
  openThread,
  requestDelete,
  confirmDeleteId,
  confirmDelete,
  cancelDelete,
  running,
  loading,
  warning,
}: {
  threads: ResearchThreadMetadata[];
  activeThreadId: string | null;
  close: () => void;
  drawerOpen: boolean;
  newResearch: () => void;
  openThread: (id: string) => void;
  requestDelete: (id: string) => void;
  confirmDeleteId: string | null;
  confirmDelete: (id: string) => void;
  cancelDelete: () => void;
  running: boolean;
  loading: boolean;
  warning: string | null;
}) {
  return (
    <>
      {drawerOpen ? <button className="history-backdrop" type="button" aria-label="Close research history" onClick={close} /> : null}
      <aside className={`research-history${drawerOpen ? " research-history--open" : ""}`} aria-label="Research history">
        <header className="history-header">
          <strong>Research</strong>
          <button className="history-close" type="button" onClick={close} aria-label="Close research history"><X aria-hidden="true" /></button>
        </header>
        <button className="history-new" type="button" onClick={newResearch} disabled={running}><Plus aria-hidden="true" />New research</button>
        {warning ? <p className="history-warning" role="status">{warning}</p> : null}
        <div className="history-section-heading"><span>Recent</span>{loading ? <small>Loading…</small> : null}</div>
        <nav className="history-list" aria-label="Recent research threads">
          {!loading && !threads.length ? <p className="history-empty">Your saved research will appear here.</p> : null}
          {threads.map((thread) => (
            <div className={`history-item${activeThreadId === thread.id ? " history-item--active" : ""}`} key={thread.id}>
              <button className="history-open" type="button" onClick={() => openThread(thread.id)} disabled={running} aria-current={activeThreadId === thread.id ? "page" : undefined}>
                <span>{thread.title}</span><small>{updatedLabel(thread.updated_at)}</small>
              </button>
              {confirmDeleteId === thread.id ? (
                <div className="history-confirm" role="group" aria-label={`Delete ${thread.title}?`}>
                  <span>Delete?</span>
                  <button type="button" onClick={() => confirmDelete(thread.id)} disabled={running}>Yes</button>
                  <button type="button" onClick={cancelDelete}>No</button>
                </div>
              ) : (
                <button className="history-delete" type="button" onClick={() => requestDelete(thread.id)} disabled={running} aria-label={`Delete ${thread.title}`}><Trash2 aria-hidden="true" /></button>
              )}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
