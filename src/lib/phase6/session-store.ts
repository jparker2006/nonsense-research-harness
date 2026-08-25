import type { Phase5RunResult } from "../phase5/contracts.ts";
import { PHASE_6_LIMITS } from "./contracts.ts";

export type Phase6Session = {
  session_id: string;
  result: Phase5RunResult;
  revision: number;
  updated_at_ms: number;
};

const sessions = new Map<string, Phase6Session>();

function prune(now = Date.now()) {
  for (const [id, session] of sessions) {
    if (now - session.updated_at_ms > PHASE_6_LIMITS.sessionTtlMs) sessions.delete(id);
  }
  while (sessions.size >= PHASE_6_LIMITS.maxSessions) {
    const oldest = [...sessions.values()].sort((a, b) => a.updated_at_ms - b.updated_at_ms)[0];
    if (!oldest) break;
    sessions.delete(oldest.session_id);
  }
}

export function getPhase6Session(id: string): Phase6Session | undefined {
  prune();
  return sessions.get(id);
}

export function putPhase6Session(session: Phase6Session): void {
  prune();
  const current = sessions.get(session.session_id);
  if (!session.result.artifact && current?.result.artifact) {
    sessions.set(session.session_id, { ...current, updated_at_ms: session.updated_at_ms });
    return;
  }
  sessions.set(session.session_id, session);
}

export function clearPhase6SessionsForTest(): void {
  if (process.env.NODE_ENV !== "test") throw new Error("phase6_test_only");
  sessions.clear();
}
