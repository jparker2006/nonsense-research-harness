import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";
import { WEB_RESEARCH_LIMITS, cleanText, truncate } from "./contracts.ts";

export type ExtractedPage = {
  title: string | null;
  byline: string | null;
  publishedAt: string | null;
  canonicalUrl: string | null;
  text: string;
  truncated: boolean;
};

function safeCanonical(document: Document, finalUrl: URL): string | null {
  const value = document.querySelector('link[rel~="canonical"]')?.getAttribute("href");
  if (!value) return null;
  try {
    const parsed = new URL(value, finalUrl);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.origin !== finalUrl.origin) {
      return null;
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function dateMetadata(document: Document): string | null {
  const selectors = [
    'meta[property="article:published_time"]',
    'meta[name="date"]',
    'meta[name="pubdate"]',
  ];
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.getAttribute("content")?.trim();
    if (value) return value.slice(0, 100);
  }
  return null;
}

export function extractReadablePage(input: {
  body: string;
  contentType: string;
  finalUrl: URL;
}): ExtractedPage | null {
  if (input.contentType === "text/plain") {
    const text = cleanText(input.body);
    return {
      title: null,
      byline: null,
      publishedAt: null,
      canonicalUrl: null,
      text: text.slice(0, WEB_RESEARCH_LIMITS.textCharacters),
      truncated: text.length > WEB_RESEARCH_LIMITS.textCharacters,
    };
  }

  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(input.body, {
    url: input.finalUrl.toString(),
    contentType: input.contentType,
    virtualConsole,
  });
  try {
    const elementCount = dom.window.document.getElementsByTagName("*").length;
    if (elementCount > WEB_RESEARCH_LIMITS.maxElements) return null;
    const canonicalUrl = safeCanonical(dom.window.document, input.finalUrl);
    const publishedAt = dateMetadata(dom.window.document);
    const article = new Readability(dom.window.document, {
      maxElemsToParse: WEB_RESEARCH_LIMITS.maxElements,
    }).parse();
    if (!article) return null;
    const text = cleanText(article.textContent ?? "");
    return {
      title: truncate(article.title, WEB_RESEARCH_LIMITS.titleCharacters),
      byline: truncate(article.byline, WEB_RESEARCH_LIMITS.titleCharacters),
      publishedAt,
      canonicalUrl,
      text: text.slice(0, WEB_RESEARCH_LIMITS.textCharacters),
      truncated: text.length > WEB_RESEARCH_LIMITS.textCharacters,
    };
  } finally {
    dom.window.close();
  }
}
