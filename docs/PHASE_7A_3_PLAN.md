# Phase 7A.3 plan — chat-native research interface

Status: **PASSED LOCALLY** on 2026-08-25 HST. Jake owns the first paid live UI acceptance run.

Phase 7A.3 changes how the already-working Phase 7A.2 agent is presented. It does not change the Luna controller, Grok composer, research tools, evidence validation, transcript corpus, model routing, budgets, or zero-retry policy. Jake will perform the first paid live run after the deterministic gate.

## Frozen product contract

The primary surface is one chronological research conversation:

```text
user request
  observable agent work for that request
  complete cited answer or inline preparation packet
next user request
  observable agent work for that follow-up
  answer or revised packet
sticky composer
```

1. Replace the global activity/run/artifact state with one reducer-owned ordered exchange model. Each exchange retains its user request, server `run_id`, public activity events, assistant answer, newly created artifact, receipt, and error. A follow-up never erases or steals a previous run's work.
2. Bind the first streamed `data-run` to the pending user exchange, then route every run-scoped part by `run_id`. A local submitting state disables duplicate send before the first server event. Existing activity IDs update in place rather than moving to the end.
3. Render observable work directly below the user request that caused it. It is expanded while running or failed and collapsed after successful completion. It shows code-owned public summaries and tool results, never private chain-of-thought.
4. Render a newly validated Headlines or Big Story artifact as the assistant's full inline answer. Show every useful structured section, the clock, conversation questions, archive result, open checks, and sources. Suppress the old “ready in the artifact panel” acknowledgement when the packet itself is present.
5. Retain an optional **Focus** action and Markdown copy for concentrated reading. Focus reuses the same packet renderer; it is not the only place where the result exists.
6. Assign stable numbered references per answer. Web citations show publisher/domain plus article title; archive citations show season/episode plus episode title. Machine `web_*`, `archive_*`, chunk, and segment IDs remain internal lookup keys and are not primary user-facing copy.
7. Use the same reference numbers in inline citations, archive quotes, source list, source drawer, and copied Markdown. Web sources keep a direct **Open original** link.
8. Replace dominant raw `PARTIAL` language with precise truthful outcomes such as **Ready · 1 source unavailable** or **Ready · archive search limited**. Failed and stopped states remain unmistakable. Archive no-match is information, not a failure.
9. Preserve clock estimates on phone layouts. Keep focus, hover, disabled, error, reduced-motion, and coarse-pointer states accessible.

## Narrow stream corrections

- Stream a retained artifact only when the current run actually created a new revision. An ordinary follow-up must not receive the previous packet as a new answer.
- Stream source metadata before the assistant answer/artifact so readable citations resolve immediately.
- Add optional `run_id` correlation to streamed errors; pre-stream HTTP errors remain attachable to the one pending local exchange.

## Deterministic gate

- Pure reducer tests prove pending binding, in-place activity updates, two-run isolation, follow-up preservation, error ownership, stop, and new-research reset.
- Presentation tests prove stable de-duplicated numbering, human web/archive labels, complete Headlines and Big Story Markdown, precise limitation language, and no visible machine IDs.
- Route tests prove source-before-answer ordering, consistent run IDs, optional error correlation, and no stale-artifact emission on a follow-up.
- Static rendered UI evidence proves DOM order `user -> agent work -> answer/packet -> composer`, complete packet sections, collapsed terminal work, accessible controls, and human-readable citations.
- Provider-free browser checks cover the real blank/starter shell at desktop and phone sizes, focus treatment, tap targets, overflow, and console health.
- Impeccable detector, supply-chain check, lint, TypeScript, full Vitest suite, and Next.js production build pass on the final tree.

## Explicit non-goals

- No paid Luna, Grok, embedding, rerank, web-search, or URL call in this phase.
- No persistence, authentication, sidebar/history, deployment, hosted storage, subagent runtime, new model, corpus mutation, speaker attribution, Google Drive integration, or broad tool catalog.
- No invented reasoning transcript and no fixture/demo mode in the production route.

Stop after a clean local commit and hand Jake the exact localhost prompt. Jake owns the first paid live UI acceptance run; only then may its browser state be verified and the phase's live gate be closed.
