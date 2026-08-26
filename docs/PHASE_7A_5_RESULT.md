# Phase 7A.5 — Conversational UI polish result

## Outcome

Phase 7A.5 passes its bounded local gate. It repairs two presentation defects found during Jake's accepted Phase 7A.4 live run without changing the agent loop, model policy, tools, evidence contracts, transcript corpus, provider limits, or persistence boundary.

Ordinary answers now render a deliberately tiny safe formatting subset: paired `**bold emphasis**`. All other content remains React-escaped text; raw HTML is not interpreted. This preserves the concise answer hierarchy the model produced without adding a general Markdown renderer or expanding the browser attack surface.

The active observable-work line now contains one readable action label. Its left-to-right highlight is a separate empty decorative layer with `aria-hidden="true"`; it no longer duplicates the label through CSS-generated content. Completed actions remain quiet one-line summaries, details remain expandable, and reduced-motion users receive a static active color with no sweep.

## Preserved behavior

- The chronological order remains user request, observable work, natural cited answer or explicitly requested brief, then composer.
- Near-bottom auto-follow, immediate pause after user scrolling, completion positioning, and **Jump to latest** remain unchanged and regression-covered.
- Follow-up research remains isolated to its legitimate run while reusing the same bounded evidence workspace.
- A Headlines or Big Story brief is still created or revised only when the current user turn explicitly asks for one.
- Machine source IDs stay internal; readable numbered article and episode references remain clickable.
- No provider request, web request, retry, corpus mutation, dependency, schema change, new model, subagent, persistence, deployment, or hosted infrastructure was added.

## Verification

- Focused UI suite: 15/15 tests pass.
- Full `pnpm gate` passes:
  - supply-chain denylist: 144 known-bad versions checked;
  - ESLint: pass;
  - TypeScript: pass;
  - Vitest: 24 files and 207 tests pass;
  - Next.js 16.3.2 production build: pass.
- Safe rendering regression proves bold emphasis becomes `<strong>`, literal Markdown markers disappear, and raw HTML remains escaped.
- Observable-work regression proves the active label appears exactly once, has no `data-label` duplicate, and the empty highlight layer is assistive-technology-hidden.
- Existing deterministic gates continue to prove legitimate follow-up research, explicit-only brief creation/revision, retained-artifact isolation, responsive controls, reduced motion, and auto-follow behavior.
- The Impeccable detector reports no findings for the changed component and stylesheet.
- Real localhost browser checks at desktop and narrow layout show no horizontal overflow and zero console warnings/errors. Because a reload correctly starts a fresh in-memory conversation, answer/work state verification used the production React component with frozen local data rather than a paid provider call or a hidden browser fixture.

## Gate and next decision

Phase 7A.5 is ready for Jake's visual acceptance when he is back at the laptop. If accepted, freeze Phase 8's inputs, rubric, providers, and total budget before making comparison calls. Persistence, deployment, sidebars/history, extra tools, subagents, and model routing remain deferred until usefulness is proven.
