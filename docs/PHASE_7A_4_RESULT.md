# Phase 7A.4 result — conversational research agent

Status: **DETERMINISTIC GATE PASSED** on 2026-08-25 HST.

Jake owns the first paid live UI acceptance run. This phase made no provider requests and spent `$0.00`.

## Outcome

The harness now treats the continuing conversation as the product. Standard chat is a bounded tool-using research agent, Deep research changes the investigation objective without changing the output format, and a Headlines or Big Story brief is created only when the current user message explicitly requests one.

Ordinary answers are concise natural prose with validated claim-level citations. The browser shows a few expandable descriptions of observable work below the request that caused them, never private reasoning. Requested briefs remain strictly structured, evidence-validated outputs, but their live Phase 7A contract ranks material by editorial priority instead of assigning episode minutes.

## Implemented architecture

```text
message + Standard/Deep selection
  -> load bounded in-process conversation/evidence workspace
  -> Luna selects one typed allowed action
  -> code validates and executes the action
  -> save evidence, corrections, queries, safe trace, and receipt
  -> Luna reassesses until the evidence/stopping rule is satisfied
  -> concise cited response blocks
     OR, only on explicit current-turn intent, validated Grok brief v2
```

The one-controller architecture, existing model pair, SSRF-hardened web tools, hybrid transcript tools, request ceilings, `$1.00` per-turn runtime ceiling, and zero automatic retries remain intact. No subagents, model router, fallback provider, database, hosted infrastructure, or new tool class was added.

### Conversation and research

- Added strict `research_depth: "standard" | "deep"` request and trace contracts.
- Installed the approved short server-only system prompt and a small Deep stopping-objective addition.
- Kept direct conversational answers available when tool use would be ceremonial.
- Required current-turn explicit intent for `create_artifact`; an old brief, earlier request, or Deep mode is insufficient.
- Changed `respond` to ordered natural-language blocks with per-block source IDs. Code rejects unknown, unavailable, candidate-only, or invented citations.
- Preserved evidence, web and archive queries, exact transcript matches, user corrections, safe run traces, and the latest validated brief for legitimate follow-ups in the current workspace.
- Kept repeated-action protection scoped to one run, so a later turn may deliberately refresh a search or reread a source.

### Active brief v2 boundary

- Added strict active Phase 7A Headlines and Big Story schemas with four editorial priorities: `must_cover`, `strong_material`, `optional_detail`, and `cut_first`.
- Removed `target_minutes` and `estimated_minutes` from the active request, controller, composer, validation, browser, and Markdown paths.
- Required at least one `must_cover` and one `cut_first` item and preserved exact evidence, citation, archive-quote, source-ledger, and no-invented-host validation.
- Added the smallest compatibility adapter for historical Phase 6 fixtures. Frozen Phase 5 contracts and reports were not rewritten.
- Kept one current working brief with monotonic explicit revisions while preserving the chronological conversation.

### Browser experience

- Added a separate compact Deep research control, off by default and exposed with an unambiguous pressed state.
- Grouped safe runtime events into meaningful expandable work lines such as reading supplied articles, searching the web, and checking the archive.
- Removed the vertical activity rail, repeated circles and checks, duplicated lifecycle labels, per-step timestamps, and permanent loading icons.
- Limited motion to a restrained solid-color left-to-right highlight on the active line; reduced-motion mode renders a static active state.
- Rendered concise cited assistant blocks first, with full references and supporting brief research behind progressive disclosure.
- Added near-bottom auto-follow, immediate user-scroll pause, new-content-aware **Jump to latest**, and completion positioning at the beginning of the new answer.
- Preserved stable human-readable citation numbering while keeping raw web, archive, chunk, and provider IDs internal.

## Verification evidence

All deterministic work completed before any live-provider action.

| Gate | Result |
| --- | --- |
| Focused Phase 7A.4 suites | **PASS** — 3 files, 55 tests |
| Full test suite | **PASS** — 24 files, 206 tests |
| Supply-chain denylist | **PASS** — 144 known-bad versions checked |
| Lint | **PASS** |
| TypeScript | **PASS** |
| Next.js production build | **PASS** — Next.js 16.3.2; `/` static, `/api/chat` dynamic |
| `pnpm gate` | **PASS** |
| Diff whitespace check | **PASS** |
| Paid provider requests | **0** |
| Provider spend | **$0.00** |

The deterministic suites cover Standard tool use, direct chat without ceremonial research, broader bounded Deep behavior, Deep without artifact creation, current-turn artifact intent, evidence and correction reuse, per-block citation validation, both timing-free brief schemas, revision behavior, honest stopped/failed/provider-disabled states, per-run repeat protection, fresh sessions, route streaming order, grouped work, reduced motion, auto-follow pause/resume, completion positioning, mobile controls, and Markdown/source projection.

### Corpus and historical integrity

- `data/processed/episodes.jsonl`: 59 lines, 2,577,783 bytes, SHA-256 `4ceea4085e0bbe36513706f42a7bedf0008ee4b02b52fd7d695b69f585fe219a`
- `data/processed/segments.jsonl`: 441 lines, 2,533,810 bytes, SHA-256 `a774dc9e6a1de562105a64c72853ca30ade7bdd54c7e8f84c869eaf6bc8e5155`
- `git diff --exit-code -- reports data/processed data/raw data/transcripts`: **PASS**

### Local browser proof

The authoritative Desktop application was inspected at `http://127.0.0.1:3210/` after the full gate:

- desktop document and body horizontal overflow: `0`;
- no legacy activity rail or permanent sidebar in the DOM;
- Deep research default `aria-pressed`: `false`;
- browser warning/error log: empty;
- narrow-layout proof at the in-app browser's 390×844 control setting (reported as 582 CSS pixels because of host scaling): horizontal overflow `0`;
- Deep research, New research, and Send message controls: 44-pixel minimum height;
- the deterministic interaction suite independently proves scroll pause, Jump-to-latest appearance only after new streamed content, resume behavior, completion answer positioning, Enter-to-send, and reduced-motion state.

No live prompt was submitted during this proof because provider-disabled operation must remain honestly unavailable and the spec assigns the first paid Phase 7A.4 run to Jake.

## Honest limitations

- Conversation memory is process-local and bounded. Restarting the server loses it.
- There is no authentication, durable history, conversation sidebar, multiplayer editing, deployment, or shared remote memory.
- Standard versus Deep changes the controller's stopping objective; exact source breadth remains model- and evidence-dependent within the same hard ceilings.
- The first real-provider Phase 7A.4 behavior and visual acceptance are not claimed by this deterministic result. Jake must run the prompt below.
- Transcript semantic retrieval may degrade honestly to keyword-only or unavailable depending on runtime provider authorization.
- A requested brief is validated research structure, not a finished script, final story choice, locked running order, or duration plan.
- Frozen historical Phase 5 artifacts still contain the timing contract that was valid for those proofs. Only the active Phase 7A path is timing-free.

## Exact localhost acceptance prompt

Leave **Deep research off** for this first check, paste the following as one message, and send it once:

```text
Research the August 2026 multistate sprout foodborne-illness outbreak. Read these two links, check the current web for anything that materially changes the story, and check the Nonsense archive for relevant past coverage. First give me a concise answer: what is actually interesting here, what is solid, and what is still uncertain? Do not create a prep brief yet.

FDA: https://www.fda.gov/food/outbreaks-foodborne-illness/outbreak-investigation-shiga-toxin-producing-e-coli-salmonella-sprouts-august-2026

AP: https://apnews.com/article/alfalfa-sprouts-food-poisoning-ac7701ed353e1e8c0aea8fec04982a26
```

Expected product behavior, not prescribed prose: compact observable work appears beneath the message; the agent reads or searches only as useful; the answer leads with a concise conclusion and claim-adjacent readable citations; no brief or episode timing appears; sources remain clickable; the run reaches an honest terminal state without an automatic retry.

Stop here. If Jake accepts this run, Phase 8 can freeze a small usefulness comparison before any persistence or deployment work.
