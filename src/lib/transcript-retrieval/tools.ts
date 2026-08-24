import "server-only";
import { TranscriptRetrievalService, createOpenRouterTranscriptProvider } from "./search.ts";
import type { TranscriptSearchFilters } from "./types.ts";

let service: TranscriptRetrievalService | undefined;

function getService(): TranscriptRetrievalService {
  if (service) return service;
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const provider = apiKey && process.env.PHASE3_EXECUTE_LIVE === "approved"
    ? createOpenRouterTranscriptProvider(apiKey)
    : undefined;
  service = new TranscriptRetrievalService({ provider });
  return service;
}

export async function search_transcripts(input: {
  query: string;
  filters?: TranscriptSearchFilters;
  limit?: number;
}) {
  return getService().searchTranscripts(input);
}

export function open_transcript_chunk(input: { chunk_id: string }) {
  const chunkId = input.chunk_id.trim();
  if (!chunkId || chunkId.length > 160) {
    return { status: "not_found" as const, chunk_id: chunkId };
  }
  return getService().openTranscriptChunk(chunkId);
}
