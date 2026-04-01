# Codex Plan 90

Status: Implemented (2026-03-17)

## Goal
Replace the outdated usage-guide admin-HITL validation prompt with wording that actually triggers `SLACK_ADMIN_HITL_CHANNEL` in a live run.

## Root Cause
- The old usage-guide prompt was too vague and underspecified.
- In live use it led to a clarification response instead of `needsHumanReview` and an admin HITL Slack notification.
- A guide prompt should be validated against the current pipeline behavior, not just intended behavior.

## Changes
1. Live-test candidate admin-HITL prompts against the local pipeline.
2. Keep the prompt that produced a real admin HITL Slack notification.
3. Update `docs/usage-guide.md` to use the verified wording and expectation.
4. Record the doc update in `docs/HANDOVER.md`.

## Acceptance Criteria
- The replacement prompt is verified in a local run before documentation is changed.
- `docs/usage-guide.md` no longer recommends the old non-triggering admin-HITL prompt.
- The updated guide expectation reflects current behavior honestly.

## Result
- Verified a replacement prompt with local run `run_cmmumnpw2002639nn4f00px2t` / root `run_cmmumnjbs002039nnji28v9fc`.
- Confirmed the deliver output included a Slack notification to `brand-cp-admin-hitl`.
- Updated the usage guide to use the verified prompt and clarified that additional monitoring alerts may also appear depending on failures.
