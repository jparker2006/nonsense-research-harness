import { Agent, fetch as undiciFetch } from "undici";
import {
  WEB_RESEARCH_LIMITS,
  WebResearchError,
  failedPageRecord,
  normalizeWebUrl,
  sourceId,
  truncate,
} from "./contracts.ts";
import { extractReadablePage } from "./extraction.ts";
import {
  createPinnedLookup,
  parsePublicUrl,
  resolvePublicAddresses,
  systemDnsResolver,
  type DnsResolver,
  type PinnedAddressStore,
} from "./network-policy.ts";
import type { ReadUrlInput, WebSourceRecord } from "./types.ts";

export type SafeHttpResponse = {
  status: number;
  headers: { get(name: string): string | null };
  body: null | {
    getReader(): ReadableStreamDefaultReader<Uint8Array>;
    cancel(reason?: unknown): Promise<void>;
  };
};

export type SafeFetchExecutor = (url: URL, signal: AbortSignal) => Promise<SafeHttpResponse>;

type ReadUrlDependencies = {
  resolver?: DnsResolver;
  fetchExecutor?: SafeFetchExecutor;
  now?: () => Date;
};

function responseContentType(response: SafeHttpResponse): string | null {
  const value = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  return value || null;
}

function acceptedContentType(value: string | null): value is "text/html" | "application/xhtml+xml" | "text/plain" {
  return value === "text/html" || value === "application/xhtml+xml" || value === "text/plain";
}

async function discard(response: SafeHttpResponse): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The per-invocation dispatcher is closed after the tool returns.
  }
}

async function readBoundedBody(response: SafeHttpResponse): Promise<{ body: string; bytes: number }> {
  const declared = response.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > WEB_RESEARCH_LIMITS.maxDecodedBodyBytes) {
    await discard(response);
    throw new WebResearchError("body_too_large", "The response exceeds the 2 MiB body limit.");
  }
  if (!response.body) throw new WebResearchError("empty_body", "The response body is empty.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > WEB_RESEARCH_LIMITS.maxDecodedBodyBytes) {
        await reader.cancel();
        throw new WebResearchError("body_too_large", "The decoded response crossed the 2 MiB body limit.");
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    if (!body.trim()) throw new WebResearchError("empty_body", "The response body is empty.");
    return { body, bytes };
  } finally {
    reader.releaseLock();
  }
}

function createLiveExecutor(pinned: PinnedAddressStore) {
  const dispatcher = new Agent({
    connect: {
      timeout: WEB_RESEARCH_LIMITS.connectTimeoutMs,
      lookup: createPinnedLookup(pinned),
    },
    headersTimeout: WEB_RESEARCH_LIMITS.headersTimeoutMs,
    bodyTimeout: WEB_RESEARCH_LIMITS.bodyTimeoutMs,
    maxResponseSize: WEB_RESEARCH_LIMITS.maxDecodedBodyBytes + 1,
    pipelining: 0,
  });
  const execute: SafeFetchExecutor = (url, signal) =>
    undiciFetch(url, {
      method: "GET",
      redirect: "manual",
      signal,
      dispatcher,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
        "accept-encoding": "identity",
        "user-agent": "NonsenseResearchHarness/0.1 (+safe-read-only-fetch)",
      },
    }) as unknown as Promise<SafeHttpResponse>;
  return { execute, close: () => dispatcher.close() };
}

export async function readUrl(
  input: ReadUrlInput,
  dependencies: ReadUrlDependencies = {},
): Promise<WebSourceRecord> {
  const retrievedAt = (dependencies.now?.() ?? new Date()).toISOString();
  const requested = input.url;
  let requestedUrl: URL;
  try {
    requestedUrl = parsePublicUrl(requested);
  } catch (error) {
    const safe = error instanceof WebResearchError ? error : new WebResearchError("invalid_url", "The URL is invalid.", "denied");
    return failedPageRecord({
      requested,
      availability: safe.availability,
      code: safe.code,
      message: safe.message,
      retrievedAt,
    });
  }

  const normalizedRequested = normalizeWebUrl(requestedUrl.toString());
  const pinned: PinnedAddressStore = new Map();
  const live = dependencies.fetchExecutor ? null : createLiveExecutor(pinned);
  const execute = dependencies.fetchExecutor ?? live!.execute;
  const resolver = dependencies.resolver ?? systemDnsResolver;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEB_RESEARCH_LIMITS.wholeRunTimeoutMs);
  const seen = new Set([normalizedRequested]);
  let current = requestedUrl;
  let redirects = 0;
  let httpRequests = 0;
  let lastReceipt: WebSourceRecord["receipt"] = { redirects: 0, http_requests: 0 };

  try {
    while (true) {
      const parsed = parsePublicUrl(current.toString());
      const answers = await resolvePublicAddresses(parsed.hostname, resolver);
      pinned.set(parsed.hostname.toLowerCase(), answers);

      httpRequests += 1;
      const response = await execute(parsed, controller.signal);
      const contentType = responseContentType(response);
      lastReceipt = {
        http_status: response.status,
        content_type: contentType ?? undefined,
        redirects,
        http_requests: httpRequests,
      };

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await discard(response);
        if (!location) {
          throw new WebResearchError("redirect_missing_location", "The redirect did not include a destination.", "denied");
        }
        if (redirects >= WEB_RESEARCH_LIMITS.maxRedirects) {
          throw new WebResearchError("redirect_limit", "The response exceeded the three-redirect limit.", "denied");
        }
        let next: URL;
        try {
          next = parsePublicUrl(new URL(location, parsed).toString());
        } catch (error) {
          if (error instanceof WebResearchError) throw error;
          throw new WebResearchError("redirect_denied", "The redirect destination is invalid.", "denied");
        }
        const normalizedNext = normalizeWebUrl(next.toString());
        if (seen.has(normalizedNext)) {
          throw new WebResearchError("redirect_loop", "The response entered a redirect loop.", "denied");
        }
        seen.add(normalizedNext);
        current = next;
        redirects += 1;
        continue;
      }

      if ([401, 402, 403, 451].includes(response.status)) {
        await discard(response);
        throw new WebResearchError("http_restricted", "The page is access restricted.", "restricted");
      }
      if (response.status < 200 || response.status >= 300) {
        await discard(response);
        throw new WebResearchError("http_unavailable", `The page returned HTTP ${response.status}.`);
      }
      if (!acceptedContentType(contentType)) {
        await discard(response);
        throw new WebResearchError("content_type_denied", "The response content type is not supported.", "denied");
      }

      const bounded = await readBoundedBody(response);
      lastReceipt = { ...lastReceipt, bytes: bounded.bytes, redirects, http_requests: httpRequests };
      const extracted = extractReadablePage({ body: bounded.body, contentType, finalUrl: parsed });
      if (!extracted || extracted.text.length < WEB_RESEARCH_LIMITS.minimumPartialCharacters) {
        throw new WebResearchError("extraction_failed", "The page did not contain enough readable text.");
      }
      const availability =
        extracted.truncated || extracted.text.length < WEB_RESEARCH_LIMITS.minimumCompleteCharacters
          ? "partial"
          : "complete";
      return {
        source_id: sourceId(normalizedRequested),
        source_kind: "retrieved_page",
        availability,
        url: normalizedRequested,
        requested_url: normalizedRequested,
        final_url: normalizeWebUrl(parsed.toString()),
        canonical_url: extracted.canonicalUrl ?? undefined,
        title: extracted.title,
        byline: extracted.byline,
        published_at: extracted.publishedAt,
        excerpt: truncate(extracted.text, WEB_RESEARCH_LIMITS.excerptCharacters),
        text: extracted.text,
        retrieved_at: retrievedAt,
        trust: "untrusted_external_content",
        evidence_usable: true,
        receipt: lastReceipt,
      };
    }
  } catch (error) {
    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
    const timedOut =
      controller.signal.aborted ||
      ["UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"].includes(errorCode) ||
      (error instanceof Error && error.name === "AbortError");
    const safe =
      error instanceof WebResearchError
        ? error
        : timedOut
          ? new WebResearchError("timeout", "The page read exceeded its time limit.")
          : new WebResearchError("network_failure", "The page could not be retrieved.");
    return failedPageRecord({
      requested,
      normalized: normalizedRequested,
      finalUrl: normalizeWebUrl(current.toString()),
      availability: safe.availability,
      code: safe.code,
      message: safe.message,
      retrievedAt,
      receipt: lastReceipt,
    });
  } finally {
    clearTimeout(timeout);
    await live?.close();
  }
}
