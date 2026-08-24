# Phase 2 OpenRouter compatibility plan

Status: zero-spend implementation in progress. Live probes are blocked until the recorded budget is approved and `OPENROUTER_API_KEY` is supplied server-side.

## Frozen model decision

- Model: `x-ai/grok-4.3` through OpenRouter.
- Why this model: it is the lowest-priced current full Grok tier in OpenRouter's live catalog with structured output, tool calling, configurable reasoning, and a one-million-token context window. Its current list price is $1.25 per million input tokens and $2.50 per million output tokens below 200,000 prompt tokens.
- Rejected for this phase: the former `x-ai/grok-4.1-fast` is absent from the live model API; `x-ai/grok-4.6` costs more; `x-ai/grok-4.20` has the same list price but currently reports higher tool-call and structured-output error rates.
- One exact model only. No model fallback, free variant, automatic router, `:online` shortcut, or second provider package.

## Privacy and routing policy

- The key is read only from server-side `OPENROUTER_API_KEY`. It is absent from source, logs, reports, browser payloads, and Git.
- Each request sets `allow_fallbacks: false`, `require_parameters: true`, `data_collection: "deny"`, and `zdr: true`.
- Each request rejects endpoints priced above $1.25/M input or $2.50/M output.
- All inputs are synthetic. Phase 2 sends no transcript, podcast, personal, or unpublished material.

## Exact live probe budget

- Maximum provider requests: 4 total.
  1. One streamed strict JSON-schema response, maximum 256 output tokens.
  2. One streamed forced call to the local deterministic `double_number` tool, maximum 128 output tokens.
  3. One streamed follow-up containing the local result, maximum 256 output tokens.
  4. One streamed OpenRouter web-search server-tool response, maximum 384 output tokens.
- Web search: Exa `instant`, one search maximum, three results maximum, 1,200 extracted characters per result, and `openrouter.ai` only.
- Request timeout: 45 seconds each.
- Phase hard cap: `$0.03` total. The runner stops before a fifth request and stops after any response that brings reported cumulative cost over the cap.
- Expected spend is roughly one to two cents. No retry is automatic; any failed request consumes its slot and ends the probe.

## Required evidence

- Exact returned model/provider identifiers.
- Time to first stream event and total latency.
- Prompt, completion, reasoning/search usage when returned, and exact OpenRouter-reported cost.
- Validated structured object.
- Validated local tool name, arguments, result, and final acknowledgement.
- Exactly one recorded web search and at least one URL citation.
- Typed, key-safe failure if any capability is unavailable.

## Gate

Phase 2 passes only if all four bounded requests succeed, the model remains `x-ai/grok-4.3`, citations and usage survive the stream, exact total spend remains below `$0.03`, and no secret enters the report. Stop before transcript retrieval or other Phase 3 work.

## Primary references checked on 2026-08-23

- OpenRouter live models API: https://openrouter.ai/api/v1/models
- Grok 4.3 model page: https://openrouter.ai/x-ai/grok-4.3
- Structured outputs: https://openrouter.ai/docs/guides/features/structured-outputs
- Web-search server tool: https://openrouter.ai/docs/guides/features/server-tools/web-search
- Provider routing: https://openrouter.ai/docs/guides/routing/provider-selection
- Usage accounting: https://openrouter.ai/docs/cookbook/administration/usage-accounting
