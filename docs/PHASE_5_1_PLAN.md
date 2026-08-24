# Phase 5.1 plan — harden Big Story composition

Status: approved for provider-free implementation on 2026-08-24 HST. This repair phase preserves all four Phase 5 live attempts and does not authorize another provider request, deployment, persistence, Phase 6, or a commit/push.

## Problem to fix

The replacement Big Story run proved planning, current-web retrieval, archive retrieval, exact chunk opening, evidence capture, and bounded execution. It failed only at final composition: Grok returned a receipt but no parseable artifact, and the remaining run time was not enough for a useful repair. The adapter discarded the safe completion metadata needed to distinguish truncation, empty output, and malformed JSON.

The model-facing Big Story contract is also larger than the MVP needs. It repeats related evidence across several arrays, asks the model to echo machine-owned source metadata, and duplicates each archive text in the prompt as both an excerpt and content.

## Frozen repair

1. Preserve sanitized generation ID, finish reason, output character count, parse status, and reasoning-token usage when supplied. Never store raw failed model output.
2. Treat empty, truncated, incomplete, and invalid-JSON output as distinct terminal composition failures. Do not spend the repair call when no parseable artifact exists.
3. Keep the final artifact's source ledger, but construct it deterministically from cited evidence IDs. Grok never generates or repairs machine-owned ledger records.
4. Consolidate the Big Story's repeated evidence sections into a compact research brief plus typed research cards: background, key evidence, force, interpretation, surprise, and optional recommendation lead.
5. Keep the clock-aware modular outline, exact archive coverage, conversation questions, open checks, and source validation.
6. Send each evidence body to Grok once. Keep Grok 4.6 at medium effort, raise its combined reasoning/output allowance from 6,000 to 12,000 tokens, and raise the whole-run ceiling from 180 to 300 seconds so one bounded repair can have real time.
7. Execute both planned web queries for Big Story within the existing two-search ceiling. Search prior Big Story `story_section` chunks, divide the four-open allowance across the two archive queries, and never reopen the same chunk.

## Deterministic gate

- Both modes complete through the real Mastra graph with zero network/provider calls.
- A maximum-shape Big Story draft stays inside the 12,000-token model contract and hydrates only cited source records.
- Empty output, invalid JSON, `finish_reason=length`, and other incomplete finish states retain safe receipts, return exact failure codes, and make no repair call.
- A parseable artifact with citation/schema errors still receives at most one repair.
- Big Story executes at most two web searches, two transcript searches, and four unique transcript opens with substantive-story filters.
- Historical `reports/phase-5-live.json` remains byte-preserved and all corpus/retrieval hashes remain unchanged.
- A statically locked launcher reconstructs the frozen evidence packet locally and can make exactly one future Grok composition request without research/tool calls or retry.
- Dependency audit and full `pnpm gate` pass with all live launchers locked.

## Separately authorized proof

After this deterministic gate, stop. The locked next proof is one composition-only Grok call against frozen packet SHA-256 `ca1049a6e4b0b733564775b384757c005e53543385bbc77074b70898e91d8798`, with no web, URL, embedding, rerank, transcript-query, or Luna calls and no retry. It needs separate approval with an exact one-request dollar cap before any provider access.
