# One-Agent Nonsense Research — Result

Status: **PASSED**

Build authority: `docs/ONE_AGENT_RESEARCH_SPEC.md` and private issue `#2`.

## Outcome

The live application now uses one GPT-5.6 Luna Max `ToolLoopAgent` through OpenRouter for ordinary Standard questions, explicit Deep Research, follow-ups, and explicitly requested Headlines or Big Story Working Artifacts. Research Depth changes ceilings only. The production dependency factory cannot select the previous Standard forced-synthesis runtime, Deep manager/worker graph, Grok composer, fallback manager, or model-mediated OpenRouter Exa plugin.

```text
conversation + saved evidence
            |
     one Luna tool loop
            |
   +--------+---------+----------------+
   |                  |                |
direct Exa       safe URL reads   S3-S4 archive
candidates       trusted pages    search + exact open
   |                  |                |
   +--------+---------+----------------+
            |
 typed cited answer boundary
            |
 natural answer OR explicit-only validated Working Artifact
```

The five product tools are `search_web`, `read_urls`, `search_transcripts`, `open_transcript_chunks`, and explicit-only `create_or_update_artifact`. An internal `submit_answer` boundary validates paragraphs and exact numbered citations without invoking a second model or clean-context composer.

## Implemented contracts

- Direct Exa Search API discovery uses bounded parallel queries, at most ten candidates per query, strict response parsing, normalized URL de-duplication, and typed missing-key, authorization, rate-limit, timeout, malformed-response, provider, stopped, no-match, and partial states.
- Search results remain untrusted candidates until the hardened URL reader successfully opens them. Search snippets never become citeable evidence.
- The model chooses whether to search the web or Season 3-4 archive. Opened archive passages retain exact episode, segment, chunk, and quote provenance without invented speaker attribution.
- Same-session AI SDK tool-call/result history, evidence, candidates, archive matches, and the current artifact persist in process memory. History compaction removes complete units so a tool result can never survive without its matching tool call.
- Repetition suppression is scoped to one run. Legitimate follow-up turns may refresh the same action.
- Standard permits six searches, sixty candidates, twelve URL reads, four concurrent reads, twelve Luna steps, a 50-second new-research cutoff, a 120-second hard safety deadline, and a `$0.50` combined ceiling. Deep uses the same loop with broader six-minute and `$2.00` ceilings.
- Headlines and Big Story outlines use only `essential`, `strong`, and `optional`. They contain no minute estimate or locked running order.
- Explicit artifact requests force one bounded repair after an invalid draft before the chat answer may finish. The server hydrates archive machine identifiers from an opened source; Luna supplies only a selected citation and exact quote.
- The answer boundary permits at most two same-context recovery calls for an empty or invalid typed submission. No whole-run retry, model fallback, critic, or second workflow exists.
- Receipts separate Luna, Exa, transcript-retrieval, and combined accounted cost. UI citations show human-readable publishers or S3-S4 episode labels while machine IDs remain server-only.
- `prompts/research-agent/ONE_AGENT.md` is the sole active product system prompt. Earlier manager, worker, answer, fallback, Standard, Deep, and brief prompts are superseded historical/test-fixture evidence.

## Watched browser proof — PASSED

The final accepted proof ran in one fresh browser session on 2026-08-27 with direct Exa, the hardened page reader, the validated S3-S4 archive, and live Luna. No fixture, Opus call, model fallback, or whole-run retry was used.

| Turn | Exact request | Observed result | Time | Requests | Cost |
|---|---|---|---:|---:|---:|
| Current web | “What’s actually going on with new U.S. rules and policy around AI data centers using so much electricity and water? Is this a real constraint or mostly headlines?” | 6 searches, 46 candidates, 6 URL reads, 3 human-readable cited sources; conclusion distinguished real grid/ratepayer constraints from local water constraints | 1m 10s | 11 | `$0.0527` |
| Archive follow-up | “Did Nonsense cover anything in Seasons 3 or 4 that changes how we should frame this? Check the archive and connect the most relevant past episode to your answer.” | exact archive search/open, 4 passages, cited S4E28 and S4E29, connected interconnection and cooling trade-offs to saved DOE/New York evidence | 43s | 14 | `$0.0285` |
| Explicit artifact | “Turn this into a Headlines preparation brief. Rank the material as essential, strong, or optional, and give me a suggested order—no minute-by-minute timing.” | artifact revision 1 saved after one forced bounded repair; inline packet contains all three priorities, sourced research, questions, open checks, references, and no minute fields | 1m 12s | 4 | `$0.0337` |
| **Passing proof total** | | | **3m 05s** | **29** | **`$0.1149`** |

The three-turn proof stayed well below its `$1.00` ceiling. Recorded diagnostic and proof receipts total `$0.9567`; one earlier failed artifact attempt was not retained through context compaction, so applying its entire per-turn `$0.30` local cap gives a conservative maximum of `$1.2567`, still below the authorized `$3.00` aggregate ceiling.

## Failures and repairs preserved

- Direct Exa initially received empty domain-filter arrays. The adapter now omits empty optional filters, with a route regression test.
- Early Standard runs consumed the entire response window on research. New research now cuts off at 50 seconds while a 120-second hard safety boundary preserves bounded synthesis and repair room.
- Free-form final prose sometimes omitted citations or exposed tool protocol. The same Luna loop now submits typed paragraphs plus numbered citations through an internal validated answer boundary.
- One run returned an empty answer submission after a single recovery. The loop now allows at most two bounded same-context submission recoveries; it still never retries research as a whole.
- Raw message-count/character compaction orphaned a tool result from its call, causing OpenRouter to reject a later artifact turn before billing. Compaction now removes complete history units and repairs persisted history before every provider call; a three-turn regression covers the boundary.
- Artifact generation asked Luna to repeat episode, segment, and chunk IDs that the server already owned. The generated contract now accepts an archive citation and exact quote, then server-hydrates and validates the stable corpus IDs.
- After one invalid artifact draft, Luna could answer in chat without spending the permitted repair. An explicit artifact request now forces the second artifact attempt before answer completion. The accepted proof exercised this path and saved revision 1.
- Several page reads were unavailable or content-type denied. Those candidates remained non-citeable, the limitations stayed visible, and the final answers used only successfully opened sources.

No failed run was silently counted as passing. Each replacement browser sequence followed a code/test repair, and no automatic whole-run retry occurred.

## Deterministic verification

The complete final `pnpm gate` passed on 2026-08-27:

- supply-chain denylist: 144 known-bad versions checked, clean;
- ESLint: passed;
- TypeScript: passed;
- Vitest: 27 files and 258 tests passed;
- Next.js 16.3.2 production build: passed, with `/` static and `/api/chat` dynamic.

The suite covers direct Exa boundaries, candidate-only search, hardened reads, six-query parallelism, exact archive provenance, same-session history, safe history compaction, legitimate follow-up refresh, typed answer recovery, explicit artifact gating, forced bounded repair, server-owned archive-ID hydration, revision/manual-edit preservation, priority-only artifacts, provider-disabled degradation, citation/source projection, fresh sessions, secret safety, receipts, and no whole-run retry.

## Corpus and retrieval integrity

The accepted baseline is:

| Artifact | SHA-256 | Bytes |
|---|---|---:|
| `data/processed/episodes.jsonl` | `4ceea4085e0bbe36513706f42a7bedf0008ee4b02b52fd7d695b69f585fe219a` | 2,577,783 |
| `data/processed/segments.jsonl` | `a774dc9e6a1de562105a64c72853ca30ade7bdd54c7e8f84c869eaf6bc8e5155` | 2,533,810 |
| `data/retrieval/chunks.jsonl` | `c5667e392c8b242ab96c55b1b0f4c10d0dc74e883940cde0c1b78e433f3ecfd8` | 3,277,930 |
| `data/retrieval/bm25-index.json` | `c58293b55a95aad89621872b9387a285ab7355979fc752269a4fdf76ca7c4e02` | 2,592,054 |
| `data/retrieval/embeddings.f32` | `ed72ac74f763c9eaab7443400f4a481ae703882b8d20926c0efc5b6f2fc05961` | 7,735,296 |
| `data/retrieval/manifest.json` | `a626743a0a24218bfe1052323aa09519411e382ba336d82d0cda693cffa898e9` | 1,571 |

## Honest limitations

- Session continuity is process-local. A dev hot reload, restart, expiry, or New Research clears server state; there is no persistence, cross-device history, or multi-instance synchronization.
- Past Nonsense Coverage is bounded to the validated 59-episode Season 3-4 corpus. A bounded no-match is not proof the podcast never discussed a subject.
- Search quality still depends on readable public pages. Inaccessible pages remain candidates only and can leave an answer partial.
- The accepted Standard turns met the 45–90 second target, but an artifact with a validation repair took 72 seconds; the target is not a latency guarantee.
- Luna remains provisional. This pass did not call Opus or claim universal superiority over general frontier assistants.
- Legacy runtime modules remain as historical regression evidence, but production routing cannot select them.
- No deployment or Git push is authorized by this result.

## Final gate and commit

The watched proof and complete repository gate passed. Exact corpus-hash recheck, the local commit, and clean-tree evidence are recorded in the final handoff.
