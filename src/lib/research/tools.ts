import "server-only";

import { failedPageRecord } from "../web-research/contracts.ts";
import { readUrl } from "../web-research/read-url.ts";
import { webSearch } from "../web-research/web-search.ts";
import {
  TranscriptRetrievalService,
  createOpenRouterTranscriptProvider,
} from "../transcript-retrieval/search.ts";
import type { ProviderReceipt } from "../transcript-retrieval/providers.ts";
import type { TranscriptSearchFilters, TranscriptSearchResult } from "../transcript-retrieval/types.ts";
import type { OpenTranscriptChunkResult } from "../transcript-retrieval/types.ts";
import type { WebSearchInput, WebSearchResult, WebSourceRecord } from "../web-research/types.ts";

export type ResearchTools = {
  webSearch(input: WebSearchInput): Promise<WebSearchResult>;
  readUrl(input: { url: string }): Promise<WebSourceRecord>;
  searchTranscripts(input: {
    query: string;
    filters?: TranscriptSearchFilters;
    limit?: number;
  }): Promise<{ result: TranscriptSearchResult; receipts?: ProviderReceipt[] }>;
  openTranscriptChunk(input: { chunk_id: string }): Promise<OpenTranscriptChunkResult> | OpenTranscriptChunkResult;
};

export function createResearchTools(options: {
  apiKey?: string;
  exaApiKey?: string;
  liveAuthorized?: boolean;
  signal?: AbortSignal;
}): ResearchTools {
  const apiKey = options.apiKey?.trim() ?? "";
  const liveAuthorized = options.liveAuthorized === true;
  let activeReceipts: ProviderReceipt[] = [];
  const provider = apiKey && liveAuthorized
    ? createOpenRouterTranscriptProvider(apiKey, (receipt) => activeReceipts.push(receipt), options.signal)
    : undefined;
  const transcripts = new TranscriptRetrievalService({ provider });
  return {
    webSearch(input) {
      return webSearch(input, { apiKey: options.exaApiKey, liveAuthorized, signal: options.signal });
    },
    readUrl(input) {
      if (!liveAuthorized) {
        return Promise.resolve(
          failedPageRecord({
            requested: input.url,
            availability: "unavailable",
            code: "network_not_authorized",
            message: "URL retrieval is not authorized for this runtime.",
            retrievedAt: new Date().toISOString(),
          }),
        );
      }
      return readUrl(input, { signal: options.signal });
    },
    async searchTranscripts(input) {
      activeReceipts = [];
      const result = await transcripts.searchTranscripts(input);
      return { result, receipts: [...activeReceipts] };
    },
    openTranscriptChunk(input) {
      const chunkId = input.chunk_id.trim();
      if (!chunkId || chunkId.length > 160) {
        return { status: "not_found", chunk_id: chunkId };
      }
      return transcripts.openTranscriptChunk(chunkId);
    },
  };
}
