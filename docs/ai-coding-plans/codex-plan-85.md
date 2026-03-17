# Codex Plan 85

Status: Implemented (2026-03-17)

## Goal
Fix the admin dashboard refresh failure caused by the run summary panel returning `502 Bad Gateway`.

## Root Cause
- The admin backend fetch for Trigger run summaries uses the wrong list endpoint.
- `src/admin/routes.ts` currently calls `${TRIGGER_API_URL}/api/v3/runs?limit=...`.
- The installed Trigger SDK uses `/api/v1/runs` for run listing and `/api/v3/runs/:id` only for single-run retrieval.
- On the local Trigger instance, `/api/v3/runs` returns `404`, which the admin API wraps into a `502` and surfaces during dashboard refresh.

## Changes
1. Update the admin run summary fetch to use Trigger's working run list endpoint and pagination shape.
2. Add a regression test that locks the outbound Trigger URL so this version mismatch does not reappear.
3. Update handover and usage/admin docs with the fix and the runtime dependency note for the run watch panel.

## Acceptance Criteria
- `GET /admin/runs/summary` succeeds when the local Trigger API is available.
- The admin dashboard refresh no longer fails because of the incorrect Trigger run list endpoint.
- A unit test verifies the admin backend requests `/api/v1/runs` for run summaries.

## Result
- Updated the admin run summary fetch to call Trigger's working `/api/v1/runs` list endpoint with `page[size]` pagination.
- Added a regression test that locks the outbound admin summary request to `/api/v1/runs`.
- Verified the live proxied admin endpoint returns `200 OK` with run summary data again.
