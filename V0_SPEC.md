# Nonsense Research Harness — v0 Specification

Status: Approved by Jake on 2026-08-23. Phase 3 transcript retrieval is complete; hosted resources, deployment, and later phases remain unauthorized.

Authoritative project root: `/Users/jakeparker/Desktop/Nonsense Podcast Project`

## 1. Product definition

The Nonsense Research Harness is a private web application that helps CJ Little and Jeff Parker prepare one podcast story at a time. A user supplies a topic, links, and rough notes. One agent reads the supplied material, performs bounded current research, searches the existing podcast transcript archive, and produces an editable, cited research packet with a flexible outline.

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

- One story/topic per workspace
- Two modes: `headlines` and `big_story`
- Supplied-link reading
- Bounded current web research
- Search and exact excerpt retrieval over the existing transcript archive
- Streaming, sanitized tool activity
- Structured, editable research-plus-outline artifact
- Follow-up conversation in the same workspace
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
- Simultaneous multiplayer editing
- Google Drive synchronization
- Fine-tuning
- Background autonomous jobs
- Production analytics dashboards

## 4. Workspace input contract

Every workspace contains these fields:

| Field | Required | Contract |
| --- | --- | --- |
| `mode` | Yes | Exactly `headlines` or `big_story` |
| `topic` | Yes | Plain-language topic or working title; non-empty |
| `links` | No | Ordered HTTP/HTTPS URLs supplied by the user; duplicates normalized |
| `notes` | No | Rough notes, questions, claims, or desired angles; treated as user input, not verified fact |
| `target_minutes` | No | Positive number representing desired story runtime; if absent, the outline remains ordered and cuttable without pretending to know timing |

v0 does not require file upload, a selected host, a complete episode title, or a prepared prompt. Application-level size and count limits must be explicit in code and shown before an oversized input is rejected. The initial numeric limits will be calibrated and frozen during the provider compatibility phase.

## 5. Golden-path experience

1. The user unlocks the private application.
2. The user creates a workspace and chooses Headlines or Big Story.
3. The user enters a topic and optionally adds links, notes, and a target runtime.
4. The user starts research.
5. The center activity stream shows concise actions such as reading a supplied article, searching the web, finding archive matches, validating evidence, and assembling the artifact.
6. The user can expand an action to inspect safe inputs, results, excerpts, citations, or an honest error.
7. The right artifact panel fills with the completed research packet and outline.
8. The user can edit the artifact directly, open sources, copy material, stop a live run, retry a failed run, or ask a follow-up.
9. Follow-up chat does not silently overwrite manual artifact edits. Artifact mutation after the first run requires an explicit update/regenerate action.
10. The workspace and its evidence reopen after a browser reload or server cold start.

## 6. Interface contract

### Desktop layout

- Left: workspace/thread list and new-workspace action
- Center: conversation and streaming activity timeline
- Right: editable artifact and source ledger

On narrow screens, the same three areas may become tabs or drawers. No feature may exist only in a developer console.

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

The server-to-client stream supports at least:

- `run_started`
- `tool_started`
- `tool_completed`
- `tool_failed`
- `validation_started`
- `validation_failed`
- `repair_started`
- `composition_started`
- `artifact_completed`
- `run_stopped`
- `run_failed`
- `run_completed`

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

There is one agent using two pinned OpenRouter models selected deterministically by code: GPT-5.6 Luna at max effort for light structured/tool work and Grok 4.6 at medium effort for heavy research and synthesis. Neither model selects or falls back to the other.

Graph:

`intake → research/tool loop → deterministic evidence validation → optional one repair loop → structured composition → persistence`

Rules:

- Attempt each unique supplied link before using it as evidence.
- Perform at least one transcript search for every initial artifact run.
- The model may choose additional bounded searches and reads within the configured limits.
- Deterministic validation checks schema validity, required fields, resolvable citations, exact archive IDs/excerpts, and budget termination.
- At most one repair loop may run after validation failure.
- If repair still fails, return an honest partial artifact with validation failures; do not loop indefinitely.
- No provider/model fallback is allowed in v0.
- A stop request terminates the active stream where technically possible and preserves already collected evidence.
- Follow-ups run in the same workspace with access to the saved artifact and evidence, subject to the same limits.

Numeric turn, tool, token, time, and dollar ceilings are configuration, not prompt text. Phase 2 must prove and freeze initial values. A paid run is rejected when required budget configuration is absent.

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

- Target: one Next.js application deployed on Vercel.
- Agent streaming runs through a server route; the browser never receives the OpenRouter key.
- The deployed application cannot rely on writable local disk or process memory for durable state.
- A remote storage adapter persists access/session data, workspaces, messages, runs, artifacts, source ledgers, and usage receipts.
- Remote libSQL/Turso is provisional until its serverless and Mastra compatibility is proven. The application code depends on a storage interface rather than vendor-specific calls outside the adapter.
- Mastra is provisional until the pinned dependency, streaming, OpenRouter, and Vercel bundle spike passes. LangGraph.js is the defined fallback without changing product, tool, event, or artifact contracts.
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
- The Nonsense Research Harness

Deterministic checks:

- Schema validity
- Citation resolution
- Exact archive excerpt and ID validity
- Budget termination
- Honest failure states
- Cost and latency receipt

Qualitative checks:

- Preparation usefulness
- Strength of conversation tensions/questions
- Archive relevance
- Amount of generic AI prose
- Manual cleanup required
- Respect for the story clock without overscripting

The v0 usefulness gate passes only if the harness has zero fabricated citations/archive quotes in the test set and provides a clear advantage in archive recall and repeatable preparation. If the advantage over Gemini/plain Grok is unclear, stop and simplify before deployment.

## 15. Phase 0 acceptance gate

Phase 0 is complete only when:

- This spec contains no unresolved core product behavior.
- Every required v0 behavior maps to a testable contract above.
- Deferred features remain outside the build path.
- The corpus snapshot is recorded without modifying corpus data.
- Jake reviews and approves this specification.

After approval, stop. Phase 1 dependency or application work requires a new explicit instruction.
