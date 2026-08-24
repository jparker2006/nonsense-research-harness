# Processed Nonsense corpus

This directory is a deterministic derived layer over the 59 validated publisher transcripts. Raw SRT files, canonical transcripts, the frozen RSS feed, and the 110-row manifest remain authoritative and unchanged.

## Files

- episodes.jsonl: one record per validated episode, sorted oldest to newest
- segments.jsonl: one record per publisher chapter, with a whole-episode fallback when publisher chapters are absent

## Episode taxonomy

- headlines: 27
- big_story: 29
- special: 1
- short_notice: 2
- core episodes: 56
- context-only episodes: 3

## Segmentation

- publisher-timed episodes: 47
- whole-episode fallbacks: 12
- total segments: 441

Normalized segment roles are pre_show, formal_open, special_day_bit, cj_week, jeff_week, headline_topic, story_section, cj_recommendation, jeff_recommendation, retro_tech_closer, outro, special_content, unsegmented_episode, and unclassified. The original publisher chapter label is always retained.

## Normalization

SRT cue numbers and timestamp syntax are removed from derived prose. Subtitle line wraps and whitespace are collapsed mechanically. Source wording, punctuation, recognition errors, and uncertainty are preserved. No speaker labels, corrections, rewritten prose, inferred topic tags, or invented chapter boundaries are added.

## Scope

Only manifest rows with validation_status passed are included. Unresolved episodes and the two rejected truncated publisher files remain outside this processed corpus. No audio or local ASR output is used.
