# Codex Plan 33

1. Refactor notification routing policy to separate marketer monitoring from admin channels:
   - `SLACK_MARKETERS_MONITORING_CHANNEL` for marketer-facing monitoring issues.
   - `SLACK_MONITORING_CHANNEL` for admin/system failures.
   - `SLACK_HITL_CHANNEL` for admin human-review escalations.
2. Add deterministic normalization for Interface-generated Slack notifications so recipients are rewritten to the correct channel based on issue type/severity.
3. Tighten HITL escalation criteria to avoid admin HITL notifications for non-critical marketer issues.
4. Update tests for new routing rules and channel fallbacks.
5. Update `.env.example`, usage docs, and handover, then run tests.
