# Phase 3 — Hybrid transcript retrieval plan

Status: approved architecture; ready for execution through `PHASE_3_GOAL_LAUNCHER.md`.

Phase 3 builds the podcast-archive tool used later by the one agent. It does not build the agent graph, perform episode research, change the UI, deploy anything, or begin Phase 4.

## Outcome

The server can search the Season 3 and 4 transcript archive by exact language and conceptual meaning, return bounded verbatim excerpts with stable source IDs, and open the exact source chunk. Search remains useful in a typed `keyword_only` state when OpenRouter is unavailable.

The runtime pipeline is:

`query → metadata filters → BM25 top 25 + vector top 25 → reciprocal-rank fusion → optional rerank top 20 → top 6 exact excerpts`

The agent will not select retrieval modes or models. Code owns routing, limits, fallback behavior, and source validation.

## Frozen inputs

The authoritative corpus remains in the Desktop project:

- `data/processed/episodes.jsonl`: 59 records, 2,577,783 bytes, SHA-256 `4ceea4085e0bbe36513706f42a7bedf0008ee4b02b52fd7d695b69f585fe219a`
- `data/processed/segments.jsonl`: 441 records, 2,533,810 bytes, SHA-256 `a774dc9e6a1de562105a64c72853ca30ade7bdd54c7e8f84c869eaf6bc8e5155`
- Segment text: 450,988 words total; 12 segments exceed 4,000 words and require smaller retrieval units.

Source files, canonical transcripts, and processed records are read-only in this phase. Generated indexes live under `data/retrieval/`, never under `public/`.

## Retrieval-chunk contract

Generate sentence-aware chunks from each stored segment without rewriting or normalizing text:

- Use Node 24's English sentence segmentation and exact JavaScript string offsets.
- Aim for 250–450 words per chunk.
- Carry at most 60 words of whole-sentence overlap into the next chunk.
- If one sentence exceeds the maximum, split it deterministically on original word boundaries.
- Preserve `start_char` and `end_char`; `segment.text.slice(start_char, end_char)` must equal the stored chunk text exactly.
- Stable chunk ID: `<segment_id>:c<zero-padded chunk index>`.
- Preserve parent episode/segment metadata, timestamps, title, format, corpus role, segment role, and source hashes.
- Every one of the 441 segments must produce at least one chunk. Coverage may overlap but may not contain a source-text gap.

Generated artifacts:

- `data/retrieval/chunks.jsonl` — exact text and metadata
- `data/retrieval/bm25-index.json` — serialized local search index
- `data/retrieval/embeddings.f32` — packed document vectors
- `data/retrieval/manifest.json` — schema version, corpus hashes, chunk count, vector model/dimensions, artifact hashes, and generation receipt

The generator fails closed on duplicate IDs, malformed records, missing parents, uncovered text, mismatched slices, checksum drift, non-finite vectors, dimension mismatch, or incomplete output.

## Local lexical retrieval

- Pin `minisearch@7.2.0`; do not add another search framework.
- Index `text`, `title`, `chapter_label_raw`, and `segment_role`.
- Boost title and chapter-label matches above body text.
- Apply Season, episode-format, corpus-role, and segment-role filters deterministically before final ranking.
- Return no more than 25 BM25 candidates internally.
- BM25 must work without an API key or network access.

## Embedding retrieval

- Endpoint: `https://openrouter.ai/api/v1/embeddings`
- Model: `openai/text-embedding-3-small`
- Dimensions: provider default, expected 1,536; freeze the returned dimension in the manifest.
- Document and query embeddings must use the same exact model and dimensions.
- Provider: Azure only, `allow_fallbacks: false`, `data_collection: "deny"`, `zdr: true`, and maximum input price `$0.02/M` tokens.
- Batch at most 64 chunks per request and checkpoint successful batches by chunk ID.
- Store packed `Float32` vectors in chunk order; do not add a vector database.
- Compute cosine similarity in memory. The corpus is small enough for a linear scan.
- Return no more than 25 vector candidates internally.

The document-embedding artifact is generated once. A runtime search normally makes one cheap query-embedding call; when that call is unavailable, search continues as `keyword_only`.

## Fusion and reranking

- Fuse BM25 and vector candidate ranks with deterministic reciprocal-rank fusion using one frozen constant.
- Deduplicate by `chunk_id` and retain at most 20 candidates for reranking.
- Candidate reranker: `qwen/qwen3-reranker-8b` through OpenRouter.
- Provider: Fireworks only, `allow_fallbacks: false`, `data_collection: "deny"`, `zdr: true`, and maximum input price `$0.20/M` tokens.
- One rerank request maximum per search; return at most 6 matches.
- Reranking is provisional. Retain it in the default runtime only if the frozen evaluation improves semantic retrieval without regressing exact/filter cases. A tie removes the reranker for simplicity.
- If reranking fails, return fused results with `retrieval_status: "hybrid_unreranked"`; do not fail the entire tool.

## Tool contracts

### `search_transcripts`

Input:

- `query`: trimmed string, 2–500 characters
- optional filters: `season`, `episode_format`, `corpus_role`, `segment_role`
- `limit`: integer from 1–10; default 6

Output:

- `retrieval_status`: `complete`, `hybrid_unreranked`, `keyword_only`, `no_match`, or `unavailable`
- bounded matches containing `chunk_id`, `segment_id`, `episode_id`, title, date, season/episode, format/role metadata, timestamps, and a verbatim excerpt
- sanitized score provenance sufficient for debugging without provider payloads or model reasoning
- an explicit empty match list and reason when nothing clears the frozen relevance threshold

### `open_transcript_chunk`

Input: one exact `chunk_id`.

Output: the complete stored chunk text, parent episode/segment metadata, exact offsets, and source IDs; otherwise typed `not_found`.

Neither tool invents speaker attribution. Provider-specific response shapes remain behind the server boundary.

## Frozen evaluation

Before tuning ranking constants, create `tests/fixtures/transcript-retrieval-cases.json` with 12 human-inspected cases and expected source IDs:

- 4 exact/entity/title queries
- 5 conceptual paraphrases
- 2 metadata-filter cases
- 1 genuinely absent topic

Compare BM25, vector, fused, and fused-plus-rerank modes using Recall@5 and mean reciprocal rank. Record individual results, not only aggregate scores.

Acceptance:

- Exact and filter cases: 100% expected-source Recall@5.
- Conceptual cases: at least 80% expected-source Recall@5.
- Fusion must not regress exact/filter Recall@5 versus BM25.
- Reranking stays only if it improves conceptual mean reciprocal rank and causes no exact/filter Recall@5 regression.
- The absent case returns `no_match`, not a confident irrelevant excerpt.

Do not change expected IDs after inspecting ranking output unless the original ground truth is demonstrably wrong and the correction is documented.

## Live-call and cost boundary

Jake approved a `$0.50` Phase 3 OpenRouter budget.

- Allowed purposes: one synthetic embeddings/rerank compatibility smoke test, document/query embedding generation, and the frozen 12-case rerank evaluation.
- Maximum 40 provider requests across Phase 3.
- Maximum 64 embedding inputs per request.
- Maximum 20 documents and one request per rerank evaluation case.
- No chat-completion, Luna, Grok, web-search, URL-read, or generation request is authorized.
- No automatic provider retry. A failed request consumes its recorded slot.
- Record reported tokens, cost, model, provider, latency, status, and cumulative spend without raw transcript text or secrets.
- The `$0.50` value is an approved budget, not a provider-enforced hard ceiling; request and price bounds limit exposure, and execution stops after any response that crosses the budget.
- Lock all Phase 3 live-call scripts after evidence generation.

Expected document-index cost is roughly one to three cents. Typical query embedding plus reranking should remain well below one cent, but actual receipts control the result.

## Implementation order

1. Reverify Git state, corpus counts, relationships, and hashes.
2. Freeze the 12-case evaluation and exact tool schemas.
3. Review and pin MiniSearch; install only that new runtime dependency.
4. Build and test deterministic exact-text chunks.
5. Build and test BM25 retrieval with no provider calls.
6. Implement provider clients and validate them with synthetic text.
7. Generate and verify the document embedding artifact within the approved bounds.
8. Add vector search and deterministic rank fusion.
9. Evaluate reranking and either retain it or remove it according to the frozen rule.
10. Expose the two server-only tool functions and typed degraded states.
11. Run integrity, retrieval, latency, security, cost, test, lint, typecheck, and production-build gates.
12. Write `docs/PHASE_3_RESULT.md`, update `BUILD_TODO.md`, commit once, and push the existing private `origin/main`.

## Phase 3 gate

Phase 3 completes only when:

- The authoritative input hashes still match the frozen snapshot.
- All 59 episodes and 441 segments validate; every segment is represented in the chunk artifact.
- Every chunk is an exact source slice with stable, unique IDs and complete coverage.
- BM25, vector, fusion, retained rerank behavior, filters, limits, empty results, and typed provider failures are tested.
- The frozen relevance acceptance thresholds pass.
- Keyword-only degradation works with all provider access disabled.
- Search cold-start and provider latency are measured and recorded honestly.
- Actual OpenRouter spend is at or below `$0.50`.
- No secret, private reasoning, invented speaker label, or raw provider error enters client output, logs, reports, or Git.
- `pnpm gate` and the production build pass in the authoritative Desktop project.
- `docs/PHASE_3_RESULT.md` records models, providers, corpus/vector hashes, quality metrics, latency, cost, limitations, and the reranker keep/remove decision.
- The exact passing commit is pushed to the existing private repository and the working tree is clean.

Stop after this gate. Do not begin Phase 4, build the agent graph, alter the UI, create hosted infrastructure, or deploy.

## Rollback

All Phase 3 outputs are additive derived artifacts and code. Rollback is the prior Git commit plus deletion of generated `data/retrieval/` artifacts. Source transcripts and processed corpus files remain untouched.

## Primary references checked 2026-08-23

- OpenRouter RAG pipeline: https://openrouter.ai/docs/cookbook/evaluate-and-optimize/rag
- OpenRouter embeddings API: https://openrouter.ai/docs/api/api-reference/embeddings/submit-an-embedding-request
- OpenAI embedding model on OpenRouter: https://openrouter.ai/openai/text-embedding-3-small
- OpenRouter rerank API: https://openrouter.ai/docs/api/api-reference/rerank/submit-a-rerank-request
- Qwen3 Reranker 8B: https://openrouter.ai/qwen/qwen3-reranker-8b
- OpenRouter ZDR policy and live endpoint registry: https://openrouter.ai/docs/guides/features/zdr
