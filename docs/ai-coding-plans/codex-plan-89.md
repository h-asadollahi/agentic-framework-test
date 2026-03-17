# Codex Plan 89

Status: Implemented (2026-03-17)

## Goal
Add a Slack HITL admin view that shows the latest tracked Slack threads, response/addition metrics, and enough backend persistence to survive refreshes.

## Root Cause
- The admin UI currently shows routes, route events, and Trigger runs, but has no visibility into Slack human-in-the-loop activity.
- Slack escalations and route-learning prompts are sent and polled successfully, but there is no audit table or admin API to answer questions like "how many responded?" or "how many turned into added routes?".
- Refreshing the admin UI cannot reconstruct those metrics without a durable store.

## Changes
1. Add a Postgres-backed Slack HITL audit table beside the learned-route tables.
2. Track Slack thread lifecycle transitions for escalations and route-learning flows.
3. Add admin endpoints for Slack summary metrics and latest tracked messages, defaulting to `SLACK_ADMIN_HITL_CHANNEL`.
4. Add a dedicated `Slack HITL` admin page with counters and latest-thread history.
5. Update tests and docs for the new admin observability surface.

## Acceptance Criteria
- The admin API returns Slack HITL counters for tracked threads, including responded and route-added counts.
- The admin UI has a dedicated Slack page that shows latest tracked messages and summary counters.
- New route-learning Slack replies that lead to learned routes are visible as both responded and added.
- The feature remains safe when DB-backed admin storage is unavailable.

## Result
- Added `slack_hitl_threads` persistence alongside the learned-route tables.
- Tracked Slack escalation and route-learning lifecycle transitions into that table.
- Added `GET /admin/slack/summary` and `GET /admin/slack/messages`, defaulting to `SLACK_ADMIN_HITL_CHANNEL`.
- Added a dedicated `Slack HITL` admin page with counters plus latest tracked threads.
- Covered the new admin routes with unit tests and kept the no-DB fallback safe.
