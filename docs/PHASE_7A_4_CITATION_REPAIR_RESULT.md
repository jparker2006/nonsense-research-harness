# Phase 7A.4 citation repair result

Status: **DETERMINISTIC REPAIR GATE PASSED; REPLACEMENT USER LIVE RUN PENDING** on 2026-08-25 HST.

## Observed failure

Jake submitted the frozen Phase 7A.4 localhost acceptance prompt. The live run successfully:

- read both supplied articles;
- searched the current web across four results;
- read three additional articles;
- checked the Nonsense archive and honestly returned no match;
- used eight accounted provider requests, `$0.0422`, and no automatic retry.

The run then failed safely before rendering its answer with `phase7a_invalid_citation`. Luna's final response referred to an identifier outside the retrieved usable-evidence set. The strict server validator correctly refused to display an unsupported citation. The browser console remained clean, and collected evidence stayed in the bounded session workspace.

An initial repair hid opaque IDs and asked Luna to return short aliases, but its provider schema still accepted any string. The first replacement run repeated the same safe terminal failure after five article reads, one archive search, eight requests, and `$0.0415`. That failed replacement is preserved as evidence that prompt guidance alone was insufficient.

## Root cause

The original controller prompt asked Luna to copy long opaque internal source IDs into claim-level response blocks while also showing unread web candidates with their own source IDs. Replacing those with aliases improved the prompt, but the static JSON schema still defined citations as arbitrary strings. The distinction remained prompt guidance rather than a provider-enforced output constraint.

## Repair

- Code now assigns deterministic short aliases (`evidence_1`, `evidence_2`, and so on) only to usable evidence included in the controller view.
- The controller prompt no longer exposes internal evidence source IDs.
- Recent conversation citations are projected through the same aliases.
- Unread web candidates retain the URL and metadata needed for `read_url` but expose no citeable identifier.
- Luna returns the exact short aliases in response blocks; the server maps recognized aliases back to exact stored source IDs before the existing strict validation and browser stream.
- Every controller request now builds a strict response schema whose citation enum contains only the usable aliases available on that turn. With no usable evidence, the schema permits only an empty citation array.
- Unknown aliases, unread candidates, unavailable sources, and invented IDs still fail closed. No citation is silently dropped, and no automatic model retry was added.

## Verification

- Added a regression using realistic opaque retrieved and unread-candidate IDs.
- Proved the controller prompt contains `evidence_1` but neither internal ID.
- Proved the OpenRouter controller adapter maps the alias back to the exact retrieved source.
- Proved the full agent turn completes in one controller request with the exact internal citation and no `phase7a_invalid_citation` limitation.
- Proved an unrecognized alias is rejected as an invalid controller transport before it can reach the agent citation validator.
- Focused Phase 7A suite: **41/41 tests passed**.
- Lint and TypeScript: **passed**.
- Full `pnpm gate`: **passed** — supply-chain denylist, lint, typecheck, 24 files and 207 tests, and the Next.js 16.3.2 production build.
- Localhost reload: **passed** — the repaired app returned to the ready conversation state with no browser warning or error logs.
- No paid provider request was made during diagnosis or repair; repair spend is **$0.00**.

Jake owns the replacement paid acceptance run using the same prompt.
