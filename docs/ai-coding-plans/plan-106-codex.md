# Plan 106 — Ignore / Reject False-Alarm HITL Threads

**Assistant:** Codex  
**Date:** 2026-04-01  
**Scope:** Allow Slack HITL flows to be explicitly ignored or rejected as false alarms instead of waiting for the full timeout.

## Problem
Current HITL flows are asymmetric:
- escalation HITL supports `approve` / `reject`
- route-learning HITL supports only `provide route info` or timeout

That means operators must either provide the requested info or wait for the timeout window, even when the HITL was a false alarm.

## Deliverables
1. Extend route-learning and escalation reply parsing with explicit ignore/dismiss/false-alarm decisions.
2. Return a deterministic non-learned/non-approved resolution immediately when a human dismisses the HITL.
3. Persist the ignored/dismissed outcome in Slack HITL audit rows.
4. Expose the new statuses cleanly in the admin Slack page.
5. Add tests for route-learning ignore and escalation ignore/reject handling.

## Approach
- Add new intent keywords for: `ignore`, `dismiss`, `false alarm`, `skip`, `not needed`, `no action`.
- Route-learning thread polling should stop immediately on those replies and return a resolved non-learned result instead of waiting.
- Escalation polling should treat those replies as an explicit rejection-like resolution with clearer messaging (`dismissed as false alarm`).
- Update Slack confirmation messages so the thread reflects the ignore/dismiss outcome.
- Add durable Slack HITL statuses like `dismissed` for auditing.
- Update the admin Slack UI tone/labels if needed.

## Validation
- Focused tests for Slack decision parsing and polling outcomes
- Build/test pass
- Manual verification guidance for Slack thread replies in both flows

## How to test
1. Trigger a route-learning HITL thread.
2. Reply in Slack thread with one of:
   - `ignore`
   - `false alarm`
   - `dismiss`
3. Confirm the task resolves immediately without waiting for timeout.
4. Trigger an escalation HITL thread.
5. Reply with `false alarm` or `no action needed`.
6. Confirm it resolves immediately as a non-approved/dismissed decision.
7. Confirm the admin Slack page shows the resolved status instead of `sent`/`timed_out`.
