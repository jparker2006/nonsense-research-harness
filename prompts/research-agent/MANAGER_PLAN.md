Create the initial plan for the current user turn.

{{MODE_POLICY}}

CURRENT USER MESSAGE:
{{CURRENT_MESSAGE}}

RECENT CONVERSATION:
{{CONVERSATION}}

SAVED USABLE AND UNAVAILABLE EVIDENCE:
{{EVIDENCE}}

SERIALIZABLE RESEARCH NOTEBOOK:
{{NOTEBOOK}}

CURRENT PREPARATION BRIEF:
{{ARTIFACT}}

BUDGET:
{{BUDGET}}

Return a compact goal and a real dependency graph. Make independent tasks dependency-free so the scheduler can run them together. Use dependencies only when one task genuinely needs another task's result. Keep each task bounded around one answerable research question and give it observable success criteria.

If the request can be answered naturally from conversation or saved evidence without new research, return no tasks and include direct_answer. If fulfilling the request would materially expand its topic, deliverable, people, or allegation, return scope_question and do not manufacture research tasks. A preparation brief mode may be selected only when the current message explicitly requests it.

If the current message explicitly corrects a factual premise, name, date, source interpretation, or prior answer, preserve the correction verbatim in user_correction. Otherwise return null. Do not infer a correction merely because the user asks a follow-up.

When the current message explicitly requests a preparation brief, include a transcript-archive coverage task unless the user explicitly excludes past coverage.
