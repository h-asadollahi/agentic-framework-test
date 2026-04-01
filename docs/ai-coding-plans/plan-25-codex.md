# Codex Plan 25 — Add Tests and Prompt Examples for Alert Routing

Date: 2026-03-09
Status: Completed

1. Add tests for delivery alert routing
- Verify monitoring channel fallback behavior when `SLACK_MONITORING_CHANNEL` is missing.
- Verify no monitoring alert is generated when there are no issues and no failures.
- Verify deduplication when a monitoring Slack notification already exists.

2. Add prompt examples in usage guide
- Add explicit prompts to validate:
  - human-review alert path (`SLACK_DEFAULT_CHANNEL`)
  - monitoring alert path (`SLACK_MONITORING_CHANNEL`)

3. Persist
- Update `docs/HANDOVER.md`.
- Mark plan completed.
- Commit and push to `main`.
