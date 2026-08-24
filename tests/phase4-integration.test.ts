import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { sourceId } from "../src/lib/web-research/contracts.ts";
import { readUrl, type SafeHttpResponse } from "../src/lib/web-research/read-url.ts";
import { webSearch } from "../src/lib/web-research/web-search.ts";

const root = process.cwd();

function streamResponse(): Response {
  const chunk = {
    model: "x-ai/grok-4.6",
    provider: "xAI",
    choices: [
      {
        delta: {
          annotations: [
            {
              type: "url_citation",
              url_citation: { url: "https://example.com/story#result", title: "Story" },
            },
          ],
        },
      },
    ],
    usage: { cost: 0.005, server_tool_use: { web_search_requests: 1 } },
  };
  return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`);
}

async function sha256(path: string) {
  return createHash("sha256").update(await readFile(resolve(root, path))).digest("hex");
}

describe("Phase 4 source integration and regressions", () => {
  it("preserves a candidate's source ID through retrieval and upgrades only retrieved text to evidence", async () => {
    const search = await webSearch(
      { query: "stable identity" },
      { apiKey: "synthetic", liveAuthorized: true, fetchImpl: async () => streamResponse() },
    );
    const candidate = search.sources[0]!;
    expect(candidate).toMatchObject({
      source_id: sourceId("https://example.com/story"),
      availability: "candidate",
      evidence_usable: false,
    });

    const opened = await readUrl(
      { url: candidate.url },
      {
        resolver: async () => [{ address: "93.184.216.34", family: 4 }],
        fetchExecutor: async () =>
          new Response("retrieved evidence ".repeat(40), {
            headers: { "content-type": "text/plain" },
          }) as unknown as SafeHttpResponse,
      },
    );
    expect(opened).toMatchObject({
      source_id: candidate.source_id,
      source_kind: "retrieved_page",
      availability: "complete",
      evidence_usable: true,
      trust: "untrusted_external_content",
    });
  });

  it("keeps provider-disabled search useful as an honest zero-call unavailable state", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    const result = await webSearch(
      { query: "offline query" },
      { apiKey: "", liveAuthorized: false, fetchImpl: fetchSpy },
    );
    expect(result).toMatchObject({ status: "unavailable", sources: [], failure: { code: "missing_key" } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps both public tools behind a server-only module", async () => {
    const tools = await readFile(resolve(root, "src/lib/web-research/tools.ts"), "utf8");
    expect(tools.startsWith('import "server-only";')).toBe(true);
    expect(tools).toContain("export function web_search");
    expect(tools).toContain("export function read_url");
    expect(tools).toContain('process.env.PHASE4_EXECUTE_LIVE !== "approved"');
    expect(tools).toContain('code: "network_not_authorized"');
    expect(tools).not.toContain("NEXT_PUBLIC");

    const client = await readFile(resolve(root, "src/components/research-harness.tsx"), "utf8");
    expect(client).not.toContain("lib/web-research");

    const publicFiles = await readdir(resolve(root, "public"), { recursive: true }).catch(() => [] as string[]);
    expect(publicFiles.some((file) => String(file).includes("web-research"))).toBe(false);
  });

  it("preserves every Phase 3 corpus and retrieval artifact byte-for-byte", async () => {
    await expect(sha256("data/processed/episodes.jsonl")).resolves.toBe(
      "4ceea4085e0bbe36513706f42a7bedf0008ee4b02b52fd7d695b69f585fe219a",
    );
    await expect(sha256("data/processed/segments.jsonl")).resolves.toBe(
      "a774dc9e6a1de562105a64c72853ca30ade7bdd54c7e8f84c869eaf6bc8e5155",
    );
    await expect(sha256("data/retrieval/chunks.jsonl")).resolves.toBe(
      "c5667e392c8b242ab96c55b1b0f4c10d0dc74e883940cde0c1b78e433f3ecfd8",
    );
    await expect(sha256("data/retrieval/bm25-index.json")).resolves.toBe(
      "c58293b55a95aad89621872b9387a285ab7355979fc752269a4fdf76ca7c4e02",
    );
    await expect(sha256("data/retrieval/embeddings.f32")).resolves.toBe(
      "ed72ac74f763c9eaab7443400f4a481ae703882b8d20926c0efc5b6f2fc05961",
    );
  });
});
