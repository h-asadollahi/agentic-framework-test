# Plan 101 — Prevent Creative `general` Tasks from Being Hijacked by Learned API Routes

**Assistant:** Codex  
**Date:** 2026-04-01  
**Scope:** Stop broad DB-backed learned routes from overriding LLM creative/copy subtasks in `pipeline-execute`.

## Problem
A creative marketer request for Northline Fashion was decomposed into `general` subtasks. During `pipeline-execute`, a stale global API route (`route-011`) matched the creative subtask text and forced execution through `api-fetcher`, causing `fetch failed` on a placeholder endpoint.

## Root Cause
- `execute.ts` checked learned routes for every unknown `general` subtask.
- `resolveUnknownSubtaskStrategy()` immediately preferred any matched learned route.
- There was no guard to distinguish creative/copy generation tasks from genuine external-data retrieval tasks.
- The DB contained a broad invalid API route whose match patterns were generic enough to collide with unrelated work.

## Fix
1. Add a creative-task guard in `execute-routing.ts`.
2. Allow learned-route usage only when a `general` task either:
   - has explicit route context, or
   - actually looks like a retrieval/data task.
3. Keep valid MCP/data prompts working unchanged.
4. Add regression tests for both the blocked creative case and the preserved Mapp catalog case.

## Files Changed
- `src/trigger/execute-routing.ts`
- `src/trigger/execute.ts`
- `tests/unit/execute-routing.test.ts`
- `docs/HANDOVER.md`

## How to Test
1. Run `npm test -- tests/unit/execute-routing.test.ts`.
2. Run a direct logic check with the DB route store loaded:
   - confirm `findByCapability()` can still see the bad route
   - confirm `shouldUseMatchedLearnedRoute()` returns `false` for the creative subtask description
3. Re-run the creative prompt:
   - `Create a campaign concept for a softly tailored, below-knee knit dress in a neutral palette.`
4. Expect:
   - no `api-fetcher` call for task-1
   - no `route-011` takeover
   - the task falls back to LLM creative generation instead
