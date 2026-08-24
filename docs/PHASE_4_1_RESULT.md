# Phase 4.1 result — live web-search repair

Status: **PASSED** on 2026-08-23 HST. Grok native search found an official NASA page published 3 hours 49 minutes before the successful probe, and the safe reader independently retrieved it. The launcher is locked. Phase 5, agent wiring, UI work, persistence, hosted infrastructure, and deployment were not started.

## What changed

The server-only `web_search` adapter still uses the one approved heavy model, `x-ai/grok-4.6` at medium reasoning through OpenRouter with ZDR, denied data collection, no provider/model fallback, and the existing price ceiling. Phase 4.1 changed the search engine from Perplexity to Grok's native SpaceXAI search after both Perplexity and Exa returned the same OpenRouter HTTP 500.

The current OpenRouter contract says a server-tool model decides whether to search. It does not document `tool_choice: "required"` for this server tool, so that field was removed. Native SpaceXAI search ignores provider-side result-count, result-context, and `max_uses` controls. The runtime therefore retains top-level `max_tool_calls: 1`, code-validates the requested result limit, and slices returned citations to at most five. The maximum model output was restored from 128 to the previously proven 384 tokens.

xAI's successful native responses again omitted `server_tool_use.web_search_requests`. The runtime accepts one of two proofs:

- an exact usage counter of one; or
- for native search only, at least one validated URL citation plus the request's one-tool-action bound.

If a usage counter is present and is not exactly one, the result is rejected. If neither proof exists, the function returns sanitized `unavailable`. Proof failures now retain safe model/provider/token/cost receipt fields instead of discarding them.

## Diagnosis and live evidence

All deterministic work passed before each paid repair probe. The complete sequence is retained rather than hiding failures:

| Request | Engine | Outcome | Latency | Reported cost |
| --- | --- | --- | ---: | ---: |
| 1 | Perplexity | OpenRouter HTTP 500 | 1.53 s | unavailable |
| 2 | Exa | OpenRouter HTTP 500 | 1.48 s | unavailable |
| 3 | Native | Model did not produce a citation under the old 128-token ceiling; rejected as `search_not_proven` | 17.84 s | unavailable |
| 4 | Native | Search proved, but broad “newest page” wording returned the NASA Earth landing page rather than the newest article | 36.67 s | $0.026220 |
| 5 | Native | Exact current-title search found and retrieved the freshness canary | 23.80 s | $0.023394 |

The canary came from NASA's official release feed, last built at `2026-08-24 04:01 UTC`: `What Lake Bonneville Left Behind`. At `2026-08-24 07:50 UTC`, Grok returned the exact official URL:

`https://science.nasa.gov/earth/earth-observatory/what-lake-bonneville-left-behind/`

`read_url` then independently returned HTTP 200, zero redirects, the title `What Lake Bonneville Left Behind - NASA Science`, and publication time `2026-08-24T00:01:00-04:00`. The proof report stores only source and receipt metadata, not page text.

## Cost and request boundary

- Provider requests: **5 / 5**, with separately approved extensions after diagnostics.
- Automatic retries: **0**.
- Provider-reported cost from the two successful receipted searches: **$0.049614**.
- Three missing cost receipts: Perplexity HTTP 500, Exa HTTP 500, and the first native no-citation response.
- Conservative unreceipted upper bound: **$0.092000**.
- Conservative total upper bound: **$0.141614 / $0.20**.

The conservative bound is local and not a provider-enforced total-dollar cap. OpenRouter documents zero-token/error insurance for inference, while auxiliary search work may still be billed; the report therefore does not call the missing-receipt attempts free.

## Deterministic evidence

The repair tests cover the native request contract, absent forced-tool selection, present and absent usage counters, rejection of counters above one, provider-receipt preservation, invalid inputs, disabled provider states, malformed streams/annotations, timeouts, routing, citation normalization, candidate caps, and secret/body redaction. The immutable evidence test checks every live attempt, the exact canary and reader receipt, the cost ceiling, the locked launcher, and native Node compatibility.

Phase 3 artifacts remain byte-identical:

| File | SHA-256 |
| --- | --- |
| `data/processed/episodes.jsonl` | `4ceea4085e0bbe36513706f42a7bedf0008ee4b02b52fd7d695b69f585fe219a` |
| `data/processed/segments.jsonl` | `a774dc9e6a1de562105a64c72853ca30ade7bdd54c7e8f84c869eaf6bc8e5155` |
| `data/retrieval/chunks.jsonl` | `c5667e392c8b242ab96c55b1b0f4c10d0dc74e883940cde0c1b78e433f3ecfd8` |
| `data/retrieval/bm25-index.json` | `c58293b55a95aad89621872b9387a285ab7355979fc752269a4fdf76ca7c4e02` |
| `data/retrieval/embeddings.f32` | `ed72ac74f763c9eaab7443400f4a481ae703882b8d20926c0efc5b6f2fc05961` |

## Limitations

- OpenRouter's server-tool model can still decline to search. The runtime reports that honestly; Phase 5 may use its single evidence-repair loop to sharpen the query, not silently accept model prose.
- Broad “find the newest page” wording returned a section landing page. Exact headline/topic wording found the hours-old article. This fits the planned podcast intake, which starts from topics, headlines, links, or rough notes, but it is not proof that every vaguely phrased current-events query will find the newest source.
- Native SpaceXAI search does not give the caller exact provider-side result-count or context-size limits, and its injected search context affects latency and token cost. Returned candidates remain locally capped.
- xAI citation titles were the low-quality string `1`; the independent reader recovered the correct page title. Search annotations are discovery candidates, not evidence.
- Perplexity and Exa server-tool compatibility with Grok remain unavailable after identical HTTP 500 responses.
- Three attempts lack provider cost receipts, so only the conservative upper bound is safe to use.

## Artifacts

- Live diagnostic and proof: `reports/phase-4-1-web-search.json`
- Locked one-shot launcher: `scripts/run-phase4-1-web-search.ts`
- Runtime and deterministic tests: `src/lib/web-research/web-search.ts`, `tests/web-search.test.ts`
- Immutable evidence test: `tests/phase4-1-evidence.test.ts`

Rollback is additive: revert the Phase 4.1 commit to restore the historical Phase 4 Perplexity adapter. Corpus, retrieval artifacts, and source transcripts are unchanged.
