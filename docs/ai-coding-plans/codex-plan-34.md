# Codex Plan 34

1. Rename admin Slack env vars across runtime logic:
   - `SLACK_HITL_CHANNEL` -> `SLACK_ADMIN_HITL_CHANNEL`
   - `SLACK_MONITORING_CHANNEL` -> `SLACK_ADMIN_MONITORING_CHANNEL`
2. Add new `SLACK_MARKETERS_HITL_CHANNEL` for marketer human-review routing.
3. Refactor delivery notification logic:
   - marketer human review -> `SLACK_MARKETERS_HITL_CHANNEL`
   - admin human review -> `SLACK_ADMIN_HITL_CHANNEL`
   - marketer monitoring -> `SLACK_MARKETERS_MONITORING_CHANNEL`
   - admin monitoring -> `SLACK_ADMIN_MONITORING_CHANNEL`
4. Update interface prompt guidance, Slack/escalation defaults, tests, `.env`, `.env.example`, and usage docs.
5. Run full test suite, update handover, then commit and push.
