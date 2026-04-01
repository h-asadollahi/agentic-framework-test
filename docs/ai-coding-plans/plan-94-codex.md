# Codex Plan 94

Status: Completed (2026-03-17)

## Goal
Add prompt-centric token telemetry on top of the existing per-model usage events, update `token-usage-monitor` to answer from DB-backed prompt aggregates plus provider/model detail, and ship a dedicated `Token Usage` page in the admin UI.

## Root Cause
- The repo already records per-agent/per-sub-agent token usage in `llm_usage_events`, but that data is optimized for model-call detail, not one-row-per-user-prompt reporting.
- Admin token reporting currently aggregates call-level rows only, so there is no prompt history table with the original request text and summed input/output/total tokens.
- The admin UI only exposes lightweight token metrics inside `Admin Chat`, not a dedicated operational page for telemetry review.

## Changes
1. Add a new prompt-level telemetry table (`llm_prompt_usage_runs`) and a stable `pipelineRunId` request-context field.
2. Create a prompt-usage row at orchestrator start, update it atomically from each successful LLM event, and finalize it on completed/failed/rejected outcomes.
3. Extend `llmUsageStore` and the admin API with prompt-centric summaries and prompt history listing.
4. Update `token-usage-monitor` and deterministic delivery formatting to use prompt totals/daily buckets while preserving provider/model breakdowns.
5. Add a dedicated `Token Usage` page in the admin UI and keep the smaller summary view in `Admin Chat`.
6. Cover the new telemetry flow with focused tests and update operational docs.

## Acceptance Criteria
- Every orchestrated marketer/admin request creates one prompt-usage row with original prompt text and summed input/output/total tokens.
- `llm_usage_events` remains intact and is linked to the prompt row via `pipelineRunId`.
- Admin token-usage prompts still route to `token-usage-monitor`, but the answers come from DB aggregation only.
- The admin UI has a dedicated token usage page with summary cards, daily breakdown, and recent prompt history.

## Validation
- `npm test -- tests/unit/admin-routes.test.ts tests/unit/deliver-fast-path.test.ts tests/unit/admin-observability-routing.test.ts tests/unit/llm-usage-store.test.ts`
- `npx tsc --noEmit`
- `node --check admin/public/app.js`
