# Standard Research v2 result

Status: **PASSED — deterministic gate and two watched browser acceptance runs complete**

Date: 2026-08-26 (Pacific/Honolulu)

Authoritative repository: `/Users/jakeparker/Desktop/Nonsense Podcast Project`

Started from local `main` commit `eff65951a826f1fbf5de43ba22b8531448e685b9`. The exact final local commit is reported in the handoff because a Git commit cannot contain its own hash. Nothing was pushed or deployed.

## Outcome

Ordinary Standard chat is now one GPT-5.6 Luna Max tool loop. It no longer invokes the Grok plan, review, answer, or fallback stages. Luna decides whether and how to use four server-owned tools, retains evidence for same-session follow-ups, and writes the final answer itself.

```text
ordinary browser message
  -> validated server-only chat route
  -> one GPT-5.6 Luna Max ToolLoopAgent
       search_web
         -> 1–6 adaptive queries in one action
         -> concurrent OpenRouter Exa searches
         -> full bounded candidate registry (60 maximum)
         -> small shortlist returned to Luna
       read_urls
         -> concurrent safe direct page reads
         -> honest partial Exa excerpt only when a page cannot open
       search_transcripts
         -> optional hybrid S3–S4 search
       open_transcript_chunks
         -> exact selected text plus bounded adjacent context
  -> time-reserved compact synthesis context
  -> server validates citation aliases and rejects raw IDs/tool protocol
  -> concise Markdown answer + clickable source drawer + exact receipt

explicit Headlines / Big Story request -> existing validated Grok brief path
Deep Research -> existing manager/worker graph with shared Exa/archive repairs
```

## Implemented behavior

- Added the active readable Standard prompt at `prompts/research-agent/STANDARD_AGENT.md`.
- Added `src/lib/research-agent/standard.ts`, a single native AI SDK `ToolLoopAgent` with the complete four-tool catalog and no Standard-path Grok call.
- Standard Exa discovery accepts up to six independent queries, runs them concurrently, returns up to ten results each, and preserves at most sixty de-duplicated candidates. Those are ceilings, not quotas.
- Full candidates remain in the server workspace; Luna receives only four candidates per query and 320 excerpt characters per candidate so final synthesis does not reread the entire search corpus.
- Direct page reads remain SSRF-safe. If a discovered page is blocked but Exa supplied an extractive citation excerpt, that excerpt can become explicitly partial evidence with `search_excerpt_fallback`; the UI and final prompt disclose that the page itself was not opened.
- Standard can open at most five web sources, make one archive search, and open three exact archive chunks. It stops starting slow tools when their time reserve would consume the synthesis runway.
- At synthesis, accumulated candidate/tool chatter is dropped. Luna receives the current question, opened/partial evidence, and the exact valid citation aliases in a compact final context.
- The server rejects missing/unknown aliases, raw internal source IDs, empty/oversized answers, and leaked `to=functions...` or tool-protocol text.
- The current date is injected into every Standard prompt. Time-sensitive questions must search the current month/year and distinguish event date from publication date.
- Regulatory questions must establish jurisdiction, legal force, scope, and effective dates; distinguish proposals/notices/guidance/law; and include an official source in the first search/read pass when reasonably available.
- Exact transcript opening now returns bounded adjacent chunks without changing the citeable exact chunk. Reranker-empty results degrade honestly to `hybrid_unreranked` rather than a false no-match.
- Ordinary Standard uses Luna only. Explicit briefs retain Grok, and Deep Research retains the manager/worker graph.

## Frozen limits

| Boundary | Standard value |
| --- | ---: |
| Exa searches | 6 |
| Results per search | 10 |
| Total candidates | 60 |
| Candidates shown to Luna per query | 4 |
| Safe URL reads | 5 |
| Transcript searches | 1 |
| Exact transcript opens | 3 |
| Agent steps | 12 |
| Provider requests | 24 |
| Research cutoff | 50 seconds, with per-tool start reserves |
| Hard deadline | 90 seconds |
| Target cost | $0.20 |
| Per-run ceiling | $0.50 normally; accepted proof ran under a stricter $0.40 override |

## Deterministic verification

The final `pnpm gate` passed:

- supply-chain denylist: 144 known-bad versions checked, clean;
- ESLint: passed;
- TypeScript `--noEmit`: passed;
- Vitest: 26 test files, **247 tests passed**;
- Next.js 16.3.2 production build: passed with static `/` and dynamic `/api/chat`.

The Standard suite proves the live route seam, Luna-only routing, concurrent six-query execution, sixty-candidate enforcement, shortlist compaction, safe source opening, partial Exa excerpt fallback, current-date injection, time-reserved synthesis, exact archive opening, follow-up evidence reuse, citation rejection, tool-protocol rejection, classified one-time transient retry, and honest no-match/unavailable states.

No file under `data/` changed. Canonical hashes remain:

| Artifact | SHA-256 |
| --- | --- |
| `data/processed/episodes.jsonl` | `4ceea4085e0bbe36513706f42a7bedf0008ee4b02b52fd7d695b69f585fe219a` |
| `data/processed/segments.jsonl` | `a774dc9e6a1de562105a64c72853ca30ade7bdd54c7e8f84c869eaf6bc8e5155` |
| `data/retrieval/chunks.jsonl` | `c5667e392c8b242ab96c55b1b0f4c10d0dc74e883940cde0c1b78e433f3ecfd8` |
| `data/retrieval/bm25-index.json` | `c58293b55a95aad89621872b9387a285ab7355979fc752269a4fdf76ca7c4e02` |
| `data/retrieval/embeddings.f32` | `ed72ac74f763c9eaab7443400f4a481ae703882b8d20926c0efc5b6f2fc05961` |
| `data/retrieval/manifest.json` | `a626743a0a24218bfe1052323aa09519411e382ba336d82d0cda693cffa898e9` |

## Watched browser acceptance

Every run was watched to a terminal UI state. Failures were preserved rather than silently retried. Total reported live spend was **$0.7827**, below the authorized $1.50 aggregate ceiling and far below the earlier $3.00 project allowance.

### Accepted current-web case

Prompt:

> What's going on with the new ultra-processed food rules? Is this actually a big deal?

Visible receipt:

- status: `Ready · limitations noted`;
- elapsed: **1m 2s**;
- reported cost: **$0.0602**;
- provider requests: **17**;
- six Exa searches, 53 de-duplicated candidates, and five source-read attempts;
- five clickable sources: two HHS pages, AP, NBC News, and the Regulations.gov RFI text;
- one direct page restriction was preserved; a limited Exa excerpt was visibly labeled as the fallback;
- archive search was not started after its time reserve, so the answer synthesized instead of becoming a four-minute Deep run.

The answer led with the conclusion that the story combines a proposed GRAS-notification change and a still-nonbinding federal UPF-definition process, not an immediate nationwide ban. It separated present legal force from possible downstream significance and uncertainty around the UPF category. Every material section carried server-validated clickable citations, including opened/partial federal primary sources.

### Human comparison to the supplied Opus answer

The supplied Opus answer remained the human reference only; Opus was never called through an API.

| Dimension | Result |
| --- | --- |
| Conclusion first | Pass; both answers immediately distinguish policy direction from an operative ban. |
| Clarity/relevance | Pass; the harness is similarly direct and keeps the GRAS and UPF-definition tracks separate. |
| Current legal status | Pass; the harness distinguishes proposal, definition work, and immediate consumer effect. |
| Primary evidence | Harness advantage; HHS and Regulations.gov are visible, clickable records. |
| Claim traceability | Harness advantage; every substantive section resolves to stored sources. |
| Breadth/compression | Opus advantage; the reference fits more state/Congress examples into slightly tighter prose. |
| Overall frozen rubric | **Pass for this product:** no worse on the question's core conclusion and materially stronger on grounding/source transparency. This is not a claim that Luna is universally smarter than Opus. |

### Accepted archive-heavy case

Prompt:

> Have CJ and Jeff talked before about ultra-processed foods, food additives, or government food rules? Check the Nonsense archive and tell me what past coverage would actually help with this story.

Visible receipt:

- status: `Ready · limitations noted`;
- elapsed: **23s**;
- reported cost: **$0.0082**;
- provider requests: **6**;
- one archive search and three exact opened passages;
- citations to S4E30 and S4E29.

The answer correctly treated S4E30's PFAS/cookware discussion as useful only for food-contact chemicals and regulatory substitution, not as evidence that the hosts had already covered UPFs. It labeled S4E29 as peripheral industrial-food context and explicitly said no clear archive hit established earlier UPF or food-rule coverage. No speaker labels were invented.

## Preserved failure evidence and repairs

| Failure | Evidence | Repair |
| --- | --- | --- |
| Live model call rejected before billing | `0 requests · $0.0000`; OpenRouter reported no endpoint for the requested parameters | Removed unsupported `parallel_tool_calls` from the strict Luna route. |
| Serial search consumed the full deadline | `1m30s · 12 requests · $0.0803`; six serial searches, one candidate | Batched independent queries concurrently. |
| Beta server tool returned no proved search | `1m30s · $0.0919` and `1m29s · $0.1391`; zero candidates / HTTP errors | Moved Exa discovery to OpenRouter's deterministic web-plugin transport. |
| Luna printed tool protocol during forced synthesis | Visible `to=functions...` prose | Added fail-closed protocol validation and explicit no-tool synthesis instructions. |
| Search breadth starved synthesis | `1m30s · $0.0813` and `1m30s · $0.0664` after real 60-result retrieval | Added small Standard tool ceilings, per-tool time reserves, and compact candidate projection. |
| Final context remained too large | `1m12s · $0.0671`; answer omitted aliases | Rebuilt the final step from current evidence only and injected exact valid aliases. |
| Grounded answer was stale or too cautious | `$0.0644`, `$0.0638`, and `$0.0600` exploratory proofs | Added legal-status policy, honest Exa excerpt fallback, and exact current-date/freshness instructions. |

## Honest limitations

- The working OpenRouter Exa path uses the legacy [`web` plugin](https://openrouter.ai/docs/guides/features/plugins/web-search) because the beta [`openrouter:web_search` server-tool](https://openrouter.ai/docs/guides/features/server-tools/web-search) path was ignored or rejected in watched Luna calls. OpenRouter documents the plugin as deprecated. This should be revisited when the server tool is reliably compatible with the chosen Luna route; it is not hidden as a permanent ideal.
- An Exa excerpt fallback is partial evidence, not proof that the full page was opened. The source ledger and visible limitation preserve that distinction.
- Standard remains probabilistic. The accepted frozen case establishes a working bounded architecture, not a guarantee that every wording will beat a stronger frontier model.
- Session memory remains process-local and is lost on restart. No database, account system, deployment, or cross-device history was added.
- Archive retrieval covers only the available 59 Season 3–4 episodes and has no speaker attribution. `hybrid_unreranked` is shown honestly when reranking cannot be trusted.
- Explicit briefs still use the separately validated Grok path. Deep Research still uses the manager/worker graph; neither was redesigned here.

## Scope held

No source transcript, processed corpus record, retrieval artifact, dependency, hosted service, account, deployment, persistence layer, broad UI redesign, new model, Opus call, or public corpus exposure was added. No push occurred.
