import { createHash } from "node:crypto";
import type { WebFailure, WebSourceRecord } from "./types.ts";

export const WEB_RESEARCH_LIMITS = Object.freeze({
  urlCharacters: 2_048,
  titleCharacters: 300,
  excerptCharacters: 600,
  textCharacters: 40_000,
  minimumPartialCharacters: 200,
  minimumCompleteCharacters: 500,
  maxDecodedBodyBytes: 2 * 1024 * 1024,
  maxElements: 20_000,
  maxRedirects: 3,
  connectTimeoutMs: 3_000,
  headersTimeoutMs: 5_000,
  bodyTimeoutMs: 5_000,
  wholeRunTimeoutMs: 12_000,
  searchTimeoutMs: 45_000,
  searchMaxResults: 10,
  searchMaxCharactersPerResult: 1_200,
  searchMaxOutputTokens: 768,
  phaseBudgetUsd: 0.1,
  providerRequests: 1,
});

export class WebResearchError extends Error {
  readonly code: string;
  readonly availability: "denied" | "restricted" | "unavailable";

  constructor(
    code: string,
    message: string,
    availability: "denied" | "restricted" | "unavailable" = "unavailable",
  ) {
    super(message);
    this.name = "WebResearchError";
    this.code = code;
    this.availability = availability;
  }
}

export function normalizeWebUrl(value: string): string {
  const parsed = new URL(value);
  parsed.hash = "";
  if (
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443")
  ) {
    parsed.port = "";
  }
  return parsed.toString();
}

export function sourceId(value: string): string {
  const normalized = (() => {
    try {
      return normalizeWebUrl(value);
    } catch {
      return value.trim().slice(0, WEB_RESEARCH_LIMITS.urlCharacters);
    }
  })();
  return `web_${createHash("sha256").update(normalized).digest("hex").slice(0, 20)}`;
}

export function cleanText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const clean = cleanText(value);
  return clean ? clean.slice(0, max) : null;
}

export function sanitizedFailure(code: string, message: string): WebFailure {
  return { code, message };
}

export function failedPageRecord(input: {
  requested: string;
  normalized?: string;
  finalUrl?: string;
  availability: "denied" | "restricted" | "unavailable";
  code: string;
  message: string;
  retrievedAt: string;
  receipt?: WebSourceRecord["receipt"];
}): WebSourceRecord {
  const safeRequested = input.normalized ?? input.requested.trim().slice(0, WEB_RESEARCH_LIMITS.urlCharacters);
  return {
    source_id: sourceId(input.normalized ?? input.requested),
    source_kind: "retrieved_page",
    availability: input.availability,
    url: safeRequested,
    requested_url: safeRequested,
    final_url: input.finalUrl,
    title: null,
    excerpt: null,
    retrieved_at: input.retrievedAt,
    trust: "untrusted_external_content",
    evidence_usable: false,
    receipt: input.receipt ?? {},
    failure: sanitizedFailure(input.code, input.message),
  };
}
