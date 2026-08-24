# Nonsense transcript corpus

This directory contains the frozen inventory and local transcript corpus for Seasons 3 and 4 of *Nonsense with CJ Little and Jeff Parker*. It is a private working dataset and has not been published.

## Current coverage

- Frozen RSS inventory: 110 episodes (Season 3: 67; Season 4: 43)
- Total RSS duration: 56.87 hours
- Validated canonical transcripts: 59
- Episodes without a validated canonical transcript: 51
- Complete publisher SRTs: 59
- Publisher SRTs rejected as truncated: 2
- Local ASR transcripts completed: 0

This is an honest intermediate state. Completion still requires one validated canonical transcript for all 110 inventory rows.

## Inventory and provenance

The public RSS feed was frozen on 2026-08-21 at `data/raw/rss/feed.xml` from:

`https://anchor.fm/s/d79d407c/podcast/rss`

`manifest.csv` has one row per Season 3 or Season 4 feed item. The RSS GUID is the stable `episode_id`. Each row records episode metadata, public audio and episode URLs, transcript source and local paths, and independent retrieval/validation statuses.

Publisher transcript files are stored unchanged under `data/raw/spotify/`. Validated canonical files under `data/transcripts/` are byte-for-byte copies of those SRTs, so timestamps are preserved. No speaker labels were added or inferred.

Two publisher SRTs were preserved but rejected because their final timestamps covered only 45.1 seconds of a 2,150-second episode and 56.0 seconds of a 1,618-second episode. They are not canonical transcripts and remain queued as unresolved.

## Public-source assessment

The source order is publisher RSS transcript, lawful alternative public transcript, then provider-free local transcription from the RSS audio.

- The frozen RSS exposes 61 transcript URLs. Fifty-nine passed completeness checks; two were truncated.
- Apple Podcasts says it automatically generates transcripts, but full transcript downloads are available to show owners through Apple Podcasts Connect. Its public listener interface permits sharing only short attributed excerpts, so it is not used for bulk corpus retrieval: https://podcasters.apple.com/support/5316-transcripts-on-apple-podcasts
- Public Spotify, Apple Podcasts, and Amazon Music web pages expose episode descriptions and chapter timestamps, not reusable full transcript files for the unresolved sample episodes.
- Podscan was excluded because its terms restrict storage, derivative datasets, and training use without the relevant license or subscription.
- No paid service, access-control bypass, host contact, or invented speaker attribution is used.

A project-local `mlx-whisper` environment was staged for the permitted on-device fallback, but the first model download was stopped before transcription. There are currently no local-ASR transcript files.

## Layout

- `manifest.csv` — authoritative episode inventory and status ledger
- `raw/rss/feed.xml` — frozen RSS source
- `raw/spotify/` — unchanged publisher SRT downloads, including rejected partial files
- `raw/local-asr/` — reserved for unchanged local-ASR SRT outputs
- `transcripts/` — exactly one canonical transcript per validated episode
- `coverage-report.md` — human-readable per-episode coverage
- `missing.csv` — unresolved episodes; must contain only its header at completion
- `work/` — temporary audio/model material used only for local processing

## Validation rules

A canonical transcript is marked `passed` only when it exists, is nonempty, is readable UTF-8, is bound to the correct RSS episode, covers at least approximately the episode duration, and has a unique SHA-256 digest among episode transcripts. Publisher identity is established by the transcript URL embedded in that exact frozen RSS item. Local-ASR identity will be established by a one-to-one RSS GUID to audio URL to output-path mapping.

Exact duplicate detection does not prove semantic uniqueness, but it prevents accidental reuse of the same file for two episode IDs. ASR text may still contain recognition errors, punctuation errors, or missing words and will not contain reliable speaker labels.
