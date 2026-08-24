# Phase 2 OpenRouter compatibility plan

Status: completed and superseded by `PHASE_2_RESULT.md`. The compatibility gate passed under Jake's revised `$1.00` phase budget. All live provider calls are disabled after proof.

The second run proved Luna structured output and the forced local tool call, then stopped because the test prompt prohibited a direct answer while the validator required the literal result `42`. Spend was `$0.000547`; Grok was not called. The repaired prompt required exactly `42`.

The three-request repair proved Luna's complete tool round-trip for `$0.000078`. Its final Grok/Exa server-tool request returned HTTP 500 before producing output or reported cost. Two separately approved Grok native-search captures then completed for `$0.065606` and `$0.062078`. The final capture preserved 18 citations and complete usage metadata. xAI native search does not expose deterministic result-count or excerpt-size controls; `max_tool_calls: 1` is the enforced search-action bound. Phase 4 can select a directly controlled search backend if exact result-size limits become necessary.

## Frozen model decision

- Light model: `openai/gpt-5.6-luna` at `max` reasoning effort for structured output, routine transformations, and local tool orchestration. Current list price: $0.20/M input and $1.20/M output.
- Heavy model: `x-ai/grok-4.6` at `medium` reasoning effort for deep research and synthesis. Current list price: $2/M input and $6/M output.
- Selection is deterministic in code; the model does not choose the tier. There is no automatic router, model fallback, free variant, `:online` shortcut, or extra provider package.
- Reasoning is used but excluded from returned payloads and reports. The interface will show actions and results, not private reasoning traces.

## Privacy and routing policy

- The key is read only from server-side `OPENROUTER_API_KEY`. It is absent from source, logs, reports, browser payloads, and Git.
- Each request sets `allow_fallbacks: false`, `require_parameters: true`, and `data_collection: "deny"`.
- Grok requires `zdr: true`. Luna has no ZDR endpoint on OpenRouter; Jake explicitly accepted possible provider retention for Luna light-tier work. Reasoning traces remain excluded.
- Luna requests reject endpoints above $0.20/M input or $1.20/M output. Grok requests reject endpoints above $2/M input or $6/M output.
- All inputs are synthetic. Phase 2 sends no transcript, podcast, personal, or unpublished material.

## Exact live probe budget

- Historical preflight: one unbilled request was rejected with HTTP 404 before inference because no Luna ZDR endpoint exists.
- Fresh-run maximum: 4 provider requests. No automatic retry occurs inside the run.
  1. Luna/max: one streamed strict JSON-schema response, maximum 256 output tokens.
  2. Luna/max: one streamed forced call to the local deterministic `double_number` tool, maximum 128 output tokens.
  3. Luna/max: one streamed follow-up containing the local result, maximum 256 output tokens.
  4. Grok 4.6/medium: one streamed OpenRouter web-search server-tool response, maximum 384 output tokens.
- Web search: Grok native search, one server-tool action maximum via top-level `max_tool_calls: 1`, and `openrouter.ai` only. Native xAI search controls its own result count and context size.
- Request timeout: 45 seconds each.
- Revised approved phase budget: `$1.00` total. The runner stops before exceeding its configured request count and reports cost after every response.
- A post-response budget check is not a provider-side hard cap. The observed Grok native-search cost was about six cents per request because native retrieval supplied a large input context.

## Required evidence

- Exact returned model/provider identifiers.
- Time to first stream event and total latency.
- Prompt, completion, reasoning/search usage when returned, and exact OpenRouter-reported cost.
- Validated structured object.
- Validated local tool name, arguments, result, and final acknowledgement.
- Exactly one bounded web search, evidenced by the provider usage counter when present or by citations plus the enforced one-action request bound when OpenRouter omits that counter.
- Typed, key-safe failure if any capability is unavailable.

## Gate

Phase 2 passes because the required bounded probes succeeded on their exact assigned model and reasoning tier, citations and usage survived the stream, cumulative spend remained below the revised `$1.00` approval, and no secret entered the report. Stop before transcript retrieval or other Phase 3 work.

## Primary references checked on 2026-08-23

- OpenRouter live models API: https://openrouter.ai/api/v1/models
- GPT-5.6 Luna model page: https://openrouter.ai/openai/gpt-5.6-luna
- Grok 4.6 model page: https://openrouter.ai/x-ai/grok-4.6
- Reasoning effort: https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
- Structured outputs: https://openrouter.ai/docs/guides/features/structured-outputs
- Web-search server tool: https://openrouter.ai/docs/guides/features/server-tools/web-search
- Provider routing: https://openrouter.ai/docs/guides/routing/provider-selection
- Usage accounting: https://openrouter.ai/docs/cookbook/administration/usage-accounting
