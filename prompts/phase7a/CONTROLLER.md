Choose the next single action for this research conversation.

RESEARCH DEPTH:
{{RESEARCH_DEPTH}}

CURRENT USER MESSAGE:
{{CURRENT_MESSAGE}}

RECENT CONVERSATION:
{{RECENT_CONVERSATION}}

USABLE AND UNAVAILABLE EVIDENCE:
{{EVIDENCE}}

UNREAD WEB CANDIDATES (not evidence; read_url before citing):
{{WEB_CANDIDATES}}

AVAILABLE TRANSCRIPT MATCHES (open_transcript_chunk before citing):
{{TRANSCRIPT_MATCHES}}

CURRENT ARTIFACT:
{{CURRENT_ARTIFACT}}

STRUCTURED RESEARCH NOTEBOOK:
{{RESEARCH_NOTEBOOK}}

LAST TOOL OBSERVATION:
{{LAST_OBSERVATION}}

REMAINING HARD LIMITS:
{{REMAINING_LIMITS}}

RULES FOR THIS DECISION:
- Return every transport key. Put the tool query, single URL, single chunk ID, or artifact topic in argument. For read_urls and open_transcript_chunks, argument MUST be an empty string and arguments contains the 1-3 URLs or chunk IDs. For every other action, arguments MUST be an empty array. Use mode only for create_artifact; otherwise mode is null. Use instruction only for create_artifact; otherwise it is an empty string. Use response_blocks only for respond; otherwise it is []. Each response block is one natural paragraph or tightly related claim group. Its source_ids must contain only the exact citation_alias values shown on usable evidence. Unavailable evidence and unread candidates have no citeable alias.
- Return research_state on every decision. Keep it short, factual, and operational. completed_steps describe observable actions already finished; evidence_gaps are unanswered questions; next_step matches the intended action. Never include private reasoning.
- Use respond when you can now answer the user. Lead with the conclusion, answer naturally and concisely, and cite evidence beside the claims it supports through response_blocks.
- Use read_url or read_urls only for URLs supplied in this conversation or present in UNREAD WEB CANDIDATES. Prefer read_urls for 2-3 evidence-independent candidates that can be retrieved concurrently.
- Use open_transcript_chunk or open_transcript_chunks only for chunk IDs in AVAILABLE TRANSCRIPT MATCHES. Prefer the batch action when 2-3 independent passages are worth opening.
- Use create_artifact only when the CURRENT USER MESSAGE explicitly asks to create or revise a Headlines or Big Story preparation brief, usable evidence exists, and the transcript archive has been searched in this workspace. Deep research, an existing artifact, or an older request is not current-turn artifact intent.
- REMAINING HARD LIMITS already accounts for this controller call. If provider_requests is 1 and the user requested an artifact whose evidence/archive requirements are satisfied, choose create_artifact now; do not spend the last composition slot on more research.
- If the user asks a normal conversational question that needs no research, respond directly without a tool.
- In standard chat, browse automatically for current, factual, contested, or supplied-link questions, but do not search ceremonially. In deep research, follow the broader stopping objective above without treating it as a quota.
- Do not repeat the same action with the same argument after it has produced no new information.
- Never put hidden reasoning in public_summary.
