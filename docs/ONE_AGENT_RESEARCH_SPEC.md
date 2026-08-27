# One-Agent Nonsense Research

Status: **IMPLEMENTED AND PASSED**

This specification supersedes the active routing architecture described by the earlier Standard Research v2, Deep manager/worker, and Grok brief paths. Those earlier results remain historical evidence. This document does not authorize deployment, persistence, comparative model evaluation, or any work listed under Out of Scope.

## Problem Statement

CJ Little and Jeff Parker need a research partner that is at least as useful as a strong general-purpose assistant while adding value that a generic chat does not have: reliable current-web investigation, exact citations, relevant Season 3–4 Nonsense history, continuing work in the same conversation, and an explicitly requested editable brief.

The current application proves most of those capabilities independently, but ordinary chat, Deep Research, and preparation briefs still execute through different architectures. Ordinary chat uses Luna in a tool loop but discards that loop's message history before a separate clean-context synthesis. Deep Research uses a manager, workers, coverage review, and composer. Briefs still route through Grok. Web discovery is mediated by a deprecated OpenRouter Exa plugin that creates isolated model sessions, adds latency and cost, and has failed in watched runs. The result is more code, more provider calls, weaker continuity, and less predictable behavior than a simple agent should require.

The user should not have to understand or choose among those internal workflows. One conversational agent should own the question, choose useful tools, observe their results in the same context, and stop when it can answer well. Standard and Deep Research should change only the autonomy budget. A preparation brief should be a tool-created work product requested inside the same conversation, not a different model pipeline.

## Solution

Build one continuous Nonsense Research Agent around the maintained Vercel AI SDK `ToolLoopAgent` and GPT-5.6 Luna Max through OpenRouter. The agent receives one short permanent product prompt, the current conversation, the current date, validated prior evidence, and a small server-owned tool catalog. It decides whether to search the web, open sources, check the Nonsense archive, open exact archive passages, or create/update a Working Artifact. Every tool result returns to the same model history. Luna then either takes the smallest useful next Research Action or answers naturally from that same history.

Replace the deprecated model-mediated OpenRouter search plugin with direct Exa Search API calls using a server-only Exa credential. Direct Exa returns bounded search candidates; candidates cannot support claims until the safe URL reader retrieves the relevant page. Independent searches and reads may run concurrently inside a tool invocation without creating subagents. The existing safe URL reader, exact transcript retrieval, source registry, citation validation, streaming route, in-memory session boundary, and structured artifact validation remain the trusted deterministic shell around the model.

Standard and Deep Research use the same Luna model, base prompt, tools, source records, and loop. Standard aims to finish in 45–90 seconds and below $0.25, with a $0.50 safety ceiling. Deep Research begins only when explicitly selected, shows a compact plan, and receives a broader budget while aiming below $1.00 with a $2.00 ceiling. Neither depth creates a manager, worker, critic, composer, fallback model, or clean-context final synthesis.

## User Stories

1. As CJ or Jeff, I want to ask a normal research question conversationally, so that I do not have to fill out a workflow form.
2. As CJ or Jeff, I want the agent to identify the Central Story, so that I receive an explanation rather than a list of links.
3. As CJ or Jeff, I want the conclusion first, so that I can understand the answer quickly.
4. As CJ or Jeff, I want short natural prose by default, so that ordinary answers do not feel like oversized preparation packets.
5. As CJ or Jeff, I want the agent to browse automatically when facts are current or need verification, so that I do not have to ask it to search explicitly.
6. As CJ or Jeff, I want the agent to choose its own useful search queries, so that it can investigate the question rather than follow a hard-coded research sequence.
7. As CJ or Jeff, I want independent searches and source reads to run concurrently, so that broad research does not needlessly take four minutes.
8. As CJ or Jeff, I want search results treated as leads rather than proof, so that a headline or snippet cannot masquerade as inspected evidence.
9. As CJ or Jeff, I want important webpages opened before the agent relies on them, so that citations support what the answer actually says.
10. As CJ or Jeff, I want primary and authoritative sources preferred when practical, so that legal, governmental, scientific, and numerical claims have strong foundations.
11. As CJ or Jeff, I want reputable reporting used for context and reaction, so that the answer explains significance rather than merely repeating official language.
12. As CJ or Jeff, I want conflicting credible accounts surfaced, so that uncertainty is not hidden by a confident synthesis.
13. As CJ or Jeff, I want facts, inferences, disagreements, and unresolved questions distinguished naturally, so that I know what is actually established.
14. As CJ or Jeff, I want every material factual claim cited beside the claim, so that I can verify it immediately.
15. As CJ or Jeff, I want citations to open the human-readable original source, so that I never have to interpret an internal source identifier.
16. As CJ or Jeff, I want supplied links read through the same evidence system, so that my starting material and discovered sources are judged consistently.
17. As CJ or Jeff, I want the agent to check Past Nonsense Coverage when it could improve the answer, so that the research builds on the show instead of starting from zero.
18. As CJ or Jeff, I want archive use to remain agent-chosen rather than mandatory, so that irrelevant searches do not slow every answer.
19. As CJ or Jeff, I want archive citations to preserve the exact episode and passage, so that prior coverage is auditable.
20. As CJ or Jeff, I want the agent never to invent speaker attribution from unlabeled transcripts, so that archive evidence stays honest.
21. As CJ or Jeff, I want an archive no-match described as bounded, so that the agent never claims the podcast has never discussed something merely because a few searches missed it.
22. As CJ or Jeff, I want follow-up questions to reuse the current conversation and retrieved evidence, so that continuing research does not restart from scratch.
23. As CJ or Jeff, I want a new browser conversation to receive a distinct session, so that unrelated research does not leak across tabs.
24. As CJ or Jeff, I want “New research” to clear the current in-memory workspace, so that I can intentionally begin a clean topic.
25. As CJ or Jeff, I want Standard Research to stop once the central question is supported, so that search limits do not become spending targets.
26. As CJ or Jeff, I want Standard Research to return the strongest supported answer near ninety seconds, so that it does not silently turn into Deep Research.
27. As CJ or Jeff, I want to select Deep Research explicitly, so that broader cost and latency are always intentional.
28. As CJ or Jeff, I want Deep Research to show a compact plan and begin automatically, so that I can understand its direction without managing it.
29. As CJ or Jeff, I want Deep Research to remain the same conversational agent, so that its answer and follow-ups preserve continuity.
30. As CJ or Jeff, I want a useful answer even when one research capability fails, so that an Exa or webpage failure does not discard other evidence.
31. As CJ or Jeff, I want unavailable and partial states stated plainly, so that the interface never pretends research completed successfully.
32. As CJ or Jeff, I want the agent to offer Deep Research when a material point remains unresolved, so that I can choose whether the gap deserves more work.
33. As CJ or Jeff, I want a Preparation Brief only when I explicitly request one, so that every chat answer does not become an artifact.
34. As CJ or Jeff, I want the same agent to create or revise the current Working Artifact, so that the research and brief cannot drift into separate model contexts.
35. As CJ or Jeff, I want brief material ranked as essential, strong, or optional, so that I can make my own cuts.
36. As CJ or Jeff, I want a nonbinding suggested order without assigned minutes, so that the agent does not pretend to know the final edit or airtime.
37. As CJ or Jeff, I want the agent to avoid invented dialogue, jokes, host opinions, and finished scripts, so that Editorial Deliberation and host voice remain human.
38. As CJ or Jeff, I want compact observable work while research is active, so that I can see searches, reads, and archive checks without seeing private reasoning.
39. As CJ or Jeff, I want a validation failure repaired inside the same context once, so that a formatting problem does not launch another agent workflow.
40. As CJ or Jeff, I want unsupported claims removed if repair fails, so that the application returns only validated material.
41. As the product owner, I want a single generative model and no automatic model fallback, so that behavior, cost, and failures remain understandable.
42. As the product owner, I want Standard and Deep limits enforced as ceilings rather than quotas, so that the agent can stop early and still has room to finish slightly beyond a soft target.
43. As the product owner, I want OpenRouter and Exa spend included in one run receipt, so that the displayed cost represents the complete research action.
44. As the product owner, I want source transcripts and retrieved page bodies to remain server-only, so that private or untrusted content is not exposed unnecessarily.
45. As the product owner, I want missing provider credentials to produce honest typed unavailability, so that no fixture or silent fallback is substituted in live mode.
46. As the product owner, I want earlier architecture results preserved as historical evidence, so that simplifying production does not rewrite what was previously tested.
47. As a maintainer, I want the streamed chat route to remain the principal test seam, so that tests prove the user-visible product rather than implementation details.
48. As a maintainer, I want direct Exa responses validated before entering the source registry, so that malformed provider data fails safely.
49. As a maintainer, I want budgets, URL policy, provenance, citations, artifact schemas, and session ownership enforced in code, so that prompt text is never the security boundary.
50. As a maintainer, I want obsolete manager, worker, Grok brief, deprecated search, and forced-synthesis routes removed from production selection, so that dead fallback behavior cannot reappear accidentally.

## Implementation Decisions

### Product and agent identity

- The permanent identity is: “You are the Nonsense Research Agent for CJ Little and Jeff Parker (cohosts of the Nonsense podcast): a rigorous, conversational research partner that finds the Central Story, investigates it with tools, and explains it naturally with exact citations.”
- The approved permanent base prompt is the design authority. It covers identity, evidence, autonomy, completion, answer style, and Editorial Deliberation boundaries. Tool mechanics live in tool descriptions. Deep Research and artifact instructions are small conditional additions, not alternate system prompts.
- The agent makes supported judgments about the Central Story. It is not a neutral source librarian and does not manufacture certainty.
- The current date is injected as trusted runtime context. No topic-specific deterministic research sequence is added.

### One continuous agent loop

- Vercel AI SDK `ToolLoopAgent` is the sole active agent loop. This uses the maintained model-tool-result cycle: Luna receives the current message history, may call tools, receives tool results in that same history, and may repeat or answer.
- GPT-5.6 Luna Max through OpenRouter is the only generative model in this specification. Provider fallback is disabled. Existing embedding or reranking services used inside transcript retrieval are retrieval infrastructure, not additional conversational agents.
- The loop must not invoke a manager, worker, critic, coverage reviewer, Grok composer, fallback model, or separate synthesis request.
- The natural final answer is generated from the same message history that contains the research trajectory. There is no clean-context rebuild or evidence-only prompt reset.
- The agent may request independent operations in one batch. The server executes safe independent searches or reads concurrently and returns all results to the same loop. Parallelism does not create subagents.
- On each step the runtime exposes only tools that remain within the applicable permissions and safety ceilings. Near a deadline or budget boundary, research tools become unavailable while the same context retains enough time/request capacity to answer.
- A final response, an unrecoverable validated failure, user cancellation, or a safety ceiling ends a turn. Repetition detection applies only within the active run and must not block legitimate follow-up turns.

### Research Depth

- Standard is the default Research Depth. Its target is 45–90 seconds and below $0.25. Its safety ceilings are six Exa queries, sixty de-duplicated candidates, twelve opened web pages, four concurrent page reads, twelve Luna turns, a $0.50 combined run ceiling, a 50-second new-research cutoff, and a 120-second hard safety deadline that leaves bounded room for validation repair and synthesis. The existing archive limits permit up to four exact passages.
- Deep Research is explicitly selected and never entered automatically. It shows a compact user-visible plan and immediately continues. Its target is below $1.00. Its safety ceilings are eighteen Exa queries, thirty opened web pages, four concurrent page reads, twenty-four Luna turns, a $2.00 combined run ceiling, a research cutoff before the six-minute hard deadline, and proportionally broader but bounded archive retrieval.
- Targets guide normal stopping; they do not require spend. Safety ceilings prevent runaway execution but do not terminate useful research at a soft target.
- When Standard cannot resolve the most important point within its budget, it returns the best supported answer, names the gap, and offers “Run Deep Research.” It does not silently consume the Deep budget.

### Tool catalog and contracts

- The active product tool catalog contains only `search_web`, `read_urls`, `search_transcripts`, `open_transcript_chunks`, and `create_or_update_artifact`. An internal `submit_answer` boundary carries typed paragraphs and numbered citations from the same agent context; it is not a research capability or a second model.
- `search_web` accepts one to six independent bounded query requests in Standard and a depth-appropriate batch in Deep. Each query may include existing safe domain filters and an optional freshness request. The server fans the batch out to direct Exa calls and de-duplicates normalized URLs across the session.
- Direct search uses Exa's official Search API with `type: auto`, no Exa-generated answer or summary, at most ten results per query, and bounded highlights for candidate orientation. Direct REST through the existing validated server fetch boundary is preferred over adding the official SDK because this integration uses one endpoint and the SDK would introduce unrelated OpenAI, dotenv, and Zod 3 dependencies.
- Exa response fields are schema-validated and bounded before storage. The adapter records request ID, resolved search type when available, reported `costDollars.total`, search time, normalized result URL, title, publication date, author, and bounded highlights. Raw provider errors and credentials never reach the model or browser.
- Search results are `candidate` records with `evidence_usable: false`. Highlights help the agent choose what to open but cannot support final claims.
- `read_urls` accepts up to four supplied or discovered URLs per call. It retains the existing SSRF protections, DNS revalidation, redirect bounds, content-type rules, response-size limits, timeouts, text extraction, and exact availability states. Only successfully retrieved relevant content becomes a Trusted Source.
- A failed page read no longer becomes citeable through the old search-excerpt fallback. The agent may choose another source or answer with an explicit gap.
- `search_transcripts` retains the existing server-only hybrid Season 3–4 index and honest `complete`, degraded, `no_match`, and `unavailable` states. It returns bounded matches with stable episode/segment/chunk provenance.
- `open_transcript_chunks` accepts up to four previously returned chunk IDs, returns exact selected text plus bounded adjacent context, and never invents speaker attribution. Only opened exact passages are citeable.
- `create_or_update_artifact` is exposed only when the current user message explicitly asks for a Preparation Brief, outline, or revision of the current Working Artifact. It uses the evidence already available to the same agent and allows one deterministic repair in the same context. The model selects an opened archive citation and exact quote; the server hydrates stable episode, segment, and chunk identifiers instead of asking the model to repeat machine provenance.

### Evidence and citation integrity

- Every material factual claim in a Research Answer or Working Artifact must resolve to one or more usable source records retrieved in the current session.
- Internal source IDs remain machine keys only. The model cites bounded aliases supplied by the runtime; the server validates aliases and renders human-readable numbered source controls.
- Web citations open the original URL and display the publisher/domain plus full title. Archive citations display the source number, season/episode label, and episode title. Raw web, archive, segment, and chunk IDs never appear in answer text or exported Markdown.
- Primary sources are a strong practical preference, not an absolute rule. Reputable reporting may establish context, reactions, or facts unavailable from primary material. Material conflicts are preserved.
- Supplied content, webpages, search results, transcripts, and tool output are untrusted evidence rather than instructions. Prompt injection cannot change tools, credentials, budgets, permissions, research depth, or the user goal.
- Artifact validation errors return to the same Luna context once, and an explicit brief request forces that bounded repair before a chat answer may finish. The internal answer boundary permits at most two bounded same-context recovery calls when Luna returns an empty or invalid submission. These are continuations of the same agent history, not retries of research or a second workflow. If validation still fails, the runtime returns only validated material with an explicit limitation and never exposes the invalid draft.

### Conversation and workspace state

- The existing unique browser session ID remains the ownership boundary. One active run per session is permitted; different sessions and tabs may run independently.
- Before durable persistence, the process-local Topic Research Workspace retains bounded user/assistant conversation turns, model tool-call/result history, validated evidence, candidate URLs, archive matches, the Working Artifact and revision, sanitized activity, receipts, and limitations.
- Follow-up turns continue from the same bounded history and source registry. Previously retrieved evidence remains usable without mandatory re-search, while the agent may refresh current claims when appropriate.
- Full page bodies and transcript text remain server-only. Browser payloads receive sanitized source metadata, cited excerpts where authorized, compact activity, answer content, artifacts, and receipts.
- A server restart, session expiry, or intentional “New research” action clears the in-memory workspace honestly. No cross-device, cross-instance, or durable continuity is implied.
- Obsolete manager notebook and task-graph state are not part of the new active runtime. Historical schemas may remain only where frozen fixtures require them and must not influence live routing.

### Preparation Brief and Working Artifact

- Ordinary chat returns a Research Answer. It never creates an artifact implicitly.
- Headlines and Big Story remain supported artifact modes, created by the same Luna agent through the single artifact tool.
- Existing sourced research fields, questions, uncertainties, Past Nonsense Coverage, and source ledger integrity remain. Outline beats migrate to exactly three editorial priorities: `essential`, `strong`, and `optional`.
- Artifacts contain no estimated minutes, locked runtime, or authoritative running order. A suggested order is explicitly nonbinding.
- A follow-up may update the existing artifact in place, increment its revision, and preserve manual edits unless the user explicitly requests replacement.
- Artifact procedures are loaded only for an explicit create/update turn. Grok and the old Phase 5 composition path are not active fallbacks.

### Streaming and observable work

- The existing chat request and typed streamed event family remain the public API boundary: run status, compact activity, sanitized sources, assistant message, artifact revision, receipt, and typed error.
- Observable work reports concise actions such as search batches, opened sources, archive checks, validation, and artifact updates. It never reports private chain-of-thought.
- Activity remains grouped beneath the originating user message. Completed activity collapses to a compact summary while active work auto-scrolls.
- A valid answer with a nonfatal limitation presents as ready with the limitation, not as a failed run. Stopped and failed states remain distinct.

### Credentials, costs, and failures

- `OPENROUTER_API_KEY` and `EXA_API_KEY` are independent server-only credentials. Neither may appear in prompts, provider payload logs, client streams, source records, traces, Git, or artifacts.
- Missing OpenRouter authorization prevents Luna execution with a typed unavailable response. Missing Exa authorization returns `web_search_unavailable` to the agent while supplied-link reading and archive tools remain available.
- Direct Exa failures distinguish invalid input, missing key, unauthorized, rate limited, timeout, malformed response, provider error, stopped, no match, and partial batch results without leaking provider payloads.
- Each receipt reports model requests, Exa search requests, URL reads, archive calls, artifact calls, Luna cost, Exa-reported cost, retrieval cost where applicable, combined accounted cost, elapsed time, and limitations.
- No whole-run automatic retry is allowed. One artifact repair or at most two answer-submission recovery calls may occur inside the same run and must be visible in the receipt.

### Supersession and migration

- Production selection removes the Standard clean-context synthesis reset, the Deep manager/worker/reviewer/composer graph, the Grok preparation-brief route, the Luna fallback route, and the deprecated OpenRouter web plugin.
- Useful deterministic fixtures and historical result documents remain, explicitly marked as superseded evidence. They cannot be selected by live routing.
- The active readable base prompt replaces the previous manager, worker, answer, fallback, Standard, Deep, and brief system prompts. Mode-specific artifact instructions may remain as narrowly loaded schema guidance.
- Existing corpus records, chunks, BM25 index, vectors, retrieval manifests, and exact hashes must remain byte-identical.
- No broad visual redesign is part of this migration. Only UI changes required to preserve the approved Standard/Deep control, new receipt fields, priority names, and correct activity/artifact behavior are permitted.

## Testing Decisions

- Tests assert externally observable behavior, source integrity, security boundaries, and terminal states. They must not assert private reasoning, exact model prose, internal step ordering when multiple orders are valid, or implementation-specific class structure.
- The principal test seam is the streamed `POST /api/chat` route with injected deterministic Luna, direct Exa, safe-reader, archive, clock, and cost dependencies. This is the highest existing seam and proves request parsing, session ownership, active routing, tool results, source projection, citations, artifacts, receipts, and final status together.
- Existing route and Standard research fixtures provide prior art for model-step injection, provider-disabled states, concurrent queries, source registries, exact archive opening, follow-up evidence reuse, citation rejection, and streamed UI events. Those tests should be migrated to the one-agent contract rather than duplicated behind a new harness.
- A narrow direct-Exa adapter suite uses injected fetch responses to prove request shape, credential headers, `auto` search, result and highlight bounds, URL normalization, de-duplication, cost/request metadata, freshness/domain filters, aborts, timeouts, partial batches, HTTP classifications, malformed JSON, missing fields, oversized fields, and secret-safe failures. No live Exa call occurs in deterministic tests.
- A narrow artifact validation suite proves explicit-request gating, create versus update, revision preservation, exact source-ledger resolution, one forced bounded repair, server-owned archive-ID hydration, unsupported-source rejection, three priority values, absence of minute fields, nonbinding order, archive quote integrity, and preservation of manual edits.
- A narrow budget/session suite proves Standard and Deep ceilings, answer reserve, no quota chasing, one active run per session, independent fresh tabs, legitimate repeated follow-ups, session expiry, New research reset, and honest process-local loss.
- Security tests prove that Exa and OpenRouter keys, provider payloads, raw page bodies, raw corpus text, prompts, internal IDs, and tool protocol cannot reach browser events or rendered/exported answers.
- Routing tests prove ordinary chat, explicit Deep Research, and explicit artifact requests all instantiate the same Luna `ToolLoopAgent` with the same tool catalog. They also prove no manager, worker, reviewer, Grok composer, fallback model, deprecated plugin, or clean-context synthesis call occurs.
- Citation tests prove every rendered material block resolves only to usable evidence, candidate-only records are rejected, unreadable pages cannot be cited, duplicate titles remain distinct, archive passages retain exact provenance, and raw source IDs are absent.
- Deterministic completion requires the complete existing `pnpm gate`: supply-chain denylist, lint, typecheck, all Vitest suites, and production build. Corpus and retrieval hashes must match their accepted values exactly.
- After deterministic completion, perform exactly one watched three-turn browser proof in one fresh session:
  1. Ask a current-web Standard question and verify direct Exa discovery, inspected sources, a concise Central Story answer, exact clickable citations, natural completion, and no artifact.
  2. Ask an archive-relevant follow-up and verify same-session evidence reuse plus an agent-chosen archive search/open with exact S3–4 provenance.
  3. Explicitly request a Preparation Brief and verify the same agent creates a sourced artifact with `essential`, `strong`, and `optional` priorities and no minute estimates.
- The watched proof has a $1.00 combined OpenRouter-and-Exa ceiling, no automatic whole-run retry, and maximum behavior no broader than the approved Standard limits plus the two follow-up turns. Preserve every failure and exact receipt honestly. Do not call Opus or run a comparative model evaluation.
- The implementation passes only if the final browser state is terminal, each turn is useful and correctly grouped, the complete conversation remains available for follow-up, every material factual claim resolves to usable evidence, the artifact is validated, costs remain within authorization, the full gate passes, and the exact passing commit is reported.

## Out of Scope

- Model bakeoffs, comparative Claude/ChatGPT/Gemini evaluation, Opus API calls, model replacement, or claims of universal superiority.
- Durable persistence, hosted databases, cross-device history, multi-instance synchronization, authentication, authorization, or shared remote CJ/Jeff accounts.
- The Nonsense Knowledge Base, Episode Research Spaces, Topic Watches, scheduled/background refresh, notifications, or automatic news monitoring.
- New research tools, subagents, manager/worker graphs, planners, critics, composers, evaluator models, fallback models, code execution, browser automation, paywall bypass, arbitrary PDF processing, or external publishing.
- Google Drive, email, calendar, social media, CMS, or other external write integrations.
- Topic selection, final editorial ranking, locked episode order, episode timing, host impersonation, dialogue, jokes, or finished on-air scripts.
- Fine-tuning, new transcript acquisition, audio processing, speaker diarization, corpus rewriting, public corpus exposure, new embeddings, a vector database, or changes to accepted retrieval artifacts.
- Broad UI redesign, sidebar/history work, deployment, Vercel infrastructure, production secrets, analytics, or public launch.
- Automatic retries of an entire failed research turn.

## Further Notes

- The one-agent shape follows the maintained Vercel AI SDK `ToolLoopAgent` contract: a model iteratively calls tools, observes their results, and chooses whether to continue or answer. The runtime uses this library rather than implementing a custom graph.
- Direct Exa uses the official Search API response rather than an Exa-generated answer. Official documentation exposes bounded result metadata, highlights, request IDs, and `costDollars.total`; the application still treats highlights as discovery-only and relies on the hardened reader for Trusted Sources.
- The official Exa JavaScript SDK was considered. Direct REST through the existing fetch/Zod boundary is the smaller dependency choice for a single endpoint; the current SDK would add unrelated OpenAI, dotenv, Zod 3, and compatibility dependencies.
- Standard Research v2 remains proof that Luna can produce useful current-web and archive-grounded answers. Its deprecated search transport, forced synthesis reset, and split brief/Deep paths are limitations this specification removes, not evidence to erase.
- The Season 3–4 archive contains 59 validated episodes and remains sufficient for this iteration. No claim is made about missing seasons.
- Jake approved this specification as the active build authority and launched the bounded implementation goal. Passing this implementation does not authorize deployment or later persistence work.
