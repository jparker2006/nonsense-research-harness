# Phase 3 result — hybrid transcript retrieval

Status: **PASSED** on 2026-08-23. Phase 3 stops here; no Phase 4 work, agent graph, UI integration, hosted service, or deployment was started.

## Delivered

The private server-side archive now has:

- deterministic sentence-aware exact-text chunks with stable source offsets;
- a pinned `minisearch@7.2.0` BM25 index;
- packed `Float32` document vectors from `openai/text-embedding-3-small` through OpenRouter's Azure ZDR route;
- in-memory cosine retrieval and reciprocal-rank fusion;
- the retained `qwen/qwen3-reranker-8b` through OpenRouter's Fireworks ZDR route;
- `search_transcripts` and `open_transcript_chunk` server-only functions;
- typed `complete`, `hybrid_unreranked`, `keyword_only`, `no_match`, `unavailable`, and `not_found` behavior.

No vector database was added. No transcript or retrieval artifact is under `public/`. The processed corpus was not modified.

## Corpus and artifact integrity

| Item | Result |
| --- | --- |
| Episodes | 59 validated; 2,577,783 bytes; SHA-256 `4ceea4085e0bbe36513706f42a7bedf0008ee4b02b52fd7d695b69f585fe219a` |
| Segments | 441 validated and represented; 2,533,810 bytes; SHA-256 `a774dc9e6a1de562105a64c72853ca30ade7bdd54c7e8f84c869eaf6bc8e5155` |
| Chunks | 1,259 unique, gap-free exact source slices; 3,277,930 bytes; SHA-256 `c5667e392c8b242ab96c55b1b0f4c10d0dc74e883940cde0c1b78e433f3ecfd8` |
| BM25 index | 2,592,054 bytes; SHA-256 `c58293b55a95aad89621872b9387a285ab7355979fc752269a4fdf76ca7c4e02` |
| Embeddings | 1,259 × 1,536 finite `Float32` vectors; 7,735,296 bytes; SHA-256 `ed72ac74f763c9eaab7443400f4a481ae703882b8d20926c0efc5b6f2fc05961` |

Every artifact is checksum-verified at load. Generation fails on corpus drift, malformed or duplicate records, missing parents, uncovered text, mismatched slices, incomplete vectors, dimension drift, or non-finite values. One legitimate short-notice episode has a null episode number; the schema preserves that source value rather than inventing one. No speaker attribution was added.

## Frozen retrieval evaluation

The 12 expected-source cases were frozen before ranking output was inspected: 4 exact, 5 conceptual, 2 metadata-filter, and 1 genuinely absent case. Expected IDs were not changed.

| Mode | Exact Recall@5 / MRR | Conceptual Recall@5 / MRR | Filter Recall@5 / MRR | Absent result |
| --- | --- | --- | --- | --- |
| BM25 | 100% / 1.00 | 80% / 0.667 | 100% / 1.00 | no match |
| Vector | 100% / 0.875 | 80% / 0.70 | 100% / 1.00 | no match |
| Fused | 100% / 1.00 | 80% / 0.80 | 100% / 1.00 | no match |
| Fused + Qwen reranker | **100% / 1.00** | **100% / 0.90** | **100% / 1.00** | **no match** |

The reranker is retained because conceptual MRR strictly improved from 0.80 to 0.90, conceptual Recall@5 improved from 80% to 100%, and exact/filter Recall@5 did not regress. The deterministic vector rejection floor was set to `0.30` after the frozen local diagnostic: the absent query peaked at `0.2906`, while useful evidence in every relevant case was at least `0.3628`.

Individual case rankings and the frozen decision are in `reports/phase-3-evaluation.json`. The pre-rerank threshold evidence is in `reports/phase-3-local-evaluation.json`.

## Provider, request, and spend evidence

Both live routes used `allow_fallbacks: false`, `require_parameters: true`, `data_collection: "deny"`, `zdr: true`, and a provider-specific maximum input price.

| Purpose | Model and route | Requests | Reported tokens | Reported cost |
| --- | --- | ---: | ---: | ---: |
| Embedding smoke, 20 document batches, 12 query embeddings | `openai/text-embedding-3-small` → Azure | 22 succeeded, 1 validation failure | 595,130 on successful receipts | $0.0119026 |
| Rerank smoke and 11 non-empty evaluation cases | `qwen/qwen3-reranker-8b` → Fireworks | 12 succeeded | 97,306 | $0.0194612 |
| **Total recorded** | | **35 / 40 requests** | | **$0.0313638 / $0.50** |

Request 1 received a valid embedding HTTP response but the local receipt validator rejected OpenRouter's provider-native model alias before its usage was recorded. That failure is preserved in the ledger. The identical successful retry reported 10 tokens and $0.0000002; applying the pinned price ceiling gives a conservative total exposure of no more than **$0.0313640**. There were no automatic retries. No Luna, Grok, chat-completion, web-search, URL-read, or generation request was made.

All paid commands in `scripts/run-phase3-retrieval.ts` are statically locked after evidence generation. The ledger, including failures, provider aliases, latency, reported tokens, cost, and cumulative limits, is `reports/phase-3-usage.json`. It contains no transcript text or API key.

## Latency

| Measurement | Result |
| --- | --- |
| Retrieval artifact cold load during frozen evaluation | 157.51 ms |
| Separate provider-free cold load | 208.13 ms |
| Local BM25 + vector scan + fusion, 60 samples | 9.95 ms median; 24.76 ms p95; 29.96 ms max |
| Successful Azure embedding requests | 1,428.66 ms median; 2,008.34 ms p95; 2,137.65 ms max |
| Successful Fireworks rerank requests | 784.69 ms median; 1,577.13 ms p95/max |

The local benchmark uses document vectors as deterministic stand-ins for query vectors, measures only local retrieval compute, and makes no provider request. Its receipt is `reports/phase-3-latency.json`.

## Security and degradation

- API access stays server-side; `.env.local` is ignored, mode `0600`, and absent from Git.
- Provider routing is pinned to Azure or Fireworks, fallback is disabled, and ZDR/data-denial flags are required.
- Raw provider errors and response bodies never enter tool output, logs, reports, or client state.
- With provider access absent, exact keyword search remains useful as `keyword_only`; a failed query embedding returns keyword results when possible and otherwise `unavailable`.
- A rerank failure returns deterministic fused results as `hybrid_unreranked`.
- The absent frozen topic returns `no_match`, not an irrelevant excerpt.
- Returned excerpts are bounded, verbatim source text with stable IDs; `open_transcript_chunk` returns the exact full stored chunk.

## Verification

- `pnpm audit --json`: zero known vulnerabilities after adding MiniSearch.
- Supply-chain denylist: clean across 144 known-bad Mastra versions.
- Deterministic suite: 7 test files, 29 tests passed before the final full gate.
- Final `pnpm gate`: denylist, lint, typecheck, 29 tests, and the Next.js production build passed on the completed Phase 3 tree.

## Limitations

- The archive contains only the available Season 3 and 4 corpus: 59 episodes and 441 processed segments.
- The corpus has no reliable speaker labels, so search returns episode/segment evidence without claiming CJ or Jeff said a line.
- Twelve frozen cases are a useful regression gate, not comprehensive relevance proof. More real host queries may expose ranking gaps.
- Hybrid runtime search needs one query-embedding call and, when candidates exist, one rerank call. Provider-disabled operation is lexical only.
- The in-memory linear vector scan is intentionally sized for this corpus; a much larger archive would need a separately approved scaling decision.
- The tools are implemented but not wired into the research agent or UI; that belongs to a later phase.
- Hosted runtime authorization, persistence, deployment, and Phase 4 research tools remain unbuilt and unauthorized.
