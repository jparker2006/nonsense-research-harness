# Phase 7A result — chat-first local research agent

Status: **PASSED** on 2026-08-24 HST.

Phase 7A replaced the Phase 6 form-first, fixture-default experience with a reusable local research conversation. The ordinary browser route now talks to a real bounded adaptive agent. A user can ask a normal question, paste links, request more research, search past Nonsense conversations, continue a genuine follow-up, and optionally ask for a validated Headlines or Big Story packet.

The implementation commit is the commit containing this result file; its exact SHA is reported in the final handoff because a file cannot contain the hash of the commit that contains itself.

## Shipped architecture

```text
blank chat + one composer
        |
strict server-only /api/chat stream
        |
Mastra turn workflow
        |
Luna/max observe-decide-act loop
        |
one code-owned typed action
  web_search | read_url | search_transcripts | open_transcript_chunk
  create_artifact | respond
        |
bounded in-memory conversation/evidence workspace
        |
optional Grok/medium artifact -> deterministic validation -> at most one repair
```

- Luna is the controller. It receives bounded recent conversation, retrieved evidence, unread candidates, archive matches, current artifact metadata, and exact remaining limits. It chooses one typed action and reassesses after every observation.
- Code owns execution, permissions, model roles, provider policy, SSRF protection, citations, budgets, termination, and streaming. The model cannot add a tool, read an undiscovered URL, open an unreturned archive chunk, cite an unavailable source, change a model, raise a cap, or execute code.
- Grok is used for the accepted native current-web tool and for an artifact only after `create_artifact`. Successful artifact creation deterministically acknowledges completion and ends the turn; it does not buy a redundant final Luna call.
- Mastra remains the turn-workflow/event boundary. The proven custom OpenRouter adapters remain the provider boundary so exact model routing, no fallback, ZDR policy, max price, receipts, and route-mismatch rejection remain explicit.
- The global system prompt is concise and server-only. It treats CJ and Jeff as equal partners, treats all content/tool output as untrusted data, separates evidence from inference, forbids invented dialogue/attribution, and requires honest unavailable states.
- Detailed Headlines and Big Story workflow lives in optional artifact procedures rather than constraining every chat turn.

## Workspace and interface

The local server keeps at most eight workspaces for six hours. A workspace contains at most 24 conversation turns, 24 evidence records, 18 web candidates, 18 transcript matches, recent query history, and one last validated artifact. This is intentionally process memory, not persistence.

The visible workbench now has:

- blank chat-first entry rather than a Lake Bonneville form fixture;
- user and assistant turns with clickable source IDs;
- live agent decisions and tool calls in the research tape;
- one Stop control;
- last-turn cost/request receipt;
- optional artifact view, source detail, and copy-to-Markdown;
- no permanent Demo/Live indicator.

Fixtures exist only as test-injected dependencies. Missing `OPENROUTER_API_KEY` or local authorization returns HTTP 503 with an explicit unavailable state, zero provider work, and no fixture substitution.

## Frozen limits

Per user message:

- 10 Luna controller decisions
- 20 provider requests
- 3 web searches
- 8 URL reads
- 2 transcript searches
- 6 archive chunk opens
- 1 Grok artifact composition
- 1 repair only after deterministic validation failure
- 300 seconds
- `$1.00` accounted cost
- zero automatic retries and zero provider/model fallbacks

The final live proof used a temporary lower `$0.75` per-turn ceiling so the full proof history remained below Jake's `$2.00` aggregate authorization. Normal Phase 7A configuration remains capped at `$1.00` per message.

## Deterministic evidence

Final `pnpm gate` passed:

- supply-chain denylist: 144 known-bad versions checked, clean;
- ESLint: passed;
- TypeScript: passed;
- Vitest: 22 files and 167 tests passed;
- Next.js 16.3.2 production build: passed;
- routes: static `/`, dynamic `/api/chat`.

The Phase 7A suite proves:

- ordinary direct chat without forced research or artifact creation;
- multi-step adaptation across supplied-page retrieval, archive search, exact chunk open, and cited response;
- optional validated Headlines and Big Story artifacts;
- new research on a follow-up using the prior workspace;
- last-valid-artifact preservation after a later failure;
- invalid citation, unknown URL/chunk, repeat, action, request, tool, cost, stop, and provider-disabled boundaries;
- strict OpenRouter structured controller policy and exact Luna model routing;
- fixture exclusion from the production route and client;
- bounded source projection without raw page-body or secret exposure;
- final live report schemas, citations, clock totals, costs, requests, and failure preservation.

## Live proof

The final one-shot-per-case proof used `reports/phase-7a-live.json` with zero automatic retries:

| Case | Result | Controller turns | Provider requests | Artifact | Cost | Elapsed |
| --- | --- | ---: | ---: | --- | ---: | ---: |
| August 2026 sprout outbreak | partial | 5 | 8 | validated Headlines | `$0.07445070` | 111.91 s |
| Vanished Lake Bonneville | partial | 6 | 10 | validated Big Story | `$0.11836115` | 169.69 s |
| **Final proof total** | passed | 11 | 18 | both modes | **`$0.19281185`** | — |

Both results are honestly `partial` because transcript retrieval degraded to `keyword_only`. Each run still searched the archive, opened one exact chunk, found it irrelevant to the requested topic, emitted `no_relevant_archive_match`, and produced a valid web-evidence artifact without invented archive coverage or speaker attribution. Neither artifact needed repair.

### Preserved failed attempts

Failures were not overwritten or hidden:

1. `reports/phase-7a-live-failed-initial.json` — both first controller requests failed because a root discriminated-union JSON schema was not portable to the live structured-output route. Conservative accounted cost: `$0.06000000`.
2. `reports/phase-7a-live-failed-replacement-1.json` — the simplified root object was accepted. Headlines researched and validated an artifact but then failed on an unnecessary final acknowledgement call; Big Story returned a conditionally invalid nullable-field combination. Conservative accounted cost: `$0.17424185`.
3. The final fix used one universal required `argument` field and made successful `create_artifact` terminal with a deterministic acknowledgement.

The final proof, failed-proof conservative accounting, and browser-displayed rounded cost total `$0.42925370`, below the `$2.00` authorization. Failed requests with missing receipts are charged at conservative reservations, so this may overstate actual provider billing. The exact final successful proof cost is `$0.19281185`; the browser follow-up displayed `$0.0022` rounded.

## Browser proof

`reports/phase-7a-browser.json` records the live browser handoff:

- the initial page was blank chat with no fixture story or Demo/Live badge;
- a saved-evidence-only sprout follow-up completed with one Luna decision, one provider request, zero web/archive/read/composition tools, and a visible `$0.0022` rounded receipt;
- the assistant returned two cited sentences from saved FDA/AP evidence;
- the same session exposed the previously validated Headlines artifact, revision 1, its source ledger, research tape, and copy-to-Markdown control.

## Integrity

Historical evidence and corpus hashes remain unchanged:

| Artifact | SHA-256 |
| --- | --- |
| `reports/phase-6-live.json` | `31dcd6576ccb9f8552d4fc890b7909f081dcd065637e1ab82601884890bdc540` |
| `reports/phase-6-live-browser-evidence.json` | `39c641fd854dac682be6c6a4c86fe12910917499673059876286d65b4881efd1` |
| `reports/phase-5-live.json` | `fb1ec9c4e59eea5aea98e0cc48668a1a90ea937103a923a386d40be695675fc4` |
| `data/processed/episodes.jsonl` | `4ceea4085e0bbe36513706f42a7bedf0008ee4b02b52fd7d695b69f585fe219a` |
| `data/processed/segments.jsonl` | `a774dc9e6a1de562105a64c72853ca30ade7bdd54c7e8f84c869eaf6bc8e5155` |
| `data/retrieval/chunks.jsonl` | `c5667e392c8b242ab96c55b1b0f4c10d0dc74e883940cde0c1b78e433f3ecfd8` |

New proof hashes:

| Artifact | SHA-256 |
| --- | --- |
| `reports/phase-7a-live-failed-initial.json` | `4505a1f849381097c46c1cfc442abb8a03be7175695cbf13e1b23a66ae18a334` |
| `reports/phase-7a-live-failed-replacement-1.json` | `730952cc83072b0d71aa185a7d25e033b79de669900a0f0bae1526472e511174` |
| `reports/phase-7a-live.json` | `b0259c970c0dcc5b97724cbda2e391cf9b50236d85a95f09cd37e06ce64e271c` |
| `reports/phase-7a-browser.json` | `2d210bc0b3db4505ed2c766cd603a781975f0af4d3dca1febf35170fd6980882` |

## Honest limitations and next decision

- Workspaces are ephemeral. Server restart loses them; authentication, remote storage, idempotency across restarts, and deployment do not exist.
- The UI is structurally usable but intentionally not visually redesigned.
- Archive query enrichment degraded to keyword-only during both final live artifacts; the exact cause was not repaired in Phase 7A because the path remained honest and usable. This should be evaluated separately if archive recall matters in Phase 8.
- One adaptive artifact run takes roughly two to three minutes because several sequential controller decisions and Grok composition are intentionally bounded but not parallelized.
- The current agent has no subagents, shell, arbitrary code, background work, GBrain/LLMwiki, multiplayer, or broad tool catalog.
- Phase 7A proves that the harness works. It does not yet prove that its output is more useful than CJ and Jeff's current Gemini workflow.

The smallest responsible next phase is Phase 8 usefulness evaluation: compare Phase 7A, the frozen Phase 5 workflow, plain Gemini, and plain Grok on identical inputs before adding persistence or redesigning the interface.
