# Phase 3 goal launcher

Copy and send the text below to Codex from the Nonsense project thread.

---

Create and pursue a goal to complete Phase 3 of the Nonsense Research Harness.

Treat `/Users/jakeparker/Desktop/Nonsense Podcast Project` as the only authoritative repository and read these files before acting:

- `docs/PHASE_3_PLAN.md`
- `BUILD_TODO.md`
- `V0_SPEC.md`
- `docs/PHASE_2_RESULT.md`

Execute `docs/PHASE_3_PLAN.md` completely. The approved Phase 3 architecture is deterministic exact-text chunking, pinned MiniSearch BM25, `openai/text-embedding-3-small` embeddings through OpenRouter's ZDR Azure endpoint, reciprocal-rank fusion, and an evaluation-gated `qwen/qwen3-reranker-8b` through the ZDR Fireworks endpoint. Expose `search_transcripts` and `open_transcript_chunk` as server-only tool functions with honest keyword-only and unavailable states.

The Phase 3 OpenRouter budget is `$0.50` total and no more than 40 provider requests. Only embedding and rerank requests described by the plan are authorized. Do not call Luna, Grok, chat completions, web search, or URL tools. Do all deterministic work and tests before paid calls. Do not modify source transcripts or processed corpus records, expose the corpus publicly, add a vector database, create hosted infrastructure, deploy, or begin Phase 4.

Do not mark the goal complete merely because code exists. Complete every Phase 3 gate in the plan: corpus and chunk integrity, frozen 12-case quality evaluation, reranker keep/remove decision, provider-disabled degradation, latency/cost/security evidence, full `pnpm gate`, `docs/PHASE_3_RESULT.md`, and a clean exact passing commit pushed to the existing private `origin/main`. Preserve failures and limitations honestly. If the reranker does not meet its frozen acceptance rule, remove it from the default runtime and still complete Phase 3 with BM25 plus vector fusion. Stop immediately after the Phase 3 gate and report the exact commit, quality metrics, spend, artifacts, limitations, and final token usage from the completed goal.

---
