# Phase 5 result — bounded one-agent workflow

The historical failed live attempts and the passing bounded repair proof are both preserved. Phase 5.1 completion evidence is documented in `docs/PHASE_5_1_RESULT.md`.

Status: **PASSED THROUGH THE BOUNDED PHASE 5.1 COMPLETION PROOF** on 2026-08-24 HST. A generated Headlines artifact validates after zero-provider deterministic recovery. The replacement Big Story run preserved a real research plan and five-source packet; the repaired Grok composition boundary then produced a valid Big Story artifact from that exact packet in one separately authorized request. All historical failures remain preserved and every live path is relocked. No Phase 6 work, persistence, hosted infrastructure, deployment, or UI redesign started.

## Delivered

The server-side Phase 5 implementation is one fixed Mastra workflow:

`intake → Luna research plan → bounded tool execution → Grok composition → deterministic validation → optional one Grok repair → final result`

It has no subagents, delegation, model-selected routing, provider fallback, or automatic retry. Luna/max produces only the research plan. Code invokes the four bounded capabilities `web_search`, `read_url`, `search_transcripts`, and `open_transcript_chunk`. Grok/medium produces the Headlines or Big Story artifact. Code—not a model—then validates its structure, source ledger, cited evidence, exact archive IDs and quotes, host-voice prohibition, clock, termination, and spend.

The workflow returns a structured artifact plus sanitized activity, evidence metadata, usage receipts, and an honest `complete`, `partial`, or `failed` state. It does not choose a story, generate a finished on-air script, attribute unlabeled archive text to either host, or imitate CJ or Jeff.

## Frozen boundaries

| Boundary | Code-enforced maximum |
| --- | ---: |
| Luna turns | 6; fixed graph normally uses 1 |
| Grok turns | 2 including the only repair |
| Web searches | 2; Headlines executes 1 and Big Story executes up to 2 |
| URL reads | 6 |
| Transcript searches | 2; Headlines executes 1 and Big Story may execute 2 |
| Transcript chunk opens | 4 |
| Luna output | 1,024 tokens |
| Grok output | 12,000 combined reasoning/output tokens |
| Whole run | 300 seconds |
| Model request | smaller of remaining run time or 120 seconds |
| Conservative run cost | $0.50 |
| Automatic retries | 0 |

The local spend ledger reserves before each paid action, replaces the reservation with a provider receipt when present, refuses the next action if its reservation would cross the cap, and fails the run if a returned receipt itself crosses the cap. This is not a provider-enforced dollar limit; a provider can charge an already-started request before its receipt is inspected.

## Deterministic evidence

The real Mastra graph runs through recorded, zero-network fixtures for both modes. Focused Phase 5 verification passes **47 tests across 6 files**, covering:

- complete Headlines and Big Story artifacts through all four tool boundaries;
- unavailable pages, web no-match, and keyword-only archive degradation;
- exact citation, source-ledger, archive-ID, archive-metadata, and byte-exact quote validation;
- fabricated host attribution and hypothetical host voice rejection without scanning verbatim evidence as generated prose;
- malformed planner output, malformed composer output, successful repair, failed repair, and single-loop termination;
- pre-action budget refusal, post-receipt budget crossing, URL/tool ceilings, and whole-run timeout before and during tools;
- fixed Luna/Grok routing, strict schemas, ZDR policy, no fallback, no retry, receipt preservation, and route mismatch rejection;
- provider-disabled zero-call behavior, unexpected-adapter-error sanitization, typed thrown-read evidence, supplied-link provenance, duplicate-read avoidance, immutable corpus hashes, and client/public isolation.

The last pre-Big-Story repository gate passed supply-chain denylist, lint, typecheck, **119 tests across 18 files**, and the Next.js production build. The final locked-tree gate is recorded below.

## First live Headlines attempt

The frozen public case used NASA's `What Lake Bonneville Left Behind` article, an eight-minute target, current official-source research, and archive search. The graph correctly planned research, retrieved the supplied NASA page, found and opened current NASA/USGS/Utah sources, and returned honest `no_match` archive states. Grok composition then reached the former 90-second per-request timeout before returning an artifact.

| Result | Evidence |
| --- | --- |
| Live gate | **Failed safely**; no artifact was claimed |
| Run status/error | `failed` / `phase5_model_timeout` |
| Elapsed | 155,395.12 ms, below the 180-second whole-run ceiling |
| Counts | 1 Luna; 1 Grok; 2 web searches; 5 URL reads; 2 transcript searches; 0 transcript opens; 0 repair |
| Usable retrieved sources | 4 |
| Known provider-reported cost | $0.0522195 |
| Timed-out Grok receipt | Missing; $0.20 conservative reservation retained |
| Total conservative accounted exposure | **$0.2522195 / $0.50** |
| Retry | None |

The complete sanitized attempt is `reports/phase-5-live.json`. It contains public source excerpts and evidence metadata, not the API key, prompts, hidden reasoning, stack traces, or raw provider response. The key remains ignored by Git and mode `0600`.

## Original-timeout repair

The failure showed that the former 90-second model-call timeout was unnecessarily lower than the approved 180-second run ceiling. The repaired workflow:

- gives a model request the smaller of the remaining whole-run time and 120 seconds;
- performs one current-web search in the MVP, which still yields up to three candidates and preserves time for composition;
- avoids rereading a supplied link when search returns the same stable source ID;
- preserves `provided_link` provenance instead of overwriting it as a discovered source;
- checks the deadline after provider/tool returns and converts crossings into an inspectable failed result;
- routes malformed composer JSON to deterministic validation and the one allowed repair while retaining its usage receipt.

The replacement live attempt proved the timeout repair far enough to return a complete Grok artifact after 78 seconds of composition, inside both the 120-second request and 180-second run boundaries.

## Replacement live Headlines attempt

The replacement used the same frozen NASA case. It completed Luna planning, one supplied-page read, one current-web search, one archive search, and Grok composition. The generated packet was useful and schema-shaped: it contained eight cited facts, five discussion questions, six clocked/cuttable beats totaling eight minutes, explicit uncertainties, no invented host voice, and an honest archive no-match.

The live run still failed its initial gate because Grok paraphrased two machine-owned source-ledger fields—`retrieved_at` and `excerpt`—instead of copying them byte-for-byte. Its single Grok repair then returned no usable response or receipt. The original result remains `partial` with both ledger mismatches and `phase5_model_unavailable`.

| Result | Evidence |
| --- | --- |
| Initial live gate | **Failed safely**; useful partial artifact preserved |
| Run ID | `run_038456c4-ef1f-4dc1-bdd0-c43eb37ad382` |
| Elapsed | 109,574.71 ms |
| Counts | 1 Luna; 2 Grok including repair; 1 web search; 1 URL read; 1 transcript search; 0 transcript opens; 1 repair |
| Provider-reported cost | $0.05720412 |
| Missing repair receipt | $0.20 conservative reservation |
| Conservative accounted exposure | **$0.25720412 / $0.50** |
| Automatic retry | None |

### Deterministic recovery

The failure identified a design error: source IDs are model-selected, but retrieval timestamps, excerpts, URLs, titles, availability, and archive metadata are machine-owned facts. Code now canonicalizes existing ledger IDs from collected evidence before validation. It does not bless an invented ID, add a missing citation, alter generated prose, or weaken exact archive-quote checks.

The already-generated Headlines artifact was eligible for zero-provider recovery because it had an explicit archive no-match and its only substantive validation failures were the two ledger mismatches. Recovery `recovery_run_038456c4-ef1f-4dc1-bdd0-c43eb37ad382` made **0 provider requests**, preserved the original failed result and errors, replaced only canonical ledger metadata, and produced a `complete` Headlines artifact with zero validation errors. Archive-bearing stored artifacts remain fail-closed when exact chunk content is unavailable.

## Live Big Story attempt

The frozen Big Story case used the IEA's 2026 data-centre electricity update, rough notes about physical infrastructure and competing interpretations, a 28-minute clock, and the archive query path intended to reach prior Nonsense AI-infrastructure coverage.

The only approved run failed during Luna planning after 11,486.37 ms. No valid response or usage receipt returned, so the workflow recorded `phase5_planner_failed`, charged its $0.02 conservative Luna reservation, and stopped before any supplied-link read, web search, transcript search, Grok call, evidence, plan, or artifact. There was no retry.

| Result | Evidence |
| --- | --- |
| Live gate | **Failed safely**; no plan or artifact claimed |
| Run ID | `run_1d260318-f871-4288-8df9-eb7bfe11a561` |
| Elapsed | 11,486.37 ms |
| Counts | 1 Luna; 0 Grok; 0 tool calls; 0 repair |
| Provider-reported cost | Unavailable |
| Conservative accounted exposure | **$0.02 / $0.50** |
| Automatic retry | None |

## Replacement live Big Story attempt

Jake explicitly authorized one replacement under the existing `$0.50` run ceiling, `$1.30` aggregate ceiling, and zero-automatic-retry rule. The replacement completed Luna planning, read the supplied IEA source, ran one current-web search, ran two transcript searches, and opened four exact archive chunks. The archive evidence included the highly relevant prior episodes `The Insane Infrastructure of Artificial Intelligence` and `Data vs. Dairy: Uncovering the Secret Water Hogs of the Modern World`.

Grok composition returned a provider receipt after about 109 seconds but no parseable artifact, so deterministic validation recorded `schema:artifact:Invalid input: expected object, received null`. The single in-run repair then returned no usable response or receipt and recorded `phase5_model_unavailable`. The workflow preserved its plan and five usable evidence records, claimed no artifact, and stopped. No second replacement or automatic retry ran.

| Result | Evidence |
| --- | --- |
| Live gate | **Failed safely**; plan and evidence preserved, no artifact claimed |
| Run ID | `run_e8bba85f-2b4b-42ef-9d02-5b917a6cfdbc` |
| Elapsed | 149,527.51 ms, below the 180-second whole-run ceiling |
| Counts | 1 Luna; 2 Grok including repair; 1 web search; 1 URL read; 2 transcript searches; 4 transcript opens; 1 repair |
| Usable evidence | 5 |
| Provider-reported cost | $0.10138324 |
| Missing repair receipt | $0.20 conservative reservation |
| Conservative accounted exposure | **$0.30138324 / $0.50** |
| Automatic retry | None |

## Aggregate live evidence and locks

| Boundary | Result |
| --- | ---: |
| Recorded attempts | **4 / 4**: failed original Headlines, failed replacement Headlines, failed original Big Story, failed replacement Big Story |
| Zero-provider recoveries | **1**: recovered Headlines artifact passed |
| Known provider-reported spend | **$0.21080686** |
| Missing-receipt reservations | **$0.62** |
| Conservative accounted exposure | **$0.83080686 / $1.30** |
| Per-attempt cap | All attempts below **$0.50** |
| Automatic retries | **0** |

The separately authorized Phase 5.1 proof added exactly one Grok composition request and `$0.047494` of actual/accounted spend under its own `$0.20` ceiling. Across the historical Phase 5 ledger plus Phase 5.1 proof, conservative accounted exposure is **$0.87830086** and known provider-reported spend is **$0.25830086**.

`PHASE_5_LIVE_CALLS_DISABLED`, `PHASE_5_LIVE_RUNNER_DISABLED`, `PHASE_5_HEADLINES_RECOVERY_DISABLED`, and `PHASE_5_1_COMPOSE_PROOF_DISABLED` are all locked. An authority-present model call is proven to make zero fetches. The historical report recomputes usage from immutable attempts rather than trusting stored totals, reserves $0.50 for a missing top-level result, and cannot authorize a fifth attempt or a third attempt for either case. The separate proof launcher refuses a second proof when its immutable output already exists.

## Gate decision

Phase 5 **passes through the bounded Phase 5.1 completion proof**. Deterministic fixtures validate both modes. The recovered real Headlines artifact validates. The historical replacement Big Story run proves the research path and freezes its exact five-source packet; the separately recorded Phase 5.1 request proves the repaired composition path against that packet with zero validation errors. This is explicitly composed evidence across two executions, not a claim that the historical failed end-to-end run changed after the fact.

## Final locked-tree verification

| Gate | Result |
| --- | --- |
| Dependency audit | No known vulnerabilities |
| Supply-chain denylist | Clean across 144 known-bad Mastra versions |
| Lint | Passed without warnings |
| TypeScript | Passed |
| Tests | **139 / 139 passed across 20 files** |
| Next.js production build | Passed |
| Phase 3 corpus/retrieval integrity | All five frozen SHA-256 checks passed |
| Secret/report boundary | Key ignored and mode `0600`; both reports contain no credential, raw model-input `content`, system prompt, or hidden reasoning |
| Live execution | Model, full runner, recovery, and composition-proof launcher statically locked |
| Git authority | Private `jparker2006/nonsense-research-harness`; default branch `main`; exact passing commit recorded after final push |

The final evidence test independently parses the historical report, proves all four attempts and exact `$0.83080686` aggregate, validates the recovered Headlines result, preserves both historical Big Story failures, validates the separate Big Story proof against the rebuilt frozen packet, and proves every live launcher is relocked.

## Current limitations

- One real Headlines artifact validates after a separately recorded zero-provider recovery. The Big Story artifact validates in the separate Phase 5.1 composition proof over the replacement run's frozen evidence packet; there is no single post-repair end-to-end live run.
- Luna planning returned no usable response on the original Big Story attempt. The replacement planned and researched successfully, while its historical composition still remains failed and unaltered.
- The model-repair request on the replacement Headlines run also returned no usable response or receipt. Machine-owned ledger canonicalization removes the need to spend a model repair on that class of error, but other repair cases remain fixture-proven only.
- The client ledger is fail-closed between calls, but no client-only check can undo a provider charge from an already-started request.
- The 300-second boundary is checked before and after tools and passed into model cancellation. Existing web/URL tool-specific timeouts bound in-flight calls, but the top-level workflow does not yet inject one shared cancellation signal into every tool.
- The archive contains 59 Season 3 and 4 episodes with no reliable speaker labels. Exact archive text can be cited, but not attributed to CJ or Jeff.
- Search relevance is bounded by the Phase 3 corpus and evaluation. A truthful no-match is acceptable and does not imply the topic was never discussed in unavailable episodes.
- Phase 5 prepares material; comparison against Gemini or plain Grok belongs to Phase 8 and is not claimed here.
