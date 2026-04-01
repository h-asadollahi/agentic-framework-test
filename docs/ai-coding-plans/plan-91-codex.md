# Codex Plan 91

Status: Implemented (2026-03-17)

## Goal
Make the Slack admin page show direct Slack notifications sent through `send-notification`, not just threaded escalation and route-learning flows.

## Root Cause
- The admin UI was reading `slack_hitl_threads`, but only the threaded Slack flows wrote to that audit table.
- Deliver-stage admin HITL notifications use the generic Slack channel adapter, so they reached Slack successfully but never appeared in the admin UI.
- The page copy also implied it only handled "threads", which no longer matched the broader observability goal.

## Changes
1. Extend the Slack audit model to support `notification` entries in addition to threaded HITL kinds.
2. Persist direct Slack sends from the Slack channel adapter into the audit store.
3. Update Slack admin summaries so plain notifications do not inflate pending-response counts.
4. Refresh the admin UI wording to show tracked Slack messages, not only threads.
5. Add focused tests for the Slack channel audit behavior.

## Acceptance Criteria
- A direct Slack notification to `SLACK_ADMIN_HITL_CHANNEL` is written to the admin audit store.
- The admin Slack page can list those notifications after refresh.
- Response-oriented counters remain meaningful for threaded flows.

## Result
- Direct Slack notifications are now recorded as `kind: "notification"` in the audit store.
- The Slack admin page now talks about tracked messages and includes a direct-notifications counter.
- Added a focused unit test for the Slack channel audit path and kept admin-route tests green.
