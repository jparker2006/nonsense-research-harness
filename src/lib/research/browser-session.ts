export function createResearchBrowserSessionId(
  randomUuid: () => string = () => globalThis.crypto.randomUUID(),
): string {
  const value = randomUuid().toLowerCase();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)) {
    throw new Error("research_invalid_session_id");
  }
  return value;
}

export function getOrCreateResearchBrowserSessionId(
  holder: { current: string | null },
  create: () => string = createResearchBrowserSessionId,
): string {
  holder.current ??= create();
  return holder.current;
}
