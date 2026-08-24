# Phase 4 result — safe web research tools

Status: **PASSED WITH A RECORDED LIVE-SEARCH LIMITATION** on 2026-08-23 HST. Phase 4 stops here. The tools are not wired into the agent or UI, and Phase 5, persistence, hosted infrastructure, and deployment were not started.

## Delivered

The private server now has two bounded, read-only research functions:

- `web_search` builds one fixed OpenRouter Grok 4.6/medium request using the Perplexity engine, ZDR, denied data collection, no provider fallback, one tool use, at most five results, 1,200 characters per result, and 128 output tokens;
- `read_url` retrieves one public HTTP/HTTPS page through a pinned Undici dispatcher, manually validates up to three redirects, extracts text with jsdom and Mozilla Readability, and returns a bounded normalized source record.

Both use `web_<20-character SHA-256 prefix>` identity derived from the normalized candidate/requested URL. Search results remain `candidate` records with `evidence_usable: false`; only successfully retrieved `complete` or `partial` page text becomes usable evidence. External text always carries `trust: "untrusted_external_content"`.

The exports live in `src/lib/web-research/tools.ts` behind `import "server-only"`. Both paid search and URL networking default to unavailable unless `PHASE4_EXECUTE_LIVE=approved`; the unapproved URL state is `network_not_authorized`. Nothing is exposed from `public/`, and the client does not import the server implementation. The pre-existing UI contains display-only labels for future `web_search` and `read_url` activity, but no Phase 4 endpoint, reader, DNS policy, page text, or provider credential enters the client bundle.

## Safety boundary

`read_url` enforces:

- HTTP/HTTPS and default ports only; no credentials, fragments, user headers, cookies, authorization, referrer, browser fallback, proxy, authentication, retry, or paywall bypass;
- rejection of localhost/internal suffixes, metadata destinations, and every address that ipaddr.js does not classify as public unicast, including unusual decimal/hex IPv4 and IPv4-mapped IPv6 forms;
- resolution of every A/AAAA answer, whole-set rejection if any answer is non-public, and a per-invocation socket lookup that uses only the already validated pinned answers;
- manual redirect handling with reparse, DNS re-resolution, and security revalidation on every hop; three redirects and four HTTP requests maximum;
- 3-second connect, 5-second header, 5-second body-idle, and 12-second whole-run timeouts;
- HTML, XHTML, and plain text only; a streamed 2 MiB decoded-body cap; 20,000 DOM elements; 40,000 returned text characters; 600-character excerpts; and 300-character titles;
- jsdom scripts and resources disabled, Readability HTML discarded, and only cleaned text returned.

Typed states cover `complete`, `partial`, `restricted`, `denied`, and `unavailable`. Raw network/provider errors, response bodies, stack traces, reasoning, secrets, and credentials are never copied into a tool result or report. An HTTP 200 soft paywall may still look like short/partial content; Phase 4 does not claim reliable soft-paywall classification.

## Deterministic evidence

All deterministic work passed before the one paid provider request:

| Gate | Result |
| --- | --- |
| URL/IP/DNS/redirect policy | Public, mixed-DNS, internal, unusual-literal, loop, missing-location, unsafe-target, and fourth-redirect cases passed |
| Fetch/extraction | HTML, XHTML, text, restricted/error states, unsupported types, byte caps, all timeout classes, DOM cap, metadata, truncation, script/resource, and prompt-injection cases passed |
| Search boundary | Exact request routing/limits, filters, citation normalization, duplication, malformed/absent annotations, no-match, missing usage, wrong route, timeout, missing key/authority, and sanitized errors passed |
| Integration/security | Stable search-to-read IDs, candidate/evidence separation, server-only boundary, zero-call disabled states, and Phase 3 hashes passed |
| Final deterministic suite before result writing | 12 test files; 69 tests passed |
| Dependency audit | 0 known vulnerabilities across 733 resolved dependencies; no ignored lifecycle builds |
| Supply-chain denylist | Clean across 144 known-bad Mastra versions |

The native Node live launcher initially hit unsupported TypeScript parameter-property syntax before any request. The same syntax recurred once in a later post-proof lock check, also before network execution. Both zero-call failures were corrected, and a six-file Node `--check` regression test now covers every module imported by the live script. These local failures consumed no provider request and no URL read.

## Live proof

The separately approved proof used only the public query `OpenRouter web search server tool documentation result limits` and OpenRouter's public documentation.

| Boundary | Result |
| --- | --- |
| Provider requests | **1 / 1** |
| Web searches | **1 / 1**, Perplexity engine, requested limit 5, 1,200 characters/result, 128 output tokens |
| URL reads | **1 / 1** top-level; **1 / 4** allowed HTTP requests; 0 redirects; 0 retries |
| Total elapsed time | 2,288.61 ms |
| Reported provider cost | Unavailable because the failed response contained no accepted usage receipt |
| Conservative maximum exposure | **$0.02 / $0.10** approved cap |

The search returned `unavailable` with sanitized code `provider_unavailable`: no valid citation, provider identity, usage, or cost receipt survived. The boundary intentionally discarded the raw provider body, so the exact upstream rejection cannot be recovered without spending a prohibited second request. This is a real limitation: Phase 4 proves the search request and parser deterministically, but it does **not** claim successful live Perplexity search compatibility.

The independent `read_url` proof succeeded on `https://openrouter.ai/docs/guides/features/server-tools/web-search`: HTTP 200, `text/html`, one request, zero redirects, 834,335 decoded bytes, title `Web Search Server Tool - Real-Time Web Search for Any Model`, and usable bounded text. The proof report contains metadata only, not the page text.

Evidence is preserved in `reports/phase-4-live.json`. The only Phase 4 paid-call script is now statically locked, and an authority-present command exits before network access. There was no retry.

## Artifact and bundle integrity

Phase 3 artifacts remain unchanged:

| File | SHA-256 |
| --- | --- |
| `data/processed/episodes.jsonl` | `4ceea4085e0bbe36513706f42a7bedf0008ee4b02b52fd7d695b69f585fe219a` |
| `data/processed/segments.jsonl` | `a774dc9e6a1de562105a64c72853ca30ade7bdd54c7e8f84c869eaf6bc8e5155` |
| `data/retrieval/chunks.jsonl` | `c5667e392c8b242ab96c55b1b0f4c10d0dc74e883940cde0c1b78e433f3ecfd8` |
| `data/retrieval/bm25-index.json` | `c58293b55a95aad89621872b9387a285ab7355979fc752269a4fdf76ca7c4e02` |
| `data/retrieval/embeddings.f32` | `ed72ac74f763c9eaab7443400f4a481ae703882b8d20926c0efc5b6f2fc05961` |

The whole `.next` directory was rejected as a bundle metric because its build cache grew across repeated identical gates. The stable production comparison is the substantive client static chunks: **1,225,173 bytes before and 1,225,173 bytes after**, a zero-byte change. Every individual chunk retained the same size, and scans found no Phase 4 endpoint, user-agent, DNS-policy, or body-limit markers. The server implementation is not client-imported.

## Dependencies

Exactly the frozen packages were added:

- runtime: `undici@8.10.0`, `ipaddr.js@2.5.0`, `@mozilla/readability@0.6.0`, and `jsdom@29.1.1`;
- development only, after TypeScript proved it necessary: `@types/jsdom@28.0.3`.

All direct versions are exact. Their direct licenses are MIT except Mozilla Readability's Apache-2.0 license. Registry metadata, engines, package scripts, integrity fields, dependency graph, lockfile, advisories, and ignored builds were inspected; the final audit reports no known vulnerability.

## Limitations

- Live Perplexity search compatibility is not proven; its one authorized request failed without a usable receipt, and no retry was made.
- The exact provider-side charge is unavailable. The $0.02 conservative exposure is a local upper bound, not a provider receipt or provider-enforced hard cap.
- Separate search/read latency was not captured; only the 2.29-second combined live run is recorded.
- Readability cannot extract JavaScript-only pages and may return partial or unavailable for unusual layouts.
- Soft paywalls returning HTTP 200 cannot always be distinguished from naturally short pages.
- DNS pinning prevents private-address rebinding within this reader, but public hosts can still serve misleading or malicious content; all returned text remains explicitly untrusted.
- The tools are not connected to the agent, graph, persistence layer, or UI. That belongs to a separately hardened Phase 5.

## Rollback

Phase 4 is additive. Reverting the Phase 4 commit removes the web-research modules, fixtures/tests, live report, result document, scripts, and five direct dependency additions. Transcript source, processed corpus, and Phase 3 retrieval artifacts remain unchanged.
