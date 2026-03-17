# Codex Plan 93

Status: Completed (2026-03-17)

## Goal
Remove the bad Anthropic usage routes that were accidentally learned for admin token-usage prompts, harden admin observability routing so plural/provider phrasing maps to the built-in telemetry capability, and document the official token-usage options for Anthropic, OpenAI, and Gemini.

## Root Cause
- The deterministic admin observability matcher in `src/trigger/think.ts` only matched singular `llm`, so prompts using `LLMs` fell through to generic cognition.
- Generic admin observability subtasks then entered the unknown-subtask learned-route flow and created invalid provider routes through Slack HITL.
- The resulting routes (`route-012`, `route-013`, `route-014`) point to an Anthropic endpoint without the required auth/header handling and should not exist as learned routes.
- The project needs a documented provider-by-provider token-usage path before expanding the admin token usage feature beyond forward-only internal telemetry.

## Changes
1. Broaden deterministic admin token-usage intent detection to catch plural and provider-oriented wording.
2. Add a defensive execute-stage fallback so admin token-usage subtasks do not enter `learn-route`.
3. Delete the bad learned routes (`route-012`, `route-013`, `route-014`) directly from the persisted store.
4. Add targeted regression coverage for the new token-usage matching behavior.
5. Update operational docs with the cleanup and the official provider token-usage research notes.

## Acceptance Criteria
- Admin prompts like “Give me the daily token usage across all the LLMs used for this project by marketers” route to `token-usage-monitor`.
- Admin token-usage prompts do not trigger `learn-route` when deterministic matching misses.
- `route-012`, `route-013`, and `route-014` are removed from the learned route store.
- Docs clearly explain what token-usage data can be sourced from Anthropic, OpenAI, and Gemini.

## Validation
- `npm test -- tests/unit/admin-observability-routing.test.ts tests/unit/execute-fast-path.test.ts tests/unit/admin-routes.test.ts`
- `npx tsc --noEmit`
