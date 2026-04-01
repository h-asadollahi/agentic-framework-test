# Codex Plan 08 — Add Mapp Analytics Learned Routes

Date: 2026-03-06
Status: Completed

1. Define analytics-oriented learned routes
- Add route entries to `knowledge/learned-routes.json` for common marketing analytics questions (cohort, conversion, retention, campaign performance, top channels).
- Use environment-template endpoint URLs based on `MAPP_ANALYTICS_API_URL`.

2. Wire secure credential templates
- Add route headers using env template placeholders:
  - `{{MAPP_ANALYTICS_API_CLIENT_ID}}`
  - `{{MAPP_ANALYTICS_API_CLIENT_SECRET}}`
- Keep all actual credential values out of repo.

3. Add parameterized query templates
- Use `{{input.*}}` placeholders for reusable inputs like date range, campaign, segment, and metric.

4. Update project handover
- Record the new learned-route coverage in `docs/HANDOVER.md`.

5. Validate and persist
- Validate JSON integrity and run `npm test`.
- Mark plan completed, commit, and push to `main`.
