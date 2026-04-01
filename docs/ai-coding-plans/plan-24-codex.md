# Codex Plan 24 — Route Human Review and Monitoring Alerts to Dedicated Slack Channels

Date: 2026-03-09
Status: Completed

1. Refactor delivery notification logic
- For `needsHumanReview`, force Slack recipient to `SLACK_DEFAULT_CHANNEL`.
- For any issues (or failed subtask results), emit monitoring Slack notification to `SLACK_MONITORING_CHANNEL`.

2. Strengthen typed contract
- Add optional `issues` and `needsHumanReview` fields to `AgencyResult` for explicit handling.

3. Add tests
- Cover channel selection and issue-triggered monitoring notification behavior.

4. Update docs
- Update `.env.example`, `docs/usage-guide.md`, and `docs/HANDOVER.md`.

5. Persist
- Mark plan completed, commit, and push to `main`.
