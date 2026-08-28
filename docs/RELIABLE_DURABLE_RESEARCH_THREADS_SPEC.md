# Reliable, Understandable, Durable Nonsense Research

Status: **COMPLETE — verified 2026-08-28**

Implementation evidence: [`RELIABLE_DURABLE_RESEARCH_THREADS_RESULT.md`](./RELIABLE_DURABLE_RESEARCH_THREADS_RESULT.md)

This specification is one staged build with three mandatory gates: Reliability, Cleanup, and Persistence. Each stage must be implemented and verified completely before the next stage begins. Passing an earlier stage does not permit skipping later acceptance criteria, and code existing is never sufficient evidence of completion.

## Problem Statement

CJ Little and Jeff Parker need the Nonsense Research Agent to behave like a dependable research partner, not an impressive demo that sometimes collapses under an ordinary prompt. Today the product has the right broad shape—one conversational Luna agent with web, webpage-reading, Season 3–4 archive, artifact, and cited-answer capabilities—but its deterministic shell still creates avoidable failures. The web tool exposes options whose inner and outer contracts disagree. Successful archive retrieval can be mislabeled unavailable after an optional reranker or later limit event. Packet wording is recognized through a fragile regular expression. Valid structured answers are flattened and split again until they fail their own shape validator. The UI can summarize the worst event instead of the useful result. A Deep Research request can therefore spend time and money, collect evidence, and still return no answer.

The repository also preserves several superseded controller, manager, worker, composer, fallback, fixture, prompt, and phase-era execution paths. Production currently selects the one-agent runtime, but understanding that fact requires tracing unions and compatibility branches through historical modules. This makes failures harder to diagnose and makes future work more likely to repair the wrong layer.

Finally, a useful conversation disappears when the local process restarts. CJ or Jeff cannot return to an earlier topic, continue the same body of research, or use a simple history sidebar. The current process-local workspace contains too much provider-specific and ephemeral data to become a safe durable record as-is.

The next build must make the existing tools reliable, remove the dead execution architectures, and add durable Research Threads without turning the product into a workflow engine, knowledge graph, or database platform.

## Solution

Retain one GPT-5.6 Luna Max `ToolLoopAgent` and one small tool catalog. Standard and Deep Research remain different safety budgets for the same loop. Simplify every tool to one canonical contract shared by the model-facing schema and the provider adapter. Make Tool Outcomes truthful and compositional: usable evidence remains usable, optional degradation cannot erase success, and a later ceiling cannot relabel earlier work. Preserve the narrow Evidence Gate for source provenance, citation resolution, and exact quotations while letting Luna make the semantic research judgment.

After the complete Reliability gate passes, delete the superseded executable architectures and reorganize the surviving runtime around one understandable agent, one prompt, one route, one product-level workspace contract, and the small web/archive/artifact tool set. Historical specifications, results, reports, and accepted corpus evidence remain historical records, but they cannot be imported or executed by the application.

After the cleaned runtime passes again, add a thin server-only `ThreadStore` backed by Neon Postgres. Store each Research Thread as one versioned, sanitized JSONB snapshot plus list metadata in one table. Persist the human conversation, bounded Trusted Source evidence, exact Past Nonsense Coverage passages, unresolved points, the current Working Artifact, and compact receipts. Do not persist search candidates, raw pages, provider-native model messages, private reasoning, or dead runtime state. Add a minimal sidebar for New Research, recent threads, opening a thread, and deleting a thread. The browser should survive a server restart and continue from product-level conversation and evidence rather than replaying private provider protocol.

## User Stories

1. As CJ or Jeff, I want an ordinary research question to finish with an answer, so that the harness is dependable enough to use during show preparation.
2. As CJ or Jeff, I want the agent to browse current information automatically when useful, so that I do not have to micromanage its tools.
3. As CJ or Jeff, I want the agent to run several independent web searches in one action, so that research is broad without becoming a multi-agent graph.
4. As CJ or Jeff, I want each search action limited to a small batch, so that the agent observes evidence before deciding what to do next.
5. As CJ or Jeff, I want web search to accept a simple query contract, so that harmless model-generated options cannot invalidate the entire action.
6. As CJ or Jeff, I want search candidates opened before they support claims, so that a search-result snippet never masquerades as evidence.
7. As CJ or Jeff, I want readable current webpages to become Trusted Sources, so that citations lead to the evidence the agent actually used.
8. As CJ or Jeff, I want one bounded transient retry when a provider briefly fails, so that a momentary network error does not waste the whole turn.
9. As CJ or Jeff, I want invalid input and authorization errors to fail immediately, so that the agent does not retry a problem that cannot repair itself.
10. As CJ or Jeff, I want every retry visible in the receipt, so that cost and latency remain honest.
11. As CJ or Jeff, I want the archive search to find exact names and conceptually similar passages, so that relevant prior coverage is not missed by wording differences.
12. As CJ or Jeff, I want BM25 and vector retrieval to run in parallel, so that neither method prematurely filters out the other's useful matches.
13. As CJ or Jeff, I want reciprocal-rank fusion to combine archive results deterministically, so that basic retrieval still works without another model judgment.
14. As CJ or Jeff, I want the optional reranker to improve ordering when available, so that the strongest passages rise to the top.
15. As CJ or Jeff, I want fused archive results retained when reranking fails, so that an optional optimization can never make the archive unavailable.
16. As CJ or Jeff, I want keyword results retained when query embeddings fail, so that exact archive lookup remains useful during a provider outage.
17. As CJ or Jeff, I want an honest bounded no-match, so that the agent does not claim the podcast never discussed something outside the indexed Seasons 3–4 corpus.
18. As CJ or Jeff, I want the agent to choose whether Past Nonsense Coverage is relevant, so that archive lookup is useful rather than hard-coded ceremony.
19. As CJ or Jeff, I want the agent to make up to three adaptive archive searches, so that it can refine a weak query without spinning indefinitely.
20. As CJ or Jeff, I want at most four exact archive passages opened, so that the answer gets useful history without drowning in transcript text.
21. As CJ or Jeff, I want exact episode and chunk provenance preserved internally, so that Past Nonsense Coverage is verifiable.
22. As CJ or Jeff, I want unlabeled transcripts treated honestly, so that the agent never invents whether CJ or Jeff said a passage.
23. As CJ or Jeff, I want the artifact tool available to the agent on every turn, so that natural requests do not depend on a brittle verb list.
24. As CJ or Jeff, I want the agent to create or revise a Preparation Brief only when I ask for that work product, so that ordinary chat remains conversational.
25. As CJ or Jeff, I want artifact intent interpreted by the agent, so that “write a packet” works without deterministic wording rules.
26. As CJ or Jeff, I want invalid artifacts repaired once in the same context, so that a schema mistake does not start a different workflow.
27. As CJ or Jeff, I want structured answer paragraphs preserved exactly, so that valid Markdown is not flattened and re-split into an invalid shape.
28. As CJ or Jeff, I want every material factual paragraph cited, so that the answer remains grounded.
29. As CJ or Jeff, I want unsupported citation numbers rejected, so that attractive prose cannot point to evidence the agent never inspected.
30. As CJ or Jeff, I want a useful supported answer when one nonessential tool fails, so that partial provider availability does not erase completed research.
31. As CJ or Jeff, I want the unresolved point stated plainly, so that I know what the agent could not establish.
32. As CJ or Jeff, I want Standard Research to stop expanding and synthesize promptly, so that a normal question does not silently become a four-minute Deep run.
33. As CJ or Jeff, I want Deep Research to use the same understandable loop with broader ceilings, so that deeper work does not activate a second architecture.
34. As CJ or Jeff, I want tool ceilings treated as safety boundaries rather than quotas, so that the agent does not search merely because capacity remains.
35. As CJ or Jeff, I want completed work shown as compact readable actions, so that I can inspect what happened without reading chain-of-thought.
36. As CJ or Jeff, I want successful web or archive work shown as successful even when a later action hits a limit, so that the UI does not lie about the evidence collected.
37. As CJ or Jeff, I want `complete`, `limited`, `no match`, `unavailable`, and `failed` to mean different things, so that I can trust the interface.
38. As CJ or Jeff, I want one understandable runtime, so that reliability repairs happen in the code that actually serves my request.
39. As a maintainer, I want dead manager, worker, planner, reviewer, composer, fallback, and phase-controller execution paths removed, so that they cannot accidentally return to production.
40. As a maintainer, I want one active system prompt, so that product behavior can be inspected and edited without hunting across prompt bundles.
41. As a maintainer, I want one canonical model-tool-result loop, so that tests describe the product rather than historical architectures.
42. As a maintainer, I want unused runtime dependencies removed, so that the supply chain matches the actual application.
43. As a maintainer, I want historical result documents preserved, so that prior failures and decisions are not rewritten after cleanup.
44. As a maintainer, I want corpus and retrieval artifacts byte-identical, so that runtime cleanup cannot silently change archive evidence.
45. As CJ or Jeff, I want a Research Thread to survive a development-server or application restart, so that useful research is not disposable.
46. As CJ or Jeff, I want my exact questions and final answers retained, so that I can return to the conversation later.
47. As CJ or Jeff, I want cited Trusted Sources retained with bounded evidence excerpts, so that follow-ups can build on inspected material.
48. As CJ or Jeff, I want exact Past Nonsense Coverage passages retained, so that archive connections remain available after a restart.
49. As CJ or Jeff, I want the latest unresolved questions and limitations retained, so that follow-up research starts from the real remaining gap.
50. As CJ or Jeff, I want the current Working Artifact and revision retained, so that later conversation can revise the same brief.
51. As CJ or Jeff, I want compact receipts retained, so that prior cost, tool counts, status, and limitations remain auditable.
52. As CJ or Jeff, I want raw pages, search candidates, and private model protocol excluded from durable storage, so that persistence stores product value rather than implementation exhaust.
53. As CJ or Jeff, I want a sidebar listing recent Research Threads, so that I can reopen prior topics quickly.
54. As CJ or Jeff, I want recent threads sorted by last update, so that active episode research is easy to find.
55. As CJ or Jeff, I want a deterministic title derived from my first question, so that thread creation does not require another paid model call.
56. As CJ or Jeff, I want New Research to open a blank conversation without deleting the old thread, so that starting a topic is safe.
57. As CJ or Jeff, I want empty New Research screens not to create database clutter, so that a thread is saved only after its first message.
58. As CJ or Jeff, I want to delete a thread deliberately, so that I control retention.
59. As CJ or Jeff, I want deleting the open thread to return me to a blank New Research screen, so that the UI cannot point at deleted state.
60. As CJ or Jeff, I want citations and artifacts to render correctly after reopening a thread, so that persistence does not degrade the research result.
61. As CJ or Jeff, I want a visibly honest warning if persistence is unavailable, so that an ephemeral conversation is never presented as durable.
62. As CJ or Jeff, I want the research answer preserved in the browser even if saving it fails, so that a database outage does not erase already-paid work.
63. As CJ or Jeff, I want an interrupted turn to reopen as interrupted rather than endlessly working, so that restart behavior is truthful.
64. As a maintainer, I want a thin storage interface with an in-memory test implementation and a Neon implementation, so that persistence behavior is testable without provider calls.
65. As a maintainer, I want an idempotent database migration, so that local and eventual Vercel environments can reach the same schema safely.
66. As a maintainer, I want the database credential server-only, so that it never reaches the model, browser, source records, or Git.
67. As a maintainer, I want each stage independently gated, so that Cleanup cannot hide a Reliability regression and Persistence cannot hide a Cleanup regression.
68. As a maintainer, I want the final live proof to use the same browser route and UI as the product, so that passing a private helper does not substitute for a working harness.

## Implementation Decisions

### Stage order and authority

- This is one build with three serial stages: Reliability, Cleanup, then Persistence. The agent must stop advancing whenever a stage gate is red, repair that stage, rerun its complete gate, and only then continue.
- A single durable result record will accumulate exact commands, deterministic results, live receipts, spend, failures, corpus hashes, and stage conclusions. Failed attempts remain visible.
- The accepted domain glossary and ADRs remain authoritative: the product is a research assistant rather than a show writer; Standard and Deep are Research Depth policies for one agent; Neon Postgres is the durable Research Thread store.

### One agent and one tool catalog

- GPT-5.6 Luna Max through OpenRouter remains the only conversational model. No planner, worker, critic, composer, evaluator, fallback model, subagent, or clean-context synthesis call is added.
- Vercel AI SDK `ToolLoopAgent` remains the single loop. The model sees tool results in the same active turn and decides the smallest useful next Research Action.
- The permanent product catalog is `search_web`, `read_urls`, `search_transcripts`, `open_transcript_chunks`, and `create_or_update_artifact`. The same Luna loop also has two internal typed control boundaries: `set_research_goal` declares the requested deliverable once, and terminal `submit_answer` validates the final response. Neither boundary is a separate planner, model, or research workflow. All five product tools are always registered. Deterministic code enforces contracts and safety, not semantic routing.
- Standard permits at most ten model steps. Deep permits at most eighteen. These are safety ceilings, not expected workloads. Existing dollar ceilings remain $0.50 and $2.00 respectively unless the implementation goal explicitly narrows them.
- Research tools become unavailable to the model near a time, request, or cost boundary while `submit_answer` remains available. The strongest supported answer is preferred over spending the remaining quota.

### Canonical Tool Outcome

- Every product tool maps its internal/provider result to one canonical Tool Outcome vocabulary: `complete`, `limited`, `no_match`, `unavailable`, or `failed`.
- `complete` means usable requested output was returned. `limited` means usable output was returned with a material constraint. `no_match` means the capability worked and found no usable result. `unavailable` means an external dependency or required local artifact could not be reached. `failed` means the harness contract or implementation broke.
- Safety-boundary events such as “no further searches allowed” are control events, not retroactive tool outcomes. A later boundary cannot overwrite earlier successful search or archive evidence.
- Compact UI activity summarizes the useful aggregate result. Expanded details may show a transient retry, skipped optional reranker, later ceiling, or failed neighbor. A group is red only when it produced no usable output and genuinely ended unavailable or failed.

### Web search and webpage reading

- `search_web` accepts only one required field: one to four unique query strings. Remove freshness and allow/exclude-domain fields from both the model-facing schema and adapter contract. The current date and the tool description guide freshness; the model may use normal search syntax such as `site:` when useful.
- Each query uses direct Exa discovery with the established bounded candidate count. Exa results remain candidates and cannot support claims until `read_urls` retrieves the page.
- The model-facing schema and provider adapter share one canonical validator. Input accepted by the tool schema cannot later become `invalid_input` inside the adapter.
- Independent queries in one action execute concurrently and return together to the same Luna context. The agent must observe that result before choosing another search action.
- `read_urls` retains SSRF protection, redirect and DNS checks, content-type and response-size limits, and a maximum of four independent reads per action.
- Search and read adapters perform at most one short retry for a transient network failure, timeout, 429, or provider 5xx response. They never retry invalid input, policy rejection, authentication, ordinary 4xx responses, or an entire agent run. Both attempts count toward receipts and safety ceilings.

### Season 3–4 archive retrieval

- Archive discovery runs BM25 and vector retrieval independently against the same query, then merges their ranked lists with reciprocal-rank fusion. Vector retrieval is not a reranking stage and neither retriever is allowed to prefilter the other.
- The retained reranker receives only fused candidates, has a short bounded timeout, and is optional. A timeout, provider error, or unusable reranker output returns the fused results as a normal usable success.
- If query embedding fails and BM25 returns matches, return a `limited` keyword-only Tool Outcome. If both retrievers execute and return no matches, return `no_match`. If semantic retrieval is unavailable and BM25 also finds nothing, return `unavailable` rather than making an unsupported no-match claim.
- One turn may perform at most three adaptive archive searches and open at most four exact passages. The agent chooses whether to use those capabilities and is not required to exhaust them.
- Opened archive passages retain stable episode, segment, and chunk provenance and exact selected text. Adjacent context may orient the model but cannot replace the exact citeable passage.

### Working Artifacts

- Remove deterministic keyword and verb routing for Preparation Brief intent. `create_or_update_artifact` is present on every turn, and the permanent prompt/tool description instructs Luna to call it only when the user requests a Preparation Brief, outline, or revision.
- The artifact tool accepts its mode and complete proposed structured artifact. Existing deterministic source-ledger, exact-quote, priority, and schema validation remains authoritative after the agent chooses the tool.
- One same-context artifact repair remains available after invalid output. Artifact failure does not erase an otherwise valid Research Answer; the answer names that the requested artifact could not be saved.
- Artifacts continue to use `essential`, `strong`, and `optional` priorities with no assigned minutes or locked running order.

### Answer submission and Evidence Gate

- `submit_answer` accepts structured paragraph objects and validates those objects directly. It must never concatenate them, inject citation markers into prose, split them on blank lines, and reconstruct them again.
- Each paragraph carries readable Markdown and an explicit list of numbered citations. The Evidence Gate resolves those numbers to opened Trusted Sources or exact Past Nonsense Coverage, rejects candidates and unknown IDs, and verifies direct quotations against retained evidence.
- The Evidence Gate is deliberately narrow. It validates provenance and quotation integrity but does not use deterministic text heuristics to judge whether a source semantically proves Luna's interpretation.
- A supported answer may complete when a nonessential tool is unavailable. It clearly states the unresolved point and, for Standard Research, may offer Deep Research. Only the absence of enough evidence for a safe answer or a terminal model/runtime failure prevents a substantive answer.
- Structured Markdown paragraphs remain intact through stream projection, persistence, hydration, rendering, and Markdown copy.

### Cleanup and canonical runtime

- Cleanup begins only after the entire Reliability gate passes on the repaired runtime.
- The live route becomes one direct dependency path to the one-agent runtime. Remove compatibility unions and routing branches for the old phase controller, Standard forced-synthesis runtime, manager/worker graph, Grok composer, fallback runtime, and fixture-only runtime.
- Move the surviving agent loop, product contracts, prompt loader, tool adapters, evidence/artifact logic, presentation mapping, and thread boundary into neutral domain-named modules. Active runtime names and user-visible errors must not use phase numbers.
- Delete superseded executable source, live scripts, prompt bundles, and tests whose only purpose is to exercise a removed runtime. Migrate useful external-behavior coverage to the canonical route seam before deletion.
- Remove dependencies that have no remaining production or test import after cleanup, including orchestration packages retained only for the superseded architecture.
- Preserve historical specifications, result records, provider receipts, and reports as nonexecutable evidence. Preserve the transcript corpus and retrieval artifacts byte-for-byte.
- Exactly one production system prompt remains active and readable as Markdown. Historical prompts may remain only inside clearly nonexecutable historical evidence when deletion would erase a past record.

### Durable Research Threads

- Persistence begins only after the cleaned canonical runtime passes its complete gate.
- Use `@neondatabase/serverless` through a thin server-only `ThreadStore`; do not add an ORM, vector database, event store, message broker, or knowledge graph.
- Use one Neon table. Each row contains a UUID Research Thread ID, deterministic title, versioned sanitized JSONB snapshot, monotonic revision, created timestamp, and updated timestamp. Listing selects metadata without transferring the snapshot.
- The snapshot schema is product-owned and provider-neutral. It stores user turns, final assistant blocks and citations, Research Depth, Trusted Sources with bounded evidence excerpts and provenance, exact opened archive passages, current unresolved points and limitations, current Working Artifact and revision, and compact terminal receipts.
- Do not persist search candidates, unread snippets, entire raw webpages, adjacent transcript context not selected as evidence, provider-native model/tool messages, private reasoning, activity animation events, deprecated manager notebooks, task graphs, or secrets.
- The complete human conversation persists for the Research Thread. Runtime model context remains bounded: hydrate recent conversation plus relevant retained evidence and the current artifact. Within one active turn, the native model-tool-result history remains continuous; across restarts, context is rebuilt from durable product state rather than replaying provider protocol.
- Save an initial user turn before paid work, save after completed evidence/artifact checkpoints, and save the terminal answer and receipt. A restart may lose an in-flight provider action but must retain the last completed product checkpoint.
- If a loaded thread ends with an unmatched user turn or running receipt, project it as interrupted/stopped. Never restore a perpetual loading state and never continue paid work automatically.
- Thread writes use the row revision to detect conflicting updates. A stale write returns a typed conflict and preserves the newer row; it does not silently overwrite another completed turn. Simultaneous multiplayer editing remains out of scope.
- A database operation may receive one short retry only for a transient connection or 5xx failure. Schema, authorization, validation, and revision conflicts do not retry.
- If Neon is unavailable, the current browser turn may continue in clearly labeled process-local mode and retain its answer in the browser, but the UI must say that history is unavailable and may not survive restart. The Persistence stage cannot pass on this fallback.

### Thread API and sidebar

- Reuse the existing random browser conversation UUID as the Research Thread ID. A blank New Research screen remains unsaved; the first submitted message creates the row lazily with a deterministic title derived from that message.
- The server exposes narrow operations to list recent thread metadata, load one sanitized Research Thread, and delete one Research Thread. Chat streaming loads and checkpoints through the same `ThreadStore` rather than a separate persistence path.
- List at most fifty recent threads ordered by most recently updated. Thread renaming, folders, tags, search, and episode grouping are not included.
- The sidebar contains New Research and the recent-thread list. Opening a thread hydrates chronological messages, citations, the current Working Artifact, compact receipts, and follow-up context.
- New Research clears the active selection and opens a blank composer without deleting the prior thread. Deletion requires an explicit confirmation; deleting the active thread returns to the blank state.
- Switching or deleting is disabled during an active run. No background run continues after navigation.
- The active Research Thread ID is reflected in browser navigation state so a refresh can reopen it. The interface remains responsive; on narrow screens the history list becomes a simple dismissible drawer rather than permanently shrinking the conversation.

### Database and secret boundary

- The schema migration is explicit, idempotent, and independently verifiable. Application requests do not mutate database schema automatically.
- `DATABASE_URL` is a server-only secret. It may not enter model prompts, client bundles, streamed events, logs, artifacts, source records, Git, or test snapshots.
- The live Persistence gate requires an explicitly configured Neon database. An in-memory `ThreadStore` is permitted only for deterministic tests and honest local fallback, never as evidence that durable persistence passed.
- This build does not provision a public deployment or claim multi-user security. Authentication and the shared private door remain a separate release prerequisite.

## Testing Decisions

- Tests assert externally observable behavior, durable product state, security boundaries, and terminal outcomes. They do not assert Luna's hidden reasoning, exact prose, or a rigid internal action sequence when multiple valid research paths exist.
- The principal acceptance seam is the real streamed chat route rendered through the browser conversation. It exercises request parsing, the one agent loop, every product tool, Evidence Gate, answer/artifact projection, Tool Outcome presentation, ThreadStore checkpoints, hydration, and sidebar behavior together. The user already approved this highest-level seam through the five-part proof gate.
- Focused adapter tests remain underneath that seam only where failure injection is necessary: Exa/network responses, URL-reader policy, query embedding, reranking, archive artifacts, Neon operations, and model output fixtures.

### Stage 1 gate: Reliability

1. A deterministic Standard current-web route case proves one-to-four-query search, canonical input validation, successful page opening, exact citations, natural answer completion, and no artifact.
2. A deterministic archive-focused route case proves parallel BM25/vector retrieval, reciprocal-rank fusion, optional reranker success and timeout fallback, at most three searches, at most four opens, exact S3–4 provenance, and a cited answer.
3. A deterministic Deep Research Big Story case based on the frozen Disneyland-deaths request proves broad web research, agent-chosen archive use, always-available artifact creation, structured answer completion, and no `research_answer_shape_invalid` failure.
4. Injected Exa, URL-reader, query-embedding, reranker, and Neon-independent runtime failures prove the approved transient retry policy and exact `complete`, `limited`, `no_match`, `unavailable`, and `failed` projections. Earlier usable evidence must remain successful after a later ceiling or optional failure.
5. The complete repository gate passes: supply-chain denylist, lint, typecheck, every deterministic test, production build, secret scan where available, and exact accepted corpus/retrieval hashes.
- After deterministic success, the later implementation goal must run the approved live Standard web case, archive follow-up, and Disneyland Deep Preparation Brief case through the watched browser. No live provider call is authorized merely by this specification; the goal must state its exact aggregate budget before those calls.
- Stage 1 records exact latency, request counts, spend, sources, Tool Outcomes, limitations, browser console state, and the verbatim final answers. It does not pass if a helper succeeds while the real browser remains broken.

### Stage 2 gate: Cleanup

- Re-run the complete Stage 1 deterministic suite after moving/deleting code. The same external behavior must pass through the canonical route with no paid provider call required.
- A static architecture test proves the production route can instantiate only one Luna `ToolLoopAgent`, one active system prompt, and the permanent tool catalog. It fails on imports or selectors for removed manager, worker, controller, composer, fallback, or phase-fixture runtimes.
- A dependency/import audit proves every remaining runtime dependency is used and removed orchestration dependencies are absent from the production lock graph.
- A repository search proves phase-numbered names exist only in historical documents, reports, immutable evidence, or intentionally preserved migration fixtures—not in active runtime modules, client contracts, user-visible status text, or live scripts.
- Existing historical documents and reports remain readable, while corpus and retrieval artifact hashes remain exact.
- The full repository gate and production build pass before Persistence begins.

### Stage 3 gate: Persistence and sidebar

- A `ThreadStore` contract suite runs against the in-memory implementation and a real Neon test database, proving create-on-first-message, list order, load, checkpoint update, monotonic revision, stale-write conflict, hard delete, idempotent migration, retry classification, and sanitized snapshots.
- A persistence security suite proves no candidate snippets, raw pages, adjacent archive context, provider-native messages, private reasoning, activity traces, prompt text, internal secrets, or database credentials enter the stored JSONB or browser payload.
- A route/UI suite proves New Research does not delete prior work, no empty row is created before the first message, recent threads load in updated order, deleting the active thread clears the selection, narrow-screen history is usable, and switching/deleting is blocked during an active run.
- A restart proof creates a Research Thread through the real chat route, captures a cited answer and exact archive evidence, destroys all process-local workspace state, constructs a fresh server/store instance against the same Neon database, reloads the thread, and completes a follow-up using the persisted conversation/evidence/artifact context.
- An interrupted-run proof reloads the last completed checkpoint as interrupted rather than running and performs no automatic provider call.
- A Neon-unavailable proof keeps the current browser answer visible, labels history honestly unavailable, and never counts the fallback as durable success.
- The final watched browser proof verifies the Standard web turn, archive follow-up, requested Big Story artifact, server restart, sidebar reopen, cited follow-up, New Research separation, and manual deletion. It inspects network and console output for secret leakage and runtime errors.
- The complete repository gate, production build, exact corpus hashes, and exact final passing commit are recorded after the final browser proof.

## Out of Scope

- A different conversational model, model bakeoff, Opus API call, manager/worker architecture, subagents, planner, critic, evaluator, composer, or fallback model.
- New research tools beyond web search, safe URL reading, Season 3–4 archive search/opening, Working Artifact creation/update, and answer submission.
- Topic Watches, scheduled research, crons, notifications, background continuation, or automatic news monitoring.
- Nonsense Knowledge Base construction, cross-topic semantic memory, GBrain, LLMwiki, a knowledge graph, or a hosted vector database.
- Episode Research Spaces, attaching topics to episodes, multiplayer editing, presence, comments, or conflict merging beyond rejecting a stale write.
- Authentication, the shared private door, public deployment, Vercel project creation, production environment configuration, custom domains, or public access.
- Thread renaming, search, folders, tags, pinning, export, Google Drive synchronization, or external publishing.
- New transcripts, Seasons outside the validated 3–4 corpus, audio download, transcription, diarization, speaker labels, corpus rewriting, or public corpus exposure.
- Fine-tuning, prompt/model comparison evaluation, analytics dashboards, or broad visual redesign beyond the minimal history sidebar and truthful status corrections.
- Automatic retry of an entire research turn or silent escalation from Standard to Deep Research.

## Further Notes

- Simplicity is an acceptance criterion. A new abstraction must either remove duplicated behavior, create the single approved persistence seam, or make an externally observable contract testable. Otherwise it should not be added.
- The narrow Evidence Gate is retained because it protects citation provenance without pretending deterministic code can judge semantic truth.
- The archive's parallel BM25/vector retrieval is simpler and safer than feeding either retriever into the other. Reciprocal-rank fusion is deterministic; reranking remains an optional quality improvement rather than an availability dependency.
- Neon’s serverless driver supports direct SQL over `DATABASE_URL` and noninteractive transactions appropriate to Vercel Functions. The one-table snapshot design deliberately uses only the small subset this product needs: <https://neon.com/docs/serverless/serverless-driver>.
- Vercel Marketplace storage integrations inject database credentials as environment variables, but provisioning and deployment remain outside this build: <https://vercel.com/docs/marketplace-storage>.
- Deferred future capabilities remain deferred until this simple agent, answer quality, and persistence are proven: attaching workspaces to episodes, Topic Watches, automatic refresh, and a cross-topic Nonsense Knowledge Base.
