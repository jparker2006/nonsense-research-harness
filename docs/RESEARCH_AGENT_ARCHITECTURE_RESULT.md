# Nonsense Research Harness — Manager–Worker Architecture Result

> **Current-runtime note (2026-08-26):** this document remains the historical proof for Deep Research and the manager/worker graph. Ordinary Standard chat has since moved to the Luna-only architecture in `docs/STANDARD_RESEARCH_V2_RESULT.md`. Explicit briefs still use their validated Grok path.

Status: **PASSED — deterministic gate and watched live browser proof complete**

Date: 2026-08-26 (Pacific/Honolulu)

Authoritative repository: `/Users/jakeparker/Desktop/Nonsense Podcast Project`

Started from local `main` commit `19c6b92ced1dd7aa3d15a0c17dc46f47ab8f9aaf`. The exact final local commit is reported in the handoff because a Git commit cannot contain its own hash. No push, deployment, durable persistence, hosted infrastructure, new research tool, third model, or corpus rewrite was performed.

## Outcome

The live chat route no longer uses the shallow one-action controller. It now presents one conversational Nonsense research agent backed by a Grok manager, a server-owned research task graph, parallel Luna workers with native AI SDK tool loops, a versioned evidence notebook, coverage-based replanning, typed evidence packets, grounded synthesis, and optional explicit-only preparation briefs.

```text
browser message + Standard / Deep policy
  -> validated server-only chat route and bounded live deadline
  -> Grok 4.6 Medium manager
       plan objective + dependency graph
  -> code-owned DAG scheduler
       launch every dependency-ready task in a bounded pool
  -> GPT-5.6 Luna Max research workers, in parallel
       search web -> read underlying URLs
       search archive -> open exact chunks
       submit one typed evidence packet
  -> server-owned serializable evidence notebook
       tasks, waves, exact sources/excerpts, claims, conflicts, gaps,
       corrections, prior answers, fallbacks, receipts, artifact revision
  -> Grok reviews the converged wave
       continue with revised tasks, or judge satisfied / partial / unable
  -> Grok writes the concise claim-cited answer
       or the existing validated brief composer runs only when requested
  -> streamed observable work, readable source links, receipt, checkpoint
```

## Implementation

- Added the exactly pinned official `@openrouter/ai-sdk-provider@3.0.0`; the existing Vercel AI SDK supplies native typed tool loops, step lifecycle, tool selection, stop conditions, and cancellation.
- Added domain-oriented runtime modules under `src/lib/research-agent/`; historical phase-numbered runtimes remain only for frozen injected regression fixtures.
- Grok 4.6 Medium plans, replans after every converged wave, judges semantic sufficiency, and synthesizes. A transient manager stage retries once, then visibly falls back to Luna without deleting evidence.
- Luna Max workers receive the complete five-tool catalog. They can reformulate searches and read in parallel, but cannot change the user goal, create a brief, or answer the user. They terminate through `submit_evidence`.
- Search candidates remain unciteable until the underlying page is read. Archive matches remain unciteable until the exact chunk is opened. Final citations resolve only to saved usable evidence.
- The task graph is a validated DAG. All ready tasks run concurrently up to the operational pool of eight; dependencies wait; checkpointing occurs after each wave.
- The notebook is schema-versioned and serializable but intentionally remains in the existing bounded process-local session store.
- The arbitrary first-16 evidence cutoff was removed. Canonical evidence remains available while prompt text is bounded deterministically.
- Standard targets `$0.30`, ceilings at `$0.50`, and reserves `$0.10` for completion. Deep targets `$1.00`, normally ceilings at `$2.00`, and reserves `$0.30`. The watched Deep proof used the stricter authorized `$1.50` runtime override.
- Parallel reservation math was corrected so peers do not block each other merely because conservative reservations overlap. Failed reservations no longer inflate the displayed provider-tool count.
- Workers reserve their typed submission step before research, force submission near a boundary, and preserve already retrieved evidence if a model still omits the typed submission.
- Live Standard and Deep routes now carry a real aborting deadline through manager, worker, web-search, URL-read, and transcript-provider calls. Standard is bounded at five minutes and Deep at twelve minutes.
- Invalid or oversized model text cannot poison a checkpoint: canonical goal/task text remains intact while shorter public UI projections, activity details, and legacy research-state fields are safely bounded.
- Malformed provider receipts are normalized atomically; `NaN`, infinite token counts, or malformed metadata cannot strand a reservation or corrupt accounting.
- Active instructions are readable in `prompts/research-agent/*.md`: system, manager plan/review, worker, answer, Standard, Deep, and fallback.
- Preparation briefs remain explicit-only, source-validated, and priority-ranked (`must_cover`, `strong_material`, `optional_detail`, `cut_first`) with no invented episode timing.

## Deterministic verification

`tests/research-agent.test.ts` contains exactly the 25 frozen architecture scenarios from the specification. They cover:

- direct conversation, Standard, Deep, visible plans, and no implicit brief;
- real concurrent ready-task execution, dependency ordering, convergence, and replanning;
- native multi-tool worker loops, the complete tool catalog, and typed evidence submission;
- candidate/read and archive-search/open provenance boundaries;
- evidence beyond record 16, same-session corrections, saved-evidence reuse, and legitimate repeated follow-up research;
- satisfied/partial judgments owned by the manager rather than keyword-scoring code;
- cycles, malformed tasks/packets, long public projections, invented/candidate citations, and exact archive quote validation;
- one manager retry plus visible fallback, one transient worker retry, unsafe no-retry, cancellation, and timeout;
- target/ceiling/reserve enforcement, concurrent reservation fairness, and malformed receipt normalization;
- explicit priority-ranked Headlines/Big Story briefs, readable citations, useful follow-ups, prompt-injection isolation, notebook round-trip, and streamed run correlation.

The final repository gate passed:

- supply-chain denylist: 144 known-bad versions checked, clean;
- ESLint: passed;
- TypeScript `--noEmit`: passed;
- Vitest: 25 test files, 233 tests passed, including exactly 25 architecture scenarios;
- Next.js 16.3.2 production build: passed with static `/` and dynamic `/api/chat`;
- `pnpm audit --prod --audit-level high`: no known vulnerabilities.

## Watched live browser evidence

Every browser run was watched from request through the visible terminal state. Failures were preserved and diagnosed before replacement; there were no blind automatic retries.

### Accepted Standard proof

Prompt, abbreviated only here: research the current 2026 U.S. federal response to raw-milk foodborne illness; prefer primary sources, check one independent source, check Nonsense, and keep the answer concise.

Visible result:

- status: `Ready · limitations noted`;
- two converged waves;
- 8 actual web searches, 9 underlying source reads, and an archive check;
- 43 provider requests;
- displayed/accounted cost: `$0.4300` under the `$0.50` ceiling;
- six readable clickable sources: FDA, two CDC pages, Food Safety Magazine, and two AP pages;
- useful conclusion: the demonstrated 2026 federal change was incident-specific investigation, inspection, testing, voluntary recall, warning, and closure—not a proven new nationwide raw-milk rule;
- correctly separated epidemiologic strength from the unmatched product-isolate WGS result, independent reporting, inference, and archive uncertainty.

This proof finished in 6m15s and exposed that the old elapsed guard was checked only between provider calls. The accepted evidence was preserved, and the final implementation now propagates a real five-minute Standard abort signal through all live tools and models. The timeout path is deterministic-regression tested.

### Accepted Deep Research proof

Prompt: deeply investigate the 2026 RAW FARM raw-cheddar outbreak as a case study in federal food-safety power using supplied FDA and AP links; verify timeline, epidemiologic/laboratory evidence, recall authority, oversight debate, change versus non-change, and Nonsense coverage; return a concise cited answer, not a brief.

Visible result:

- status: `Ready · limitations noted`;
- compact six-task parallel plan followed by one converged wave;
- first Grok plan call failed transiently, the single Grok retry also failed, and visible Luna fallback produced the plan; later coverage review and synthesis completed;
- 16 actual web searches, 31 underlying source reads, 6 opened archive passages, and a bounded archive check;
- 85 provider requests;
- displayed/accounted cost: `$1.1883` under both the `$1.50` proof cap and `$2.00` normal Deep ceiling;
- elapsed: 6m20s, inside the twelve-minute Deep deadline;
- five readable clickable sources: AP, Food Safety Magazine, CIDRAP, Brownfield, and ProPublica;
- useful conclusion: the episode primarily tested FDA's willingness to use existing recall power, while retrieved evidence did not prove a statutory rewrite;
- explicitly disclosed that primary FDA/CDC pages, operative U.S. Code/eCFR text, full hearing material, and broader archive coverage were not retrieved.

### Preserved failures and repairs

- The first Standard architecture run reached 80 provider requests and `$0.2834` but workers exhausted steps without `submit_evidence`. Root causes were parallel tool-limit races and no reserved final submission step. Counters are now incremented before awaited tools, final submission capacity is reserved, and missing submissions preserve evidence honestly.
- Two live plan turns exposed a legacy checkpoint mismatch: valid manager task questions were longer than the public `research_state.evidence_gaps` field, and a plan-ready activity prefix could exceed its DTO limit. Canonical text is now kept in the notebook while all public projections are bounded centrally.
- A completed intermediate Standard run used 26 requests and `$0.2571` but retrieved no citeable evidence because parallel conservative web-search reservations collided. Web-search reservation was corrected from `$0.10` to `$0.04`, three-worker concurrency is regression tested, and counts now distinguish launched provider calls from blocked attempts.
- One stale Next dev hot bundle executed while a temporary source edit had failed hot parsing. Subsequent live calls were made only after a clean production build and full server restart.
- Failed manager-plan rows now terminalize visibly; route errors distinguish manager plan/review/answer validation; no failed run leaves a deceptive active spinner.

## Live spend ledger

The user authorized at most `$3.00` total OpenRouter spend for live browser verification.

| Evidence | Accounted cost |
|---|---:|
| Initial preserved missing-submission Standard run | `$0.283400` |
| Two short receipt-bearing failed plan runs | `$0.017600` |
| Intermediate no-evidence Standard run | `$0.257100` |
| Accepted useful Standard run | `$0.430000` |
| Accepted Deep Research run | `$1.188300` |
| Isolated schema-only Grok diagnostic | `$0.011206` |
| Two paid plan turns whose receipt was lost at the pre-fix checkpoint boundary, conservatively charged at the coded `$0.06` manager reservation each | `$0.120000` |
| **Conservative aggregate** | **`$2.307606`** |

The conservative aggregate leaves `$0.692394` of the authorization unused. Displayed values are retained at the UI precision supplied by the harness. The two lost-receipt calls are deliberately charged at reservation rather than guessed downward.

## Integrity and security

- The API key remained server-only and was never printed, streamed, stored in prompts, or committed.
- Browser events contain sanitized public work only; they exclude prompts, provider payloads, full page bodies, raw transcript corpus, and private reasoning.
- The URL reader retains its SSRF, DNS revalidation, redirect, content-type, size, and timeout boundaries.
- Raw pages, transcripts, and search results remain untrusted data. Prompt-injection text cannot modify tools, model routing, budgets, or the user goal.
- Search candidates, unavailable pages, unsupported worker summaries, and invented source IDs cannot support final factual claims.
- The corpus, processed records, retrieval artifacts, and historical proof reports were not edited.
- `@openrouter/ai-sdk-provider` is pinned exactly. The final supply-chain denylist and production dependency audit found no high-severity vulnerability.

## Known limitations

- Conversation state and the serializable notebook are still held in an eight-session, six-hour process-local store. Restarting the server loses them; multi-instance deployment would split them.
- There is no authentication, deployment, shared CJ/Jeff workspace, history sidebar, hosted database, or background continuation.
- Some government pages may be unavailable to the hardened text reader; Deep proof correctly fell back to independent reporting rather than pretending the primary was read.
- URL reading handles bounded public HTML, not arbitrary PDFs, JavaScript-only sites, browser automation, or paywall bypass.
- Web search and archive search are deliberately bounded per task. A broad negative archive conclusion remains `no match for these bounded queries`, never `the podcast never discussed it`.
- Standard can still use two waves when Grok judges that material gaps remain; the five-minute deadline now wins if calls run long.
- Deep output is intentionally more comprehensive than ordinary chat, but it can still be long. This was an architecture gate, not the deferred usefulness comparison or a broad visual-polish pass.
- A separate evaluator, durable resumability, additional tools, subagents, model bakeoffs, fine-tuning, and deployment remain out of scope.

## Final gate

Final `pnpm gate` passed on 2026-08-26 after this report and TODO closeout were added. Corpus integrity remained exactly:

- 59 episodes, 2,577,783 bytes, SHA-256 `4ceea4085e0bbe36513706f42a7bedf0008ee4b02b52fd7d695b69f585fe219a`;
- 441 segments, 2,533,810 bytes, SHA-256 `a774dc9e6a1de562105a64c72853ca30ade7bdd54c7e8f84c869eaf6bc8e5155`;
- 1,259 chunks, 3,277,930 bytes, SHA-256 `c5667e392c8b242ab96c55b1b0f4c10d0dc74e883940cde0c1b78e433f3ecfd8`;
- BM25 index, 2,592,054 bytes, SHA-256 `c58293b55a95aad89621872b9387a285ab7355979fc752269a4fdf76ca7c4e02`;
- embeddings, 7,735,296 bytes, SHA-256 `ed72ac74f763c9eaab7443400f4a481ae703882b8d20926c0efc5b6f2fc05961`.

The exact final local commit is recorded in the handoff after this report is committed. No push is authorized by this goal.
