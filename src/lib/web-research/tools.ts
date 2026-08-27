import "server-only";
import { failedPageRecord } from "./contracts.ts";
import { readUrl } from "./read-url.ts";
import { webSearch } from "./web-search.ts";
import type { ReadUrlInput, WebSearchInput } from "./types.ts";

export function web_search(input: WebSearchInput) {
  return webSearch(input, {
    apiKey: process.env.EXA_API_KEY,
    liveAuthorized: process.env.PHASE4_EXECUTE_LIVE === "approved",
  });
}

export function read_url(input: ReadUrlInput) {
  if (process.env.PHASE4_EXECUTE_LIVE !== "approved") {
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
}
