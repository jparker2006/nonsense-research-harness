# Nonsense Research Harness — Build TODO

Status: Phase 1 passed locally on 2026-08-23. Jake approved `V0_SPEC.md`, dependency downloads, local implementation, and a private GitHub repository. Provider calls, hosted databases, Vercel projects, and deployment remain unauthorized.

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

The application/runtime stack passed Phase 1. Provider and model compatibility remain provisional until Phase 2.

- Application: Next.js and TypeScript
- Agent UI: `assistant-ui`, adapted from the maintained Mastra UI examples
- Agent/workflow runtime: Mastra
- Model gateway: OpenRouter
- Model: one pinned Grok model
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

## Phase 2 — Prove OpenRouter and Grok compatibility

### Harden before running

- [ ] Verify the exact OpenRouter model slug and current support for streaming, tool calling, structured output, and server-side web search.
- [ ] Keep the OpenRouter key server-only and out of logs, browser payloads, Git, and traces.
- [ ] Disable model/provider fallback.
- [ ] Set maximum model turns, output tokens, server-tool uses, search results, timeout, and per-run cost.
- [ ] Record the exact live-call count and dollar cap for approval.
- [ ] Use synthetic input; do not send transcript data in this phase.

### Prove

- [ ] Run one structured-output request.
- [ ] Run one call to a harmless local test tool.
- [ ] Run one bounded OpenRouter web-search request.
- [ ] Stream all tool and completion events through the same API shape the UI will use.
- [ ] Record latency, token usage, reported cost, citations, tool-call shape, and errors.

### Phase 2 gate — STOP

- [ ] All required capabilities work with the pinned model and packages.
- [ ] Citations and usage metadata survive the complete stream.
- [ ] Actual spend remains within the approved cap.
- [ ] Failures are typed and renderable; no raw provider error or secret reaches the client.

## Phase 3 — Build deterministic transcript retrieval

No model or web calls are required in this phase.

### Harden before running

- [ ] Choose one authoritative copy of the 59 episodes and 441 segments.
- [ ] Verify counts and checksums before and after any copy or generated index.
- [ ] Keep the corpus server-only; do not place it under `public/`.
- [ ] Define stable archive IDs so returned references cannot point at the wrong episode or segment.
- [ ] Define an honest empty-result response.

### Build

- [ ] Add a lightweight full-text index over the 441 segments; do not add embeddings or a vector database.
- [ ] Implement `search_transcripts(query, filters, limit)`.
- [ ] Implement `open_transcript(segment_id)`.
- [ ] Return episode title, date, show type, segment label, excerpt, and stable source ID.
- [ ] Add deterministic tests for exact matches, related terms, filters, limits, empty results, malformed records, and duplicate IDs.

### Phase 3 gate — STOP

- [ ] All 441 segments are accounted for exactly once.
- [ ] Returned excerpts match the underlying corpus byte-for-byte.
- [ ] Known queries from several episodes return useful results.
- [ ] No speaker attribution is invented.
- [ ] Search performance is acceptable in a cold serverless process.

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

- [ ] Freeze one agent, one model, four tools, and one evidence-repair loop.
- [ ] Define maximum turns, searches, URL reads, archive reads, tokens, time, and cost in code.
- [ ] Define deterministic validation separately from model judgment.
- [ ] Require source IDs on factual claims and real segment IDs on archive references.
- [ ] Prohibit invented host dialogue, impersonation, final topic selection, and unsupported certainty.
- [ ] Prepare recorded tool fixtures so the complete graph can run without provider spend.

### Build

- [ ] Implement the graph: intake → research loop → evidence validation → optional single repair → structured composition → save result.
- [ ] Use the same Grok model for research and composition.
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
- [ ] Embeddings, vector database, or semantic RAG
- [ ] Speaker attribution
- [ ] Audio download or transcription
- [ ] Fine-tuning
- [ ] Multiple models, routers, fallbacks, subagents, or critic agents
- [ ] Durable background jobs or Vercel Workflow
- [ ] Mobile-native application
- [ ] Analytics dashboard

## First next action

Review and harden Phase 2 before making any OpenRouter call. Do not spend provider money or begin Phase 2 until Jake approves the exact model, request count, limits, and dollar cap.
