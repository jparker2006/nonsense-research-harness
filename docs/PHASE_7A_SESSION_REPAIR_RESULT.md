# Phase 7A session and follow-up repair result

Status: **CODE PASSED; REPLACEMENT LIVE RUN FAILED ON A SEPARATE CONTROLLER-OUTPUT ISSUE** on 2026-08-24 HST.

## Outcome

The stale-conversation defect is repaired. The browser no longer sends every new conversation to the fixed `session_phase7a_local` workspace, and an agent run no longer treats legitimate research repeated in a later user turn as an endless-loop violation. The full deterministic gate passes.

The one authorized replacement browser run did not complete end to end. Its browser stream remained attached, current web search completed with five candidates, and no stale-session `phase7a_repeated_action` occurred. The following Luna controller response failed strict output validation as `phase7a_controller_invalid`, so the run stopped before reading sources, searching the archive, or creating a Headlines packet. This is preserved as a separate open reliability issue rather than being described as a successful proof.

## Implementation

- A new browser conversation creates `session_phase7a_<32 lowercase hex characters>` from `crypto.randomUUID()` on first send.
- The ID lives in a React ref, so creating it does not rerender or detach the active stream. Follow-up turns reuse it; **New research** clears it and the next send creates a different ID.
- Normalized web/archive queries and authorized URL/chunk reads are tracked in per-run sets. A duplicate inside one observe-decide-act loop still fails closed.
- Bounded query histories and stored evidence remain available across turns. A later turn may repeat a search or reread authorized evidence; existing evidence is upserted and does not falsely consume new-evidence capacity.

## Deterministic evidence

- Focused Phase 7A suite: 24/24 passed after the final ref-based browser-session implementation.
- Full gate: supply-chain denylist, lint, TypeScript, 175 tests in 22 files, and the Next.js production build passed.
- Regression coverage proves:
  - two fresh browser conversations receive distinct schema-valid session IDs;
  - one conversation keeps a stable ID until **New research** clears it;
  - the same web query is allowed in a later user turn;
  - case/whitespace-equivalent repetition is rejected within one run;
  - an authorized URL can be reread on a later turn without duplicating stored evidence.

## Replacement live evidence

- Exact evidence: `reports/phase-7a-session-repair-live.json`
- Browser console warnings/errors: **0**
- Current web-search candidates: **5**
- Terminal status: **failed**
- Terminal code: `phase7a_controller_invalid`
- Provider requests: **3**
- Accounted cost: **$0.0604**
- Automatic retries: **0**
- Transcript searches: **0 completed**
- Artifact: **not created**

## Next repair

Instrument the controller adapter so JSON parsing, transport-schema validation, action conversion, finish reason, and bounded response metadata remain distinguishable without retaining raw private model output. Then harden the failing structured-output boundary deterministically before authorizing another paid browser proof. Do not add an automatic model retry merely to hide this failure.
