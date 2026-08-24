import { Mastra } from "@mastra/core";
import { InMemoryStore } from "@mastra/core/storage";

/**
 * Phase 1 compatibility probe. Importing this from the Next.js route makes
 * Mastra part of the real server bundle without configuring or calling a model.
 */
export const mastraSpike = new Mastra({
  storage: new InMemoryStore({ id: "phase-1-spike" }),
});

export const mastraRuntimeName =
  mastraSpike instanceof Mastra ? "Mastra 1.61.0" : "unavailable";
