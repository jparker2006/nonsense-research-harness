# Phase 7A.1 result — runtime hardening and frontend first pass

Status: **PASSED** on 2026-08-24 HST.

Phase 7A.1 hardened the existing local chat agent and completed one restrained visual pass. It did not add another model, subagent, database, deployment, corpus mutation, or paid proof run.

## What changed

### Runtime

- Repaired the transcript-provider authority boundary. `PHASE7A_LOCAL_LIVE=approved` now authorizes the existing query embedding and accepted reranker only in non-production execution. Production and missing-authority paths continue to fail closed, and the older Phase 3/5/6 locks remain valid.
- Added a bounded structured research notebook: objective, completed steps, evidence gaps, and next step. This is public operational state, not private reasoning.
- Added typed `read_urls` and `open_transcript_chunks` controller actions. Each accepts one to three already-authorized targets, validates all targets before work, counts each target against the original limits, runs independent work concurrently, and preserves individual unavailable results.
- Added up to eight sanitized run traces per workspace. A trace retains public summaries, safe targets and bounded observations, status, counts, accounted cost, source IDs, artifact revision, and limitations. Raw page bodies, prompts, secrets, and private reasoning are excluded.
- Preserved the Luna/max controller, optional Grok/medium artifact composer, Mastra turn boundary, existing safe tools, exact source validation, zero automatic retries, and `$1.00` per-turn ceiling.

### Interface

- Replaced the permanent session and activity rails with one primary workspace.
- Kept chat as the default view; preparation packets use a deliberate document view and sources open in an on-demand drawer.
- Moved observable agent work into one compact inline activity panel with progressive disclosure.
- Applied a light Glox Brain Lab-inspired system with Geist, restrained blue, compact chrome, readable surfaces, explicit focus treatment, reduced motion, and mobile tap targets.
- Preserved the real `/api/chat` transport. No fixture/demo selector or silent sample run was added.

The visual decisions are recorded in `DESIGN.md`. The local Glox Brain Lab application was inspected read-only. Impeccable, Popular Web Designs, Frontend Design, and Design Taste Frontend guidance shaped the pass; the primary reference remained the user's own Glox interface.

## Deterministic evidence

- Focused tests: 26/26 passed across `tests/phase7a.test.ts` and `tests/transcript-providers.test.ts`.
- Full gate: supply-chain denylist, lint, TypeScript, 171 tests in 22 files, and the Next.js production build passed.
- The injected `/api/chat` integration test still streams run, activity, message, source, and receipt parts while excluding raw evidence and secrets.
- Provider tests prove local Phase 7A embedding authority and production refusal without making a provider request.
- Runtime tests prove notebook continuity, two-way parallel web and archive work, partial batch failure, target allowlists, trace retention/sanitization, hard counts, stop, source integrity, and artifact behavior.
- Impeccable's static detector returned zero findings for the final component and stylesheet.
- Desktop browser check: one workspace, zero legacy rail elements, zero horizontal-overflow elements, and zero console warnings/errors.
- Phone browser check: zero horizontal-overflow elements; visible new-research and send controls measured as 44-pixel tap targets; the starter action populated the composer without submitting a run.
- Keyboard check: the new-research control received the explicit blue focus-visible outline.
- Browser observations are summarized in `reports/phase-7a-1-browser.json`.

## Provider and cost evidence

- Paid provider requests: **0**
- Accounted Phase 7A.1 spend: **$0.00**
- No Luna, Grok, embedding, rerank, web-search, or URL provider proof call was made.

## Limitations and next decision

- The semantic-retrieval authority repair is deterministically proven but was not re-proven against OpenRouter in this phase because no new metered-call budget was authorized. Runtime degradation remains honest.
- The blank and starter/composer states were visually exercised in the current browser pass. Activity, source, and artifact behavior remain covered by deterministic route/component tests and the earlier connected Phase 7A browser proof; they were not regenerated through a paid live turn for this visual-only pass.
- Workspaces are still in-memory and local. Reload hydration, persistence, authentication, Vercel deployment, simultaneous collaboration, and durable run recovery remain deferred.
- This is a first visual pass, not final visual acceptance. Jake should review it on the laptop before further polish.
- After that review, Phase 8 should compare usefulness against the frozen Phase 5 workflow and plain Gemini/Grok before persistence or deployment.
