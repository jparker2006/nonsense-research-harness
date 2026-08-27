# Research agent prompts

These server-only Markdown files keep the current prompt and superseded prompt evidence readable.

- `ONE_AGENT.md`: **sole active production system prompt** for Standard, Deep, and explicitly requested Working Artifacts
- `ONE_AGENT_DRAFT.md`: approved design copy retained for provenance; its text was activated in `ONE_AGENT.md`

- `STANDARD_AGENT.md`, `SYSTEM.md`, `MANAGER_PLAN.md`, `MANAGER_REVIEW.md`, `WORKER.md`, `ANSWER.md`, `STANDARD.md`, `DEEP.md`, and `FALLBACK.md`: **superseded historical/test-fixture prompts**. The live dependency factory cannot select their runtimes.

Code remains authoritative for tools, schemas, URL policy, citations, budgets, cancellation, artifact authorization, and provider routing. Deep Research and explicit-artifact turns receive only small runtime instructions layered onto the same `ONE_AGENT.md` identity.

The same loop also uses a server-internal `submit_answer` boundary so natural paragraphs carry exact numbered citations before rendering. It is not a second prompt, model, or research tool.
