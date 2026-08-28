import { RESEARCH_LIMITS, researchWorkspaceSchema, type ResearchWorkspace } from "./contracts.ts";

const workspaces = new Map<string, ResearchWorkspace>();

function prune(now = Date.now()) {
  for (const [id, workspace] of workspaces) {
    if (now - workspace.updated_at_ms > RESEARCH_LIMITS.sessionTtlMs) workspaces.delete(id);
  }
  while (workspaces.size >= RESEARCH_LIMITS.maxSessions) {
    const oldest = [...workspaces.values()].sort((left, right) => left.updated_at_ms - right.updated_at_ms)[0];
    if (!oldest) break;
    workspaces.delete(oldest.session_id);
  }
}

export function createResearchWorkspace(sessionId: string, now = Date.now()): ResearchWorkspace {
  return researchWorkspaceSchema.parse({
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
    updated_at_ms: now,
  });
}

export function getResearchWorkspace(sessionId: string): ResearchWorkspace | undefined {
  prune();
  const workspace = workspaces.get(sessionId);
  return workspace ? structuredClone(workspace) : undefined;
}

export function putResearchWorkspace(workspace: ResearchWorkspace): void {
  prune();
  const parsed = researchWorkspaceSchema.parse(workspace);
  workspaces.set(parsed.session_id, structuredClone(parsed));
}

export function clearResearchWorkspacesForTest(): void {
  if (process.env.NODE_ENV !== "test") throw new Error("research_test_only");
  workspaces.clear();
}
