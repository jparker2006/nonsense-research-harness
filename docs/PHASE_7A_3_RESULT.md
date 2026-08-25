# Phase 7A.3 result — chat-native research interface

Status: **PASSED LOCALLY** on 2026-08-25 HST on the final passing tree. No provider-backed acceptance run was made; Jake explicitly owns that next action.

## Outcome

The connected Phase 7A agent now presents each turn as one chronological exchange:

```text
user request
  observable agent work for this run
  cited assistant answer or complete inline prep packet
next user request
  its own work and answer
sticky composer
```

- A reducer binds the first server `run_id` to the pending prompt and routes activities, assistant messages, artifacts, receipts, and errors back to that exchange.
- Repeated activity IDs update in place. Completed turns remain visible and a follow-up cannot erase, move, or inherit their work.
- The activity disclosure contains only code-owned public labels and tool summaries. It is explicitly presented as observable work, not hidden reasoning.
- Headlines and Big Story packets render as the assistant answer. Headlines includes verified facts and surprising details; both modes include the complete clock-aware outline, questions, archive result, open checks, and references.
- The old redundant artifact-panel acknowledgement is suppressed when the same run produced a packet. Copy Markdown and optional Focus reuse the same structured artifact.
- Citations are stable numbered references derived from ledger order. They show publisher/domain and article title or season/episode and episode title. Machine IDs remain internal even if model-authored open-check text mentions one.
- `partial` remains authoritative in the receipt while the primary outcome becomes precise, such as `Ready · 1 source unavailable` or `Ready · archive search limited`. Failed and stopped remain terminal failure/stopped states.

## Stream correctness

- The route now emits sources before the artifact/assistant projection.
- An artifact is emitted only when the current run increased the workspace artifact revision. An ordinary follow-up no longer receives a retained prior packet as if it were new.
- Streamed errors may carry `run_id`; pre-stream HTTP failures still attach to the sole pending exchange.

## Deterministic evidence

- `pnpm gate`: **PASS**
  - supply-chain denylist: 144 known-bad versions checked, clean
  - lint: pass
  - TypeScript: pass
  - Vitest: **23 files / 194 tests passed**
  - Next.js 16.3.2 production build: pass
- Focused Phase 7A client/route coverage includes eight UI/state/presentation cases plus the existing route/agent suite.
- Impeccable detector on the harness, thread renderer, and CSS: **0 findings**.
- Static render evidence covers chronological DOM order, complete Headlines and Big Story sections, visible beat minutes, human citations, suppression of boilerplate, and absence of visible web/archive IDs.
- Route regression proves a follow-up without a new composition receives no `data-artifact`.

## Provider-free browser evidence

The production build was served at `http://127.0.0.1:3210/` without sending a message.

- The real page mounted with the expected banner, starter state, composer, and accessible names.
- Desktop and phone viewport checks had no horizontal overflow; the phone layout preserved the composer and usable starter actions.
- Clicking a starter populated the local composer and enabled Send without submitting it.
- Console warnings/errors: **0**.
- The temporary viewport override was reset and the blank local tab was left ready for Jake.

## Cost and boundaries

- Provider requests: **0**
- OpenRouter spend: **$0.00**
- No Luna, Grok, embeddings, reranker, web search, URL read, or transcript retrieval call was made.
- No model, agent policy, research tool, corpus, persistence, auth, deployment, sidebar/history, subagent runtime, or hosted infrastructure changed.

## Remaining acceptance gate

Jake should send one normal live prompt through the UI. After it reaches a terminal state, verify on that exact user-owned run:

1. work appears under the request in chronological order;
2. the full packet appears inline;
3. citations show article/episode names and open the correct source;
4. partial wording matches the actual limitation;
5. Copy and Focus work;
6. the console is clean.

No automatic retry or replacement run is authorized by this result.
