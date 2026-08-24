# Phase 5 plan — bounded one-agent workflow

Historical plan: the current provider-free repair is defined in `docs/PHASE_5_1_PLAN.md`.

Status: hardened and approved for execution on 2026-08-23 HST. This phase builds and proves the real research backend, then stops. It does not redesign the Phase 1 UI, add durable persistence or authentication, create hosted resources, deploy, or begin Phase 6.

## Outcome

Given one `headlines` or `big_story` input containing a topic and optional links, notes, and target runtime, one bounded workflow returns:

- a validated, editable preparation artifact;
- a source ledger containing only retrieved web evidence and exact archive evidence;
- sanitized activity events suitable for the later Claude Code-style interface;
- usage/cost receipts and an honest `complete`, `partial`, or `failed` run state.

The output prepares conversation. It does not select the final story, invent host dialogue, attribute unlabeled transcript text to either host, or produce a finished on-air script.

## Frozen architecture

Use the already pinned `@mastra/core@1.61.0` workflow engine. The graph is:

`intake → Luna research plan → bounded tool execution → Grok composition → deterministic validation → optional one Grok repair → final result`

This is one workflow and one agent identity. There are no subagents, critic agents, delegation, model fallback, or model-selected routing.

- `openai/gpt-5.6-luna`, max reasoning: produce a strict, bounded research plan containing web and archive queries. Luna never writes the final artifact.
- Code executes the plan through exactly four existing server capabilities: `web_search`, `read_url`, `search_transcripts`, and `open_transcript_chunk`.
- `x-ai/grok-4.6`, medium reasoning: compose the strict Headlines or Big Story artifact from the collected evidence only.
- Code validates schemas, source IDs, archive IDs and exact quotes, evidence availability, model routing, termination, and budget.
- If validation fails, Grok receives only the artifact, evidence ledger, and exact validation errors. It gets one repair attempt. A second failure returns the strongest honest partial artifact and the remaining errors.

Search candidates are never evidence. A web source may support a claim only after `read_url` returns usable content. An archive source may support a quote only after `open_transcript_chunk` returns authoritative text and the quote is an exact substring.

## Input contract

- `mode`: exactly `headlines` or `big_story`.
- `topic`: trimmed, 3–300 characters.
- `links`: at most 3 unique normalized public HTTP/HTTPS URLs.
- `notes`: optional, at most 8,000 characters; never treated as verified fact.
- `target_minutes`: optional number from 1–120.

Invalid input fails before tools or providers.

## Run limits

All ceilings are code, not prompt text:

| Boundary | Ceiling |
| --- | ---: |
| Luna model turns | 6; the frozen graph normally uses 1 |
| Grok composition turns | 2 including repair |
| Web searches | 2 |
| Top-level URL reads | 6 |
| Transcript searches | 2 |
| Transcript chunk opens | 4 |
| Luna output | 1,024 tokens/call |
| Grok output | 6,000 tokens/call |
| Whole run | 180 seconds |
| Conservative cost | `$0.50` per run |
| Automatic retries | 0 |

The client ledger reserves a conservative amount before each paid action and refuses the action when the reservation would cross the run cap. Provider-reported cost replaces its reservation when present; missing receipts retain their reservation. This is a local fail-closed ledger, not a provider-enforced total-dollar cap.

The original live proof was bounded to one Headlines run and one Big Story run, `$1.00` conservative total, and no retry. The original Headlines run failed safely at its former request timeout and remains immutable. On 2026-08-24 HST Jake separately approved exactly one replacement Headlines run and the original Big Story run, `$0.50` per new run, `$1.30` conservative aggregate including failed attempts, and no automatic retries. After the original Big Story failed during planning, Jake authorized exactly one replacement Big Story attempt under the same per-run and aggregate ceilings. The revised ledger permits at most four recorded attempts: two Headlines attempts and two Big Story attempts. All historical attempts remain immutable, and all fixtures and deterministic gates run before the replacement.

## Research behavior

Luna must return one or two precise web queries and one or two archive queries. Code validates and deduplicates them. Empty or malformed output fails rather than silently inventing a plan. The MVP executes the first web query for either mode, the first archive query for Headlines, and up to two archive queries for Big Story. The wider frozen ceilings remain fail-closed boundaries, not targets; one current search returns up to three candidates and preserves enough of the 180-second run for composition.

Execution order:

1. Attempt every supplied link, within the read limit.
2. Run the mode's bounded planned exact/current web query. Do not re-read a supplied link when search returns the same stable source ID; read other unique candidates until the URL-read cap.
3. Run the planned archive queries. Open unique top chunks until the archive-open cap.
4. Build a bounded evidence packet. Web text is capped per source and in aggregate before model input; archive excerpts remain verbatim.
5. Compose the mode-specific artifact.

Tool failures add typed events and unavailable ledger records. A non-critical failure does not erase usable evidence. A run with insufficient verified evidence returns partial or failed, never unsupported certainty.

## Artifact and validation rules

Both schemas contain a working title, discrete sourced claims, tensions/questions, a clock-aware modular outline, archive coverage, open checks, and a source ledger. Big Story additionally contains orientation/timeline, people or forces, competing interpretations, and optional recommendation leads.

Validation is deterministic:

- every claim has at least one source ID that resolves to usable evidence;
- outline source IDs resolve;
- archive references resolve to a stored opened chunk with matching episode/segment/chunk IDs;
- every quoted archive string is a byte-for-byte substring of that chunk;
- no source marked unavailable supports a claim;
- no speaker attribution or invented CJ/Jeff dialogue appears in structured fields;
- required sections and priority labels validate through Zod;
- every step and tool count remains inside the ledger;
- the graph terminates after zero or one repair.

## Activity contract

The workflow emits the approved event vocabulary with run ID, timestamp, safe summary, and typed metadata: `run_started`, `tool_started`, `tool_completed`, `tool_failed`, `validation_started`, `validation_failed`, `repair_started`, `composition_started`, `artifact_completed`, `run_failed`, and `run_completed`.

Events may include safe queries, domains, stable source IDs, counts, typed states, and usage. They never include chain-of-thought, hidden reasoning, system prompts, secrets, full raw HTML, stack traces, or unbounded provider payloads.

## Deterministic proof

Recorded fixtures must prove both modes and all branches without provider or network calls:

- complete Headlines and Big Story runs;
- truthful partial output after an unavailable page;
- vague/no-match web search behavior;
- keyword-only archive degradation;
- source and archive-ID rejection;
- non-exact archive quote rejection;
- malformed planner/composer output;
- one successful repair and one failed repair;
- every individual budget boundary and whole-run timeout;
- fixed model routing, no retry, event sanitization, and graph termination;
- provider-disabled execution makes zero calls.

## Live proof and stop gate

Only after the deterministic gate passes:

1. preserve both Headlines attempts and the zero-provider recovery of the replacement artifact;
2. preserve the failed original Big Story attempt and run exactly one approved replacement;
3. preserve sanitized inputs, artifacts, activity, receipts, latency, cost, and limitations;
4. lock the live launcher;
5. run dependency audit and full `pnpm gate`;
6. verify Phase 3 corpus/retrieval hashes are unchanged;
7. write `docs/PHASE_5_RESULT.md`, commit, push the exact passing commit to private `origin/main`, and stop.

Phase 5 passes only if both fixture modes terminate, both schemas validate, factual and archive references resolve, partial states remain truthful, the live cases stay under their approved caps, and the exact clean commit is pushed. Live usefulness versus Gemini/plain Grok is not claimed here; that belongs to Phase 8.
