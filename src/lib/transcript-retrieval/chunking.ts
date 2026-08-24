import type { EpisodeRecord, RetrievalChunk, SegmentRecord } from "./types.ts";

export const CHUNKING_POLICY = Object.freeze({
  minimumWords: 250,
  maximumWords: 450,
  overlapWords: 60,
});

type TextSpan = {
  start: number;
  end: number;
  words: number;
};

export function countWords(text: string): number {
  return text.match(/\S+/gu)?.length ?? 0;
}

function splitOversizedSpan(text: string, span: TextSpan): TextSpan[] {
  if (span.words <= CHUNKING_POLICY.maximumWords) return [span];
  const local = text.slice(span.start, span.end);
  const words = [...local.matchAll(/\S+/gu)];
  const pieces: TextSpan[] = [];
  let wordStart = 0;
  while (wordStart < words.length) {
    const wordEnd = Math.min(words.length, wordStart + CHUNKING_POLICY.maximumWords);
    const start = wordStart === 0 ? span.start : span.start + (words[wordStart]?.index ?? 0);
    const end =
      wordEnd === words.length
        ? span.end
        : span.start + (words[wordEnd]?.index ?? local.length);
    pieces.push({ start, end, words: wordEnd - wordStart });
    wordStart = wordEnd;
  }
  return pieces;
}

function sentenceSpans(text: string): TextSpan[] {
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  const spans: TextSpan[] = [];
  for (const sentence of segmenter.segment(text)) {
    const span = {
      start: sentence.index,
      end: sentence.index + sentence.segment.length,
      words: countWords(sentence.segment),
    };
    spans.push(...splitOversizedSpan(text, span));
  }
  if (spans.length === 0 && text.length > 0) {
    spans.push({ start: 0, end: text.length, words: countWords(text) });
  }
  return spans;
}

function chunkSpans(text: string): TextSpan[] {
  const units = sentenceSpans(text);
  const chunks: TextSpan[] = [];
  let startUnit = 0;

  while (startUnit < units.length) {
    let endUnit = startUnit;
    let words = 0;
    while (endUnit < units.length) {
      const nextWords = units[endUnit]?.words ?? 0;
      if (words > 0 && words + nextWords > CHUNKING_POLICY.maximumWords) break;
      words += nextWords;
      endUnit += 1;
      if (words >= CHUNKING_POLICY.minimumWords && endUnit === units.length) break;
    }
    if (endUnit === startUnit) endUnit += 1;

    const start = units[startUnit]?.start ?? 0;
    const end = units[endUnit - 1]?.end ?? text.length;
    chunks.push({ start, end, words: countWords(text.slice(start, end)) });
    if (endUnit >= units.length) break;

    let overlapStart = endUnit;
    let overlapWords = 0;
    while (overlapStart > startUnit + 1) {
      const candidate = units[overlapStart - 1];
      if (!candidate || overlapWords + candidate.words > CHUNKING_POLICY.overlapWords) break;
      overlapWords += candidate.words;
      overlapStart -= 1;
    }
    startUnit = overlapStart === endUnit ? endUnit : overlapStart;
  }

  return chunks;
}

export function createChunksForSegment(
  segment: SegmentRecord,
  episode: EpisodeRecord,
): RetrievalChunk[] {
  return chunkSpans(segment.text).map((span, index) => ({
    schema_version: "1.0",
    chunk_id: `${segment.segment_id}:c${String(index + 1).padStart(3, "0")}`,
    chunk_index: index + 1,
    segment_id: segment.segment_id,
    episode_id: segment.episode_id,
    season: segment.season,
    episode_number: segment.episode_number,
    title: segment.title,
    published_at: episode.published_at,
    episode_format: segment.episode_format,
    corpus_role: segment.corpus_role,
    segment_role: segment.segment_role,
    chapter_label_raw: segment.chapter_label_raw,
    start_seconds: segment.start_seconds,
    end_seconds: segment.end_seconds,
    start_char: span.start,
    end_char: span.end,
    word_count: span.words,
    text: segment.text.slice(span.start, span.end),
  }));
}

export function assertChunkCoverage(segment: SegmentRecord, chunks: RetrievalChunk[]): void {
  if (chunks.length === 0) throw new Error(`No chunks generated for ${segment.segment_id}.`);
  const ids = new Set<string>();
  let coveredThrough = 0;
  for (const chunk of chunks) {
    if (ids.has(chunk.chunk_id)) throw new Error(`Duplicate chunk_id: ${chunk.chunk_id}`);
    ids.add(chunk.chunk_id);
    if (chunk.segment_id !== segment.segment_id) throw new Error(`Wrong parent for ${chunk.chunk_id}.`);
    if (chunk.start_char > coveredThrough) {
      throw new Error(`Source gap in ${segment.segment_id} before character ${chunk.start_char}.`);
    }
    if (segment.text.slice(chunk.start_char, chunk.end_char) !== chunk.text) {
      throw new Error(`Source slice mismatch for ${chunk.chunk_id}.`);
    }
    if (countWords(chunk.text) !== chunk.word_count) {
      throw new Error(`Word-count mismatch for ${chunk.chunk_id}.`);
    }
    coveredThrough = Math.max(coveredThrough, chunk.end_char);
  }
  if (chunks[0]?.start_char !== 0 || coveredThrough !== segment.text.length) {
    throw new Error(`Incomplete source coverage for ${segment.segment_id}.`);
  }
}
