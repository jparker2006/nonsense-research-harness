# Phase 5.1 result — Big Story composition hardening

Status: **LIVE PROOF PASSED** on 2026-08-24 HST.

Phase 5.1 repaired the specific boundary exposed by the failed Big Story run, then passed the separately authorized composition-only proof on its first and only request. All four historical Phase 5 attempts remain immutable, all live launchers are relocked, and Phase 6, persistence, hosted infrastructure, and deployment remain untouched.

## What changed

### Truthful completion diagnostics

The OpenRouter stream boundary now retains only safe completion metadata:

- generation ID;
- normalized finish reason;
- response character count;
- `parsed`, `empty`, `invalid_json`, `truncated`, or `incomplete` output status;
- reasoning-token count when the provider supplies it.

Raw failed model output is never written to usage records, events, or reports. A non-parseable composition now terminates with an exact `phase5_model_*_output` code and does not spend the one repair call. A parseable artifact with schema, citation, clock, or archive errors may still receive exactly one repair.

### Smaller model job

Grok no longer returns `source_ledger`. Code recursively collects cited source IDs, selects only matching retrieved evidence, and constructs every source record from machine-owned data before validation. This removes the failure class that required the earlier zero-provider Headlines recovery.

The Big Story model contract now contains:

- working title and core question;
- one sourced research brief;
- 4–10 typed research cards covering background, key evidence, forces, interpretations, surprises, and optional recommendation leads;
- exact prior Nonsense coverage;
- 2–8 conversation questions;
- a 4–10 beat clock-aware modular outline;
- up to 8 uncertainties/open checks.

Deterministic validation requires at least one `key_evidence` card and one `interpretation` card. The final artifact still includes a complete source ledger, but that ledger is hydrated in code. Each evidence body is now included once in the model prompt instead of being duplicated as both `excerpt` and `content`.

### Bounded research depth and runtime

- Headlines still executes one planned web query and one archive query.
- Big Story executes at most two planned web queries.
- Big Story executes at most two archive queries filtered to `big_story` / `story_section` records.
- The four transcript opens are divided two per query, and a chunk is never reopened.
- The planner is instructed to use content terms rather than adding `Nonsense`, `podcast`, or `transcript` noise to archive queries.
- Grok remains `x-ai/grok-4.6` at medium effort with fallback disabled.
- The combined reasoning/output allowance is 12,000 tokens instead of 6,000.
- The whole-run ceiling is 300 seconds instead of 180; each model request remains capped at 120 seconds.
- The `$0.50` per-run cost ceiling, two Grok-turn ceiling, one-repair ceiling, and zero-automatic-retry rule are unchanged.

## Deterministic evidence

Focused Phase 5.1 verification passes **64 / 64 tests across 7 files**. The complete repository passes **139 / 139 tests across 20 files**. New coverage proves:

- safe parsing and receipt retention for empty, malformed, truncated, and incomplete output;
- no repair request after non-parseable composition;
- one repair remains available for a parseable invalid artifact;
- both model-facing schemas omit `source_ledger`;
- code hydrates all and only cited evidence records;
- uncited evidence cannot enter the ledger;
- the compact maximum-shape Big Story fixture remains under the frozen response-size guard used by the test;
- Big Story uses two web queries, two story-section archive queries, four unique opens, and no duplicate chunk read;
- legacy live evidence still parses and its exhausted four-attempt ledger remains fail-closed.
- the locked one-shot launcher rebuilds a five-source packet from immutable report/corpus data at SHA-256 `ca1049a6e4b0b733564775b384757c005e53543385bbc77074b70898e91d8798` and cannot enter the ordinary gate.

## Provider-free gate before the live proof

| Gate | Result |
| --- | --- |
| Provider requests | **0** |
| Phase 5.1 spend | **$0.00** |
| Dependency audit | No known vulnerabilities |
| Supply-chain denylist | Clean across 144 known-bad versions |
| Lint | Passed without warnings |
| TypeScript | Passed |
| Tests | **139 / 139 across 20 files** |
| Next.js production build | Passed |
| Historical live report | SHA-256 `fb1ec9c4e59eea5aea98e0cc48668a1a90ea937103a923a386d40be695675fc4` |
| Corpus/retrieval integrity | All five frozen SHA-256 values unchanged |
| Secret boundary | Report clean; key ignored, format-valid, and mode `0600` |
| Live execution | Model, live runner, and recovery launcher statically locked |
| Git at this checkpoint | No Phase 5/5.1 commit or push; `origin/main` remained the Phase 4.1 head |

## Live composition proof

Jake authorized one composition-only Grok request with a `$0.20` maximum, zero retries, and no Luna, web search, URL read, embedding, rerank, or transcript-query calls. The launcher rebuilt the exact five-source evidence packet collected by replacement run `run_e8bba85f-2b4b-42ef-9d02-5b917a6cfdbc` and verified packet SHA-256 `ca1049a6e4b0b733564775b384757c005e53543385bbc77074b70898e91d8798` before the request.

| Evidence | Result |
| --- | --- |
| Provider requests | **1 / 1** |
| Automatic retries | **0** |
| Model/provider | `x-ai/grok-4.6` / xAI |
| Output | `parsed`; finish reason `stop`; **0 validation errors** |
| Artifact | Big Story; 6 research cards; 4 exact archive references; 5 conversation questions; 7 outline beats; 28 total minutes; 5 code-owned sources |
| Tokens | 3,611 prompt; 6,744 completion-side; 4,324 reasoning; 10,355 total |
| Latency | 96,727.31 ms |
| Actual/accounted spend | **$0.047494 / $0.20** |
| Proof report | `reports/phase-5-1-compose-proof.json` |
| Proof report SHA-256 | `d231d14b5f35f7ffc331aa1992a52e0ad7e3ab70dd1b555542cc843d4b712ed2` |

The artifact asks what the IEA update actually establishes about data-centre electricity demand and bottlenecks, connects that evidence to earlier Nonsense coverage of AI infrastructure, electricity bills, water, and siting, and explicitly labels missing demand totals, forecasts, generation mix, interconnection queues, and build timelines. Every archive quote validates as an exact substring of its stored chunk. Code—not Grok—hydrates the final source ledger.

The model boundary and one-shot launcher were set back to their static locked state immediately after the request. No second call was attempted.

## Gate interpretation and honest limitations

The historical replacement Big Story run already proved Luna planning, supplied-link reading, current-web retrieval, two archive searches, four exact chunk opens, and preservation of five usable evidence records. This composition-only proof validates the repaired Grok boundary over that exact packet. Together they provide real-provider proof for every part of the Big Story path without disguising the historical failed end-to-end attempt or spending on a redundant research rerun.

- This is composed proof across two preserved executions, not one post-repair end-to-end Big Story run.
- The 12,000-token allowance includes reasoning and output; provider allocation remains model-controlled.
- The 300-second local boundary still needs a later Vercel runtime/configuration check before deployment.
- Filtering archive retrieval to Big Story story sections improves depth for this mode but can omit relevant Headlines coverage. The MVP deliberately prefers substantive same-format coverage.
- Two Big Story web searches improve source diversity but can add latency and cost; the existing cost ledger still fails closed before the next paid action.

Phase 5.1 needs no additional provider call. The final locked repository gate and immutable-evidence verification below close the phase; the exact passing tree is committed and pushed as one closeout commit. Phase 6 must still be planned and approved separately.

## Final locked-tree verification

| Gate | Result |
| --- | --- |
| Dependency audit | No known vulnerabilities |
| Supply-chain denylist | Clean across 144 known-bad versions |
| Lint | Passed without warnings |
| TypeScript | Passed |
| Tests | **139 / 139 across 20 files** |
| Next.js production build | Passed |
| Historical live report | SHA-256 `fb1ec9c4e59eea5aea98e0cc48668a1a90ea937103a923a386d40be695675fc4` |
| Phase 5.1 proof report | SHA-256 `d231d14b5f35f7ffc331aa1992a52e0ad7e3ab70dd1b555542cc843d4b712ed2` |
| Corpus/retrieval integrity | All five frozen SHA-256 values unchanged |
| Secret boundary | Both reports clean; key ignored, format-valid, and mode `0600` |
| Live execution | Model, full runner, recovery, and proof launcher statically locked |
| Git preflight | Local `main` and private `origin/main` both started at Phase 4.1 commit `7c4a2cc3b53855e2a612c6c573a0f28630425f65`; closeout uses one exact passing commit |
