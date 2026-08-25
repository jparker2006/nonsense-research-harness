const SESSION_ID_PREFIX = "session_phase7a_";

export function createPhase7ABrowserSessionId(
  randomUuid: () => string = () => globalThis.crypto.randomUUID(),
): string {
  const entropy = randomUuid().replaceAll("-", "").toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(entropy)) throw new Error("phase7a_invalid_session_entropy");
  return `${SESSION_ID_PREFIX}${entropy}`;
}

export function getOrCreatePhase7ABrowserSessionId(
  holder: { current: string | null },
  create: () => string = createPhase7ABrowserSessionId,
): string {
  holder.current ??= create();
  return holder.current;
}
