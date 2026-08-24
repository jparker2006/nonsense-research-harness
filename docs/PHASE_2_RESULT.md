# Phase 2 compatibility result

Status: **PASSED WITH RECORDED LIMITATIONS**

Date: 2026-08-23 Hawaii / 2026-08-24 UTC

## Outcome

The pinned two-model boundary works. GPT-5.6 Luna at max effort produced streamed strict structured output and completed a local function-tool round-trip. Grok 4.6 at medium effort completed one native web-search action and returned 18 official OpenRouter citations through the stream.

No transcript, podcast, personal, or unpublished material was sent. Every request used synthetic compatibility prompts. Approximate cumulative OpenRouter spend across all Phase 2 attempts was `$0.128309`, below Jake's revised `$1.00` phase budget. Live calls are disabled again in code.

## Attempt ledger

1. Luna with ZDR: rejected before inference because Luna has no ZDR endpoint. Reported spend: `$0.00`.
2. Luna non-ZDR full probe: strict structured output and the forced tool call passed; an inconsistent prompt/validator contract stopped the run. Spend: `$0.000547`.
3. Three-request repair: Luna called `double_number(21)` and returned exactly `42`. Grok with the beta Exa server-tool path returned HTTP 500 before output or reported cost. Spend: `$0.000078`.
4. First Grok native-search capture: completed for `$0.065606`, but the old post-response budget check rejected the result before recording its evidence.
5. Final Grok native-search capture, authorized within the revised `$1.00` phase budget: completed for `$0.062078` in 19.3 seconds, with 27,486 prompt tokens, 987 completion tokens, and 18 URL citations.

## Proven

- Light model: `openai/gpt-5.6-luna`, reasoning effort `max`
- Heavy model: `x-ai/grok-4.6`, reasoning effort `medium`
- Exact deterministic routing with model/provider fallback disabled
- Streamed strict JSON-schema output
- Function call `double_number({"value":21})` and exact final result `42`
- One Grok native web-search action bounded by top-level `max_tool_calls: 1`
- Citation, text, timing, token usage, cost, model, provider, and completion metadata survive the provider stream
- Server-only key handling; no key or transcript content entered reports or Git

## Recorded limitations

- Luna has no ZDR endpoint on OpenRouter. Jake explicitly accepted possible provider retention for light-tier work; the application must disclose it.
- Grok native search controls its own retrieval context. One constrained official-documentation query consumed 27,486 prompt tokens and `$0.062078`, so it should be treated as a roughly six-cent observed search—not a sub-cent operation.
- The successful Grok usage payload omitted `server_tool_use.web_search_requests`. The validator therefore accepts the 18 citations plus the request's enforced `max_tool_calls: 1` as proof of one bounded search. If OpenRouter returns the counter, it must equal one.
- A local post-response spend check is not a provider-enforced dollar ceiling. Deployed usage still needs an account/workspace spending guardrail.
- The Exa server-tool path returned HTTP 500 in this test. The proven Phase 2 path is Grok native search.
- Phase 2 proves the provider-stream boundary, not the finished UI integration. Wiring real model/tool events into the visible application remains a later build phase.

## Gate decision

Phase 2 passes under the revised `$1.00` approval. Required model capabilities worked, citation and usage evidence survived the stream, cumulative spend stayed within the revised budget, and the saved artifacts contain no secret. Stop here before Phase 3.
