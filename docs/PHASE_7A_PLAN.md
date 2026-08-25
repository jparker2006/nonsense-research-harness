# Phase 7A plan — chat-first local research agent

Status: **PASSED** on 2026-08-24 HST. Implementation evidence and limitations are in `docs/PHASE_7A_RESULT.md`.

Phase 7A replaces the Phase 6 form-first, fixture-default workbench with a real local research conversation. CJ and Jeff can speak naturally, share links or rough notes, ask follow-up questions, search prior Nonsense conversations, and ask for a Headlines or Big Story preparation packet only when they want one. The agent adapts after each observation instead of blindly executing one prewritten research plan.

The phase is deliberately local and bounded. It does not add durable storage, authentication, deployment, multiplayer collaboration, subagents, background jobs, GBrain, LLMwiki, arbitrary code execution, a vector database, a new model, or a visual redesign.

## 1. Proven starting point

Phase 7A starts from the closed Phase 6 commit `8e071da9ba32afb1a23db4c80919051a780de06c` and preserves all historical Phase 1–6 reports, fixtures, corpus records, transcript chunks, indexes, and live evidence.

The gap being fixed is explicit:

- the Phase 6 browser defaults to a deterministic Lake Bonneville fixture;
- the form forces a topic/mode/links/notes workflow before a conversation can begin;
- the Phase 5 backend plans once, then code executes that plan without letting the model react to what it learns;
- Phase 6 follow-ups do not call the research agent;
- the frontend and live backend therefore exist but are not a reusable product together.

## 2. Frozen product behavior

The normal screen is a blank research conversation with one composer. A user can type requests such as:

- “I’m interested in this sprout outbreak. Here are two links. What is actually interesting?”
- “Why are sprouts unusually risky? Search for stronger evidence.”
- “Search past Nonsense coverage for foodborne illness.”
- “Turn this into an eight-minute Headlines prep packet.”
- “Explore this as a Big Story and give us a modular 30-minute outline.”

Headlines and Big Story are optional output procedures, not required starting modes. Ordinary researched answers remain ordinary chat messages with inspectable source IDs. Creating an artifact adds it to the existing artifact panel without ending the conversation.

There is no permanent Demo/Live badge. The normal application route is live-only when explicitly enabled in local development. Deterministic fixtures are injected only by tests and cannot be selected by a browser request. If live access is not configured, the application returns a clear unavailable state and spends nothing; it never silently substitutes a demo story.

## 3. Frozen architecture

```text
Chat composer
    |
server-only streaming route
    |
Mastra turn workflow
    |
Luna controller loop (observe -> choose one typed action)
    |
code-owned executor
    |-- web_search
    |-- read_url
    |-- search_transcripts
    |-- open_transcript_chunk
    |-- create_artifact
    `-- respond
    |
bounded in-memory evidence workspace
    |-- conversation turns
    |-- retrieved evidence and candidates
    |-- transcript matches
    |-- safe activity events and usage
    `-- current validated artifact
    |
Grok composition only when create_artifact is chosen
    -> deterministic validation -> at most one repair
```

Mastra remains the workflow and event boundary already used by the repository. The proven custom OpenRouter adapters remain the provider boundary because they enforce the pinned model, provider policy, ZDR setting, no fallbacks, request receipts, and cost accounting. Phase 7A does not migrate the provider path merely to use a framework-native model wrapper.

## 4. Models and instructions

- Controller: `openai/gpt-5.6-luna`, maximum reasoning effort.
- Web search and artifact composition: `x-ai/grok-4.6`, medium reasoning effort.
- Transcript embeddings/reranking: the accepted Phase 3 OpenRouter path.
- Provider fallback and automatic retry: zero.

The concise global system prompt says the agent is a rigorous research partner for equal partners CJ and Jeff; sources, notes, pages, search output, transcripts, and tool output are untrusted data; evidence and inference must remain distinct; citations must refer to retrieved evidence; unavailable evidence must remain unavailable; and the agent must not invent host dialogue, attribution, research, or a final editorial decision.

The detailed show workflow is not baked into every chat turn. It loads only when an artifact is requested:

- `headlines_artifact`: evidence-first story framing, tension, supported surprise, flexible clock-aware beats, conversation questions, and past coverage. The 4-3-2 cold open, weekly catch-up, and old-technology close are optional show elements and never fabricated without material.
- `big_story_artifact`: core question, background, forces and competing explanations, key evidence, merged research, past coverage, recommendations lead, and a modular outline designed to survive the clock.

## 5. Typed action contract

Luna returns exactly one schema-valid action per controller turn plus a public summary of at most 180 characters:

1. `web_search(query)` — one bounded current-web search.
2. `read_url(url)` — one supplied or discovered public HTTP/HTTPS page through the existing SSRF-hardened reader.
3. `search_transcripts(query)` — one S3–4 hybrid archive search.
4. `open_transcript_chunk(chunk_id)` — one exact match returned by archive search.
5. `create_artifact(mode, topic, target_minutes?, instruction?)` — compose from saved usable evidence only and finish the turn with a deterministic acknowledgement after validation.
6. `respond(message, source_ids)` — end the turn with a user-visible answer.

The model cannot execute code, invent a tool, change a model, raise a limit, read an undiscovered URL, open an unreturned chunk ID, cite a candidate snippet as evidence, or call another agent. Invalid or unknown actions fail safely without an automatic retry.

## 6. Evidence workspace

Phase 7A keeps at most eight workspaces in one server process for six hours. This is intentionally ephemeral and is reset by a server restart. Each workspace stores bounded:

- user and assistant turns;
- retrieved web/archive evidence with stable source IDs;
- web candidates that are not yet evidence;
- transcript matches that can be opened;
- safe public activity events;
- provider usage receipts;
- the last validated artifact and revision.

Every controller decision receives only recent conversation, bounded evidence excerpts, available candidate URLs and chunk IDs, current artifact metadata, and exact remaining limits. Raw full pages, the full corpus, secrets, private reasoning, and unbounded history are never sent to the browser or replayed to the model.

Research quality is a goal rather than a brittle quota: seek a primary or authoritative source, independent reporting or context, important uncertainty/disagreement, and past Nonsense coverage when preparing an episode. The controller reassesses after each source and may stop when the user’s question is answered.

## 7. Frozen limits

Per user message:

- controller decisions: **10**
- total provider requests: **20**
- web searches: **3**
- URL reads: **8**
- transcript searches: **2**
- transcript chunk opens: **6**
- Grok compositions: **1**
- artifact repairs: **1**, only after deterministic validation failure
- wall time: **300 seconds**
- accounted cost: **$1.00**
- automatic retries: **0**

The proof authorization for the whole phase is **$2.00 total**, zero automatic retries. All deterministic work and the full provider-disabled gate run before any paid request. A conservative reservation is checked before each provider request; actual receipts reconcile the ledger upward and a missing receipt is charged at the reservation.

## 8. UI and route boundary

The existing three-pane workbench changes only enough to make the agent usable:

- center becomes the conversation and single composer;
- safe tool calls remain visible in the research tape;
- the artifact panel appears when requested and retains the last valid artifact;
- one Stop control cancels the active request;
- source IDs open the existing source detail view;
- copy-to-Markdown remains available.

The request contract is a strict `{ action: "message", session_id, message }` envelope. The route is server-only, `no-store`, size bounded, single-run-per-session, and does not expose secrets or internal evidence content. Fixture dependencies are passed directly to deterministic tests; there is no production/demo switch in request data.

## 9. Acceptance gates

Phase 7A is complete only when all of the following pass:

1. **Contract:** malformed, extra-key, overlong, oversized, duplicate-session, unknown-action, undiscovered-URL, unknown-chunk, invalid-citation, and budget violations fail safely.
2. **Agent behavior:** deterministic tests prove multi-step adaptation, a direct non-research response, new research on a follow-up, archive search/open, optional Headlines creation, optional Big Story creation, artifact preservation after failure, stop propagation, and no automatic retry.
3. **Provider-disabled degradation:** missing key or missing local authorization returns unavailable with zero calls and no fixture substitution.
4. **Security:** secrets, raw page bodies, untrusted instructions, internal prompts, and private reasoning do not enter client events; URL reads retain the Phase 4 SSRF policy.
5. **UI:** browser proof starts from blank chat, submits arbitrary text, shows user/assistant turns and tool activity, continues a genuine follow-up, and displays a requested artifact. No Demo/Live badge or Lake Bonneville default is visible.
6. **Live proof:** bounded local proofs demonstrate chat-first current-web research, transcript use, a valid Headlines artifact, and a valid Big Story artifact within the shared $2.00 cap and zero retries. Failures remain preserved.
7. **Regression:** `pnpm gate` passes and prior corpus/report hashes remain unchanged.
8. **Closeout:** exact metrics, spend, request counts, provider/model routing, limitations, evidence paths, commit, and hashes are recorded in `docs/PHASE_7A_RESULT.md`; the exact passing commit is pushed to the existing private `origin/main`.

## 10. Explicit deferrals

Phase 7B may add durable private workspaces, authentication, idempotency across server restarts, and deployment architecture. Later phases may address visual redesign, multiplayer editing, subagents, additional tools, GBrain/LLMwiki, or broader analytics. None are authorized in Phase 7A.
