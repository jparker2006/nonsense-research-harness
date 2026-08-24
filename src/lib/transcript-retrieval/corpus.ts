import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { EpisodeRecord, SegmentRecord } from "./types.ts";

export const CORPUS_SNAPSHOT = Object.freeze({
  episodes: Object.freeze({
    path: "data/processed/episodes.jsonl",
    count: 59,
    bytes: 2_577_783,
    sha256: "4ceea4085e0bbe36513706f42a7bedf0008ee4b02b52fd7d695b69f585fe219a",
  }),
  segments: Object.freeze({
    path: "data/processed/segments.jsonl",
    count: 441,
    bytes: 2_533_810,
    sha256: "a774dc9e6a1de562105a64c72853ca30ade7bdd54c7e8f84c869eaf6bc8e5155",
  }),
});

const episodeSchema = z
  .object({
    schema_version: z.string(),
    episode_id: z.string().min(1),
    season: z.number().int(),
    episode_number: z.number().int().nullable(),
    title: z.string().min(1),
    published_at: z.string().min(1),
    duration_seconds: z.number().nonnegative(),
    episode_format: z.string().min(1),
    corpus_role: z.string().min(1),
  })
  .passthrough();

const segmentSchema = z
  .object({
    schema_version: z.string(),
    segment_id: z.string().min(1),
    episode_id: z.string().min(1),
    season: z.number().int(),
    episode_number: z.number().int().nullable(),
    title: z.string().min(1),
    episode_format: z.string().min(1),
    corpus_role: z.string().min(1),
    segment_index: z.number().int().positive(),
    start_seconds: z.number().nonnegative(),
    end_seconds: z.number().nonnegative(),
    chapter_label_raw: z.string().nullable(),
    segment_role: z.string().min(1),
    boundary_source: z.string().min(1),
    cue_count: z.number().int().nonnegative(),
    word_count: z.number().int().nonnegative(),
    text: z.string().min(1),
    speaker_labels_present: z.boolean().optional(),
  })
  .passthrough();

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseJsonl<T>(buffer: Buffer, label: string, parse: (value: unknown) => T): T[] {
  const text = buffer.toString("utf8");
  if (!text.endsWith("\n")) throw new Error(`${label} must end with a newline.`);
  return text
    .trimEnd()
    .split("\n")
    .map((line, index) => {
      try {
        return parse(JSON.parse(line));
      } catch (error) {
        const reason = error instanceof Error ? error.message : "unknown parse error";
        throw new Error(`${label} line ${index + 1} is malformed: ${reason}`);
      }
    });
}

function assertSnapshot(buffer: Buffer, expected: { bytes: number; sha256: string }, label: string) {
  if (buffer.byteLength !== expected.bytes) {
    throw new Error(`${label} byte drift: expected ${expected.bytes}, received ${buffer.byteLength}.`);
  }
  const digest = sha256(buffer);
  if (digest !== expected.sha256) {
    throw new Error(`${label} checksum drift: expected ${expected.sha256}, received ${digest}.`);
  }
}

export type LoadedCorpus = {
  episodes: EpisodeRecord[];
  segments: SegmentRecord[];
  episodesById: Map<string, EpisodeRecord>;
  segmentsById: Map<string, SegmentRecord>;
};

export function loadAndValidateCorpus(root = process.cwd()): LoadedCorpus {
  const episodesBuffer = readFileSync(resolve(root, CORPUS_SNAPSHOT.episodes.path));
  const segmentsBuffer = readFileSync(resolve(root, CORPUS_SNAPSHOT.segments.path));
  assertSnapshot(episodesBuffer, CORPUS_SNAPSHOT.episodes, "episodes.jsonl");
  assertSnapshot(segmentsBuffer, CORPUS_SNAPSHOT.segments, "segments.jsonl");

  const episodes = parseJsonl<EpisodeRecord>(episodesBuffer, "episodes.jsonl", (value) =>
    episodeSchema.parse(value) as EpisodeRecord,
  );
  const segments = parseJsonl<SegmentRecord>(segmentsBuffer, "segments.jsonl", (value) =>
    segmentSchema.parse(value) as SegmentRecord,
  );
  if (episodes.length !== CORPUS_SNAPSHOT.episodes.count) {
    throw new Error(`Expected ${CORPUS_SNAPSHOT.episodes.count} episodes; received ${episodes.length}.`);
  }
  if (segments.length !== CORPUS_SNAPSHOT.segments.count) {
    throw new Error(`Expected ${CORPUS_SNAPSHOT.segments.count} segments; received ${segments.length}.`);
  }

  const episodesById = new Map<string, EpisodeRecord>();
  for (const episode of episodes) {
    if (episodesById.has(episode.episode_id)) throw new Error(`Duplicate episode_id: ${episode.episode_id}`);
    episodesById.set(episode.episode_id, episode);
  }

  const segmentsById = new Map<string, SegmentRecord>();
  for (const segment of segments) {
    if (segmentsById.has(segment.segment_id)) throw new Error(`Duplicate segment_id: ${segment.segment_id}`);
    const episode = episodesById.get(segment.episode_id);
    if (!episode) throw new Error(`Missing parent episode for ${segment.segment_id}.`);
    if (
      episode.season !== segment.season ||
      episode.episode_number !== segment.episode_number ||
      episode.title !== segment.title ||
      episode.episode_format !== segment.episode_format ||
      episode.corpus_role !== segment.corpus_role
    ) {
      throw new Error(`Parent metadata mismatch for ${segment.segment_id}.`);
    }
    if (segment.end_seconds < segment.start_seconds) {
      throw new Error(`Invalid timestamp range for ${segment.segment_id}.`);
    }
    if (segment.speaker_labels_present === true) {
      throw new Error(`Unexpected speaker labels in ${segment.segment_id}.`);
    }
    segmentsById.set(segment.segment_id, segment);
  }

  return { episodes, segments, episodesById, segmentsById };
}

export function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function sha256Buffer(buffer: Buffer): string {
  return sha256(buffer);
}
