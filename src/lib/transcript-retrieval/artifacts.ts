import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type MiniSearch from "minisearch";
import { loadBm25Index } from "./bm25.ts";
import { sha256Buffer } from "./corpus.ts";
import type { RetrievalChunk } from "./types.ts";

type ArtifactEntry = {
  path: string;
  bytes: number;
  sha256: string;
};

export type RetrievalManifest = {
  schema_version: string;
  counts: { episodes: number; segments: number; chunks: number };
  embedding: {
    status: "pending" | "ready";
    model: string;
    provider: string;
    dimensions: number | null;
    generation?: {
      request_count: number;
      input_count: number;
      total_tokens: number | null;
      cost_usd: number;
    };
  };
  reranker: {
    status: "pending_evaluation" | "retained" | "removed";
    model: string;
    provider: string;
  };
  artifacts: {
    chunks: ArtifactEntry;
    bm25: ArtifactEntry;
    embeddings: ArtifactEntry | null;
  };
};

export type RetrievalArtifacts = {
  manifest: RetrievalManifest;
  chunks: RetrievalChunk[];
  chunksById: Map<string, RetrievalChunk>;
  bm25: MiniSearch;
  vectors?: Float32Array;
  dimensions?: number;
};

export function validateRetrievalChunks(values: unknown[]): RetrievalChunk[] {
  const chunks = values.map((value, index) => {
    if (typeof value !== "object" || value === null) {
      throw new Error(`Retrieval chunk ${index + 1} is malformed.`);
    }
    const chunk = value as Partial<RetrievalChunk>;
    if (
      chunk.schema_version !== "1.0" ||
      typeof chunk.chunk_id !== "string" || !chunk.chunk_id ||
      typeof chunk.segment_id !== "string" || !chunk.segment_id ||
      typeof chunk.episode_id !== "string" || !chunk.episode_id ||
      typeof chunk.title !== "string" ||
      typeof chunk.published_at !== "string" ||
      typeof chunk.episode_format !== "string" ||
      typeof chunk.corpus_role !== "string" ||
      typeof chunk.segment_role !== "string" ||
      typeof chunk.text !== "string" || !chunk.text ||
      !Number.isInteger(chunk.chunk_index) ||
      !Number.isInteger(chunk.season) ||
      !(chunk.episode_number === null || Number.isInteger(chunk.episode_number)) ||
      !Number.isFinite(chunk.start_seconds) ||
      !Number.isFinite(chunk.end_seconds) ||
      !Number.isInteger(chunk.start_char) ||
      !Number.isInteger(chunk.end_char) ||
      !Number.isInteger(chunk.word_count) ||
      (chunk.chapter_label_raw !== null && typeof chunk.chapter_label_raw !== "string")
    ) {
      throw new Error(`Retrieval chunk ${index + 1} is malformed.`);
    }
    return chunk as RetrievalChunk;
  });
  const ids = new Set(chunks.map((chunk) => chunk.chunk_id));
  if (ids.size !== chunks.length) throw new Error("Chunk artifact contains duplicate IDs.");
  return chunks;
}

function readVerified(root: string, artifact: ArtifactEntry): Buffer {
  const buffer = readFileSync(resolve(root, artifact.path));
  if (buffer.byteLength !== artifact.bytes) throw new Error(`Artifact byte drift: ${artifact.path}`);
  if (sha256Buffer(buffer) !== artifact.sha256) throw new Error(`Artifact checksum drift: ${artifact.path}`);
  return buffer;
}

export function loadRetrievalArtifacts(root = process.cwd()): RetrievalArtifacts {
  const manifest = JSON.parse(
    readFileSync(resolve(root, "data/retrieval/manifest.json"), "utf8"),
  ) as RetrievalManifest;
  const chunksBuffer = readVerified(root, manifest.artifacts.chunks);
  const bm25Buffer = readVerified(root, manifest.artifacts.bm25);
  const chunks = validateRetrievalChunks(chunksBuffer
    .toString("utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line)));
  if (chunks.length !== manifest.counts.chunks) throw new Error("Chunk artifact count mismatch.");
  const chunksById = new Map(chunks.map((chunk) => [chunk.chunk_id, chunk]));

  const loaded: RetrievalArtifacts = {
    manifest,
    chunks,
    chunksById,
    bm25: loadBm25Index(bm25Buffer.toString("utf8")),
  };
  if (manifest.embedding.status === "ready") {
    const entry = manifest.artifacts.embeddings;
    const dimensions = manifest.embedding.dimensions;
    if (!entry || !dimensions) throw new Error("Ready embedding manifest is incomplete.");
    const buffer = readVerified(root, entry);
    const copied = Uint8Array.from(buffer);
    const vectors = new Float32Array(copied.buffer);
    if (vectors.length !== chunks.length * dimensions) throw new Error("Embedding vector count mismatch.");
    if (vectors.some((value) => !Number.isFinite(value))) {
      throw new Error("Embedding artifact contains a non-finite value.");
    }
    loaded.vectors = vectors;
    loaded.dimensions = dimensions;
  }
  return loaded;
}
