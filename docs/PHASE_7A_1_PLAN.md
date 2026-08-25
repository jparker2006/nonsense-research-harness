# Phase 7A.1 plan — runtime hardening and frontend first pass

Status: **PASSED** on 2026-08-24 HST.

Phase 7A.1 hardens the working chat-first agent before changing its appearance. After the backend gate passes, the same bounded goal applies one restrained visual pass based primarily on Jake's Glox Brain Lab interface and the product-design guidance in the Impeccable and Popular Web Designs skills.

## Backend scope

1. Repair Phase 7A authorization for the existing OpenRouter embedding and rerank providers. The production-disabled `PHASE7A_LOCAL_LIVE=approved` boundary must authorize query-time hybrid retrieval without weakening the older Phase 3/5/6 proof locks.
2. Add a bounded structured research notebook to each workspace: objective, completed steps, evidence gaps, and next step. It is operational state, not hidden reasoning, and is never sent to the browser as chain-of-thought.
3. Add typed `read_urls` and `open_transcript_chunks` actions. Each accepts at most three already-authorized targets, counts every target against the existing limits, executes independent reads concurrently, preserves per-target failures, and reassesses after the batch.
4. Store at most eight sanitized run traces per workspace. A trace contains public action summaries, bounded safe targets and observations, status, counts, cost, source IDs, and artifact revision; it excludes raw page bodies, prompts, secrets, and private reasoning.
5. Preserve the existing Luna/max controller, Grok/medium optional artifact composer, Mastra turn boundary, OpenRouter provider controls, source allowlists, SSRF policy, zero automatic retries, $1 per-turn cap, and all corpus/history evidence.

## Backend gate

- Deterministic provider tests prove Phase 7A query embedding authorization in local development and refusal in production or without the exact flag.
- Agent tests prove notebook continuity, bounded concurrent reads/opens, target allowlists, partial batch failure, trace sanitization, hard counts, and unchanged artifact/citation behavior.
- Provider-disabled operation remains honest and spends zero.
- A fresh `/api/chat` integration proof exercises chat, tools, follow-up, and artifact behavior through the real route with injected deterministic providers.
- `pnpm gate` passes before visual implementation begins.
- No paid provider call occurs without a separate explicit dollar and request cap.

## Frontend scope

1. Inspect the local Glox Brain Lab application and treat its information density, restrained chrome, typography, and agent-run presentation as the primary reference.
2. Replace the current two-side-rail layout with one primary workspace. Chat remains central; agent activity becomes a compact progressive panel; sources stay in a drawer; the artifact becomes a deliberate workspace view.
3. Preserve every real state and interaction: blank chat, user/assistant turns, tool activity, running, stop, complete, partial, unavailable, failure, citations, sources, artifact, copy, cost, and mobile behavior.
4. Use one restrained product vocabulary, accessible contrast and focus, 44-pixel coarse-pointer targets, reduced motion, and no decorative AI-dashboard tropes.

## Final gate

- Browser verification at desktop and phone widths proves the connected UI, state hierarchy, no horizontal overflow, keyboard focus, source/artifact access, and one-workspace layout.
- Full security/lint/typecheck/test/build gate passes on the exact final tree.
- `V0_SPEC.md`, `BUILD_TODO.md`, and the Phase 7A.1 result record exact architecture, evidence, limitations, and the next decision.
- The exact clean passing commit is pushed to the existing private `origin/main`.

## Explicit deferrals

No deployment, hosted storage, authentication, subagents, additional models, GBrain/LLMwiki, usefulness comparison, transcript/corpus mutation, speaker attribution, audio work, or broad tool catalog is included.
