# Phase 6 result — passed

Status: **PASSED** on 2026-08-24 HST. Phase 7 has not started.

Phase 6.0 through 6.5 replaces the Phase 1 mock with the real Phase 5 workflow and a dark, artifact-first local workbench. The corrected authorized replacement browser proof completed with a validated Headlines artifact. Provider access was relocked immediately afterward.

## What works

- The typed AI SDK route streams the real Mastra workflow through a separate bounded browser DTO. Safe activity, terminal state, artifact, source ledger, counts, latency, and accounted cost reach the browser; keys, prompts, raw page bodies, corpus records, hidden reasoning, and raw provider errors do not.
- Browser abort propagates through planning, composition, current-web search, URL reads, embedding, and reranking. Stop is terminal and never starts an automatic retry.
- One local session can have one active run. Duplicate work fails closed. Session state is bounded and memory-only; restart or expiry is reported honestly.
- The workbench handles Headlines and Big Story intake, chronological activity, source inspection, controlled editing, Markdown copy, Stop, explicit Retry, and local evidence-only follow-up while preserving the last valid artifact.
- The layout is verified at 1440×900, 1024×768, and 390×844 with responsive activity/artifact tabs, visible focus, reduced-motion styles, no horizontal overflow, and no browser console errors or warnings.

## Deterministic evidence

Before either paid attempt, the complete provider-free repository gate passed. After the corrected proof, the live report is parsed by the authoritative `phase5RunResultSchema` and revalidated with `validatePhase5Artifact`; the frozen Phase 6 input is also compared byte-for-byte with the preserved Phase 5 Headlines case.

The final gate covers the 144-version supply-chain denylist, ESLint, TypeScript, **150 tests across 21 files**, and a Next.js production build. Browser fixture evidence is preserved in `reports/phase-6-browser-fixture.json`. It covers both episode modes, the real production route/workflow/projection, streamed activity, source drawer, editing, clipboard output, stop, manual retry, follow-up, mobile tabs, focus, labels, reduced motion, and provider-disabled execution at `$0.00`.

## Live-attempt ledger

The original authorized attempt used an incorrectly retyped, nonexistent NASA slug. It failed honestly before composition and remains immutable. Jake then explicitly authorized exactly one replacement using the corrected imported Phase 5 case under the same six-request, `$0.50`, and zero-retry limits.

| Boundary | Original failed attempt | Authorized replacement |
| --- | ---: | ---: |
| Browser starts | 1 | 1 |
| Provider requests, conservative upper bound | 4 / 6 | **5 / 6** |
| Automatic retries | 0 | **0** |
| Luna / Grok composition | 1 / 0 | **1 / 1** |
| Web search / URL read | 1 / 1 | **1 / 1** |
| Transcript search / opens | 1 / 0 | **1 / 0** |
| Repair | 0 | **0** |
| Accounted cost | $0.0204924 | **$0.05391264 / $0.50** |
| Elapsed | 36,374.58 ms | **98,139.81 ms** |
| Terminal state | failed | **complete** |
| Validated artifact | none | **yes** |

Aggregate recorded Phase 6 spend is `$0.07440504`. No paid follow-up, Big Story run, retry, fallback, or additional attempt occurred.

## Corrected browser proof

The browser visibly submitted the exact frozen case:

- topic: NASA's August 24, 2026 article `What Lake Bonneville Left Behind` and what its ancient shorelines reveal;
- supplied URL: `https://science.nasa.gov/earth/earth-observatory/what-lake-bonneville-left-behind/`;
- target clock: eight minutes.

The real route then:

1. read the NASA page successfully;
2. completed one current-web search with one result;
3. searched the S3–4 archive and returned the honest `no_match` state;
4. composed and deterministically validated the packet without repair;
5. streamed `complete`, the artifact, source ledger, and `$0.0539` UI receipt.

The artifact has six clocked beats totaling exactly eight minutes, includes `must_have`, `use_if_time`, and `cut_first` priorities, resolves every factual citation to `web_0f75b14faed2914ffab6`, and records zero validation errors. The browser displayed the terminal state and artifact without logs. Its console contained zero errors and zero warnings.

Authoritative evidence:

- `reports/phase-6-live.json` — corrected replacement report, SHA-256 `31dcd6576ccb9f8552d4fc890b7909f081dcd065637e1ab82601884890bdc540`
- `reports/phase-6-live-browser-evidence.json` — safe browser sequence and receipt, SHA-256 `39c641fd854dac682be6c6a4c86fe12910917499673059876286d65b4881efd1`
- `reports/phase-6-live-attempt-1-failed.json` — original failed report, unchanged SHA-256 `73f1c3b558bcf50c46468d53bb9cf02b9e6ba5ae7264346a77df7f1818a21ea3`
- `reports/phase-6-live-browser-evidence-attempt-1-failed.json` — original browser diagnosis, unchanged SHA-256 `37f7d194dfc242eeb266247194159bfab2fdaa924f00d613fa99a14ab0d0aa3f`

## Integrity and locks

- `PHASE_6_LIVE_UI_DISABLED = true`
- `PHASE_5_LIVE_CALLS_DISABLED = true`
- The live route is additionally denied in production and its one-shot report path is consumed.
- The ignored `.env.local` remains outside Git; client modules do not import the Phase 5 provider/corpus graph.
- Phase 5 reports remain unchanged:
  - `reports/phase-5-live.json`: `fb1ec9c4e59eea5aea98e0cc48668a1a90ea937103a923a386d40be695675fc4`
  - `reports/phase-5-1-compose-proof.json`: `d231d14b5f35f7ffc331aa1992a52e0ad7e3ab70dd1b555542cc843d4b712ed2`
- Corpus and retrieval artifacts remain unchanged:
  - episodes: `4ceea4085e0bbe36513706f42a7bedf0008ee4b02b52fd7d695b69f585fe219a`
  - segments: `a774dc9e6a1de562105a64c72853ca30ade7bdd54c7e8f84c869eaf6bc8e5155`
  - chunks: `c5667e392c8b242ab96c55b1b0f4c10d0dc74e883940cde0c1b78e433f3ecfd8`
  - BM25: `c58293b55a95aad89621872b9387a285ab7355979fc752269a4fdf76ca7c4e02`
  - embeddings: `ed72ac74f763c9eaab7443400f4a481ae703882b8d20926c0efc5b6f2fc05961`

## Honest limitations

- Only the supplied NASA page survives into the final source ledger. The current-web search proves the newest-web tool path but did not add an independent source to this packet.
- The archive returned no relevant match, so the artifact contains no transcript excerpt and no speaker attribution.
- Live latency was about 98 seconds, driven mostly by current-web search and Grok composition.
- The live artifact was verified through the browser's accessible DOM snapshot. The local server was intentionally stopped immediately after relocking, so a post-run screenshot and exact live viewport read were unavailable; the identical production component has separate three-viewport fixture evidence.
- Follow-up is deliberately evidence-only and local. It marks added instructions as not independently researched. Persistence, authentication, hosted infrastructure, deployment, and multiplayer remain deferred.
- The paid Phase 6 proof covers Headlines. Big Story remains proven by deterministic Phase 6 fixtures plus the completed Phase 5.1 evidence, not a new paid Phase 6 run.

## Gate decision

Phase 6 **passes**. A user can run the real bounded workflow through the browser, watch safe tool activity, receive and edit a cited clock-aware packet, inspect sources, stop, retry manually, and refine the retained artifact. The live report stays within six provider requests, zero automatic retries, and `$0.50`; all provider gates are locked. Phase 7 must be separately hardened and approved before persistence or authentication work begins.
