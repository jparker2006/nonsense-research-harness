import { failedPageRecord } from "../web-research/contracts.ts";
import { readUrl } from "../web-research/read-url.ts";
import { webSearch } from "../web-research/web-search.ts";
import {
  TranscriptRetrievalService,
  createOpenRouterTranscriptProvider,
} from "../transcript-retrieval/search.ts";
import type { ProviderReceipt } from "../transcript-retrieval/providers.ts";
import type { Phase5ToolAdapter } from "./workflow.ts";

export function createLivePhase5Tools(options: {
  apiKey?: string;
  liveAuthorized?: boolean;
}): Phase5ToolAdapter {
  const apiKey = options.apiKey?.trim() ?? "";
  const liveAuthorized = options.liveAuthorized === true;
  let activeReceipts: ProviderReceipt[] = [];
  const provider = apiKey && liveAuthorized
    ? createOpenRouterTranscriptProvider(apiKey, (receipt) => activeReceipts.push(receipt))
    : undefined;
  const transcripts = new TranscriptRetrievalService({ provider });
  return {
    webSearch(input) {
      return webSearch(input, { apiKey, liveAuthorized });
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
      return readUrl(input);
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
