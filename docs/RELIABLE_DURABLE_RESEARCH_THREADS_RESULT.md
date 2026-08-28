# Reliable, Understandable, Durable Nonsense Research — Result

Status: **COMPLETE**

Verified: 2026-08-28

Authority:

- `docs/RELIABLE_DURABLE_RESEARCH_THREADS_SPEC.md`
- private GitHub issue `#3`
- accepted base: `1c7ff0f689151f06b43325df5702ab1576d20d3d`

## Outcome

The three gates passed in the required order: Reliability, Cleanup, then Persistence. The product now has one GPT-5.6 Luna Max `ToolLoopAgent`, one active Markdown prompt, one canonical tool/result loop, and one durable Research Thread boundary. Current web evidence, exact Season 3–4 passages, answers, citations, compact receipts, unresolved points, and the current Working Artifact survive an application restart through Neon Postgres. The browser exposes New Research plus a minimal recent/open/delete history sidebar.

The implementation did not add a planner, worker, critic, composer, fallback model, subagent, vector database, knowledge graph, authentication, deployment, background work, Topic Watches, Episode Research Spaces, or a Nonsense Knowledge Base.

## Gate 1 — Reliability

### Canonical runtime contracts

- `search_web` accepts one to four unique query strings through the same validator used by the model-facing tool and adapter.
- Search candidates are not citeable until `read_urls` retrieves usable content.
- Web search and reads receive at most one retry for a transient network, timeout, 429, or provider 5xx failure. Input, policy, authentication, and ordinary 4xx failures do not retry.
- Archive discovery runs BM25 and vector retrieval independently and combines them with reciprocal-rank fusion. Reranking is optional; its failure retains fused results. Embedding failure retains BM25 results as `limited` keyword-only evidence.
- Tool Outcomes are `complete`, `limited`, `no_match`, `unavailable`, and `failed`. Later ceilings and optional failures cannot erase earlier usable work.
- The artifact tool is always registered; Luna decides whether the user's request calls for a Preparation Brief.
- `submit_answer` validates the model's structured Markdown paragraphs directly. It resolves only opened Trusted Sources or exact archive passages and checks long direct quotations against retained evidence.
- A quote-validation regression discovered live was fixed with Unicode/whitespace normalization, an actionable same-context correction, and a six-word threshold that avoids treating short scare quotes as factual quotations.

### Five-part deterministic proof

The canonical route and injected adapters prove:

1. Standard current-web completion, one-to-four-query validation, opened sources, exact citations, and no unrequested artifact.
2. Parallel BM25/vector archive retrieval, reciprocal-rank fusion, reranker fallback, bounded search/open counts, exact S3–4 provenance, and a cited answer.
3. Deep Big Story research, agent-chosen archive use, artifact creation, and structured answer completion.
4. Injected Exa, URL-reader, embedding, reranker, and persistence failures with truthful retry and outcome projection.
5. Supply-chain denylist, lint, typecheck, every deterministic test, production build, secret scan, and frozen corpus hashes.

## Gate 2 — Cleanup

- The live route imports only the neutral runtime under `src/lib/research/*`.
- Exactly one `ToolLoopAgent` is instantiated and it uses `openai/gpt-5.6-luna`.
- Exactly one production system prompt remains: `prompts/NONSENSE_RESEARCH_AGENT.md`.
- The permanent product catalog is `search_web`, `read_urls`, `search_transcripts`, `open_transcript_chunks`, and `create_or_update_artifact`. The same Luna loop uses internal `set_research_goal` once to declare the deliverable and terminal `submit_answer` to validate the response; neither is another agent or research workflow.
- Superseded controller, manager, worker, composer, forced-synthesis, fallback, fixture-runtime, phase-era source, live-script, prompt-bundle, and runtime-specific test paths were deleted.
- Mastra and its lock-graph dependencies were removed.
- Historical specifications, results, provider receipts, and reports remain nonexecutable evidence.
- Active client tests now use neutral product fixtures rather than importing a historical phase report.
- The architecture test rejects phase-numbered executable filenames, removed orchestration dependencies, a second active prompt, or a second agent path.
- `pnpm audit --prod` reports no known vulnerabilities; every retained production dependency has at least one active import.

## Gate 3 — Durable Research Threads

### Storage and API

- Added `@neondatabase/serverless` behind the server-only `ThreadStore` interface.
- Added one idempotent migration, `migrations/001_research_threads.sql`, containing one Research Threads table with UUID ID, deterministic title, versioned sanitized JSONB snapshot, monotonic revision, and timestamps.
- Added memory and Neon implementations with typed not-found/conflict outcomes and one transient database retry.
- Added narrow list, load, and delete APIs plus chat-route checkpoints through the same store.
- A first user turn is saved before paid work; evidence/artifacts checkpoint after useful work; the terminal answer and compact receipt are saved last.
- Durable context is rebuilt from product-level human conversation, Trusted Sources, exact selected archive passages, unresolved points, and the current artifact. Provider-native messages and private model protocol are not replayed.
- Stale revisions are rejected rather than overwriting newer work.
- Unmatched user turns reload as interrupted/stopped and never restart paid work automatically.
- If Neon is unavailable, the browser answer remains visible and the UI explicitly says history is process-local and may not survive restart.

### Sidebar and browser behavior

- Blank New Research creates no database row.
- The first user message lazily creates a Research Thread using the browser's genuine UUID v4.
- Recent threads are ordered by update time and load complete conversation, citations, archive evidence, artifact, and compact receipts.
- New Research clears the active selection without deleting the saved thread.
- Deletion requires explicit confirmation. Deleting the active thread returns to the blank screen.
- Switching and deletion are disabled during an active run.
- `?thread=<uuid>` restores the selected thread on refresh; a missing/deleted ID resets selection truthfully.
- Narrow screens use a dismissible history drawer.

### Real Neon proof

Neon project:

- name: `Nonsense Research Harness`
- project ID: `falling-snow-23457898`
- region: AWS US East 2

`DATABASE_URL` exists only in ignored local `.env.local`. It is not recorded here, streamed, logged, committed, or included in client assets.

Commands and results:

- `pnpm threads:migrate` — passed; two idempotent statements.
- `pnpm threads:prove` — passed against the real Neon database; create-on-first-message, list, load, checkpoint update, monotonic revision, stale-write conflict, fresh-client reload, and hard delete all passed.
- The first sandboxed Vitest launch could not create `node_modules/.vite-temp` (`EPERM`). The same project-scoped command passed when rerun with the approved filesystem permission; this was an execution-sandbox failure, not a Neon failure.

### Watched restart and persistence proof

A real browser Research Thread completed a Standard web answer, an archive follow-up, a requested Big Story artifact, and a cited follow-up. The development server was stopped and started as a fresh process. Reopening the same `?thread=` URL restored the answer, readable citations, exact S4E30 and S3E58 archive evidence, artifact revision, receipts, and sidebar entry. A post-restart cited follow-up completed from durable context. New Research remained blank while the saved thread stayed in history; reopening it restored the same state.

The proof thread was then deliberately hard-deleted through the two-step UI. The browser returned to New Research, the sidebar became empty, and `GET /api/threads/<proof-id>` returned `404`. A second replacement evidence-capture thread was also manually deleted and independently returned `404`. These disposable proof threads are not recoverable through the application.

## Live browser receipts and spend

Before Cleanup, the watched Reliability proof completed the approved Standard current-web case, archive follow-up, and explicit Deep Disneyland Preparation Brief through the real browser route. Those provider calls account for the first `$0.9920` of the goal ledger. The later persistence and replacement captures below exercised the cleaned final route and preserved exact readable outputs.

### Initial durability proof

| Turn | Outcome | Time | Requests | Cost |
| --- | --- | ---: | ---: | ---: |
| Standard UPF question | complete | 63 s | 29 | $0.0804 |
| First archive attempt | failed safely on quote validation; evidence preserved | 57 s | 29 | $0.0365 |
| First same-thread quote repair | failed safely; actionable validator detail was still missing | 29 s | 3 | $0.0067 |
| Repaired archive answer | complete | 33 s | 3 | $0.0073 |
| Big Story artifact | complete | 69 s | 4 | $0.0163 |
| Post-restart cited follow-up | complete | 11 s | 2 | $0.0074 |

The quote failures were preserved and fixed rather than hidden. The initial proof added `$0.1546` to the existing goal ledger.

### Replacement exact-output capture

| Turn | Outcome | Observable work | Time | Requests | Cost |
| --- | --- | --- | ---: | ---: | ---: |
| Standard UPF question | complete with source limitations | 6 searches, 46 candidates, 5 reads, archive checked | 62 s | 15 | $0.0576 |
| Archive follow-up | complete with limitations | 6 searches, 30 candidates, 4 exact passages | 63 s | 27 | $0.0516 |
| Requested Big Story brief | complete with one source unavailable | 4 searches, 39 candidates, 7 reads, archive checked, artifact written | 108 s | 27 | $0.0792 |

Replacement capture spend was `$0.1884`. Aggregate accounted provider spend for the whole goal was `$1.3350`, below the authorized `$3.00` ceiling. No whole research turn was retried automatically.

Browser diagnostics after the final replacement conversation contained only development HMR and React DevTools `log`/`info` entries: zero warnings and zero errors. The UI showed the unavailable source counts and other limitations without suppressing supported answers.

## Verbatim replacement browser outputs

The following is the exact readable text captured from the rendered assistant articles. Citation buttons are represented by their visible labels.

### Standard Research Answer

> Assuming you mean the recent U.S. federal action: the key change is **not a ban or a new labeling rule**. FDA and USDA announced a joint **Request for Information**—a call for evidence and comments intended to help create a single federal definition of “ultra-processed food.” The agencies themselves said there was no single authoritative U.S. definition at that point.
>
> [1] FDA
>
> So, for shoppers, manufacturers, and restaurants, the immediate legal change is limited: this announcement by itself does not require products to carry a UPF label, remove particular foods from shelves, or reformulate recipes. It is groundwork for a possible later standard, not the standard itself.
>
> [1] FDA
>
> **Is it a big deal? Potentially, but not yet in day-to-day terms.** A federal definition could eventually affect labeling, dietary guidance, school or nutrition programs, and enforcement—but its impact will depend on what definition regulators adopt and whether they follow it with an actual rule. The important distinction is between the confirmed step—starting the definition-setting process—and the much larger policies that remain possible rather than enacted.
>
> [1] FDA

### Archive Follow-up Answer

> Bottom line: the prior coverage adds two useful layers, but the opened Season 3 and 4 passages do not contain a direct discussion of the FDA/USDA ultra-processed-food definition effort. The strongest retrieved matches are a Season 4 episode on PFAS and food-contact materials, and a Season 3 passage skeptical of MAHA’s supplement claims. Together they make the current story less about a simple “processed food is bad” verdict and more about definitions, specific exposures, evidence quality, and what regulators actually do next.
>
> [1] FDA · [2] S4E30 · [3] S4E30 · [4] S4E30 · [5] S3E58
>
> **Season 4, Episode 30 — Cookware’s Forever Chemical Reckoning.** The strongest passage starts with a useful distinction: PTFE/Teflon can have legitimate applications, but the hosts focus on why cookware and food-contact uses raise different questions. They then connect nonstick cookware to overheating, scratched coatings and microplastics, and broaden the discussion to PFAS in microwave-popcorn bags and fast-food wrappers. Their own framing is that cookware is “the easiest one for us to sort of understand.” That adds a concrete exposure-pathway lens to the federal UPF story: a food-category label and an additive or packaging hazard are not the same thing, and a future definition could be debated alongside—not substituted for—questions about particular chemicals and how people encounter them.
>
> [2] S4E30 · [3] S4E30 · [4] S4E30
>
> **Season 3, Episode 58 — HEADLINES: Another Measles Outbreak, More Roadster Refunds & Your Achy-Breaky Melatonin.** The relevant passage is about supplements rather than ultra-processed food or additives, but it directly addresses MAHA. The hosts say, “This is why you'll hear such grumpiness out of me around this Make America Healthy Again movement,” arguing that some products promoted under that banner lack scientific support; they also stress that supplements are not regulated like approved medicines. What this adds is an evidence standard: legitimate concern about the food system does not automatically validate every MAHA claim, product, or proposed remedy. That is especially relevant while the government is still gathering evidence rather than imposing a product ban.
>
> [5] S3E58 · [1] FDA
>
> **Editorial takeaway:** use the Season 4 material to widen the story from “UPF” to the actual mechanisms—ingredients, coatings, packaging and exposure—and use the Season 3 material as a warning not to let MAHA’s political umbrella do the work of evidence. The federal action remains an RFI intended to help create a uniform definition; it is not, by itself, a labeling mandate, reformulation order or finding that every food fitting some future definition is equally harmful. The prior Nonsense coverage therefore supplies context and skepticism, not proof of what the eventual federal standard should be.
>
> [1] FDA · [3] S4E30 · [4] S4E30 · [5] S3E58

### Requested Big Story Working Artifact

> **Who Gets to Define “Ultra-Processed Food”?**
>
> **Core question**
>
> Is the federal government finally about to define ultra-processed food—and will that clarify a real public-health problem or turn a contested research category into policy before the science and legal consequences are settled?
>
> **Research brief**
>
> The story has moved beyond a 2025 information-gathering exercise: FDA and USDA opened an RFI for a uniform federal definition, extended the comment deadline to October 23, 2025, and—according to current trade coverage—submitted a proposed definition for OMB review in August 2026 without releasing its text. The immediate story is therefore the gap between a politically powerful label, an unsettled scientific category, and an as-yet-unpublished federal proposal. The strongest frame is not “the government banned junk food,” but “the government is deciding what this category means, what evidence counts, and what policies may follow.” Past Nonsense coverage supplies two guardrails: distinguish a food-category label from specific chemical or packaging exposures, and do not let MAHA rhetoric substitute for evidence.
>
> [6] FDA · [7] FDA · [8] fooddive.com · [9] food-safety.com · [4] S4E30 · [5] S3E58
>
> **Key interpretation**
>
> The scientific argument is not simply whether highly processed diets correlate with bad outcomes. FDA says links with cardiovascular disease, obesity, and certain cancers have been reported while important questions about how and why remain unanswered; current coverage describes disagreement over processing-based classification, nutritional content, causation, and unintended consequences.
>
> [6] FDA · [9] food-safety.com
>
> **Editorial priorities**
>
> **essential** — Open with the status distinction: FDA and USDA began by seeking information; current reporting says a proposed definition is now with OMB, but its text is not public and the anticipated release was delayed. Establish that this is not yet a disclosed, enforceable consumer rule. [7] FDA · [8] fooddive.com · [9] food-safety.com
>
> **essential** — Explain why the definition matters: the agencies want a uniform category that could support consistent federal policies, while the size of the category makes the eventual boundary consequential for ordinary diets and children. [6] FDA
>
> **essential** — Lay out the central scientific tension: associations between UPF consumption and health outcomes are important, but FDA says key questions about mechanism remain unanswered; classification, nutrition, causation, and unintended effects are disputed. [6] FDA · [9] food-safety.com
>
> **essential** — Make the legal/policy limit explicit: a proposal or white paper is not automatically a binding rule. Separate what has happened from possible downstream labeling, program, guidance, or enforcement choices. [8] fooddive.com · [9] food-safety.com
>
> **strong** — Use the Season 4 cookware/PFAS material as a concrete contrast between category-level processing language and specific exposure pathways involving cookware, food-contact materials, and chemicals. Treat the archive as editorial context, not as proof of the federal proposal’s scientific merits. [2] S4E30 · [3] S4E30 · [4] S4E30
>
> **strong** — Map the jurisdictional fight: Food Dive reports competing congressional bills and California’s definition, suggesting that the question may become who sets the standard and whether consumers face multiple definitions. [8] fooddive.com
>
> **strong** — Use the Season 3 MAHA passage to interrogate evidence quality and political branding. Ask whether the administration’s public-health message is being matched by transparent methods, published criteria, and a clear account of uncertainty. [5] S3E58 · [9] food-safety.com
>
> **optional** — Bring in the 70%-of-supply and 60%-of-children’s-calories figures as a scale reveal, then test whether such a broad category is useful enough to guide individual choices or policy. [6] FDA
>
> **optional** — If the proposal becomes public, compare its boundaries with the commonly used NOVA Category 4 framework and with congressional and state definitions; do not assume those systems answer the same question. [8] fooddive.com · [9] food-safety.com
>
> **Conversation questions**
>
> - What exactly has the government produced: a public rule, a draft definition, a white paper, or only a proposal under review?
> - What would the definition count—and what would it leave out—if the text is eventually released?
> - Does “ultra-processed” identify a causal health hazard, a pattern of ingredients and processing, or a proxy for diet and socioeconomic conditions?
> - Could a broad federal category clarify consumer information, or would it stigmatize useful processing and create confusing or conflicting standards?
> - What concrete policy comes next, if any: labels, dietary guidance, school or nutrition-program rules, enforcement, or nothing beyond guidance?
> - How should MAHA’s political urgency be separated from the strength and limits of the underlying evidence?

The artifact rendered 11 supporting-research items, 7 open checks, and 9 human-readable references. It assigned only `essential`, `strong`, and `optional` priorities and no episode timing.

## Final deterministic and security evidence

`pnpm gate` passed:

- supply-chain denylist: 144 known-bad versions checked, clean;
- lint: passed;
- typecheck: passed;
- deterministic tests: 15 files passed, 115 tests passed;
- opt-in real-Neon test: one file/one test, passed separately;
- production build: passed with `/`, `/api/chat`, `/api/threads`, and `/api/threads/[id]`.

Secret audit:

- `.env.local` is ignored by `.gitignore`;
- all three configured local secret values were scanned against all 256 tracked-or-prospective commit files and 22 browser-static output files;
- prospective-commit secret leaks: `0`;
- browser-static secret leaks: `0`;
- `postgresql://` occurrences in browser-static output: `0`.

Frozen corpus and retrieval hashes remained exact:

| Artifact | SHA-256 |
| --- | --- |
| `data/processed/episodes.jsonl` | `4ceea4085e0bbe36513706f42a7bedf0008ee4b02b52fd7d695b69f585fe219a` |
| `data/processed/segments.jsonl` | `a774dc9e6a1de562105a64c72853ca30ade7bdd54c7e8f84c869eaf6bc8e5155` |
| `data/retrieval/chunks.jsonl` | `c5667e392c8b242ab96c55b1b0f4c10d0dc74e883940cde0c1b78e433f3ecfd8` |
| `data/retrieval/bm25-index.json` | `c58293b55a95aad89621872b9387a285ab7355979fc752269a4fdf76ca7c4e02` |
| `data/retrieval/embeddings.f32` | `ed72ac74f763c9eaab7443400f4a481ae703882b8d20926c0efc5b6f2fc05961` |
| `data/retrieval/manifest.json` | `a626743a0a24218bfe1052323aa09519411e382ba336d82d0cda693cffa898e9` |

## Honest limitations

- This remains a private local harness. Authentication, the shared private door, Vercel configuration, and deployment were not built or claimed.
- Research Threads are durable, but simultaneous multiplayer editing is not supported; stale writes are rejected.
- The configured Neon project is a single private development database, not a production tenancy/security design.
- Search/read providers can still return inaccessible sources. The agent now preserves usable evidence, names the limitation, and finishes when enough support remains.
- Archive retrieval covers only the validated, unlabeled Seasons 3–4 corpus. It never attributes a passage to CJ or Jeff.
- The replacement Standard answer was concise and correct about the cited 2025 RFI but did not independently establish every August 2026 development later found by the requested brief. This build proves dependable tool use, truthful outcomes, durable context, and exact citations; broad answer-quality comparison remains the next user-owned Phase 8 gate.
- Historical phase documents and reports intentionally remain for audit history, but they are not imported or executed by the application.

## Final conclusion

All specification gates passed. The Nonsense Research Agent is now one understandable research loop with reliable tool contracts and durable Research Threads. The next decision is usefulness evaluation, not more architecture.
