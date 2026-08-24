# Phase 4 — safe research tools plan

Status: executed on 2026-08-23 HST. Completion evidence and the live-search limitation are in `docs/PHASE_4_RESULT.md`. Phase 5, deployment, and hosted infrastructure remain out of scope.

Phase 4 builds two read-only server tools: one to discover current sources and one to retrieve a supplied or discovered article. It does not build the agent graph, alter the UI, add persistence, deploy, or begin Phase 5.

## Outcome

The server can:

1. run one bounded OpenRouter web search and return normalized source candidates; and
2. safely retrieve one public HTML/text page and return bounded readable text.

Both tools return the same stable source identity and honest typed states. Search candidates are discovery aids, not verified evidence. A source becomes usable evidence only after `read_url` successfully retrieves the page text.

## Frozen architecture

### `web_search`

- Endpoint: OpenRouter chat completions through the existing server-only provider boundary.
- Model: `x-ai/grok-4.6`, medium reasoning, with reasoning excluded.
- Search engine: `perplexity`, not native/auto search.
- Provider policy: ZDR required, data collection denied, model/provider fallback disabled, and the existing Grok price ceiling retained.
- Exactly one search action per tool invocation: `max_uses: 1` and top-level `max_tool_calls: 1`.
- Force the server search tool. If OpenRouter cannot honor forced use, return `unavailable`; do not silently run an ungrounded model response.
- Result limit: integer 1–5, default 5. Send both `max_results` and `max_total_results` equal to the code-validated limit.
- Context limit: fixed `max_characters: 1200` per result. The model cannot raise it.
- Maximum model output: 128 tokens. The model's prose is discarded; only validated `url_citation` annotations and the usage receipt survive.
- Timeout: 45 seconds.
- No automatic retry.

Perplexity is frozen because OpenRouter documents ranked web results, exact result/context controls, domain filtering, and a $0.005 search charge. The Phase 2 native Grok route remains proven but is rejected for this tool because it used about $0.06 and ignored exact result/context limits.

Input:

```ts
type WebSearchInput = {
  query: string;            // trimmed, 3–300 characters
  limit?: number;           // integer 1–5, default 5
  allowed_domains?: string[]; // optional, exact host or leading wildcard, max 5
  excluded_domains?: string[]; // optional, exact host or leading wildcard, max 5
};
```

Allowed and excluded domains are mutually exclusive. Invalid filters fail before any provider request.

Output status:

- `complete`: the provider completed and at least one valid candidate survived validation;
- `partial`: valid candidates survived alongside malformed/unsupported provider annotations;
- `no_match`: a search action is proven but produced no valid URL citation;
- `unavailable`: configuration, provider, timeout, stream, or proof-of-search failure.

### `read_url`

- Runtime: Node only; server-only module.
- HTTP client: pinned Undici with one per-invocation dispatcher. Do not mutate the process-global dispatcher.
- Redirects: manual, maximum 3. Reparse, re-resolve, and revalidate every hop.
- DNS: a custom Undici connection lookup resolves all A/AAAA addresses, rejects the whole hostname if any answer is not public unicast, and passes one already-validated address to the socket. This removes the validate-then-resolve gap and covers DNS rebinding/pinning.
- Methods: GET only. Send no cookies, authorization, referrer, or user-supplied headers.
- Schemes: `http:` and `https:` only.
- Ports: default 80/443 only.
- Reject URL credentials, fragments are stripped, and URLs longer than 2,048 characters fail.
- Reject localhost and internal-style hostnames before DNS, including `.localhost`, `.local`, `.internal`, `.lan`, and `.home`.
- Reject every non-public IPv4/IPv6 range, including loopback, private/unique-local, link-local, carrier-grade NAT, unspecified, multicast, reserved/documentation, and IPv4-mapped private IPv6.
- Explicitly reject cloud metadata addresses/hostnames; the generic address policy remains the primary defense.
- Connect timeout: 3 seconds.
- Header timeout: 5 seconds.
- Body idle timeout: 5 seconds.
- Whole invocation timeout: 12 seconds across redirects.
- Maximum decoded response body: 2 MiB. Abort while streaming when crossed; do not rely only on `Content-Length`.
- Accepted content types: `text/html`, `application/xhtml+xml`, and `text/plain`, with an optional charset.
- Reject PDF, JSON, XML other than XHTML, images, audio, video, archives, and unknown types.
- HTML parser: jsdom with script execution and resource loading disabled.
- Article extraction: Mozilla Readability with `maxElemsToParse: 20_000`.
- Return text only. Readability HTML is never stored, logged, sent to the browser, or rendered, so Phase 4 does not add DOMPurify.
- Maximum returned readable text: 40,000 characters; maximum excerpt: 600 characters; maximum title: 300 characters.
- No browser/JavaScript fallback, paywall bypass, proxy, authentication, archive fallback, or automatic retry.

Input:

```ts
type ReadUrlInput = {
  url: string;
};
```

Output status:

- `complete`: Readability/plain-text extraction returned at least 500 useful characters;
- `partial`: 200–499 useful characters or a valid article was truncated at 40,000 characters;
- `restricted`: HTTP 401, 402, 403, or 451;
- `denied`: URL, hostname, DNS address, redirect, port, scheme, or content-type policy rejection;
- `unavailable`: timeout, network error, other HTTP error, oversized body, empty body, or extraction failure.

A soft paywall that returns HTTP 200 may only be detected as short/partial content. Phase 4 will record that limitation rather than pretend to bypass or reliably classify every paywall.

## Frozen dependencies

Only these exact additions are allowed after dependency-install approval:

- `undici@8.10.0` — maintained Node.js HTTP client and injectable dispatcher/lookup boundary;
- `ipaddr.js@2.5.0` — maintained IPv4/IPv6 parsing and range classification;
- `@mozilla/readability@0.6.0` — Firefox Reader View extraction; includes the fix for CVE-2025-2792;
- `jsdom@29.1.1` — Mozilla Readability's documented Node DOM implementation, compatible with the project's current Node 24.9 runtime;
- `@types/jsdom@28.0.3` as a development-only TypeScript definition package if compilation requires it.

`jsdom@30.0.1` is intentionally rejected because it requires Node 24.15 or newer while the current project runtime is Node 24.9. The lighter LinkeDOM implementation is not selected because Mozilla documents and tests the jsdom integration directly; extraction correctness is worth the larger local package.

Before normal installation: inspect tarball metadata, lifecycle scripts, transitive dependencies, licenses, advisories, and the resulting lockfile. After installation: run `pnpm audit`, the existing supply-chain denylist, and a production bundle-size comparison. No floating versions.

## Normalized source contract

Both tools emit the same safe base record:

```ts
type WebSourceRecord = {
  source_id: string; // web_<first 20 hex chars of SHA-256(normalized requested/candidate URL)>
  source_kind: "search_candidate" | "retrieved_page";
  availability: "candidate" | "complete" | "partial" | "restricted" | "denied" | "unavailable";
  url: string;
  requested_url?: string;
  final_url?: string;
  title: string | null;
  excerpt: string | null;
  text?: string;
  retrieved_at: string;
  trust: "untrusted_external_content";
  evidence_usable: boolean;
  receipt: {
    http_status?: number;
    content_type?: string;
    bytes?: number;
    redirects?: number;
    provider_model?: string;
    provider_name?: string;
  };
  failure?: { code: string; message: string };
};
```

URL normalization uses the platform `URL` parser, lowercases/normalizes the host, removes the fragment and default port, and otherwise preserves path/query semantics. Search candidates use `availability: "candidate"` and `evidence_usable: false` even when they include a snippet. `read_url` sets evidence usable only when it returns bounded source text.

The normalized search-candidate/requested URL is authoritative for source identity, so opening a candidate preserves its ID even when the server redirects. The final fetched URL is separately preserved and controls every security decision. A page-declared canonical URL may be returned as metadata only when it is syntactically valid, HTTP(S), and same-origin; it is never fetched automatically.

## Untrusted-content boundary

- Page text and search snippets are evidence data, never system/developer instructions.
- The tools do not interpret or execute instructions found in content.
- jsdom scripts and external resources stay disabled.
- Returned records always carry `trust: "untrusted_external_content"`.
- Phase 5 must place retrieved text in a clearly delimited evidence field and may not grant it tool, policy, or permission authority.
- Prompt-injection phrases are preserved as source text for honest citation but cannot trigger a tool call during Phase 4.
- No raw HTML, response body, provider error, secret, cookie, model reasoning, or private trace enters client output or Git.

## Deterministic implementation order

1. Reverify clean `main`, exact `origin/main`, Node/pnpm versions, existing corpus hashes, and Phase 3 gate.
2. Review and install only the frozen exact dependencies after approval.
3. Freeze schemas, limits, source-ID normalization, and typed failure codes.
4. Implement/test URL parsing and IPv4/IPv6 public-address classification without network access.
5. Implement/test the pinned Undici lookup boundary, manual redirects, timeouts, streaming byte cap, and content-type policy using injected DNS and mocked dispatchers.
6. Implement/test jsdom + Readability extraction with scripts/resources disabled and bounded text-only output.
7. Implement/test the OpenRouter Perplexity search request and streamed annotation parser using recorded fixtures only.
8. Normalize both tool outputs and expose `web_search` and `read_url` from a server-only module.
9. Run the separately authorized live smoke within the frozen boundary.
10. Lock Phase 4 live-call scripts, run the full gate, write `docs/PHASE_4_RESULT.md`, update `BUILD_TODO.md`, commit once, and push the exact passing private `origin/main`.

All deterministic implementation and tests run before any live network or provider call.

## Required deterministic tests

### URL and SSRF

- valid HTTP/HTTPS URLs and normalized fragments/default ports;
- invalid URLs, credentials, unsupported schemes, custom ports, and overlong input;
- localhost names and IPv4/IPv6 literals in every denied class;
- decimal/hex/IPv4-mapped normalization cases;
- DNS returning one safe address, multiple safe addresses, a mixed safe/private set, no answers, and failure;
- safe redirects, redirect loops, missing/invalid locations, unsafe redirect targets, and the fourth redirect;
- proof that validation occurs inside the socket lookup and at every redirect hop.

### Fetch and extraction

- normal HTML article, XHTML, and plain text;
- canonical/title/byline/date extraction and stable source IDs;
- 401/402/403/451, 404/500, empty bodies, unsupported PDF/JSON/image types;
- oversized `Content-Length` and a streamed body that crosses 2 MiB;
- connect/header/body/whole-run timeouts;
- Readability failure, short partial content, 40,000-character truncation, and excessive DOM elements;
- script/resource tags never execute or fetch;
- prompt-injection text remains marked untrusted and causes no action;
- raw errors/bodies cannot leak through failure receipts.

### Search

- exact Grok/Perplexity/ZDR routing and no fallback;
- one search use, one provider request, limit 1–5, 1,200 characters/result, 128 output tokens, and 45-second timeout;
- valid, duplicate, malformed, content-less, and absent URL citations;
- optional domain validation and mutual exclusion;
- complete, partial, no-match, timeout, provider-error, malformed-stream, and missing-usage states;
- model prose/reasoning discarded; normalized citations and sanitized usage retained;
- missing key or live authority fails before fetch.

### Integration and security

- search candidate → `read_url` preserves one stable source ID;
- only a retrieved page is evidence usable;
- both tools are server-only and absent from client bundles/public assets;
- provider/network-disabled fixture suite passes;
- Phase 3 corpus and retrieval hashes remain unchanged.

## Frozen live-proof boundary

Jake selected this proposed live boundary for the later execution goal:

- OpenRouter budget: **$0.10 total**.
- Provider calls: **1 maximum**.
- Web searches: **1 maximum**, Perplexity engine, up to 5 results, up to 1,200 characters/result.
- Model: Grok 4.6 medium/ZDR, maximum 128 output tokens.
- URL reads: **1 top-level invocation**, maximum 4 total HTTP requests including redirects.
- No retries.
- Synthetic/public query only; no transcript, private notes, supplied unpublished material, or personal data.
- Record model/provider/search engine, result count, citations, tokens, cost, latency, HTTP hops/status/content type/bytes, and sanitized failures.
- Stop after any response that crosses the budget; the local budget is not a provider-enforced hard ceiling.
- Lock all Phase 4 live-call paths after evidence generation.

The planned smoke searches OpenRouter's official documentation domain for its web-search server tool and reads the cited official documentation page. It proves integration without introducing private project content.

## Phase 4 gate

Phase 4 completes only when:

- every deterministic SSRF, redirect, size, timeout, content-type, extraction, prompt-injection, normalization, provider, and degraded-state test passes;
- search candidates cannot masquerade as retrieved evidence;
- every successful page has a stable source ID, final URL, bounded text/excerpt, retrieval timestamp, and receipt;
- every failure has a typed state and sanitized reason;
- the provider-disabled suite remains useful and makes zero live calls;
- the approved live smoke passes within 1 provider request and $0.10, or its limitation is preserved honestly;
- Phase 3 corpus/retrieval hashes remain unchanged;
- dependency audit, supply-chain denylist, lint, typecheck, tests, and production build pass;
- bundle-size change and live latency/cost evidence are recorded in `docs/PHASE_4_RESULT.md`;
- live-call scripts are locked;
- the exact passing commit is pushed to the existing private `origin/main` and the worktree is clean.

Stop after this gate. Do not begin Phase 5 or wire either tool into the agent/UI.

## Rollback

Phase 4 is additive. Roll back to the Phase 3 commit and remove the Phase 4-only dependencies, source modules, tests, fixtures, reports, and result document. Transcript source/processed/retrieval artifacts remain untouched.

## Primary references checked 2026-08-23

- OpenRouter web-search server tool: https://openrouter.ai/docs/guides/features/server-tools/web-search
- Mozilla Readability: https://github.com/mozilla/readability
- Readability CVE-2025-2792 fix: https://github.com/mozilla/readability/security/advisories/GHSA-3p6v-hrg8-8qj7
- Undici: https://github.com/nodejs/undici
- Undici dispatcher/client controls: https://github.com/nodejs/undici/blob/main/docs/docs/api/Dispatcher.md and https://github.com/nodejs/undici/blob/main/docs/docs/api/Client.md
- ipaddr.js: https://github.com/whitequark/ipaddr.js
- OWASP SSRF prevention: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
