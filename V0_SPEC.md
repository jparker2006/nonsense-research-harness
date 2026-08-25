# Nonsense Research Harness — v0 Specification

Status: Approved by Jake on 2026-08-23 and amended on 2026-08-24 after Phase 7A.1. The local chat-first adaptive agent and its first single-workspace visual pass are implemented and proven. Durable storage, authentication, deployment, subagents, and final visual polish remain outside the completed scope.

Authoritative project root: `/Users/jakeparker/Desktop/Nonsense Podcast Project`

## 1. Product definition

The Nonsense Research Harness is a chat-first research application that helps CJ Little and Jeff Parker investigate and prepare podcast topics. A user talks to one agent normally and may include a topic, links, rough notes, questions, or an explicit request for a Headlines or Big Story packet. The agent decides whether to answer, research the current web, search the transcript archive, or create a cited clock-aware artifact.

The harness prepares better conversation material. CJ and Jeff remain equal partners and retain topic selection, editorial judgment, argument, writing decisions, and final control of the clock.

### v0 success statement

For a real Headline or Big Story topic, either host can create a workspace, watch the agent's source and archive work, inspect every citation, receive a useful preparation artifact, ask follow-up questions, and reopen the workspace later. The result must be more repeatable and archive-aware than using a general-purpose chat or research product without the harness.

## 2. Users and permissions

- CJ and Jeff have the same capabilities. There are no host-specific prompts, tools, views, or permissions.
- v0 may use one shared access code rather than separate accounts.
- An unauthenticated visitor cannot view workspaces, transcripts, artifacts, or start a paid run.
- One workspace may have only one active agent run at a time.

## 3. v0 scope

### Included

- One research conversation per ephemeral local workspace
- Optional `headlines` and `big_story` artifact procedures
- Supplied-link reading
- Bounded current web research
- Search and exact excerpt retrieval over the existing transcript archive
- Streaming, sanitized tool activity
- One-action-at-a-time adaptive research within code-enforced limits
- Structured, source-linked research-plus-outline artifact when requested
- Follow-up conversation that can reuse evidence, explicitly perform more research, or revise the artifact in the same workspace
- Persistent workspaces in the deployed application
- Honest partial, unavailable, stopped, and failed states

### Explicitly excluded

- The full 20-to-10-to-5-to-3 Headlines selection board
- Automatic topic ranking or final selection
- A complete episode builder or recurring-segment manager
- Host imitation, speaker-specific writing, or invented CJ/Jeff dialogue
- Finished scripts intended to be read on air
- Speaker attribution in the archive
- Audio download, transcription, or ASR
- Hosted vector database or external retrieval service
- Any model beyond the fixed light/heavy pair, fallback models, subagents, critic agents, or delegation
- GBrain, LLMwiki, a knowledge graph, or an automatically generated topic wiki
- General shell access, arbitrary code execution, browser automation, or an open-ended external tool catalog
- Simultaneous multiplayer editing
- Google Drive synchronization
- Fine-tuning
- Background autonomous jobs
- Production analytics dashboards

## 4. Conversation input contract

The public request is exactly `{ action: "message", session_id, message }`. `message` is ordinary text up to 12,000 characters. It may contain questions, URLs, notes, an artifact request, a target clock, or none of those. A user never has to select a mode before chatting. URLs become readable only when explicitly supplied by the user or returned by the bounded web-search tool. Headlines/Big Story mode, topic, instruction, and target minutes enter the structured contract only when the controller selects `create_artifact` in response to an explicit user request.

The route body is capped at 24 KB. Extra keys, malformed requests, unknown actions, undiscovered URLs, unreturned archive chunk IDs, repeated no-progress actions, and nonexistent citation IDs fail safely.

## 5. Golden-path experience

1. The user opens a blank research conversation and types naturally.
2. Luna reviews recent conversation, saved evidence, unread candidates, archive matches, the current artifact, and exact remaining limits.
3. Luna selects exactly one typed action; code executes it and streams a safe public summary into the research tape.
4. The loop reassesses after each observation until it answers or creates a requested artifact.
5. Ordinary answers appear as cited assistant messages. A requested Headlines or Big Story packet appears in the artifact view with a source ledger and copy-to-Markdown control.
6. The user asks a follow-up in the same composer. The agent may answer from saved evidence or perform new bounded research; it does not fake a refinement.
7. Stop cancels the active request where possible and preserves evidence plus the last validated artifact in the current process.
8. “New research” starts a new ephemeral local workspace.

## 6. Interface contract

### Desktop layout

- One compact header contains product identity, current research context, last-turn receipt, view toggle, new-research, status, and stop controls.
- One primary workspace shows chat by default and the preparation artifact when requested.
- Agent activity appears as a compact inline panel with progressive disclosure; it is not a permanent rail.
- Source detail opens in an on-demand drawer and does not compete with the reading surface until selected.

On narrow screens, the same workspace stacks without horizontal overflow; activity remains inline and source detail becomes a full-width drawer. No feature may exist only in a developer console.

### Visible activity

The interface may show:

- Search query or supplied URL domain
- Tool name and status
- Result count
- Article title and canonical URL
- Archive query, matching episode/segment, and exact excerpt
- Validation pass/failure and the field that needs repair
- Cost/usage receipt after completion when the provider supplies it
- Typed, sanitized errors

The interface must not show private chain-of-thought, hidden reasoning tokens, secrets, raw system prompts, full raw HTML, internal stack traces, or unbounded provider payloads.

### Event vocabulary

The server-to-client stream exposes bounded `data-run`, `data-activity`, `data-message`, `data-source`, `data-artifact`, `data-receipt`, and `data-error` parts. Activity kinds are `run`, `agent`, `tool`, `composition`, `validation`, and `artifact`. They reveal public action summaries and safe tool detail, never private reasoning.

Each event has a run ID, workspace ID, timestamp, display-safe summary, and typed payload. Replayed events must render the same visible state as the original stream.

## 7. Artifact contracts

The model produces structured editorial fields validated by code. The application renders that structure as editable prose/Markdown. Every factual claim uses source IDs, and code—not the model—constructs the artifact's source ledger from those cited IDs. Notes and hypotheses are visibly distinct from verified facts.

### Headlines artifact

1. **Working title**
2. **What happened** — a compact factual setup
3. **Why it matters now**
4. **Verified facts** — discrete claims with source IDs
5. **Tension or argument** — the real disagreement, tradeoff, contradiction, or competing explanation
6. **Surprising details** — useful facts, examples, numbers, or absurdities supported by sources
7. **Past Nonsense coverage** — exact archive excerpts with episode and segment references, or an explicit `no_relevant_archive_match`
8. **Conversation starters** — questions and angles that invite CJ and Jeff to react rather than read prose
9. **Flexible outline** — ordered beats labeled `must_have`, `use_if_time`, or `cut_first`; include estimated timing only when `target_minutes` was supplied
10. **Uncertainties and open checks**
11. **Source ledger**

### Big Story artifact

1. **Working title and core question**
2. **Research brief** — a compact sourced orientation to the subject
3. **Research cards** — discrete sourced cards typed as background, key evidence, force, interpretation, surprise, or optional recommendation lead
4. **Past Nonsense coverage** — exact archive excerpts with episode and segment references, or an explicit `no_relevant_archive_match`
5. **Conversation tensions and questions**
6. **Modular outline** — sections and beats labeled `must_have`, `use_if_time`, or `cut_first`; timing is proportional only when `target_minutes` was supplied
7. **Uncertainties and open checks**
8. **Source ledger** — constructed deterministically from the evidence records cited above, never copied or invented by the model

## 8. Evidence and citation contract

Every source record has:

- `source_id`
- `source_type`: `provided_link`, `web`, or `archive`
- Title or episode title
- Canonical URL for web sources when available
- Retrieval timestamp for web sources
- Bounded excerpt used by the artifact
- Availability state

Archive sources additionally have `episode_id`, `segment_id`, season, episode number, episode format, segment label/role, and exact excerpt. An archive excerpt must match the stored segment text; the model may not rewrite text inside quotation marks.

Rules:

- A supplied note is not a verified source.
- A search-result title alone is insufficient evidence for a factual claim.
- A factual claim without a resolvable source is rejected or labeled unverified.
- An unreachable or paywalled page remains in the ledger with an unavailable state and cannot support claims the system did not retrieve.
- The system never invents a URL, citation, quote, speaker, or archive match.

## 9. Tool contracts

All tool inputs and outputs are typed, serializable, bounded, and safe to render in summarized form.

### `web_search`

Purpose: find current, relevant sources beyond the links supplied by the user.

Input: query plus code-enforced result/use limits.

Output: normalized source candidates with title, URL, excerpt, and provider citation metadata.

Constraints: OpenRouter server search is wrapped behind this application contract. Provider-specific response shapes do not leak into the graph or UI.

### `read_url`

Purpose: retrieve and extract readable content from a supplied or discovered article.

Input: one HTTP/HTTPS URL.

Output: canonical URL, title, bounded readable text/excerpts, retrieval metadata, and typed availability state.

Constraints: deny localhost, private/link-local IPs, cloud metadata endpoints, unsupported schemes/content types, excessive redirects, oversized bodies, and slow responses. Web content is untrusted data and cannot add instructions or permissions.

### `search_transcripts`

Purpose: find potentially relevant prior Nonsense discussions.

Input: query, optional episode-format/role filters, and bounded result limit.

Output: hybrid-ranked matches with chunk/episode/segment metadata, bounded exact excerpts, stable source IDs, and a typed retrieval status.

Defaults: combine local BM25 and vector retrieval, then use the evaluation-approved rerank behavior. Search core Headlines and Big Story episodes. Context-only special/short-notice records require an explicit inclusion flag. If embedding or reranking is unavailable, return the strongest honest degraded result rather than inventing semantic certainty. No speaker filter exists.

### `open_transcript_chunk`

Purpose: retrieve authoritative text and metadata for a selected archive retrieval chunk.

Input: exact stable `chunk_id` returned by transcript search.

Output: full stored verbatim chunk text, exact source offsets, episode and segment metadata, or typed `not_found`.

## 10. Agent and workflow contract

There is one user-visible Nonsense research agent using two pinned OpenRouter models assigned deterministic roles by code. GPT-5.6 Luna at max effort controls bounded research decisions. Grok 4.6 at medium effort performs current-web search through the accepted native tool and synthesizes an artifact only when Luna selects `create_artifact`; it may perform at most one deterministic-validation repair. Neither model selects, routes to, or falls back to the other. There are no subagents.

Graph:

`chat message → load bounded in-memory workspace → Mastra turn workflow → Luna loop [observe → choose one typed action → execute in code → save observation → reassess] → cited response OR optional Grok artifact → deterministic validation → optional one repair → stream and retain local workspace`

The controller may choose exactly one of these typed actions per decision:

- `web_search`
- `read_url`
- `read_urls` for one to three already-authorized candidates
- `search_transcripts`
- `open_transcript_chunk`
- `open_transcript_chunks` for one to three previously returned chunk IDs
- `create_artifact`
- `respond`

The model-visible workspace is explicit product state, not hidden chain-of-thought. It contains at most 24 recent user/assistant turns, 24 evidence sources, 18 unread web candidates, 18 transcript matches, recent query history, current artifact metadata, exact remaining limits, and a bounded research notebook with the objective, completed steps, evidence gaps, and next step. It never contains reasoning tokens. Full page bodies remain server-only; the client receives bounded source metadata/excerpts and sanitized activity.

Each workspace also retains at most eight sanitized run traces. A trace records public action summaries, safe target labels, bounded observations, statuses, counts, accounted cost, source IDs, artifact revision, and limitations. It does not retain raw page bodies, provider prompts, secrets, private reasoning, or unrestricted model payloads.

Instruction layers are small and explicit:

1. A global server-only system prompt defines product purpose, equal treatment of CJ and Jeff, evidence rules, untrusted-content handling, truthful uncertainty, and the requirement to use typed actions.
2. A server-only Headlines or Big Story procedure is supplied to Grok only after the corresponding artifact action.
3. Code and schemas remain the authority for permissions, budgets, tool execution, citations, and valid output; prompts cannot grant capabilities or relax a limit.

Rules:

- Perform at least one transcript search for every initial artifact run.
- Execute only the controller's single validated action; model-authored code is never executed. A batch action may contain at most three independent authorized targets and is still one decision.
- Rebuild each controller turn from bounded conversation/evidence state, tool observations, current artifact metadata, and remaining budget.
- Permit URL reads only for user-supplied or search-discovered public URLs and archive opens only for returned matches. Validate every batch target before starting work, count each target against the original per-tool ceilings, and preserve per-target unavailable states.
- Treat search candidates as leads rather than evidence until `read_url` succeeds; permit citations only to usable saved source IDs.
- Terminate on `respond`, successful `create_artifact`, stop, deadline, controller/tool/provider/cost ceiling, or typed unrecoverable failure. Automatic retry is zero.
- Deterministic validation checks artifact schema, required fields, resolvable citations, exact archive IDs/excerpts, source ledger, and clock.
- At most one artifact repair may run after validation failure. If repair fails, preserve the previous valid artifact and return an honest partial or failed result.
- No provider/model fallback is allowed in v0.
- A stop request terminates the active stream where technically possible and preserves confirmed evidence plus the last valid artifact.
- Follow-ups resume the same in-memory workspace and can genuinely research a missing angle. Saved-evidence-only requests can complete with one Luna call and no tools.

Per user message, code caps Luna decisions at 10, provider requests at 20, web searches at 3, URL reads at 8, transcript searches at 2, archive opens at 6, Grok compositions at 1, repairs at 1, wall time at 300 seconds, and accounted cost at `$1.00`. Automatic retries and provider/model fallbacks are zero.

## 11. Data contract and integrity snapshot

The processed corpus is a deterministic derived layer. Raw SRT files, canonical transcript files, the frozen RSS feed, and the manifest remain unchanged and authoritative for corpus reconstruction.

Snapshot recorded 2026-08-23:

| File | Lines | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `data/processed/episodes.jsonl` | 59 | 2,577,783 | `4ceea4085e0bbe36513706f42a7bedf0008ee4b02b52fd7d695b69f585fe219a` |
| `data/processed/segments.jsonl` | 441 | 2,533,810 | `a774dc9e6a1de562105a64c72853ca30ade7bdd54c7e8f84c869eaf6bc8e5155` |

Integrity checks passed:

- 59 parseable episode records with 59 unique `episode_id` values
- 441 parseable segment records with 441 unique `segment_id` values
- Every segment references an existing episode
- Episode formats: 27 Headlines, 29 Big Story, 2 short notice, and 1 special
- Speaker labels are absent by design

The application uses a generated, server-only search index derived from processed records. It does not place the corpus in the browser or a public static directory. Only the retrieved excerpts required for a run are sent to the model.

## 12. Persistence and deployment contract

- Phase 7A is intentionally local and ephemeral: at most eight workspaces remain in one process for six hours. A server restart loses them, and a fresh browser does not hydrate an existing server workspace until it sends another message.
- There is no authentication, remote database, hosted infrastructure, or deployment in the completed phase.
- A future Phase 7B may implement the target below only after Phase 8 proves the harness is useful enough to justify persistence.
- Target: one Next.js application deployed on Vercel.
- Agent streaming runs through a server route; the browser never receives the OpenRouter key.
- The deployed application cannot rely on writable local disk or process memory for durable state.
- A remote storage adapter persists access/session data, workspaces, messages, runs, artifacts, source ledgers, and usage receipts.
- The durable workspace also persists the append-only safe event stream, public plan, evidence notebook, manual artifact edits, idempotency keys, and run locks. Bounded snapshots accelerate reload, but event replay remains the audit authority.
- A browser reload or function restart may reconnect to or accurately report an active run; it must never infer completion or silently start replacement paid work.
- Any remote store choice is unmade; do not infer libSQL/Turso or another vendor from the local implementation.
- Mastra remains the pinned turn-workflow boundary. The proven custom OpenRouter adapters remain the provider boundary so exact routing, ZDR, no-fallback policy, and receipts stay code-owned.
- Vercel project creation, hosted storage creation, secrets, and deployment require later explicit approval.

## 13. Security, privacy, cost, and reliability

### Security

- All provider and storage secrets remain server-only.
- `read_url` enforces SSRF, redirect, content-type, body-size, and timeout controls.
- All external content is treated as untrusted evidence, not instructions.
- Tools are read-only in v0.
- API access is authenticated and rate-limited before paid execution.
- Dependencies use exact versions and a frozen lockfile. Known compromised Mastra versions are explicitly denied.

### Privacy

- Supplied notes, retrieved article excerpts, and selected transcript excerpts are sent to OpenRouter when required for a run. Phase 3 also sends bounded transcript chunks for ZDR embedding generation and only fused top candidates for evaluation-approved ZDR reranking.
- Grok requests require a ZDR endpoint. GPT-5.6 Luna has no ZDR endpoint on OpenRouter; Jake explicitly accepted possible provider retention for its light-tier work. The UI must disclose this distinction before first use.
- The whole archive is never sent to the model in one request.
- The UI must disclose the provider boundary before first use.
- Logs and traces exclude secrets and should minimize raw user content.
- External pages, search results, transcripts, notes, and prior artifacts are untrusted data. None can alter the system prompt, tool permissions, action schema, budgets, or access boundary.

### Cost

- No fallback model or provider.
- Code-enforced turn, tool, search, token, and timeout policies.
- A post-response usage check is not a hard dollar cap. Development probes require an explicit approved budget and bounded request count; every deployed key must also have a verified provider-side spending limit or guardrail.
- One active paid run per workspace.
- Duplicate submission protection.
- Usage/cost receipt stored when available.
- Development live calls require a separately approved provider, purpose, call count, and dollar budget.

### Reliability

- Typed states: `complete`, `partial`, `unavailable`, `stopped`, and `failed`.
- A broken source does not erase successful evidence.
- A storage failure cannot silently claim persistence.
- A reload after a completed run restores the artifact and evidence.
- v0 does not promise durable continuation of an in-flight run after a serverless interruption. The user can retry from preserved inputs/evidence; durable background execution is deferred unless real runs require it.

## 14. Evaluation plan

Freeze inputs before comparison:

1. One Headlines workspace beginning with a supplied article
2. One Big Story workspace with rough notes and multiple links
3. One topic with meaningful prior Nonsense coverage

Run the same inputs through:

- Gemini using the hosts' ordinary general-purpose workflow
- Plain Grok through OpenRouter without podcast tools or artifact enforcement
- The frozen Phase 5 fixed research workflow
- The Phase 7 adaptive Nonsense Research Harness

Deterministic checks:

- Schema validity
- Citation resolution
- Exact archive excerpt and ID validity
- Budget termination
- Controller-loop termination and truthful remaining-budget state
- Durable event replay, notebook consistency, idempotency, and duplicate-run prevention
- Honest failure states
- Cost and latency receipt

Qualitative checks:

- Preparation usefulness
- Strength of conversation tensions/questions
- Archive relevance
- Amount of generic AI prose
- Manual cleanup required
- Respect for the story clock without overscripting
- Whether adaptive research finds materially better evidence than the fixed workflow often enough to justify its added latency and cost

The v0 usefulness gate passes only if the harness has zero fabricated citations/archive quotes in the test set and provides a clear advantage in archive recall and repeatable preparation. The adaptive loop must also outperform the fixed workflow on at least one material research-quality dimension without unacceptable reliability or cost regression. If the advantage over Gemini/plain Grok or the fixed workflow is unclear, stop and simplify before deployment.

## 15. Phase 0 acceptance gate

Phase 0 is complete only when:

- This spec contains no unresolved core product behavior.
- Every required v0 behavior maps to a testable contract above.
- Deferred features remain outside the build path.
- The corpus snapshot is recorded without modifying corpus data.
- Jake reviews and approves this specification.

After approval, stop. Phase 1 dependency or application work requires a new explicit instruction.
