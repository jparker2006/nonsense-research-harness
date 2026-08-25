# Phase 7A.2 plan — controller completion reliability

Status: **PASSED** on 2026-08-24 HST. Execution evidence is in `docs/PHASE_7A_2_RESULT.md` and `reports/phase-7a-2-live.json`.

Phase 7A.2 repairs the live controller boundary exposed by the foodborne-illness browser run. It keeps the existing Luna controller, Grok artifact composer, tools, budgets, session model, and zero-retry policy. It does not add another model, framework, agent, database, deployment, provider fallback, or corpus change.

## Frozen implementation

1. Keep the portable strict single-object OpenRouter response schema, but permit neutral values for transport fields that are irrelevant to the chosen action. Batch `read_urls` and `open_transcript_chunks` use `argument: ""` and one to three entries in `arguments`; action-specific validation remains strict after transport parsing.
2. Split controller failures into completion, JSON, transport, and action stages. Retain only safe issue path/code pairs plus bounded provider receipt metadata; never retain raw output, prompts, evidence bodies, secrets, or private reasoning.
3. Preserve the real receipt for every completed paid controller response, including invalid output. A transport failure with no provider receipt remains conservatively reserved. No failed controller output starts an automatic retry.
4. Raise Luna's controller completion allowance from 2,000 to 8,000 tokens so max-effort reasoning cannot crowd out the small action object. The existing per-request price ceiling, turn dollar cap, turn timeout, and receipt accounting remain authoritative.
5. Add a lower proof-specific provider-request cap that is code-enforced and visible in the controller's remaining budget; production defaults remain unchanged.
6. Remove every attempted search candidate from the unread-candidate view while retaining safe later-turn rereads from stored evidence. If exactly one provider request remains and the user explicitly requested an artifact whose evidence and archive requirements are satisfied, reserve that request for deterministic artifact composition instead of starting another controller turn.
7. Stream a specific terminal error, preserve collected research, stop every spinner, expand the failed activity trace, and tell the user that a later follow-up can continue from saved evidence.
8. Allow the loopback `127.0.0.1` origin to load development-only Next.js assets so the supported local URL hydrates instead of rendering inert controls.
9. Prove all eight actions, neutral batch fields, malformed/truncated/schema/action failures, receipt accounting, safe diagnostics, the streamed failure state, and a full web-search to batch-read to archive to Headlines fixture path.

## Deterministic gate

- Focused controller and route tests pass.
- Full supply-chain, lint, TypeScript, test, and production-build gate passes.
- The existing session, follow-up, provider refusal, source safety, citation, archive, artifact, stop, timeout, and budget tests remain green.
- UI changes retain the existing restrained workbench design and pass the Impeccable static check.

## One replacement live gate

After every deterministic check passes, execute one browser run using the same frozen foodborne-illness prompt from `reports/phase-7a-session-repair-live.json`.

- Maximum provider requests: **12**
- Maximum accounted cost: **$0.75**
- Automatic retries: **0**
- No automatic replacement or retry

The first proof exposed controller truncation. Jake separately authorized one replacement, which exposed stale unread candidates and the missing final-slot reservation. After that deterministic repair and a clean full gate, Jake separately authorized one final proof. All three attempts are preserved; none was an automatic retry.

The live gate passes only if the visible browser remains connected, reads current web evidence, searches the Season 3–4 archive, creates a validated cited eight-minute Headlines packet, reaches a visible terminal `COMPLETE` state, exposes the receipt and source trace, and has zero browser console errors. An honest archive no-match or keyword-only degradation is acceptable; skipped archive search, fabricated evidence, unresolved citations, a controller-output failure, a stuck spinner, or a missing artifact fails the gate.

Stop after recording the exact run, request count, spend, tools, sources, archive state, artifact validation, browser state, limitations, full gate, and local commit. Do not push or deploy without separate approval.
