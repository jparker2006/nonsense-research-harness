import { PHASE_7A_LIMITS, phase7aWorkspaceSchema, type Phase7AWorkspace } from "./contracts.ts";

const workspaces = new Map<string, Phase7AWorkspace>();

function prune(now = Date.now()) {
  for (const [id, workspace] of workspaces) {
    if (now - workspace.updated_at_ms > PHASE_7A_LIMITS.sessionTtlMs) workspaces.delete(id);
  }
  while (workspaces.size >= PHASE_7A_LIMITS.maxSessions) {
    const oldest = [...workspaces.values()].sort((left, right) => left.updated_at_ms - right.updated_at_ms)[0];
    if (!oldest) break;
    workspaces.delete(oldest.session_id);
  }
}

export function createPhase7AWorkspace(sessionId: string, now = Date.now()): Phase7AWorkspace {
  return phase7aWorkspaceSchema.parse({
    session_id: sessionId,
    turns: [],
    agent_messages: [],
    evidence: [],
    candidates: [],
    transcript_matches: [],
    web_queries: [],
    archive_queries: [],
    research_state: null,
    run_traces: [],
    artifact: null,
    artifact_revision: 0,
    research_notebook: null,
    updated_at_ms: now,
  });
}

export function getPhase7AWorkspace(sessionId: string): Phase7AWorkspace | undefined {
  prune();
  const workspace = workspaces.get(sessionId);
  return workspace ? structuredClone(workspace) : undefined;
}

export function putPhase7AWorkspace(workspace: Phase7AWorkspace): void {
  prune();
  const parsed = phase7aWorkspaceSchema.parse(workspace);
  workspaces.set(parsed.session_id, structuredClone(parsed));
}

export function clearPhase7AWorkspacesForTest(): void {
  if (process.env.NODE_ENV !== "test") throw new Error("phase7a_test_only");
  workspaces.clear();
}
