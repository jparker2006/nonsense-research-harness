# Phase 7A prompts

These Markdown files are the editable source of truth for the active conversational research agent:

- `SYSTEM.md` — global research-agent behavior and boundaries.
- `CONTROLLER.md` — the dynamic observe/decide/action prompt. `{{PLACEHOLDER}}` values are filled by code for each controller turn.
- `DEEP_RESEARCH.md` — the additional stopping objective used only when Deep research is selected.
- `ARTIFACT.md` — shared strict validation and evidence instructions for requested briefs; `{{MODE}}` is filled by code.
- `HEADLINES_BRIEF.md` — instructions added when an explicit Headlines brief is requested.
- `BIG_STORY_BRIEF.md` — instructions added when an explicit Big Story brief is requested.

Code still owns schemas, allowed tools, URL safety, citation validation, budgets, stop conditions, and artifact validation. Editing prose here cannot expand the agent's permissions.
