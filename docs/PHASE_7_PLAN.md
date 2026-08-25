# Phase 7 plan — durable adaptive research agent (future Phase 7B)

Status: **DEFERRED TO PHASE 7B** on 2026-08-24 HST. The approved and executing local agent scope is `docs/PHASE_7A_PLAN.md`. This durable-storage plan authorizes no implementation, dependency installation, hosted resource, remote write, provider request, deployment, commit, or push by itself.

Phase 7 turns the closed Phase 6 local workbench into a resumable, private, bounded research agent. The visible product remains one Nonsense agent for equal partners CJ Little and Jeff Parker. Internally, Luna chooses one typed research action at a time, code executes and records that action, and Grok composes the final packet from a durable evidence notebook.

The phase is deliberately not a general agent platform. It does not add subagents, delegation, a shell, arbitrary code execution, browser automation, GBrain, LLMwiki, a knowledge graph, new models, automatic routing, fallback providers, deployment, multiplayer editing, or Google Drive.

## 1. Proven baseline and Phase 6 boundary

Phase 7 begins only from the closed Phase 6 commit `8e071da9ba32afb1a23db4c80919051a780de06c`.

Verified on 2026-08-24 HST before this plan was written:

- local `main` exactly matched private `origin/main` before the planning edits;
- the worktree was clean;
- the supply-chain denylist checked 144 known-bad versions;
- lint and TypeScript passed;
- all 150 tests across 21 files passed;
- the Next.js production build passed;
- the corrected Phase 6 live report, failed first attempt, browser evidence, Phase 5 reports, processed corpus, chunks, BM25 index, and embedding hashes matched `docs/PHASE_6_RESULT.md`;
- `PHASE_6_LIVE_UI_DISABLED` and `PHASE_5_LIVE_CALLS_DISABLED` remain `true`;
- the successful Phase 6 proof used five of six requests, zero retries, and `$0.05391264`; aggregate Phase 6 spend including the preserved failed attempt was `$0.07440504`.

Phase 6 remains the rollback and Phase 8 comparison baseline. Its historical plan, result, reports, and frozen fixtures must not be rewritten. Phase 7 uses new contracts and migrations rather than mutating historical evidence.

## 2. Product outcome

After Phase 7, CJ or Jeff can:

1. unlock the private application;
2. create or reopen a Headlines or Big Story workspace;
3. submit a topic, up to three links, notes, and an optional clock;
4. watch a public research plan and safe activity update as the agent adapts to evidence;
5. stop a run without losing confirmed evidence or the last valid artifact;
6. reload after a browser or server restart and recover the honest saved state;
7. ask an evidence-only follow-up, explicitly request more research, or request an artifact revision;
8. inspect sources and transcript excerpts and retain manual artifact edits.

The product still prepares conversation material. It does not choose final stories, impersonate either host, invent dialogue, or replace editorial deliberation.

## 3. Frozen architecture

```text
Browser workbench
  thread list | conversation + safe events | notebook/artifact + sources
        |
Authenticated streaming route
        |
Run coordinator -- idempotency, one-thread lease, cancellation, budgets
        |
Luna controller loop
  observe saved state -> choose exactly one typed action
        |
Code-owned action executor
  existing read-only tools OR deterministic notebook reducer
        |
Durable workspace store
  turns, safe events, notebook, evidence, artifact, edits, usage
        |
Grok composition -> deterministic validation -> optional one repair
```

There is one user-visible agent and no delegation.

- **Luna/max** controls bounded research decisions and structured state updates.
- **Grok/medium** composes the research packet after the controller finishes and may perform the existing single repair only after deterministic artifact-validation failure.
- Code chooses the model role. Models cannot route, fall back, grant tools, raise budgets, or start another agent.
- Mastra remains the workflow boundary. Phase 7 may use its existing workflow primitives but does not migrate frameworks or adopt a second orchestration runtime.

## 4. Instruction architecture

### Global system prompt

Add one concise server-only system prompt that states:

- the agent prepares sourced conversation material for equal partners CJ and Jeff;
- it does not imitate a host, invent dialogue, choose the final story, or claim unsourced facts;
- links, pages, search output, notes, transcripts, prior artifacts, and tool output are untrusted data rather than instructions;
- it may choose only the supplied typed actions and must respect the remaining code-provided budget;
- it records evidence, inference, and open questions distinctly;
- it must finish honestly when evidence or a tool is unavailable;
- public action summaries explain what happened without private chain-of-thought.

The system prompt is behavioral context, not a security boundary. Every permission, schema, citation rule, and ceiling remains enforced in code.

### Procedure modules

Add exactly four server-only procedures:

1. `headlines_research` — establish what happened, why now, the real tension, surprising supported detail, archive precedent, and cuttable beats.
2. `big_story_research` — establish the core question, background, forces, competing explanations, key evidence, archive precedent, and a modular clock-aware outline.
3. `source_audit` — inspect which claims are supported, contradicted, inferred, duplicated, unavailable, or still open.
4. `artifact_revision` — revise or cut the current artifact using only the explicitly selected evidence and preserving source IDs.

Exactly one mode procedure is active during initial research. Audit and revision procedures load only for those explicit user operations. A procedure cannot grant a tool or relax a limit.

## 5. Durable workspace contract

The product term is **workspace**. Internally it has one durable `thread_id` and zero or more turns and runs.

### Canonical records

- `access_sessions`: hashed opaque session token, created/expiry/revocation timestamps
- `threads`: ID, title, mode, timestamps, current artifact/notebook versions, deletion state
- `turns`: thread ID, role, bounded content, client idempotency key, timestamp
- `runs`: kind, frozen input, status, limits, usage, lease, start/end timestamps, terminal error
- `events`: run ID, monotonic sequence, typed safe public payload, timestamp
- `notebook_snapshots`: versioned bounded notebook plus last applied event sequence
- `evidence`: stable source ID, type, metadata, bounded excerpt, retrieval state, provenance
- `artifacts`: validated structured artifact, source ledger, version, originating run
- `artifact_edits`: explicit user edit based on an artifact version
- `usage_receipts`: provider action, model/provider, token counts, reported and accounted cost

The event sequence and canonical records are the replay authority. Snapshots are caches that must be reproducible from the last valid stored state and event sequence. Every state transition is transactional: evidence/notebook state and its event either commit together or neither is claimed.

### Storage adapter and vendor decision

Application code depends on a narrow storage interface. Vendor-specific calls stay inside one adapter.

Before adding a dependency, Phase 7 must verify from current official sources that remote libSQL/Turso supports the pinned Node/Next.js runtime, transactions needed for leases/idempotency, exact package versions, Vercel serverless connections, and the required privacy/retention posture. If it fails, stop and select one replacement; do not add multiple database implementations.

Local deterministic tests use a temporary isolated adapter and never contact hosted storage. Creating a hosted database, accepting a paid tier, storing a secret, or writing remote data requires a separate explicit approval.

### Retention and deletion

- Workspaces remain until an authenticated user deletes them.
- Delete is explicit and cascades application-owned turns, runs, events, notebook snapshots, evidence excerpts, artifacts, edits, and usage receipts for that workspace.
- Deletion cannot promise removal from provider records, database backups, or already exported copies; the UI states that boundary.
- Expired access sessions are deleted and cannot be renewed silently.
- Phase 6 ephemeral in-memory sessions are test data and are not migrated.

### Minimal access control

v0 uses one shared access code, not named accounts.

- Store only a salted password hash in a server secret; compare in constant time.
- On successful unlock, issue a random opaque session whose hash is stored remotely.
- Cookie is `HttpOnly`, `Secure` in hosted environments, `SameSite=Lax`, path `/`, and expires after seven days.
- Mutating routes verify the session, same-origin request boundary, input size, idempotency key, and rate limit before any paid work.
- Unauthenticated users cannot list, read, create, delete, or run a workspace.

## 6. Research notebook contract

The notebook is explicit model-visible working state, not private reasoning. It contains only bounded, inspectable fields:

- `objective`
- `mode`
- `plan_items`: at most 8, each `pending`, `active`, `complete`, `blocked`, or `cut`
- `findings`: at most 24, each typed `verified`, `inference`, or `context`, with supporting source IDs
- `open_questions`: at most 10, each open, answered, blocked, or cut
- `source_ids`: at most 24
- `archive_state`: searched, no match, matches, degraded, or unavailable
- `tool_availability`
- `remaining_budget`
- `completion_state`: researching, ready, partial, stopped, failed, or complete

No hidden reasoning tokens, free-form scratch chain, raw full page body, complete transcript record, provider prompt, or secret is stored in the notebook or sent to the client.

Each controller turn receives only:

- the global system prompt and applicable procedure;
- frozen user input and explicit follow-up instruction;
- current notebook snapshot;
- bounded recent safe events and selected tool observations;
- stable evidence IDs with bounded excerpts needed for the next decision;
- allowed actions and exact remaining limits.

Old raw observations are not replayed indefinitely. Deterministic reducers keep durable structured state, while the model must explicitly open a saved source when it needs more of that source.

## 7. Controller action contract

Luna returns one schema-valid action per turn and a public summary of at most 180 characters. It never returns executable code or more than one action.

Allowed actions:

| Action | Effect |
| --- | --- |
| `update_plan` | Replace the bounded public plan with valid items and statuses. |
| `web_search` | Run one bounded current-web search query through the existing safe tool. |
| `read_url` | Read one supplied or discovered HTTP/HTTPS URL through the existing SSRF-hardened reader. |
| `search_transcripts` | Run one bounded S3–4 archive query through the existing hybrid retrieval path. |
| `open_transcript_chunk` | Open one exact chunk ID returned by transcript search. |
| `record_finding` | Add one bounded finding whose supporting source IDs already exist. |
| `record_open_question` | Add or update one bounded question without claiming an answer. |
| `finish_research` | Declare `ready` or `partial` with a public completion summary. |

The executor rejects unknown actions, extra keys, oversized fields, unavailable tools, repeated identical actions without new evidence, nonexistent source IDs, and any action beyond remaining limits. A rejected controller action ends the run as a typed failure; it does not trigger an automatic model retry.

## 8. Loop, stop, and budget contract

### Initial run or explicit research-more run

- maximum controller turns: **12**
- maximum total provider requests: **20**
- maximum current-web searches: **3**
- maximum URL reads: **8**, including supplied links
- maximum transcript searches: **2**
- maximum transcript chunk opens: **6**
- maximum Grok compositions: **1**
- maximum artifact repairs: **1**, only after deterministic validation failure
- maximum aggregate model output: **24,000 tokens**
- maximum elapsed wall time: **300 seconds**
- maximum accounted cost: **$1.00 per run**
- automatic retries: **0**

The request ceiling includes Luna decisions, Grok web-search calls, embedding, reranking, composition, and repair. The aggregate request, time, token, and dollar ceilings always win; individual tool maxima are capacities, not a promise that every maximum can be consumed in one run. Before each provider request, the existing usage ledger reserves a conservative worst-case cost; a request is denied when the reservation would exceed either request or dollar capacity. Post-response receipts reconcile upward, never below actual reported cost.

### Evidence-only artifact follow-up

- no web or transcript research tools
- maximum Grok compositions: **1**
- maximum repairs: **1**
- maximum provider requests: **2**
- maximum aggregate model output: **12,000 tokens**
- maximum elapsed wall time: **180 seconds**
- maximum accounted cost: **$0.50**
- automatic retries: **0**

The UI makes `Use saved evidence` and `Research more` distinct actions. It never silently upgrades an evidence-only follow-up into a metered research run.

### Required research behavior

- Attempt every unique supplied link before it can support a claim.
- Perform at least one transcript search on every initial artifact run.
- A search-result snippet alone cannot support a factual claim that requires the underlying page.
- A finding may cite only existing evidence IDs.
- The controller must end with `finish_research`; hitting a hard ceiling first yields a truthful partial or failed state.
- No provider/model fallback, recursive loop, automatic retry, or hidden background continuation exists.

## 9. Composition and validation

Grok receives the frozen input, applicable mode procedure, completed notebook, and only the bounded evidence records selected for composition. It does not receive unused corpus data or an unbounded thread transcript.

Code then validates:

- the existing Headlines or Big Story artifact schema;
- every source ID and exact archive ID/excerpt;
- source-ledger construction;
- clock and priority constraints;
- evidence/notebook consistency;
- no invented host attribution or dialogue;
- terminal state and usage accounting.

One repair is allowed only after deterministic artifact validation fails and only inside remaining request, token, time, and dollar capacity. Repair failure preserves the last valid artifact and returns the exact safe validation failures.

## 10. Follow-up, edits, interruption, and concurrency

### Follow-up modes

1. **Use saved evidence**: answer or revise from stored evidence only under the smaller follow-up cap.
2. **Research more**: resume the notebook as a new metered run under the full research cap.
3. **Inspect source**: deterministic source opening where possible; no model call is required.

Manual edits create a new user-owned artifact version. A model revision is based on an explicit selected version and becomes current only after validation and user acceptance. A failed, stopped, or stale revision never overwrites the previous artifact.

### Interruption

Phase 7 does not add durable background jobs. Each committed action survives, but an interrupted serverless function is marked `interrupted` after its lease expires. Reload shows the saved plan, evidence, artifact, usage, and honest interrupted state. It never infers completion or automatically restarts paid work.

### Concurrency

- One active lease per thread.
- Every start/follow-up request has a unique client idempotency key.
- A duplicate key returns the original run; it cannot charge again.
- A second tab may observe the run but cannot start another until the lease ends.
- Stop is idempotent and terminal for the active run.

## 11. Safe event and UI contract

Retain all Phase 6 safe events and add:

- `plan_updated`
- `finding_recorded`
- `open_question_recorded`
- `research_finished`
- `run_interrupted`
- `workspace_replayed`

Events contain a run ID, thread ID, monotonic sequence, timestamp, display-safe summary, and typed bounded payload. Replaying the same events and stored versions produces the same visible state.

The Phase 6 three-pane workbench evolves minimally:

- left rail becomes the real persistent workspace list;
- center shows turns, the public plan, safe tool/state events, Stop, and explicit follow-up mode;
- right shows the notebook summary, current editable artifact, version state, and source ledger.

Do not redesign the visual system or add dashboard polish before Phase 8 usefulness passes.

## 12. Implementation sequence

### 7.0 — Contracts and deterministic fixtures

1. Add schemas and pure reducers for controller actions, notebook, durable events, run limits, and replay.
2. Add the global system prompt and four procedure modules as server-only versioned text.
3. Add adversarial fixtures for prompt injection, malformed actions, repeated actions, nonexistent evidence, budget exhaustion, stop, interruption, and unavailable tools.
4. Prove the entire loop with scripted controller/model fixtures at `$0.00`.

### 7.1 — Storage and access

1. Verify and pin one storage client or stop for a replacement decision.
2. Add the storage interface, local test adapter, one additive migration set, repositories, and transactions.
3. Add access-code unlock, hashed sessions, cookies, origin checks, rate limits, idempotency, and leases.
4. Test deletion, expiry, outage, restart, replay, concurrent tabs, and duplicate submission.
5. Stop for explicit approval before creating or writing hosted storage.

### 7.2 — Adaptive controller

1. Preserve the Phase 5 workflow as a frozen baseline.
2. Add the one-action controller loop behind a server-only `PHASE_7_AGENT_DISABLED = true` default.
3. Wrap the four existing external/archive tools and three notebook mutations behind the typed executor.
4. Add conservative pre-call accounting, cancellation, action repetition detection, and all stop conditions.
5. Add deterministic evidence and artifact validation without weakening Phase 5 rules.

### 7.3 — Durable UI and real follow-up

1. Replace the Phase 6 fixed local session ID with authenticated durable workspace IDs.
2. Stream committed safe events and reconcile from persisted sequence after reconnect.
3. Render public plan/notebook status, interrupted state, artifact versions, and saved sources.
4. Implement explicit `Use saved evidence`, `Research more`, source inspection, manual-edit preservation, and validated replacement acceptance.

### 7.4 — Provider-free gate

The following must pass before hosted writes or provider calls:

- schema/property tests for every accepted and rejected action;
- loop adaptation, repetition rejection, termination, cancellation, timeout, and budget tests;
- prompt-injection fixtures proving content cannot grant tools or alter limits;
- evidence, citation, transcript exactness, composition, repair, and previous-artifact preservation tests;
- event ordering, replay determinism, snapshot consistency, idempotency, lease, restart, outage, expiry, deletion, auth, rate-limit, and cross-thread-denial tests;
- browser tests at 1440px, 1024px, and 390px, including reload, reconnect, Stop, keyboard, focus, reduced motion, and zero console errors;
- supply-chain denylist, audit review, lint, typecheck, all tests, production build, secret scan, migration dry-run, and frozen historical hash checks.

### 7.5 — Separately authorized live proof

Only after 7.4 passes and Jake separately authorizes spend:

- run exactly one frozen Headlines case and one frozen Big Story case through the browser;
- maximum 20 provider requests and `$1.00` per case;
- maximum aggregate Phase 7 proof spend: `$2.00`;
- zero automatic retries and zero replacement attempts without new authority;
- no Gemini/plain-Grok comparison yet; that belongs to Phase 8;
- no deployment or unrelated hosted service.

Each proof records input hash, controller actions, safe event sequence, notebook terminal state, sources, archive state, artifact validation, usage receipts, reservations, actual/accounted cost, elapsed time, errors, browser state, and report hash. Every live flag is relocked immediately after the attempt, pass or fail.

## 13. Rollback and failure rules

- Phase 6 remains runnable in provider-disabled fixture mode and unchanged as the fixed baseline.
- Phase 7 adaptive execution is additive and disabled by default until its gate passes.
- Storage migrations are additive in this phase; no destructive alteration or corpus migration is allowed.
- A failed storage spike stops before a second vendor or compatibility layer is added.
- A failed deterministic gate is diagnosed in the smallest responsible layer; no subagent, new model, retry loop, or framework is added as a workaround.
- A failed live proof is preserved exactly and does not authorize a replacement.
- Storage failure, interruption, stop, and provider failure preserve the last valid artifact and accounted usage and never claim unavailable work succeeded.

## 14. Phase 7 gate — stop

Phase 7 passes only when:

- the provider-free gate and any separately authorized hosted/live proofs pass;
- at least one deterministic test proves a tool result changes the controller's next action;
- every loop terminates within all request, action, token, time, and dollar limits with zero automatic retries;
- public plan, evidence notebook, safe events, sources, manual edits, artifact versions, and receipts survive reload and simulated cold start;
- follow-up can explicitly collect new research and can separately revise from saved evidence only;
- no follow-up silently overwrites manual edits or starts unrequested research;
- unauthorized and cross-thread access fail closed;
- duplicate submissions and concurrent tabs cannot duplicate paid work;
- prompt injection cannot add tools, change instructions, increase limits, expose secrets, or write unsupported evidence;
- citations, source ledger, archive IDs/excerpts, clocks, and artifacts validate;
- Phase 3 corpus/retrieval files and Phase 5/6 evidence remain byte-identical;
- all live gates are relocked;
- `docs/PHASE_7_RESULT.md` records exact metrics, spend, hashes, limitations, migration/storage evidence, and rollback state;
- the full `pnpm gate` passes on one exact clean commit pushed to the existing private `origin/main` only when implementation and push are explicitly authorized.

Stop after this gate. Phase 8 evaluation, subagents, knowledge systems, Vercel deployment, and production access remain separate decisions.

## 15. Explicitly deferred decisions

- Subagents are considered only after Phase 8 proves the single adaptive loop has a material Big Story breadth problem. The first experiment may have at most two read-only, non-recursive researchers and must beat the single-agent baseline under a separate budget.
- LLMwiki is considered only if completed cited research packets need human-readable maintained topic dossiers.
- GBrain is considered only if cross-workspace people, organizations, claims, and longitudinal research become a demonstrated memory problem.
- Google Drive is considered only if import/export friction is measured as a workflow bottleneck.
- Durable background execution is considered only if real serverless interruptions make the lease-and-resume design insufficient.
