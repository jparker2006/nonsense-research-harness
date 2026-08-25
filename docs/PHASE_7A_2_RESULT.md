# Phase 7A.2 result — controller completion reliability

Status: **PASSED** on 2026-08-24 HST.

Phase 7A.2 repaired the failure that made a healthy live research stream appear to spin indefinitely and then stop without a packet. The connected browser now completes the frozen current-foodborne-illness run end to end: live web search, bounded source reading, Season 3–4 archive search, validated cited Headlines packet, visible receipt, and a terminal state.

The implementation commit is the commit containing this file; its exact SHA is reported in the handoff because a commit cannot contain its own hash.

## What changed

- The Luna controller may return neutral empty transport fields for actions that do not use them, while action-specific conversion remains strict.
- Empty, truncated, incomplete, invalid-JSON, invalid-transport, and invalid-action outputs are classified separately. Safe issue paths and the real paid receipt are preserved; raw model output is not.
- Luna's controller completion allowance is 8,000 tokens. No controller-output failure starts an automatic retry.
- Failed activities expand visibly, stop every spinner, name the terminal failure, and explain that collected research remains usable on a follow-up.
- Search candidates are removed from the unread pool after an attempted read. Stored evidence remains an allowed reread source on a legitimate later user turn.
- A proof-specific provider-request cap is enforced in code and shown to the controller.
- When one provider request remains, usable evidence exists, the archive has been searched, and the user explicitly requested a Headlines or Big Story packet, code reserves that last request for composition instead of buying another planning decision.
- `127.0.0.1` is an allowed development origin, so Next.js client assets hydrate at the documented local URL.

The final-slot behavior is a narrow termination and budget guard. It does not replace the adaptive controller, choose a topic automatically, force artifact creation in ordinary chat, or bypass evidence/archive prerequisites.

## Deterministic evidence

Final `pnpm gate` passed:

- supply-chain denylist: 144 known-bad versions checked, clean;
- ESLint: passed;
- TypeScript: passed;
- Vitest: 22 files and 185 tests passed;
- Next.js 16.3.2 production build: passed;
- routes: static `/`, dynamic `/api/chat`.

The 34 focused Phase 7A tests cover all eight actions, neutral batch fields, controller completion/JSON/transport/action failures, real receipt accounting, safe diagnostics, zero retry, fresh browser sessions, legitimate follow-up research, per-run repeat protection, honest unread candidates, the final composition slot, streaming terminal failures, and a complete current-web to archive to Headlines fixture path.

The Impeccable static UI detector returned no findings. No second model, subagent, database, hosted infrastructure, corpus mutation, deployment, or public transcript exposure was added.

## Live evidence

The exact prompt and all three separately authorized attempts are preserved in `reports/phase-7a-2-live.json`. Automatic retries remained zero.

| Attempt | Result | Requests | Displayed cost | Finding |
| --- | --- | ---: | ---: | --- |
| 1 | failed | 11 | `$0.0823` | controller output truncated at the old 2,000-token allowance |
| 2 | failed | 12 | `$0.1839` | stale unread candidates plus no reserved composition slot |
| 3 | partial, artifact ready | 12 | `$0.1625` | final corrected browser proof passed |
| **Aggregate** | — | **35** | **`$0.4287`** | each attempt separately authorized; zero automatic retries |

The successful browser proof observed:

- three current-web searches;
- five URL reads, four usable FDA/CDC sources, and one honestly restricted Reuters page;
- one Season 3–4 archive search returning `no_match` and zero opened chunks;
- six Luna controller turns;
- the visible `Final request reserved for the packet` guard;
- one Grok composition, zero repairs;
- one validated eight-minute Headlines artifact, revision 1, with four-source ledger, cited factual sections, conversation questions, clock-aware cut priorities, open checks, and an explicit no-archive-match note;
- terminal `PARTIAL`, exactly 12 provider requests, displayed `$0.1625`, and zero browser console warnings/errors.

`PARTIAL` is the correct success state: Reuters was restricted, and the archive honestly had no relevant match. The packet explicitly identifies both limitations and does not use either unavailable source as evidence.

## Remaining limitations

- The in-memory workspace still disappears when the local server restarts. Authentication, persistence, and deployment do not exist.
- The proof took approximately 4.2 minutes. It terminates correctly, but sequential controller/search latency remains noticeable.
- The proof establishes one strong Headlines completion path. It does not prove every topic, Big Story live behavior after this repair, or superiority over plain Gemini/Grok.
- Independent reporting was not usable in the final source set; the packet relies on four primary FDA/CDC pages and says so.
- The UI is connected and structurally usable, but final visual polish remains deferred.

Phase 7A.2 closes the controller-completion blocker. The next responsible step is product review and usefulness testing, not more backend architecture by default.
