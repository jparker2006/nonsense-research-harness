# Nonsense Research Harness — Manager–Worker Architecture Specification

Status: **READY FOR AUTONOMOUS IMPLEMENTATION**

This specification replaces the current shallow one-action-at-a-time controller as the target research architecture. It preserves the working conversation UI, safe web and transcript tools, source contracts, optional preparation briefs, and evidence-first product principles. It does not authorize durable persistence, deployment, new hosted infrastructure, or unbounded provider spending.

The implementation should be described with product-domain names such as research manager, task graph, research worker, evidence notebook, and answer synthesis. Historical phase-labeled reports remain immutable evidence, but new runtime code and tests should not be organized around phase numbers.

## Problem Statement

CJ Little and Jeff Parker need a research partner that makes podcast preparation faster without replacing the deliberation that makes the show good. They should be able to ask a natural question, paste links, request deeper research, check past Nonsense coverage, challenge an answer, and continue the conversation. The system should browse intelligently, read the underlying pages, retain evidence, and return a concise, clickable, highly grounded answer.

The current harness is a real adaptive loop, but it is still too shallow and brittle. One Luna call chooses one action at a time through a handwritten structured-JSON protocol. It does not create a durable multi-step research plan, independent work is only minimally parallelized, the same controller shoulders planning and execution, and the controller can lose visibility into newer saved evidence because of bounded prompt projection. A malformed or unavailable controller response can stop a useful run even after research has been gathered. These weaknesses are contributing to slow, incomplete, or prematurely stopped research turns.

The central product risk is incorrect or weakly supported output. Jeff's strongest requirement is that claims be grounded in actual research. The harness must never turn fluent synthesis into false confidence, cite a search snippet as if the page were read, hide missing evidence, or imply that a goal was completed when it was not.

## Solution

From the user's perspective, Nonsense remains one conversational research agent. Standard chat automatically decides when to browse, read supplied links, or search the transcript archive. Deep Research uses the same agent and tools but creates a visible compact plan, investigates more broadly, and automatically begins without waiting for plan approval. A Headlines or Big Story preparation brief is created only when explicitly requested.

Internally, a strong Grok manager owns the research goal. It creates a small dependency graph of research tasks, launches every dependency-ready task concurrently, reviews the evidence when each wave converges, updates the plan, judges whether the question has been answered, and writes the final response. GPT-5.6 Luna workers execute bounded research tasks with native tool calling. Each worker can use the entire small tool catalog and returns a typed JSON evidence packet. A server-owned evidence notebook preserves exact sources, excerpts, claims, conflicts, uncertainties, usage, and task history. Code validates mechanical truth; Grok judges semantic sufficiency.

The result should feel closer to Codex or Deep Research: one capable manager, visible compact work, real parallel investigation, iterative replanning, honest goal completion, and a concise cited answer rather than a predefined show-production workflow.

## User Stories

1. As CJ or Jeff, I want to ask a normal question without filling out a research form, so that research starts from the way I naturally think.
2. As CJ or Jeff, I want standard chat to browse automatically when current or contested facts matter, so that I do not need to toggle a special mode for ordinary verification.
3. As CJ or Jeff, I want the agent to read links I paste, so that its answer reflects the actual source rather than only a search snippet.
4. As CJ or Jeff, I want the agent to discover and read useful current sources, so that its research is at least as capable as the Gemini workflow I already use.
5. As CJ or Jeff, I want the agent to search prior Nonsense transcripts when relevant, so that earlier conversations can inform new research.
6. As CJ or Jeff, I want the archive to remain useful without unreliable speaker labels, so that missing attribution does not block research.
7. As CJ or Jeff, I want concise answers that lead with the conclusion, so that I can understand the result quickly.
8. As CJ or Jeff, I want citations beside the claims they support, so that I can check the evidence without decoding machine IDs.
9. As CJ or Jeff, I want every web citation to open the original article, so that I can inspect the source myself.
10. As CJ or Jeff, I want uncertainty, inference, and disagreement labeled honestly, so that polished prose is not mistaken for established fact.
11. As CJ or Jeff, I want the agent to state when the research goal was only partially satisfied, so that I know what remains unknown.
12. As CJ or Jeff, I want useful suggested follow-up prompts, so that I can understand how to continue the research conversation.
13. As CJ or Jeff, I want follow-up questions to reuse evidence and corrections from the same conversation, so that I do not repeatedly rebuild context.
14. As CJ or Jeff, I want the agent to refresh earlier research when I ask, so that repeated legitimate work is not blocked by protection against loops.
15. As CJ or Jeff, I want a Deep Research control, so that I can request broader investigation without requesting a preparation packet.
16. As CJ or Jeff, I want to see a compact Deep Research plan and have it begin automatically, so that I understand the direction without babysitting it.
17. As CJ or Jeff, I want independent research questions investigated in parallel, so that deeper research does not become unnecessarily slow.
18. As CJ or Jeff, I want the agent to revise its plan after learning something important, so that the initial plan does not become a rigid workflow.
19. As CJ or Jeff, I want the agent to investigate contradictions autonomously, so that it does not stop at the first plausible account.
20. As CJ or Jeff, I want the agent to ask before changing the central topic, deliverable, people, allegation, or assignment, so that autonomy does not become scope drift.
21. As CJ or Jeff, I want preparation briefs only when I explicitly request one, so that normal research answers do not become oversized artifacts.
22. As CJ or Jeff, I want requested briefs to rank material by editorial priority rather than assign episode timing, so that the hosts retain control of editing and the clock.
23. As CJ or Jeff, I want the system to remain a research tool rather than imitate our dialogue or write a finished show, so that it supports rather than replaces our work.
24. As CJ or Jeff, I want a failed source or model request to preserve completed research, so that one transient error does not waste the whole run.
25. As CJ or Jeff, I want a transient failure retried once and then handled honestly, so that reliability improves without creating hidden retry loops.
26. As CJ or Jeff, I want the preferred manager to fall back visibly when unavailable, so that a temporary Grok outage does not always destroy a useful turn.
27. As the project owner, I want research targets and safety ceilings separated, so that the agent aims to be economical but can finish a nearly complete answer.
28. As the project owner, I want final-answer capacity reserved before research spends the remaining budget, so that gathered evidence is never discarded for lack of synthesis budget.
29. As the project owner, I want all provider usage and fallback behavior recorded, so that cost and model routing remain inspectable.
30. As the project owner, I want planning, worker, mode, and answer instructions in readable Markdown, so that I can inspect and improve the harness without digging through TypeScript strings.
31. As the project owner, I want maintained open-source libraries used for generic agent-loop behavior, so that the project does not own unnecessary orchestration code.
32. As the project owner, I want the research state serializable now, so that durable persistence can be added later without another architecture rewrite.
33. As the project owner, I want current in-process memory described honestly, so that local conversation continuity is not confused with durable storage.
34. As the project owner, I want raw web content treated as untrusted data, so that a webpage cannot silently instruct the manager or alter tool policy.
35. As the project owner, I want deterministic checks limited to mechanical truth, so that brittle code does not pretend to judge the quality of natural-language research.
36. As the project owner, I want one high-level end-to-end test seam, so that the harness is proven as a working research turn rather than only as disconnected utilities.

## Implementation Decisions

### 1. Product boundary

- The product presents one Nonsense research agent for equal partners CJ and Jeff.
- It is an evidence-first conversational research tool, not a show writer, host simulator, automatic story selector, or replacement for editorial deliberation.
- Default chat may use tools autonomously. The user does not need to enable Deep Research for ordinary browsing.
- Deep Research changes investigation depth, not output format.
- A preparation brief is a separate output requested through natural language. It is never inferred merely from prior conversation, an existing brief, or Deep Research being enabled.
- Ordinary answers remain concise, natural Markdown. Fixed packet headings are not imposed on normal conversation.

### 2. Target runtime architecture

The runtime is a hierarchical manager–worker system:

```text
user message and current conversation state
  -> Grok manager creates or refreshes the research goal and task graph
  -> server validates the graph and launches every dependency-ready task
  -> Luna workers use native tool loops and submit typed evidence packets
  -> server merges packets into the evidence notebook
  -> Grok inspects coverage, conflicts, uncertainty, and remaining questions
     -> revise the graph and run another wave when useful
     -> otherwise submit the final cited answer or explicitly requested brief
```

- The manager is the single authority for research direction, replanning, semantic completion, and final synthesis.
- Workers are temporary task executors, not user-visible personalities, long-lived subagents, or equal decision-makers.
- The manager accesses websites and transcripts through workers. From the user's perspective, the agent still goes to websites; the internal delegation only separates strategy from execution.
- The strong manager must re-enter after every completed wave. A one-time plan followed by blind execution is explicitly rejected.

### 3. Manager responsibilities

- Grok 4.6 with medium reasoning effort is the preferred manager.
- It interprets the current user goal and distinguishes direct conversation, Standard research, Deep Research, and an explicit brief request.
- It creates a compact task graph containing bounded research questions, priority, dependencies, expected source types, and a clear success condition for each task.
- It may add, revise, cancel, or reprioritize future tasks after inspecting evidence. Completed task history is immutable.
- It decides whether another research wave is likely to materially improve the answer.
- It produces the final answer, completion status, limitations, and suggested follow-ups.
- It does not micromanage every URL selection and does not ingest an unbounded replay of raw pages.

### 4. Task graph and scheduler

- The plan is typed JSON and server-owned after validation.
- The graph is a directed acyclic graph. Cycles, duplicate task IDs, missing dependencies, invalid statuses, and oversized plans fail validation.
- Every task whose dependencies are satisfied is eligible to run concurrently. There is no arbitrary product rule limiting a wave to two or three workers.
- A provider-aware execution pool may queue otherwise-ready tasks to respect real connection, rate-limit, memory, and provider constraints. This throttle is operational safety, not a semantic research limit.
- The number of planned tasks is itself bounded by relevance and budget. Parallelism does not authorize the manager to manufacture dozens of low-value tasks.
- A wave ends when all launched tasks have returned a valid evidence packet or a typed terminal failure.
- The server checkpoints task state, evidence, receipts, and failures after every wave before requesting a replan.
- Cancellation propagates to every active worker and preserves completed checkpoints.

### 5. Worker responsibilities

- GPT-5.6 Luna with maximum reasoning effort is the initial worker model.
- Each worker receives the user goal, one bounded task, its success condition, the current source registry needed for that task, the tool catalog, and its remaining budget.
- Workers may reformulate searches, select candidate sources, read pages, search or open archive material, compare evidence, and recover from a failed source within their task.
- Every worker receives the complete approved tool catalog. Tool availability is not artificially split by worker type.
- A worker cannot change the overall user goal, expand the assignment, declare the whole research run complete, create the final answer, or silently create a brief.
- A worker terminates through a typed evidence-submission tool rather than freeform text parsing.
- Worker output is evidence and task judgment, never private chain-of-thought.

### 6. Tool catalog

The initial worker catalog remains intentionally small:

- Search the current web for candidate sources.
- Read one or more approved public URLs into exact citeable evidence.
- Search the Nonsense transcript archive.
- Open one or more exact transcript chunks returned by archive search.
- Submit a typed evidence packet.

All research workers receive all five tools. The existing distinction between search and reading is preserved: search results identify candidates, while the underlying page must be read before it can support a factual claim. Batch URL reading and batch transcript opening are retained for independent targets.

The safe URL reader remains deterministic and SSRF-hardened. Transcript retrieval preserves the existing hybrid BM25, embedding, fusion, and accepted reranking behavior, including honest keyword-only or unavailable degradation. No new research tool is added until this catalog is reliable at the end-to-end turn seam.

### 7. Native tool loops and libraries

- Replace the handwritten one-action structured-JSON execution loop with maintained native tool-loop primitives from the already pinned Vercel AI SDK.
- Use library-native typed tool definitions, call/result history, stop conditions, cancellation, and streaming wherever they match the required behavior.
- Implement only the small amount of project-specific scheduling needed for task dependencies, wave convergence, evidence merging, budgets, and checkpoints.
- Mastra may remain as a thin outer workflow or trace boundary only if it provides concrete value. It must not wrap the entire new runtime in a meaningless single step.
- Do not add LangGraph or another orchestration framework solely to model a small DAG. Add a dependency only when a maintained library removes more custom runtime logic than it introduces.
- All dependencies remain exactly pinned and pass the existing supply-chain review. Relevant installed-package documentation is read before implementation.

### 8. Evidence packet contract

Workers submit strict JSON. At minimum, a packet records:

- task identity and terminal task status;
- a direct answer to the assigned research question;
- discrete claims;
- stable source references for each supported claim;
- exact supporting excerpts or transcript passages;
- source provenance and retrieval status;
- material conflicts or alternative explanations;
- remaining gaps and uncertainty;
- worker confidence as a bounded judgment rather than a factual guarantee;
- tool failures, provider receipts, and accounted cost.

A worker summary alone is not evidence. Search candidates, snippets, unavailable pages, and unsupported worker statements cannot support final claims. Exact excerpts and stable source records remain available for manager inspection and citation validation.

### 9. Evidence notebook and context projection

- The server owns one serializable evidence notebook per conversation.
- The notebook contains the user goal, task graph and history, evidence packets, canonical source registry, exact excerpts, claims and their source links, conflicts, gaps, user corrections, run receipts, prior answers, and the current validated brief.
- The arbitrary projection that can hide newer evidence from the controller is removed. Recently gathered evidence must not become invisible merely because older records occupy the first positions in an array.
- Model context is selected by task and relevance, but no canonical notebook record or source mapping is discarded as a side effect of prompt truncation.
- The manager receives all task conclusions plus the exact excerpts needed to judge central claims. If detail is insufficient, it launches a focused follow-up task rather than guessing.
- Raw full-page bodies, secrets, provider prompts, private reasoning, and the full transcript corpus are never placed in browser state or unbounded manager context.
- The notebook is serializable and versioned now. Actual cross-process database persistence remains a later project.

### 10. Completion judgment

- Grok owns semantic sufficiency. Code does not score prose, count keywords, or use brittle heuristics to decide whether the user's question was answered.
- At every convergence checkpoint, Grok explicitly judges whether high-priority research questions are answered or honestly unresolved, material factual claims have support, a primary or authoritative source was attempted where available, meaningful disagreement is surfaced, the Nonsense archive was checked when relevant, and another research wave could change the conclusion.
- A separate evaluator model is not part of this implementation. It may be added later only if real evaluations show the manager regularly approves weak work or searches wastefully.
- Code validates only mechanical truths: graph validity, terminal task states, citation resolution, evidence availability, exact archive provenance, tool receipts, budgets, cancellation, and schema correctness.
- The manager returns one of three honest outcomes: satisfied, partially satisfied with named limitations, or unable to answer from available evidence.

### 11. Standard and Deep Research policies

- Both policies use the same manager, workers, tools, notebook, citation rules, and answer contract.
- Standard research normally creates one to three focused tasks, completes one wave, and stops as soon as the question is sufficiently supported.
- Deep Research normally creates three to eight tasks, shows the compact plan, seeks primary evidence plus independent context, investigates material contradictions, and may run multiple waves.
- These task counts are normal operating ranges, not quotas or hard stops.
- Deep Research begins automatically after showing its plan. The user is not expected to approve or edit the plan.
- A pure conversational, formatting, clarification, or saved-evidence follow-up may answer directly without a new research plan. A follow-up that reopens research gets a new or revised Grok plan.

### 12. Autonomy and user control

- The manager may autonomously search, reformulate queries, select and read sources, investigate contradictions, check archive coverage, revise future tasks, and stop when the goal is satisfied.
- It asks before expanding the central topic, changing the requested deliverable, adding materially different people or allegations, or otherwise changing the assignment.
- It does not ask permission for ordinary in-scope research choices.
- The visible plan is informational and work begins automatically.
- Existing conversation evidence and explicit user corrections are reused. Repeated-action protection is scoped to the active task or run and never blocks a legitimate later follow-up.

### 13. Models, fallback, and routing

- Preferred manager, replanner, completion judge, and final synthesizer: Grok 4.6, medium reasoning effort.
- Research workers: GPT-5.6 Luna, maximum reasoning effort.
- URL fetching, readable-text extraction, graph scheduling, evidence merging, citation validation, and local archive opening remain deterministic code.
- No Sol model and no third model are introduced in this implementation.
- Model identifiers, provider policies, reasoning effort, and fallback state remain pinned and inspectable through the OpenRouter boundary.
- A transient Grok manager failure receives one automatic retry from the last checkpoint. If Grok remains unavailable, Luna may take over manager and synthesis duties for that turn. The fallback is recorded and shown as a degraded limitation.
- A transient worker or tool transport failure may receive one bounded retry. Invalid model output, unsafe input, permission failure, budget exhaustion, and logical validation failure are not blindly retried.
- A later worker-model bakeoff may compare cheaper models using real task evidence, but model shopping is outside this implementation.

### 14. Budget behavior

- Standard research targets approximately $0.30. Deep Research targets approximately $1.00.
- Standard has a $0.50 safety ceiling and reserves at least $0.10 for completion and final synthesis.
- Deep Research has a $2.00 safety ceiling and reserves at least $0.30 for completion and final synthesis.
- Targets are replanning signals, not hard stops. Near a target, Grok decides whether the likely value of another wave justifies continuing.
- The safety ceiling is high enough to let the agent finish near-target work, but it remains an actual external-spend boundary.
- Research calls cannot consume the protected answer reserve. When only the reserve remains, the scheduler stops launching work and synthesizes the best honest answer from saved evidence.
- Request ceilings are transport safeguards derived from conservative per-call reservations. They must be high enough that the dollar ceiling normally wins and must not become a hidden research quota.
- Missing provider receipts are charged at the conservative reservation. Reconciliation never understates reported spend.
- A safety stop preserves the notebook and returns an honest partial answer; it never discards the run.

### 15. Final answer contract

Grok terminates through a typed answer submission containing:

- natural Markdown answer blocks;
- stable evidence references for factual claims;
- semantic completion status;
- explicit limitations and unresolved conflicts;
- concise suggested follow-up prompts.

The rendered answer leads with the conclusion, uses short natural paragraphs, selects the strongest evidence rather than dumping the notebook, distinguishes fact from inference and uncertainty, and places readable citations beside supported claims. Raw web, archive, chunk, segment, provider, and task IDs remain internal. References retain the original URL or exact episode metadata.

Follow-up suggestions should help CJ or Jeff use the research agent better, such as checking a disputed claim, comparing sources, searching prior coverage, going deeper, or creating a brief. They must not mechanically append irrelevant questions to every answer.

### 16. Preparation brief contract

- The existing validated Headlines and Big Story structures remain optional outputs.
- Brief creation or revision requires explicit current-turn intent.
- Research still runs through the same task graph and evidence notebook. The final Grok synthesis submits the appropriate structured brief rather than a normal answer.
- Briefs rank material as `must_cover`, `strong_material`, `optional_detail`, or `cut_first` and do not generate episode minutes or lock a running order.
- Brief claims and archive references obey the same source and exact-excerpt requirements as conversational answers.
- Existing valid historical artifacts and reports remain unchanged.

### 17. Prompts and inspectability

- Prompts remain server-only Markdown files loaded at runtime.
- Use small composable prompt sources for the global research identity, manager policy, worker policy, Standard policy, Deep Research policy, final-answer contract, fallback behavior, and optional brief procedures.
- Do not duplicate one giant prompt across roles or bury substantive instructions in code strings.
- Code remains authoritative for schemas, permissions, available tools, URL policy, budgets, citations, and cancellation.
- Prompts consistently describe CJ and Jeff as equal partners and forbid invented dialogue, speaker attribution, finished scripts, unsupported certainty, and external-content instructions.
- Observable summaries describe actions and outcomes, never private chain-of-thought or hidden reasoning tokens.

### 18. Streaming and visible work

- Preserve the current conversation-first UI and human-readable source experience.
- Stream a compact plan for Deep Research, task-wave start and completion summaries, source/tool activity, replanning checkpoints, fallback or limitation notices, and the final answer.
- Multiple concurrent workers should appear as one understandable research wave with expandable task details rather than a noisy row for every protocol event.
- The visible agent remains singular. Internal worker IDs and machine task IDs are not presented as a cast of agents.
- Existing auto-follow, stop, source drawer, readable citations, current-artifact revision, and compact observable-work behavior remain intact.
- This architecture implementation may adapt the event reducer to the new runtime, but it is not a broad visual-redesign project.

### 19. Security and evidence integrity

- Webpages, search results, user-provided documents, transcripts, and tool output are untrusted data, never agent instructions.
- The safe URL policy continues to reject private networks, local services, metadata endpoints, unsafe redirects, oversized bodies, unsupported media, and timeouts.
- A worker can read raw bounded source text, but the manager normally receives evidence packets and exact excerpts rather than an unbounded page replay.
- Search snippets cannot substantiate claims that require reading the source.
- Every cited factual claim must resolve to usable saved evidence. Candidate-only, unavailable, invented, or mismatched citations fail mechanically.
- Exact transcript quotes must remain byte-for-byte attributable to the stored chunk. No speaker label is inferred.
- Browser events omit secrets, raw page bodies, internal prompts, provider payloads, private reasoning, and hidden system state.

### 20. Failure and checkpoint behavior

- Each converged wave creates a recoverable in-memory checkpoint before the next manager call.
- A retry resumes from the latest checkpoint and never reruns already completed tasks merely because a later call failed.
- Independent worker failures do not automatically fail the entire wave. Grok decides whether alternate research, a revised task, or an honest partial answer is appropriate.
- A malformed graph, invalid evidence packet, unresolved citation, or unsafe tool request fails closed and remains inspectable.
- Cancellation stops active workers and returns the last checkpoint without claiming completion.
- Fallback model use, retries, missing receipts, unavailable sources, keyword-only archive search, safety stops, and incomplete goals appear in the final limitations and run receipt.

### 21. Migration and naming

- Build the new runtime beside the working conversation route, prove it through injected deterministic dependencies, then switch the route at one clear boundary.
- Prefer domain-oriented module names. Do not create new production modules named after a numbered phase.
- Historical reports, frozen proof fixtures, corpus files, indexes, and prior result documents are preserved.
- Compatibility adapters may temporarily translate old evidence and artifact contracts, but duplicate active runtimes must be removed or explicitly marked historical before closeout.
- The browser request envelope and source presentation remain compatible unless a typed additive field is needed for plan or fallback events.
- The new notebook state is versioned and serializable, but remains process-local until the separately scoped persistence project.

## Testing Decisions

### Primary seam

The primary test seam is one complete research turn with injected model and tool adapters:

```text
message + conversation notebook
  -> streamed plan and observable work
  -> parallel tool-using task execution
  -> evidence convergence and replan
  -> validated cited answer or explicit brief
  -> updated serializable notebook and run receipt
```

This is the highest seam that proves the architecture users depend on. Existing lower-level URL safety, archive retrieval, artifact validation, and citation tests remain supporting evidence. New low-level seams should be added only where a failure cannot be diagnosed at the full-turn boundary.

Tests assert external behavior and durable contracts, not private model reasoning, exact prompt prose, internal function call order unrelated to behavior, or a specific number of searches when the goal is already satisfied.

### Required deterministic scenarios

1. A direct conversational request answers without ceremonial browsing.
2. A current factual Standard request produces a Grok plan, launches tool-using work, reads underlying pages, and returns a concise cited answer without a brief.
3. A Deep Research request emits a compact plan, begins automatically, investigates more broadly than Standard, and does not create a brief.
4. Independent ready tasks start before any one of them completes; dependent tasks wait for prerequisites; the wave converges before replanning.
5. Grok revises future tasks after evidence contradicts the initial assumption.
6. A worker uses multiple native tool calls and submits one schema-valid JSON evidence packet.
7. Every worker has access to the complete approved tool catalog.
8. Search candidates remain unciteable until their underlying pages are read.
9. Transcript search followed by exact chunk opening produces citeable archive evidence without invented speaker attribution.
10. More than sixteen saved evidence records remain available through relevance-aware projection, including the newest central source.
11. A follow-up reuses saved evidence and user corrections without being blocked as a repeated action.
12. A follow-up that reopens research causes a Grok replan; a pure formatting or clarification follow-up can answer from saved evidence.
13. Grok stops when the goal is semantically satisfied and returns partial when material gaps remain.
14. Mechanical validation rejects cycles, invalid task states, fabricated source IDs, candidate-only citations, mismatched archive excerpts, and malformed evidence packets.
15. Deterministic code never declares prose sufficient through keyword or text-scoring heuristics.
16. One transient manager failure retries from the checkpoint; a second Grok failure invokes the visible Luna fallback without losing evidence.
17. One transient worker transport failure retries only the affected task; invalid or unsafe requests do not retry.
18. Concurrent cancellation stops active work, preserves completed packets, and does not claim the goal was satisfied.
19. Standard and Deep targets, safety ceilings, and protected answer reserves are enforced without discarding a near-complete run.
20. Explicit Headlines and Big Story requests create validated priority-ranked briefs; ordinary chat and Deep Research alone do not.
21. Natural answer citations resolve to human-readable sources and original links while raw IDs remain hidden.
22. Suggested follow-ups are relevant, concise, and omitted when they would add no value.
23. Prompt-injection text in a webpage remains source data and cannot alter tool permissions, model routing, budgets, or the user goal.
24. Serialized notebook round-tripping preserves task history, evidence links, conflicts, corrections, artifact revision, and receipts.
25. Streamed concurrent task events reduce into the correct user turn and remain compatible with stop, auto-follow, source inspection, and later follow-ups.

### Integration and regression proof

- Reuse the existing injected chat-route and full-turn fixtures rather than testing the manager, scheduler, and client as disconnected mock applications.
- Preserve and rerun the complete URL safety, web extraction, transcript retrieval, citation, artifact, session isolation, and client reducer suites.
- Run the full repository gate, including supply-chain review, lint, type checking, unit/integration tests, and production build.
- Verify the source transcript corpus, processed records, retrieval artifacts, and frozen historical reports are unchanged.
- Record exact test counts, build result, dependency changes, model routing, retry/fallback proof, concurrency proof, known limitations, and Git identity in a result document.

### Live proof boundary

Deterministic work comes first. A live proof is not authorized merely by this specification. When the autonomous goal explicitly authorizes provider spend, run exactly one representative Standard turn and one representative Deep Research turn through the browser-visible route, with no blind replacement attempts. Their aggregate authorization should be no greater than the sum of the per-run safety ceilings: $2.50.

The live evidence must show actual planning, concurrent independent research when the plan contains it, underlying page reads, convergence, honest completion judgment, claim-level citations, suggested follow-ups, usage receipts, and a final answer that remains available after the run. Any failure is preserved before a separately authorized replacement.

## Out of Scope

- Durable database persistence, authentication, cross-device history, and a conversation sidebar.
- Vercel deployment, hosted infrastructure, or production activation.
- Multiplayer collaboration or simultaneous CJ/Jeff editing.
- Named research personas, a society of agents, recursive delegation, or persistent autonomous subagents.
- A third model, automatic model marketplace routing, worker-model bakeoff, or a separate evaluator model.
- New research tools beyond current web search/read, transcript search/open, and evidence submission.
- GBrain, LLMwiki, a vector database, or a new transcript-ingestion project.
- Fine-tuning, host-style imitation, dialogue generation, finished scripts, automatic episode timing, or automatic final story selection.
- Reprocessing source transcripts, inventing speaker labels, or changing the accepted archive index.
- A broad visual redesign of the conversation interface.
- Podcast analytics, dashboards, or corpus-wide editorial analysis.
- Unlimited background jobs or paid continuation after the browser turn ends.
- Publishing this specification to an issue tracker without a configured tracker and approved triage vocabulary.

## Further Notes

### Resolved decision record

The architecture grill resolved the following decisions, in order:

1. One manager controls the research goal; temporary workers execute tasks.
2. Standard and Deep are policies of the same harness, not separate agents.
3. Deep Research shows a compact plan and begins automatically.
4. Strong planning matters more than using a frontier model for every tool action; Sol is excluded.
5. Durable private threads are a later project.
6. The agent is highly autonomous inside scope and asks before expanding the assignment.
7. A strong manager and lighter executors are preferred over one model doing everything.
8. The visible plan remains compact.
9. Cost targets are soft; higher safety ceilings prevent wasting nearly complete runs.
10. Completion is coverage-based and goal-oriented.
11. One transient retry and wave checkpoints improve reliability without hidden loops.
12. State becomes serializable now; actual persistence comes next.
13. User approval is required for material scope expansion, not ordinary research decisions.
14. Grok plans, returns after each wave, judges completion, and synthesizes.
15. Workers own bounded research tactics but not the overall question or final answer.
16. Every dependency-ready task runs in parallel, subject only to real operational throttling.
17. Grok judges semantic sufficiency; code checks only mechanical truth.
18. Protected synthesis reserves prevent research from consuming the ability to answer.
19. Every tool-using research turn gets a plan or replan; saved-evidence conversation may answer directly.
20. Workers use native maintained tool-loop primitives rather than the handwritten JSON action interpreter.
21. The research plan is a real server-owned dependency graph.
22. Standard and Deep use the same engine with different depth policies.
23. Workers return typed JSON evidence packets.
24. The notebook removes arbitrary evidence visibility cutoffs and is persistence-ready.
25. Grok retries once, then visibly falls back to Luna without discarding evidence.
26. Initial model roles are Grok 4.6 Medium manager and GPT-5.6 Luna Max workers.
27. Maintained open-source libraries are preferred over custom generic orchestration.
28. The manager goes to websites through research workers rather than reading every page itself.
29. The tool catalog remains small, and every worker receives all approved tools.
30. Final output is natural Markdown with referenced citations, honest goal satisfaction, limitations, and useful follow-up prompts.

### Autonomous implementation completion contract

An implementation goal based on this specification is not complete merely because new code exists. It is complete only when:

- the old shallow controller is no longer the active live research runtime;
- the target manager–worker graph is exercised through the real chat boundary;
- every required deterministic scenario passes;
- the full repository gate passes;
- no source transcript, processed corpus record, retrieval artifact, or frozen historical report changed;
- prompts are readable Markdown and new active code uses domain-oriented names;
- the result document records exact architecture, tests, costs, fallbacks, limitations, and commit;
- the working tree is clean at the exact passing commit;
- a push occurs only when the goal explicitly authorizes the existing private remote;
- paid live proof occurs only under an explicit provider, request, and dollar authorization; and
- work stops after this specification rather than silently beginning persistence, deployment, new tools, model bakeoffs, or visual redesign.
