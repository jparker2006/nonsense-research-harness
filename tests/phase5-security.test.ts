import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

async function sha256(path: string) {
  return createHash("sha256").update(await readFile(resolve(root, path))).digest("hex");
}

describe("Phase 5 security and immutable-data boundaries", () => {
  it("preserves the authoritative corpus and every Phase 3 retrieval artifact", async () => {
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

  it("keeps the Phase 5 graph, tools, reports, and corpus out of public/client assets", async () => {
    const client = await readFile(resolve(root, "src/components/research-harness.tsx"), "utf8");
    expect(client).not.toContain("lib/phase5");
    expect(client).not.toContain("transcript-retrieval");

    const publicFiles = await readdir(resolve(root, "public"), { recursive: true }).catch(() => [] as string[]);
    expect(
      publicFiles.some((file) => /phase.?5|transcript|episodes\.jsonl|segments\.jsonl|chunks\.jsonl/i.test(String(file))),
    ).toBe(false);
  });

  it("keeps the saved live evidence sanitized and strips model-input source content", async () => {
    const historical = await readFile(resolve(root, "reports/phase-5-live.json"), "utf8");
    const proof = await readFile(resolve(root, "reports/phase-5-1-compose-proof.json"), "utf8");
    expect(createHash("sha256").update(historical).digest("hex")).toBe(
      "fb1ec9c4e59eea5aea98e0cc48668a1a90ea937103a923a386d40be695675fc4",
    );
    expect(createHash("sha256").update(proof).digest("hex")).toBe(
      "d231d14b5f35f7ffc331aa1992a52e0ad7e3ab70dd1b555542cc843d4b712ed2",
    );
    for (const report of [historical, proof]) {
      expect(report).not.toMatch(/sk-or-|Bearer\s+|OPENROUTER_API_KEY|chain.of.thought|system prompt/i);
      expect(report).not.toContain('"content":');
    }
  });

  it("does not introduce a public environment variable in Phase 5 server code", async () => {
    const files = (await readdir(resolve(root, "src/lib/phase5")))
      .filter((file) => file.endsWith(".ts"));
    const source = (
      await Promise.all(files.map((file) => readFile(resolve(root, "src/lib/phase5", file), "utf8")))
    ).join("\n");
    expect(source).not.toContain("NEXT_PUBLIC");
    expect(source).not.toMatch(/console\.(?:log|error)/);
  });
});
