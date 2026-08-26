# Nonsense Research Harness — Build TODO

Status: Phases 1–6 and Phase 7A through Phase 7A.4 **PASSED at their approved gates**. Phase 7A.4 is the current reusable local product: a normal conversation connects to a bounded adaptive Luna controller, the real safe web/archive tools, an ephemeral evidence workspace, concise claim-cited answers, and optional validated Grok Headlines/Big Story briefs ranked by editorial priority. The first paid Phase 7A.4 live UI acceptance remains Jake-owned; no provider call was made during its deterministic implementation. Persistence, auth, deployment, subagents, and a history sidebar remain deferred. See `docs/PHASE_7A_4_SPEC.md` and `docs/PHASE_7A_4_RESULT.md`.

## Intended v0 outcome

CJ or Jeff can open a private web application and talk naturally with one agent about a topic, links, rough notes, current reporting, or earlier Nonsense coverage. The agent researches when useful, shows compact observable work without exposing private chain-of-thought, retains evidence for follow-ups in the current process, and returns concise cited answers. It creates a Headlines or Big Story preparation brief only when explicitly asked.

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
- Phase 3 produced 1,259 exact-source retrieval chunks, local BM25, 1,536-dimensional document vectors, reciprocal-rank fusion, and two server-only transcript tools. The frozen reranked evaluation reached 100% Recall@5 across exact, conceptual, and filter cases.
- Phase 6 streams the real bounded Phase 5 workflow through the browser workbench. Its corrected live Headlines proof completed with a validated artifact using five of six provider requests, zero retries, and `$0.05391264` of its `$0.50` cap. The interface and Big Story path also pass deterministic fixtures; no deployed persistence exists yet.
- Phase 7A replaces the form/fixture default with a live-only chat route, a typed observe-decide-act loop, genuine follow-ups, in-memory evidence reuse, and optional artifact creation. Deterministic fixtures are test injection only; missing provider authorization is explicitly unavailable.
- Phase 7A.1 keeps that architecture but makes it sturdier and easier to inspect: the controller carries a bounded public research notebook, code can read up to three already-authorized web or archive targets concurrently, and the workspace retains up to eight sanitized run traces. The UI is now one light research workspace with inline activity, chat/artifact views, and a source drawer instead of permanent side rails.
- Phase 7A.4 makes conversation—not a packet—the primary product. Standard and Deep research share one bounded tool-using architecture; answers use validated claim-level citations, requested briefs use editorial priorities rather than invented timing, and compact grouped work plus user-respecting auto-follow replace the activity rail.
- The active Phase 7A system, controller, Deep research, and brief prompts are readable Markdown sources in `prompts/phase7a/`; code still owns permissions, tools, schemas, citations, budgets, and validation.

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
- [x] Verify counts and checksums before and after any copy or generated index.
- [x] Keep the corpus server-only; do not place it under `public/`.
- [x] Define stable segment/chunk IDs and exact-source offsets so returned references cannot point at the wrong text.
- [x] Define `complete`, `hybrid_unreranked`, `keyword_only`, `no_match`, `unavailable`, and `not_found` states.
- [x] Freeze the embedding/rerank provider policies, 40-request limit, and `$0.50` approved budget in `docs/PHASE_3_PLAN.md`.
- [x] Freeze 12 human-inspected retrieval cases before tuning ranking constants.

### Build

- [x] Generate sentence-aware exact-text chunks with stable IDs, complete source coverage, and a provenance manifest.
- [x] Add a pinned MiniSearch BM25 index and provider-disabled keyword search.
- [x] Generate `openai/text-embedding-3-small` vectors through OpenRouter's ZDR Azure endpoint; do not add a vector database.
- [x] Add cosine vector retrieval and deterministic reciprocal-rank fusion.
- [x] Evaluate `qwen/qwen3-reranker-8b` through OpenRouter's ZDR Fireworks endpoint and retain it only if it meets the frozen rule.
- [x] Implement `search_transcripts(query, filters, limit)`.
- [x] Implement `open_transcript_chunk(chunk_id)`.
- [x] Return episode title, date, show type, segment label, excerpt, and stable source ID.
- [x] Add deterministic tests for source integrity, exact matches, conceptual queries, filters, ranking, limits, empty results, malformed records, duplicate IDs, provider failures, and degraded search.

### Phase 3 gate — STOP

- [x] All 59 episodes and 441 segments validate, and every segment is represented with gap-free source coverage.
- [x] Every chunk and returned excerpt matches the underlying corpus byte-for-byte.
- [x] The frozen exact/filter and conceptual retrieval thresholds pass.
- [x] Reranking is retained only if it improves conceptual MRR without regressing exact/filter Recall@5.
- [x] Keyword-only degradation works with all provider access disabled.
- [x] No speaker attribution is invented.
- [x] Search cold-start and provider latency are measured and recorded honestly.
- [x] Actual Phase 3 OpenRouter spend is at or below `$0.50`; live-call scripts are locked after proof.
- [x] `pnpm gate` passes, `docs/PHASE_3_RESULT.md` is complete, and the exact passing commit is pushed to private `origin/main`.

## Phase 4 — Build safe research tools

### Harden before running

- [x] Treat all page content as untrusted data, never as agent instructions.
- [x] `read_url` accepts only HTTP/HTTPS and rejects localhost, private IP ranges, metadata endpoints, unsupported content types, excessive redirects, oversized bodies, and slow responses.
- [x] Define timeouts, character limits, redirect limits, and readable failure receipts.
- [x] Bound web-search count and result count independently of the model prompt.
- [x] Preserve canonical URLs, titles, excerpts, retrieval time, and citation IDs.
- [x] Use mocked network responses before any live request.

### Build

- [x] Implement `read_url(url)` with readable-content extraction.
- [x] Wrap OpenRouter web search behind `web_search(query, limits)` so the provider can be replaced without changing the agent.
- [x] Normalize both tools into one evidence/source format.
- [x] Add tests for valid articles, redirects, 404s, paywalls, non-HTML content, prompt injection text, timeouts, oversized pages, and denied addresses.
- [x] After mock tests pass, run a separately approved, bounded live smoke test.

### Phase 4 gate — STOP

- [x] URL safety tests pass.
- [x] Every successful result has a stable citation record.
- [x] Every failure returns an honest typed state.
- [x] Live calls stayed within the recorded request and dollar cap; the failed search remains an explicit limitation.

### Phase 4.1 — Repair live web search

- [x] Rechecked the current OpenRouter server-tool contract and removed the unsupported forced-tool setting.
- [x] Diagnosed identical HTTP 500 responses through Perplexity and Exa, then selected the already proven Grok-native route.
- [x] Preserved provider receipts on proof failures and accepted xAI's documented citation-plus-request-bound evidence when its usage counter is absent.
- [x] Proved an exact live search for an official NASA article published 3 hours 49 minutes earlier, then independently retrieved the page through `read_url`.
- [x] Stayed within five approved provider requests, zero retries, and a `$0.20` conservative cap; locked the launcher after proof.
- [x] Preserved Phase 3 corpus/retrieval hashes and stopped before Phase 5.

## Phase 5 — Build the one-agent workflow

### Harden before running

- [x] Freeze one agent, the deterministic light/heavy model mapping, four tools, and one evidence-repair loop.
- [x] Define maximum turns, searches, URL reads, archive reads, tokens, time, and cost in code.
- [x] Define deterministic validation separately from model judgment.
- [x] Require source IDs on factual claims and real segment IDs on archive references.
- [x] Prohibit invented host dialogue, impersonation, final topic selection, and unsupported certainty.
- [x] Prepare recorded tool fixtures so the complete graph can run without provider spend.

### Build

- [x] Implement the graph: intake → Luna research plan → bounded tool execution → Grok composition → deterministic validation → optional single Grok repair → final result.
- [x] Use Luna only for light structured/tool work and Grok only for heavy research/synthesis; do not let either model route itself.
- [x] Add Headlines and Big Story schemas without separate agents.
- [x] Emit sanitized activity events for every graph step and tool call.
- [x] Return a useful partial artifact when a non-critical source is unavailable.
- [x] Add deterministic tests for graph routing, budget exhaustion, missing citations, bad archive IDs, malformed structured output, and repair-loop termination.
- [x] After fixture tests pass, execute the separately approved original/replacement Headlines and Big Story attempts; preserve every failure without automatic retry.

### Phase 5 gate — STOP

- [x] The graph always terminates within its coded limits in deterministic and live evidence.
- [x] Both output schemas validate in live evidence: the recovered Headlines artifact passes, and the Phase 5.1 Big Story proof passes against the exact frozen evidence packet from the replacement research run.
- [x] Factual claims and archive excerpts resolve to stored evidence in deterministic coverage and both validated live artifacts.
- [x] Partial and failed runs remain truthful and inspectable.
- [x] All live attempts remained within `$0.50` each and `$1.30` aggregate, with missing receipts charged to conservative reservations.

## Phase 5.1 — Harden Big Story composition

### Provider-free repair

- [x] Freeze the zero-spend scope and preserve the four-attempt live report.
- [x] Record safe generation ID, finish reason, response size, parse status, and reasoning-token usage when supplied.
- [x] Distinguish empty, invalid JSON, truncated, and incomplete output without storing failed raw model text.
- [x] Do not spend the repair call when composition produced no parseable artifact.
- [x] Remove `source_ledger` from both model-facing schemas and hydrate only cited evidence in code.
- [x] Consolidate repeated Big Story sections into a compact research brief and typed research cards.
- [x] Send each evidence body once, raise the Grok allowance to 12,000 combined reasoning/output tokens, and allow 300 seconds for the bounded run.
- [x] Execute both Big Story web queries and split four unique archive opens across two story-section searches.
- [x] Add deterministic maximum-shape, receipt, failure, hydration, retrieval-depth, and no-extra-repair coverage.
- [x] Build a statically locked one-request composition-only launcher over the frozen five-source packet; keep it locked until separately authorized.

### Phase 5.1 deterministic gate — STOP

- [x] Full `pnpm gate`, dependency audit, corpus hashes, report hash, secret boundary, and static live locks pass.
- [x] `docs/PHASE_5_1_RESULT.md` records exact evidence and remaining limitations.
- [x] No provider call, commit, push, Phase 6 work, or deployment occurred.
- [x] A composition-only live proof remains separately authorized with an exact request and dollar cap.

### Phase 5.1 live gate — STOP

- [x] Execute exactly one composition-only `x-ai/grok-4.6` request with no retry and no Luna, web, URL, embedding, rerank, or transcript-query provider calls.
- [x] Return parsed output with zero validation errors, six research cards, four exact archive references, seven clocked outline beats totaling 28 minutes, and five code-owned source records.
- [x] Preserve the receipt and artifact in `reports/phase-5-1-compose-proof.json`; actual and accounted spend is `$0.047494 / $0.20`.
- [x] Relock the model boundary and composition launcher immediately after the request.
- [x] Run the final full gate, record final hashes/security evidence, and push the exact passing Phase 5/5.1 commit to private `origin/main`.

## Phase 6 — Build the Claude Code-style interface

### Harden before running

- [x] Freeze the artifact-first three-pane information architecture and dark visual system.
- [x] Show tool activity and concise status summaries, never private chain-of-thought.
- [x] Define a bounded browser DTO and safe-detail whitelist.
- [x] Include keyboard focus, contrast, responsive layout, reduced motion, and screen-reader labels in acceptance.
- [x] Run the production stream/workflow/projection path with zero-provider fixtures before spend.

### Build

- [x] Left: truthful single local-session rail; fake history and persistence are deferred.
- [x] Center: streaming activity timeline and continuous run tape.
- [x] Right: editable Headlines or Big Story artifact with source ledger and drawer.
- [x] Render searching, reading, archive lookup, composition, validation, failure, stop, and completion states.
- [x] Add stop, explicit retry, bounded follow-up, copy, edit, and source-opening interactions.
- [x] Preserve the prior artifact during retry or failed local refinement.
- [x] Add honest loading, empty, partial, stopped, failed, unavailable, and offline/provider-disabled states.
- [x] Verify 1440px, 1024px, and 390px layouts without horizontal overflow.

### Phase 6 gate — STOP

- [x] A person can understand what the agent is doing without seeing logs or developer tooling.
- [x] Production event classes render from the provider-free workflow path.
- [x] The artifact remains editable, source-linked, and copyable.
- [x] A corrected, explicitly authorized full live browser run returns a validated artifact within five provider requests, zero retries, and `$0.05391264`.
- [x] Do not add visual polish beyond this point until the usefulness evaluation passes.

## Phase 7A — Chat-first local adaptive agent — PASSED

The frozen scope and evidence are in `docs/PHASE_7A_PLAN.md` and `docs/PHASE_7A_RESULT.md`.

- [x] Replace mandatory mode/topic/link/notes intake with one ordinary chat composer.
- [x] Keep the normal route live-only; fixtures are dependency-injected by tests and never silently replace user input.
- [x] Add one strict server-only system prompt for equal-partner, evidence, untrusted-content, citation, and no-invented-attribution behavior.
- [x] Add Headlines and Big Story artifact procedures only when the user requests an artifact.
- [x] Add a Luna controller that selects one of `web_search`, `read_url`, `search_transcripts`, `open_transcript_chunk`, `create_artifact`, or `respond` per turn.
- [x] Execute actions through code-owned allowlists and the existing SSRF-hardened/web/archive tools; reject undiscovered URLs, unreturned chunks, repeated actions, and invented citations.
- [x] Preserve recent turns, candidates, exact evidence, transcript matches, and the last validated artifact in an eight-session, six-hour in-memory workspace.
- [x] Make follow-ups real: the controller may answer from saved evidence or perform additional bounded research.
- [x] Make Headlines/Big Story optional; a validated artifact ends the turn with a deterministic acknowledgement instead of one redundant provider call.
- [x] Enforce 10 controller turns, 20 provider requests, 3 web searches, 8 URL reads, 2 transcript searches, 6 opens, 1 composition, 1 repair, 300 seconds, and `$1.00` per user turn; automatic retries remain zero.
- [x] Stream safe agent decisions, tools, answers, source metadata, artifact, and receipt into the visible workbench without a Demo/Live badge.
- [x] Prove direct chat, adaptive research, genuine follow-up, both artifact modes, artifact preservation, cancellation, unavailable mode, strict schemas, source safety, route streaming, and model policy deterministically.
- [x] Preserve both failed live proof rounds, fix their root causes, and pass the final frozen Headlines and Big Story live proof for `$0.19281185` and 18 aggregate provider requests.
- [x] Prove the visible browser can answer from saved evidence with one controller call/no tools and display the prior validated artifact.
- [x] Pass the full supply-chain/lint/typecheck/test/build gate and preserve corpus/historical evidence hashes.

### Phase 7A gate — STOP

- [x] The product is a reusable local chat agent, not a fixture demo or one fixed form workflow.
- [x] The controller changes actions after each observation and terminates within hard limits.
- [x] Artifacts remain evidence-validated, source-linked, and optional; Phase 7A.4 replaces the earlier clock-aware live contract with editorial priorities.
- [x] Missing authorization, provider/tool degradation, stop, invalid action, and failed composition are honest and do not start automatic retries.
- [x] No persistence, auth, deployment, subagents, general shell, GBrain/LLMwiki, or visual redesign was added.

## Phase 7A.1 — Runtime hardening and frontend first pass — PASSED

The frozen scope and evidence are in `docs/PHASE_7A_1_PLAN.md` and `docs/PHASE_7A_1_RESULT.md`.

- [x] Repair the Phase 7A local-development authority boundary so query embeddings and the accepted transcript reranker can run under the existing ZDR provider policy without weakening production refusal.
- [x] Add a bounded structured research notebook containing the objective, completed steps, evidence gaps, and next step; never expose private reasoning.
- [x] Add typed `read_urls` and `open_transcript_chunks` actions for up to three already-authorized targets, execute independent targets concurrently, count every target against the original limits, and preserve partial failures.
- [x] Retain at most eight sanitized run traces containing public summaries, safe targets/observations, status, counts, cost, source IDs, artifact revision, and limitations.
- [x] Replace the permanent session/activity rails with one workspace, inline progressive activity, chat/artifact views, and an on-demand source drawer.
- [x] Apply the first Glox Brain Lab-inspired visual system: light canvas, Geist type, restrained blue accent, compact chrome, readable document surfaces, accessible focus, reduced motion, and phone tap targets.
- [x] Prove the backend deterministically, exercise the real chat route with injected providers, and browser-check desktop/phone layout, starter interaction, overflow, semantics, and console health.
- [x] Make zero paid provider calls during this phase; live semantic retrieval remains truthfully not re-proven in this phase.

### Phase 7A.1 gate — STOP

- [x] Runtime tests cover notebook continuity, bounded concurrency, partial failure, target allowlists, trace sanitization, local/production provider authority, and unchanged artifact/citation behavior.
- [x] The normal route remains connected and live-only; fixtures remain test injection and no demo mode was added.
- [x] The first-pass UI has no permanent side rail, no hidden mobile-only feature, and no horizontal overflow at the checked desktop and phone widths.
- [x] Full supply-chain, lint, typecheck, test, and production-build gate passes on the final tree.
- [x] No deployment, persistence, authentication, subagent, new model, corpus mutation, or additional paid call was added.

## Phase 7A session and follow-up repair — PASSED

The exact repair and replacement-browser evidence are in `docs/PHASE_7A_SESSION_REPAIR_RESULT.md` and `reports/phase-7a-session-repair-live.json`.

- [x] Replace the fixed browser session with a fresh cryptographically random ID for each new conversation, stable only until **New research**.
- [x] Scope normalized query, URL, and transcript-chunk repeat guards to one agent run while retaining bounded prior-turn history as controller context.
- [x] Permit legitimate later-turn refreshes and rereads without duplicating stored evidence or falsely exhausting the evidence cap.
- [x] Add regressions for distinct fresh conversations, stable follow-ups, a later-turn repeated web search, a later-turn URL reread, and a normalized duplicate within one run.
- [x] Pass the full deterministic supply-chain, lint, typecheck, 175-test, and production-build gate.
- [x] Execute one authorized replacement live browser run with zero retries; the attached UI completed a current web search with five candidates.
- [x] Harden and diagnose the separate Luna controller-output failure without automatic retry or raw-output retention. Phase 7A.2 closes the resulting completion blocker.

## Phase 7A.2 — Controller completion reliability — PASSED

The frozen plan, result, and live evidence are in `docs/PHASE_7A_2_PLAN.md`, `docs/PHASE_7A_2_RESULT.md`, and `reports/phase-7a-2-live.json`.

- [x] Classify controller completion, JSON, transport, and action failures separately and preserve bounded safe diagnostics plus real paid receipts.
- [x] Raise the Luna controller completion allowance to 8,000 tokens while retaining exact model/provider policy, turn timeout, dollar ceiling, and zero automatic retries.
- [x] Permit neutral unused transport fields while preserving strict action-specific validation.
- [x] Remove attempted URLs from the unread-candidate prompt and permit evidence-backed rereads only on legitimate later turns.
- [x] Add an enforced proof-specific provider-request cap and reserve the final provider slot for an explicitly requested artifact after usable evidence and archive search exist.
- [x] Stream specific terminal failures, stop visible spinners, expand failed activity, and preserve collected research for follow-up.
- [x] Allow documented `127.0.0.1` development hydration without weakening the production route.
- [x] Pass the 34-test focused suite and full 185-test supply-chain/lint/typecheck/test/build gate.
- [x] Complete the frozen browser prompt with current FDA/CDC evidence, an honest archive no-match, a validated cited eight-minute Headlines packet, exactly 12 requests, displayed `$0.1625`, zero repairs, and zero console warnings/errors.

### Phase 7A.2 gate — STOP

- [x] The live UI reaches a visible terminal state and exposes the packet, receipt, tools, sources, archive result, and limitations.
- [x] Repeated-action protection remains per run; fresh conversations and legitimate later-turn research remain allowed.
- [x] Already-read candidates are not offered as unread, and the last provider slot cannot be consumed by another controller turn when a requested packet is ready to compose.
- [x] No persistence, auth, deployment, subagent, new model, corpus mutation, hosted infrastructure, or provider fallback was added.

## Phase 7A.3 — Chat-native research interface — PASSED AND USER-ACCEPTED

The frozen scope and deterministic evidence are in `docs/PHASE_7A_3_PLAN.md` and `docs/PHASE_7A_3_RESULT.md`. Jake subsequently completed the user-owned paid live UI acceptance and reported that the prompt worked and the result was good; that review produced the Phase 7A.4 direction.

- [x] Group every prompt, observable work trace, answer/packet, receipt, and error into one run-correlated chronological exchange.
- [x] Render safe tool activity below the request that caused it; collapse successful work and retain failed work visibly.
- [x] Render complete Headlines and Big Story artifacts inline as assistant answers, with optional Focus and readable Markdown copy.
- [x] Replace visible machine source IDs with stable numbered article/episode references while preserving internal exact lookup.
- [x] Present `partial` artifacts as usable answers with precise limitations without weakening authoritative receipt truth.
- [x] Prevent a retained prior artifact from being streamed as a new follow-up answer and correlate streamed errors to runs.
- [x] Prove client-state isolation, full artifact projection, citations, route behavior, responsive shell, and zero provider spend deterministically.
- [x] Complete one user-owned paid live UI acceptance run and inspect that exact browser state before declaring live acceptance.

### Phase 7A.3 local gate — STOP

- [x] Full supply-chain/lint/typecheck/194-test/production-build gate passes.
- [x] Provider-free desktop/phone browser check passes with zero console warnings/errors and no horizontal overflow.
- [x] No backend model/tool/corpus change, persistence, auth, deployment, sidebar/history, or provider call was added.
- [x] Do not start a replacement live run automatically; Jake submitted and accepted the first prompt himself.

## Phase 7A.4 — Conversational research agent — DETERMINISTIC GATE PASSED

The approved product contract is in `docs/PHASE_7A_4_SPEC.md`; the exact implementation and verification evidence are in `docs/PHASE_7A_4_RESULT.md`. Jake owns the first paid live UI acceptance run.

- [x] Make standard chat a real bounded tool-using agent while permitting direct answers when research would be ceremonial.
- [x] Add a separate Standard/Deep research control without coupling research depth to brief creation.
- [x] Require explicit artifact intent in the current user message; retained briefs and Deep mode cannot silently create or revise one.
- [x] Replace ordinary fixed packet responses with concise natural answer blocks whose citations resolve only to usable saved evidence.
- [x] Retain sources, queries, archive matches, corrections, sanitized traces, and the current brief across follow-up turns in the bounded in-process workspace.
- [x] Replace active Phase 7A timing generation with `must_cover`, `strong_material`, `optional_detail`, and `cut_first` editorial priorities while preserving frozen Phase 5 evidence unchanged.
- [x] Replace the icon rail with compact expandable observable-work lines, one reduced-motion-safe active highlight, and human-readable source detail.
- [x] Add near-bottom auto-follow, immediate user-scroll pause, new-content-aware **Jump to latest**, and readable completion positioning.
- [x] Prove strict browser/server contracts, claim citations, artifact intent, both v2 artifact modes, revisions, memory reuse, honest failure/degradation, grouped work, scrolling, mobile controls, and reduced motion deterministically.
- [x] Pass the final supply-chain, lint, typecheck, 206-test, production-build, corpus-integrity, historical-evidence, browser-console, and responsive-overflow gates at `$0.00` provider spend.
- [ ] Complete the user-owned paid Phase 7A.4 live UI acceptance prompt before beginning Phase 8 comparison runs.

### Phase 7A.4 gate — STOP

- [x] All deterministic acceptance criteria in `docs/PHASE_7A_4_SPEC.md` pass on the final implementation tree.
- [x] Standard/Deep behavior, optional briefs, editorial priority, citations, memory, observable work, and auto-scroll are implemented without persistence, subagents, new models, or deployment.
- [x] No paid provider request occurred; provider-disabled behavior remains honestly unavailable rather than substituting a fixture.
- [x] Frozen corpus files and historical reports remain byte-unchanged.
- [x] The exact localhost acceptance prompt completes with a concise four-source cited answer, an honest archive no-match, eight requests, `$0.0336`, and zero browser errors; Jake still decides whether the product is ready for Phase 8 usefulness comparison.

### Phase 7A.4 citation repair — DETERMINISTIC GATE PASSED

The first user-owned acceptance run completed five article reads, one web search, and an honest archive no-match, then failed safely when Luna cited an identifier outside the retrieved usable-evidence set. Exact evidence and the repair are recorded in `docs/PHASE_7A_4_CITATION_REPAIR_RESULT.md`.

- [x] Preserve the strict usable-evidence citation validator and zero automatic retries.
- [x] Give the controller short deterministic aliases only for usable evidence and resolve them to exact internal source IDs in code.
- [x] Constrain every provider response schema to that turn's exact alias enum; prompt guidance alone is not an acceptance mechanism.
- [x] Remove citeable IDs from unread candidates and opaque internal IDs from the controller evidence/conversation view.
- [x] Add an exact regression proving alias resolution, candidate isolation, one-request completion, and fail-closed validation.
- [x] Pass the focused test, lint, typecheck, full regression, production-build, corpus-integrity, and browser-console gates with `$0.00` repair spend.
- [x] Complete one replacement live acceptance run with the same frozen prompt: Ready, four cited sources, honest archive no-match, eight requests, `$0.0336`, zero automatic retries, and zero browser errors.

## Phase 7B — Durable private workspaces — NOT STARTED

- [ ] Decide whether persistence/auth is worth building only after Phase 8 usefulness testing.
- [ ] If approved, freeze a narrow serverless store adapter, shared access control, retention/deletion, idempotency, one-thread lease, reload/replay, and Vercel constraints.
- [ ] Obtain separate approval before installing a storage dependency, creating hosted infrastructure, writing remote data, or deploying.
- [ ] Do not add subagents, background jobs, multiplayer editing, or broader tools as a persistence workaround.

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
- [ ] Compare the frozen Phase 5 fixed workflow, the Phase 7 adaptive harness, plain Gemini, and plain Grok on identical inputs.
- [ ] Check citation validity, archive-reference validity, schema completeness, cost, latency, and failure behavior.
- [ ] Compare preparation usefulness, coverage, generic-AI prose, fresh angles, archive usefulness, amount of manual cleanup, and whether adaptive research justifies its added latency and cost.
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
- [ ] GBrain, LLMwiki, knowledge graphs, or automatically maintained topic dossiers
- [ ] General shell, arbitrary code execution, browser automation, or a broad MCP tool catalog
- [ ] Durable background jobs or Vercel Workflow
- [ ] Mobile-native application
- [ ] Analytics dashboard

## First next action

Have Jake run the exact paid localhost acceptance prompt in `docs/PHASE_7A_4_RESULT.md`. If he accepts the conversational behavior, freeze the smallest Phase 8 usefulness comparison before adding persistence or deployment. Compare the Phase 7A.4 harness against plain Gemini/Grok on identical inputs; do not deploy automatically.
