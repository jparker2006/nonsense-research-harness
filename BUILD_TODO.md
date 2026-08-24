# Nonsense Research Harness — Build TODO

Status: Phase 2 passed with recorded limitations on 2026-08-23. Phase 3's hybrid transcript-retrieval architecture and `$0.50` OpenRouter budget are approved and frozen in `docs/PHASE_3_PLAN.md`; implementation has not started. Hosted databases, Vercel projects, and deployment remain unauthorized.

## Intended v0 outcome

CJ or Jeff can open a private web application, start a Headlines or Big Story workspace, paste a topic, links, and rough notes, and watch one agent research the web and the podcast archive. The interface shows useful tool activity without exposing private chain-of-thought. The run ends with an editable, cited preparation artifact and can be reopened later.

The product prepares conversation material. It does not choose the final stories, imitate either host, invent dialogue, or automate away CJ and Jeff's deliberation.

## Current project state

- Current planning folder: `/Users/jakeparker/Documents/Codex/2026-08-21/my-dad-has-a-podcast-nonsense`
- Authoritative project root selected for Phase 0: `/Users/jakeparker/Desktop/Nonsense Podcast Project`
- Both folders contain byte-identical copies of `WORKFLOW.md` as verified on 2026-08-23.
- The Phase 1 application is installed and green in the authoritative Desktop root. It streams a deterministic zero-cost fixture through the real Next.js, AI SDK, assistant-ui, and Mastra boundaries.
- Local `main` tracks the verified private repository `jparker2006/nonsense-research-harness`; the Phase 1 implementation commit is `972bc24`.
- The processed corpus already lives in the authoritative Desktop project:
  - 59 episode records: `/Users/jakeparker/Desktop/Nonsense Podcast Project/data/processed/episodes.jsonl`
  - 441 segment records: `/Users/jakeparker/Desktop/Nonsense Podcast Project/data/processed/segments.jsonl`
- The processed files are about 4.9 MB combined. They are small enough for a simple server-side archive index in v0.

## Phase rules

- Complete only one phase at a time.
- Before executing a phase, review and approve its scope, dependencies, external effects, costs, secrets, and rollback path.
- Start with mocked or deterministic verification. Live provider calls come last.
- Every phase ends at a hard gate. Do not begin the next phase automatically.
- A failed gate means diagnose and revise the current phase; do not add more architecture to work around an unexplained failure.
- Do not use floating dependency versions or blindly install `latest`.
- Do not make an OpenRouter call without a recorded provider, purpose, request limit, token/tool limit, and dollar cap.
- Do not create a hosted database, Git remote, Vercel project, or deployment without separate approval at the relevant phase.
- Preserve honest partial and unavailable states. Never fabricate a source, quote, archive match, or completed action.

## Provisional stack

The application/runtime stack passed Phase 1. The pinned provider/model boundary passed Phase 2 with the limitations recorded in `docs/PHASE_2_RESULT.md`.

- Application: Next.js and TypeScript
- Agent UI: `assistant-ui`, adapted from the maintained Mastra UI examples
- Agent/workflow runtime: Mastra
- Model gateway: OpenRouter
- Models: a deterministic two-tier pair — GPT-5.6 Luna/max for light structured/tool work and Grok 4.6/medium for heavy research and synthesis
- Model tools: OpenRouter web search plus three local tools
- Deployed persistence: remote libSQL/Turso
- Deployment target: one Vercel application
- Development observability: Mastra traces/Studio or equivalent local traces

## Phase 0 — Freeze the v0 specification

### Approved product decisions

- [x] The Desktop project is the authoritative project root.
- [x] A v0 workspace prepares one story/topic, not an entire episode or the complete Headlines funnel.
- [x] A workspace has one of two modes: Headlines or Big Story.
- [x] The primary artifact combines sourced research with a flexible outline; it is not a finished script.
- [x] Transcript retrieval is a server-side source tool and does not require speaker attribution.
- [x] The interface shows sanitized tool activity and status, not private chain-of-thought.

### Harden before writing

- [x] Copy the current `BUILD_TODO.md` into the authoritative Desktop root; do not duplicate or move the corpus.
- [x] Reconfirm the two `WORKFLOW.md` files remain byte-identical before treating the Desktop copy as canonical.
- [x] Record the existing processed-corpus checksums and line counts in the spec; no corpus copy is planned.
- [x] Define the exact shared input fields: mode, topic, supplied links, rough notes, and optional time budget.
- [x] Define the exact Headlines and Big Story artifact fields.
- [x] Define the visible tool-event vocabulary and safe expandable details.
- [x] Define follow-up behavior: the user can question or redirect the same agent while the artifact remains editable.
- [x] Mark Mastra as provisional until the compatibility and Vercel bundle spike passes.

### Write

- [x] Create one concise `V0_SPEC.md` containing:
  - Product purpose, users, and non-goals
  - Golden-path user experience
  - Headlines input and output contract
  - Big Story input and output contract
  - Tool contracts
  - Agent graph and stop conditions
  - Visible activity/event contract
  - Data, persistence, authentication, and Vercel design
  - Cost, security, reliability, and unavailable-state rules
  - Evaluation cases and done criteria
  - Explicitly deferred features

### Phase 0 gate — STOP

- [x] The spec describes one coherent end-to-end experience without unresolved core product behavior.
- [x] Every required v0 feature maps to a testable acceptance criterion.
- [x] Optional ideas are outside the core build rather than mixed into it.
- [x] Jake reviews and approves `V0_SPEC.md`.
- [x] No code or dependency work starts until this gate is approved.

## Phase 1 — Prove the stack safely

This phase proves compatibility; it does not build the product.

### Harden before running

- [x] Inspect current official versions, release history, open security advisories, Node requirements, and Vercel compatibility.
- [x] Explicitly reject every known compromised Mastra package version from the June 2026 incident.
- [x] Pin exact dependency versions in `package.json` and commit a frozen `pnpm-lock.yaml`.
- [x] Configure pnpm to delay newly published packages and allow install scripts only for reviewed dependencies.
- [x] Review the dependency tree for unexpected packages, postinstall scripts, native binaries, and known vulnerabilities before a normal install.
- [x] Decide whether Mastra can run directly in a Next.js route; avoid `@mastra/deployer-vercel` unless it is demonstrably needed.
- [x] Define a fallback: replace Mastra with LangGraph.js while preserving the product/tool contracts if the spike fails.
- [x] Obtain approval before downloading dependencies.

### Prove with no model spend

- [x] Initialize the project and Git locally; a private remote is allowed by Jake's subsequent explicit approval.
- [x] Scaffold the smallest Next.js application and a placeholder streaming route.
- [x] Add the minimum agent/runtime packages only.
- [x] Render mocked text, tool-start, tool-result, error, and completion events in a minimal page.
- [x] Run a production Next.js build.
- [x] Run a local Vercel-equivalent function trace and bundle inspection without deploying.
- [x] Record function bundle size and build warnings in `docs/PHASE_1_SECURITY.md`.

### Phase 1 gate — STOP

- [x] Clean install from the frozen lockfile succeeds.
- [x] Security checks contain no unexplained high-severity finding or unreviewed install script.
- [x] The production build succeeds within Vercel bundle constraints.
- [x] Mocked tool events stream correctly.
- [x] Mastra passed; retain it and do not install the LangGraph.js fallback.

## Phase 2 — Prove the two OpenRouter model tiers

### Harden before running

- [x] Verify `openai/gpt-5.6-luna` and `x-ai/grok-4.6` support the assigned streaming, tool, structured-output, reasoning, and server-side web-search roles.
- [x] Keep the OpenRouter key server-only and out of logs, browser payloads, Git, and traces.
- [x] Disable model/provider fallback.
- [x] Set maximum provider requests, output tokens, server-tool uses, search results, timeout, and phase cost.
- [x] Record bounded provider requests and the revised `$1.00` approved phase budget in `docs/PHASE_2_PLAN.md`.
- [x] Use synthetic input; do not send transcript data in this phase.

### Prove

- [x] Run one structured-output request.
- [x] Run one call to a harmless local test tool.
- [x] Run one bounded OpenRouter web-search request.
- [x] Reassemble tool, citation, usage, and completion events through the server-side provider-stream boundary the UI integration will use.
- [x] Record latency, token usage, reported cost, tool-call shape, citations, errors, and limitations in `docs/PHASE_2_RESULT.md`.

### Phase 2 gate — STOP

- [x] All required capabilities work with the two pinned model tiers and packages.
- [x] Citations and usage metadata survive the complete stream.
- [x] Actual cumulative spend remains within Jake's revised `$1.00` approval.
- [x] Failures are typed and renderable; no raw provider error or secret reaches the client.

## Phase 3 — Build hybrid transcript retrieval

This phase builds one server-side archive tool using deterministic exact-text chunks, local BM25, OpenRouter embeddings, deterministic rank fusion, and an evaluation-gated reranker. It does not use a generation model.

### Harden before running

- [x] Choose the authoritative Desktop copy of the 59 episodes and 441 segments.
- [ ] Verify counts and checksums before and after any copy or generated index.
- [ ] Keep the corpus server-only; do not place it under `public/`.
- [x] Define stable segment/chunk IDs and exact-source offsets so returned references cannot point at the wrong text.
- [x] Define `complete`, `hybrid_unreranked`, `keyword_only`, `no_match`, `unavailable`, and `not_found` states.
- [x] Freeze the embedding/rerank provider policies, 40-request limit, and `$0.50` approved budget in `docs/PHASE_3_PLAN.md`.
- [ ] Freeze 12 human-inspected retrieval cases before tuning ranking constants.

### Build

- [ ] Generate sentence-aware exact-text chunks with stable IDs, complete source coverage, and a provenance manifest.
- [ ] Add a pinned MiniSearch BM25 index and provider-disabled keyword search.
- [ ] Generate `openai/text-embedding-3-small` vectors through OpenRouter's ZDR Azure endpoint; do not add a vector database.
- [ ] Add cosine vector retrieval and deterministic reciprocal-rank fusion.
- [ ] Evaluate `qwen/qwen3-reranker-8b` through OpenRouter's ZDR Fireworks endpoint and retain it only if it meets the frozen rule.
- [ ] Implement `search_transcripts(query, filters, limit)`.
- [ ] Implement `open_transcript_chunk(chunk_id)`.
- [ ] Return episode title, date, show type, segment label, excerpt, and stable source ID.
- [ ] Add deterministic tests for source integrity, exact matches, conceptual queries, filters, ranking, limits, empty results, malformed records, duplicate IDs, provider failures, and degraded search.

### Phase 3 gate — STOP

- [ ] All 59 episodes and 441 segments validate, and every segment is represented with gap-free source coverage.
- [ ] Every chunk and returned excerpt matches the underlying corpus byte-for-byte.
- [ ] The frozen exact/filter and conceptual retrieval thresholds pass.
- [ ] Reranking is retained only if it improves conceptual MRR without regressing exact/filter Recall@5.
- [ ] Keyword-only degradation works with all provider access disabled.
- [ ] No speaker attribution is invented.
- [ ] Search cold-start and provider latency are measured and recorded honestly.
- [ ] Actual Phase 3 OpenRouter spend is at or below `$0.50`; live-call scripts are locked after proof.
- [ ] `pnpm gate` passes, `docs/PHASE_3_RESULT.md` is complete, and the exact passing commit is pushed to private `origin/main`.

## Phase 4 — Build safe research tools

### Harden before running

- [ ] Treat all page content as untrusted data, never as agent instructions.
- [ ] `read_url` accepts only HTTP/HTTPS and rejects localhost, private IP ranges, metadata endpoints, unsupported content types, excessive redirects, oversized bodies, and slow responses.
- [ ] Define timeouts, character limits, redirect limits, and readable failure receipts.
- [ ] Bound web-search count and result count independently of the model prompt.
- [ ] Preserve canonical URLs, titles, excerpts, retrieval time, and citation IDs.
- [ ] Use mocked network responses before any live request.

### Build

- [ ] Implement `read_url(url)` with readable-content extraction.
- [ ] Wrap OpenRouter web search behind `web_search(query, limits)` so the provider can be replaced without changing the agent.
- [ ] Normalize both tools into one evidence/source format.
- [ ] Add tests for valid articles, redirects, 404s, paywalls, non-HTML content, prompt injection text, timeouts, oversized pages, and denied addresses.
- [ ] After mock tests pass, run a separately approved, bounded live smoke test.

### Phase 4 gate — STOP

- [ ] URL safety tests pass.
- [ ] Every successful result has a stable citation record.
- [ ] Every failure returns an honest typed state.
- [ ] Live calls, if approved, stay within the recorded request and dollar cap.

## Phase 5 — Build the one-agent workflow

### Harden before running

- [ ] Freeze one agent, the deterministic light/heavy model mapping, four tools, and one evidence-repair loop.
- [ ] Define maximum turns, searches, URL reads, archive reads, tokens, time, and cost in code.
- [ ] Define deterministic validation separately from model judgment.
- [ ] Require source IDs on factual claims and real segment IDs on archive references.
- [ ] Prohibit invented host dialogue, impersonation, final topic selection, and unsupported certainty.
- [ ] Prepare recorded tool fixtures so the complete graph can run without provider spend.

### Build

- [ ] Implement the graph: intake → research loop → evidence validation → optional single repair → structured composition → save result.
- [ ] Use Luna only for light structured/tool work and Grok only for heavy research/synthesis; do not let either model route itself.
- [ ] Add Headlines and Big Story schemas without separate agents.
- [ ] Emit sanitized activity events for every graph step and tool call.
- [ ] Return a useful partial artifact when a non-critical source is unavailable.
- [ ] Add deterministic tests for graph routing, budget exhaustion, missing citations, bad archive IDs, malformed structured output, and repair-loop termination.
- [ ] After fixture tests pass, run one separately approved live Headlines case and one Big Story case.

### Phase 5 gate — STOP

- [ ] The graph always terminates within its coded limits.
- [ ] The two output schemas validate.
- [ ] Factual claims and archive excerpts resolve to stored evidence.
- [ ] Partial and failed runs remain truthful and inspectable.
- [ ] Live cases, if approved, remain within the recorded budget.

## Phase 6 — Build the Claude Code-style interface

### Harden before running

- [ ] Freeze the three-pane information architecture before visual polish.
- [ ] Show tool activity and concise status summaries, never private chain-of-thought.
- [ ] Define exactly which tool inputs and outputs are safe to display.
- [ ] Ensure keyboard navigation, focus states, contrast, responsive layout, and screen-reader labels are part of acceptance.
- [ ] Use mocked streams to cover every visual state before a live agent run.

### Build

- [ ] Left: episode/thread list and new-workspace action.
- [ ] Center: conversation plus streaming activity timeline.
- [ ] Right: editable Headlines card or Big Story dossier with sources.
- [ ] Add collapsible cards for searching, reading, archive lookup, validation, failure, and completion.
- [ ] Add stop, retry, follow-up, copy, and source-opening interactions.
- [ ] Preserve the artifact while follow-up conversation continues.
- [ ] Add loading, empty, partial, error, offline, and budget-exhausted states.
- [ ] Test desktop and narrow-screen layouts.

### Phase 6 gate — STOP

- [ ] A person can understand what the agent is doing without seeing logs or developer tooling.
- [ ] Every tool state renders correctly from recorded fixtures.
- [ ] The artifact remains editable and source-linked.
- [ ] A full live run can be stopped, retried, and followed up without corrupting the thread.
- [ ] Do not add visual polish beyond this point until the usefulness evaluation passes.

## Phase 7 — Add deployable persistence and minimal access control

### Harden before running

- [ ] Confirm remote libSQL/Turso remains the simplest supported serverless store; otherwise choose one replacement before coding.
- [ ] Define a minimal schema for users/access, threads, messages, runs, artifacts, sources, and usage receipts.
- [ ] Define retention and deletion behavior.
- [ ] Decide whether v0 uses one shared access code or named accounts; default to one shared code.
- [ ] Prevent cross-thread access and unauthenticated API use.
- [ ] Obtain approval before creating a hosted database or writing remote data.

### Build

- [ ] Persist and reload threads, messages, artifacts, sources, and run status.
- [ ] Add the approved access gate with secure, HTTP-only session cookies.
- [ ] Add rate limiting and basic abuse protection.
- [ ] Ensure the application does not depend on writable local disk or a long-lived process.
- [ ] Test function restart, reload during a run, duplicate submission, storage outage, and expired session behavior.

### Phase 7 gate — STOP

- [ ] Workspaces survive cold starts and browser reloads.
- [ ] Unauthorized requests cannot read or start runs.
- [ ] Duplicate requests do not create duplicate paid runs.
- [ ] Storage failures are explicit and do not lose an already completed artifact silently.

## Phase 8 — Evaluate usefulness before deployment

### Harden before running

- [ ] Freeze the test inputs and scoring rubric before generating comparison outputs.
- [ ] Use the same input material for Gemini, plain Grok, and the harness.
- [ ] Separate deterministic correctness from subjective usefulness.
- [ ] Set a total comparison-run budget before making calls.

### Evaluate

- [ ] Test one supplied Headlines article.
- [ ] Test one Big Story topic with rough notes and links.
- [ ] Test one topic with meaningful prior podcast coverage.
- [ ] Check citation validity, archive-reference validity, schema completeness, cost, latency, and failure behavior.
- [ ] Compare preparation usefulness, generic-AI prose, fresh angles, archive usefulness, and amount of manual cleanup.
- [ ] Record failures and revise the smallest responsible layer: tool, retrieval, prompt, schema, graph, or model configuration.

### Phase 8 gate — STOP AND DECIDE

- [ ] The harness provides a clear advantage over plain Gemini or plain Grok on at least archive recall and repeatable episode preparation.
- [ ] The improvement is worth the additional interface and operating cost.
- [ ] If the advantage is unclear, stop and simplify rather than deploying a redundant chat application.

## Phase 9 — Vercel preview and release decision

This phase is required only after the usefulness gate passes.

### Harden before running

- [ ] Inspect the final dependency graph and advisories again.
- [ ] Run tests, typecheck, lint, production build, secret scan, and frozen-lockfile install.
- [ ] Confirm Vercel function size, runtime, max duration, regions, environment variables, logs, and spend controls.
- [ ] Define rollback to the previous deployment.
- [ ] Obtain explicit approval to create/link the Vercel project and deploy.

### Deploy preview

- [ ] Create a private Vercel preview deployment.
- [ ] Configure server-only OpenRouter and database secrets.
- [ ] Run one bounded end-to-end smoke test.
- [ ] Verify streaming, tool cards, persistence, access control, citations, cost receipt, and cold-start behavior.
- [ ] Review Vercel and provider logs for secrets or raw private reasoning before broader access.

### Phase 9 gate — STOP

- [ ] Preview acceptance is recorded with exact deployment and commit identifiers.
- [ ] No production/custom-domain release occurs without a separate decision.

## Explicitly deferred backlog

Do not pull these into a phase unless the usefulness evaluation identifies a concrete need.

- [ ] Simultaneous multiplayer editing
- [ ] Google Drive import/export or synchronization
- [ ] Full 20-to-10-to-5-to-3 Headlines topic board
- [ ] Topic ranking or automatic final selection
- [ ] Hosted vector database or external retrieval service
- [ ] Speaker attribution
- [ ] Audio download or transcription
- [ ] Fine-tuning
- [ ] Any additional models, automatic routers, fallbacks, subagents, or critic agents
- [ ] Durable background jobs or Vercel Workflow
- [ ] Mobile-native application
- [ ] Analytics dashboard

## First next action

Launch the approved goal in `docs/PHASE_3_GOAL_LAUNCHER.md`. Stop after the Phase 3 gate; do not begin Phase 4 automatically.
