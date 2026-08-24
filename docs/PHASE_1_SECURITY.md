# Phase 1 security and compatibility record

Status: Phase 1 compatibility and security gate passed locally on 2026-08-23.

## Frozen decisions

- Runtime: Node.js `24.x`. Vercel currently supports Node 24 and Mastra 1.61.0 requires Node 22.13 or newer.
- Next.js: `16.3.2`; React and React DOM: `19.2.8`.
- Mastra: `@mastra/core@1.61.0` and `@mastra/ai-sdk@1.9.1`.
- UI transport: `@assistant-ui/react@0.15.16`, `@assistant-ui/react-ai-sdk@1.4.7`, and `ai@7.0.77`.
- Mastra is imported directly by the Next.js route. `@mastra/deployer-vercel` is not installed.
- Fallback if the spike fails: replace Mastra with LangGraph.js behind the same four tool contracts and UI event stream. Do not add both runtimes.
- No provider package, provider key, model call, hosted database, Vercel project, or deployment is part of Phase 1.

## Supply-chain controls

- The June 16-17 Mastra compromise added `easy-day-js` to malicious releases. The official Mastra incident report says 116 malicious versions were published; subsequent scope enumeration identified 143 affected Mastra releases plus the malicious dependency.
- `security/mastra-june-2026-denylist.json` records all 144 known-bad package versions in the reviewed public list. `pnpm security:denylist` fails if any appear in the frozen lockfile and separately rejects every occurrence of `easy-day-js`.
- Dependency versions are exact. pnpm delays releases for 1,440 minutes, rejects provenance downgrades for recent packages, blocks exotic transitive sources, and allows no dependency build script by default.
- Next 16.3.2 declares ESLint 10 compatibility, but its bundled `eslint-plugin-react@7.37.5` crashes while loading `react/display-name` under ESLint 10.9.0. Phase 1 therefore pins ESLint 9.39.1, the newest compatible major, and records npm's unsupported-version warning instead of masking a runtime failure with peer overrides. Recheck this pin before each dependency update.
- First installation procedure: resolve/download with scripts disabled, inspect every lifecycle script and native binary, then explicitly keep the one observed hook (`unrs-resolver`) blocked. Its optional native binary is already present, so no dependency build script is permitted.

## Primary references

- Mastra incident report: https://github.com/mastra-ai/mastra/issues/18061
- Mastra Next.js integration: https://mastra.ai/integrations/frameworks/next-js
- Mastra UI Dojo: https://github.com/mastra-ai/ui-dojo
- assistant-ui AI SDK v7 runtime: https://www.assistant-ui.com/docs/runtimes/ai-sdk/v7
- pnpm security settings: https://pnpm.io/settings
- Vercel Node versions: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Vercel function limits: https://vercel.com/docs/functions/limitations
- Reviewed affected-version list: https://safedep.io/mastra-npm-scope-takeover-supply-chain-attack/

## Verification record

- A fresh `pnpm install --frozen-lockfile` completed in the authoritative Desktop project. Dependency lifecycle scripts did not run; the reviewed `unrs-resolver` postinstall remains explicitly blocked.
- `pnpm audit --audit-level high` reported no known vulnerabilities.
- `pnpm security:denylist` found none of the 144 known-bad package versions and no occurrence of `easy-day-js` in the frozen lockfile.
- The complete `pnpm gate` passed: ESLint, TypeScript, 3 deterministic tests, and the optimized Next.js production build.
- A local production request to `/api/chat` returned HTTP 200 using the AI SDK event stream, identified `Mastra 1.61.0`, showed successful tool calls, a readable paywall failure, an artifact, completion, and `[DONE]`.
- The traced API function contains 1,079 files plus five traced package directories. The file payload is 25.61 MiB raw and 5.58 MiB gzip, well below Vercel's 250 MB uncompressed function limit.
- The production build emitted no application warnings. npm flags ESLint 9 as unsupported upstream; this reviewed compatibility pin remains the only known dependency warning.
- Mastra passed the spike and remains the selected workflow runtime. The LangGraph.js fallback is not installed.
- Provider spend was `$0`. No OpenRouter key, model request, hosted database, Vercel project, or deployment was created.
