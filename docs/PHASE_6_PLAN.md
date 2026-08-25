# Phase 6 plan — real-agent workbench

Status: **APPROVED** by Jake on 2026-08-24 HST.

Phase 6 replaces the Phase 1 mock with the real Phase 5 workflow and an artifact-first, Claude Code/Codex/Origami-inspired workbench. It remains a local, single-session application. Persistence, authentication, hosted infrastructure, Vercel deployment, multi-user coordination, and Phase 7 are out of scope.

## Frozen product and visual decisions

- Primary users are equal partners CJ Little and Jeff Parker.
- The user starts one Headlines or Big Story workspace with a topic, up to three links, rough notes, and an optional target clock.
- The final artifact is primary. Agent activity remains visible and inspectable in a compact rail.
- Desktop uses three areas: narrow current-session rail, activity/conversation rail, and dominant artifact workspace.
- Narrow layouts collapse the session rail and switch activity/artifact through accessible tabs; core functionality is never hidden permanently.
- The locked visual system uses charcoal surfaces `#151716`, `#1c1f1d`, and `#252927`; primary text `#edece6`; muted text `#969c97`; amber action `#dfa94b`; blue running `#79a9b5`; green success `#83aa7c`; coral failure `#c97361`.
- Product sans carries UI and prose; monospace is limited to tools, time, cost, IDs, and receipts.
- The continuous run-tape is the signature progress motif. Motion communicates state only and respects reduced motion.
- No fake history, fake metrics, raw chain-of-thought, provider prompt, system prompt, API key, raw page body, or corpus record reaches the client.

## 6.0 — Contracts and safety before code

1. Keep `Phase5Input`, artifact schemas, activity events, usage, and final run results authoritative on the server.
2. Define a separate bounded browser projection. Only safe event summaries, safe detail keys, bounded source excerpts, structured artifacts, counts, elapsed time, and accounted cost may stream.
3. Freeze visible actions: `start`, `stop`, explicit `retry`, and `follow_up`. Automatic retry remains zero.
4. Default every normal build, test, and development command to provider-disabled fixture mode.
5. Permit live local execution only when all exact server-only gates are present: non-production runtime, ignored OpenRouter key, explicit Phase 6 live flag, and one-shot live-proof authority.
6. Allow one active run per local session. Duplicate start, follow-up while running, and stale-run mutation fail closed.
7. Ephemeral server memory may retain one current result and its evidence for local follow-up. It is not durable storage; restart/reload expiry is stated honestly.
8. Preserve the prior valid artifact if a stop, retry, or follow-up fails.

## 6.1 — Real streaming and cancellation

1. Replace the mock route with a typed AI SDK UI-message stream over the Phase 5 workflow.
2. Add an optional event sink to the workflow so every activity event is emitted when created, not replayed only after completion.
3. Project internal events into safe UI parts and stream run state, tool activity, source summaries, artifact, usage, and completion.
4. Propagate the browser request abort signal through the workflow, model adapter, current-web search, URL reads, and transcript provider calls where the dependency supports cancellation.
5. Check abort and time boundaries before and after every paid or network action. A stop emits `run_stopped`, prevents later steps, and never becomes an automatic retry.
6. Add a bounded follow-up refinement path over the current validated artifact and retained evidence. It may make one Grok composition request, performs no new research by default, rehydrates the source ledger in code, and replaces the artifact only after deterministic validation.
7. A user-requested research refresh is an explicit new run, not a hidden follow-up tool loop.

## 6.2 — Artifact-first workbench

### Left session rail

- Nonsense Research Desk identity
- `New story`
- one current ephemeral session only
- Headlines/Big Story label
- run state and actual/accounted cost
- no settings, accounts, fabricated recent threads, or saved history

### Activity rail

- structured intake form before the first run
- visible user request after submission
- continuous run-tape and chronological activity
- expandable planning, web search, URL read, transcript search/open, composition, validation, repair, failure, stop, and completion rows
- safe input/result details only
- contextual Stop while running; explicit Retry only after stopped/failed
- follow-up composer after a valid artifact exists

### Artifact workspace

- mode-specific Headlines rundown or Big Story dossier
- controlled section editing with the validated server artifact as the starting value
- clock and `must_have`, `use_if_time`, `cut_first` priorities
- exact past-Nonsense references or honest no-match
- uncertainty/open-check list
- source ledger with web links and an accessible transcript-excerpt drawer
- copy as Markdown
- previous valid content stays visible during follow-up and after failed refinement

## 6.3 — States, fixtures, and interactions

Recorded zero-provider fixtures cover:

- first-run/empty intake;
- invalid field and oversized request;
- planning and every tool start/complete state;
- page unavailable/paywalled;
- transcript `no_match`, keyword-only, and unavailable states;
- composition, validation, one repair, complete, and partial artifacts;
- model failure, timeout, and budget exhaustion;
- user stop before and during a tool/model boundary;
- explicit retry without automatic retry;
- follow-up success, invalid result, and expired ephemeral session;
- provider-disabled/offline mode;
- long titles, long source names, maximum artifact shape, and no archive matches.

Every fixture uses the production browser projection and stream path. No UI-only fake shape may diverge from the server contract.

## 6.4 — Verification gate before spend

- Pure contract tests validate every allowed and denied browser field.
- Workflow tests prove ordered event emission, termination, cancellation, one active run, zero automatic retries, stale-session refusal, follow-up validation, and artifact preservation.
- Route tests prove input bounds, fixture default, server-only key boundary, live-mode locks, duplicate prevention, stream termination, and safe errors.
- Component/state tests prove intake, tool expansion, source opening, editing, copy output, stop, retry, follow-up, partial/error states, and responsive tab semantics.
- Browser QA covers at least 1440px desktop, approximately 1024px tablet, 390px mobile, keyboard-only navigation, reduced motion, visible focus, contrast, overflow, console errors, and source-link behavior.
- Dependency audit, supply-chain denylist, lint, typecheck, all tests, and Next.js production build pass.
- Phase 3 corpus and retrieval hashes remain byte-identical. Both Phase 5 evidence reports remain unchanged.
- No paid request occurs before this gate passes.

## 6.5 — One bounded live UI proof

Frozen case: the existing public Phase 5 Headlines input for NASA's August 24, 2026 article `What Lake Bonneville Left Behind`, using `https://science.nasa.gov/earth/earth-observatory/what-lake-bonneville-left-behind/` and an eight-minute target. Phase 6 must import this frozen case rather than retype or substitute it.

Authority and ceilings:

- exactly one initial Headlines run through the browser/stream route;
- maximum one Luna plan, one Grok composition plus the existing single repair only if deterministic validation requires it, one web search, one transcript search, and bounded URL reads;
- no automatic retry and no paid follow-up;
- at most six OpenRouter provider requests including embedding/rerank and a possible repair;
- existing `$0.50` whole-run accounted-cost ceiling;
- no Big Story run, deployment, hosted persistence, or external write.

The proof must record the safe browser event sequence, terminal state, artifact validation, sources, tool counts, usage receipts, cost, latency, cancellation wiring state, console state, viewport evidence, and report hash. The live flag and every one-shot launcher are relocked immediately afterward whether the run passes or fails. No second live UI attempt is permitted inside Phase 6 without new explicit authority.

The original attempt is preserved byte-for-byte as `reports/phase-6-live-attempt-1-failed.json`; it used an incorrectly retyped URL and did not produce an artifact. On 2026-08-24 HST Jake explicitly authorized exactly one replacement Headlines UI run using the corrected imported frozen Phase 5 NASA case, with the same maximum six provider requests, `$0.50` cap, and zero retries. No additional replacement is authorized.

## Phase 6 gate — stop

Phase 6 passes only when:

- a person can understand the agent's work without logs or private reasoning;
- every production event/state renders from recorded fixtures;
- the real browser route streams the bounded Headlines run and its validated artifact;
- artifact editing, source inspection, Markdown copy, stop, explicit retry, and follow-up preserve the last valid artifact;
- desktop, tablet, mobile, keyboard, focus, contrast, reduced-motion, and overflow evidence pass;
- secrets, raw source bodies, corpus records, prompts, and hidden reasoning remain server-only;
- the live proof stays within one run, six provider requests, zero automatic retries, and `$0.50`;
- all live gates are locked, `pnpm gate` passes, the result document is complete, and one exact clean passing commit is pushed to private `origin/main`.

If the live UI proof fails, preserve the exact evidence, relock, diagnose Phase 6, and do not commit, push, or start Phase 7 as if the gate passed.
