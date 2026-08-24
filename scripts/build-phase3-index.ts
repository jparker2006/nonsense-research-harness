import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildBm25Index } from "../src/lib/transcript-retrieval/bm25.ts";
import {
  assertChunkCoverage,
  CHUNKING_POLICY,
  createChunksForSegment,
} from "../src/lib/transcript-retrieval/chunking.ts";
import {
  CORPUS_SNAPSHOT,
  loadAndValidateCorpus,
} from "../src/lib/transcript-retrieval/corpus.ts";

const root = process.cwd();
const outputDirectory = resolve(root, "data/retrieval");

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function writeAtomic(path: string, contents: string) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, contents, "utf8");
  await rename(temporaryPath, path);
}

const corpus = loadAndValidateCorpus(root);
const chunks = corpus.segments.flatMap((segment) => {
  const episode = corpus.episodesById.get(segment.episode_id);
  if (!episode) throw new Error(`Missing parent episode for ${segment.segment_id}.`);
  const generated = createChunksForSegment(segment, episode);
  assertChunkCoverage(segment, generated);
  return generated;
});

const chunkIds = new Set(chunks.map((chunk) => chunk.chunk_id));
if (chunkIds.size !== chunks.length) throw new Error("Generated chunk IDs are not unique.");
if (new Set(chunks.map((chunk) => chunk.segment_id)).size !== corpus.segments.length) {
  throw new Error("Not every segment is represented in the retrieval chunks.");
}

const chunksJsonl = `${chunks.map((chunk) => JSON.stringify(chunk)).join("\n")}\n`;
const bm25Json = `${JSON.stringify(buildBm25Index(chunks))}\n`;
const manifest = {
  schema_version: "1.0",
  corpus: {
    episodes: CORPUS_SNAPSHOT.episodes,
    segments: CORPUS_SNAPSHOT.segments,
  },
  counts: {
    episodes: corpus.episodes.length,
    segments: corpus.segments.length,
    chunks: chunks.length,
  },
  chunking_policy: CHUNKING_POLICY,
  embedding: {
    status: "pending",
    model: "openai/text-embedding-3-small",
    provider: "azure",
    dimensions: null,
  },
  reranker: {
    status: "pending_evaluation",
    model: "qwen/qwen3-reranker-8b",
    provider: "fireworks",
  },
  artifacts: {
    chunks: {
      path: "data/retrieval/chunks.jsonl",
      bytes: Buffer.byteLength(chunksJsonl),
      sha256: sha256(chunksJsonl),
    },
    bm25: {
      path: "data/retrieval/bm25-index.json",
      bytes: Buffer.byteLength(bm25Json),
      sha256: sha256(bm25Json),
    },
    embeddings: null,
  },
};

await mkdir(outputDirectory, { recursive: true });
await writeAtomic(resolve(outputDirectory, "chunks.jsonl"), chunksJsonl);
await writeAtomic(resolve(outputDirectory, "bm25-index.json"), bm25Json);
await writeAtomic(resolve(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      status: "passed",
      episodes: corpus.episodes.length,
      segments: corpus.segments.length,
      chunks: chunks.length,
      chunksSha256: manifest.artifacts.chunks.sha256,
      bm25Sha256: manifest.artifacts.bm25.sha256,
    },
    null,
    2,
  ),
);
