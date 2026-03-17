# Admin App

Separate admin observability UI for learned routes.

## Run

```bash
node admin/server.mjs
```

Open `http://localhost:4174`.

## Requirements

- API server running (`npm run dev` or built server)
- `DATABASE_URL` configured if you want Slack HITL thread metrics/history to persist across refreshes
- Trigger.dev API reachable at `TRIGGER_API_URL` if you want the `Run Watch` panel to populate
- Admin auth configured in API env:
  - `ADMIN_ALLOWED_IPS` and/or
  - `ADMIN_API_TOKEN`

## Auth flow

- `admin/server.mjs` loads `.env` automatically.
- The browser UI no longer asks for `ADMIN_API_TOKEN`.
- The admin app proxies `/admin/*` requests through `/_admin_proxy/*`.
- If `ADMIN_API_TOKEN` is present in `.env`, the proxy adds `Authorization: Bearer <token>` server-side.
- The `API Base URL` field still controls which backend the proxy targets.

## UI structure

- Sidebar navigation for separate dashboard, learned-routes, activity-feed, run-watch, and slack-hitl pages inside the admin workspace.
- Compact hero/header with a refresh action and an `i` info control for API base, auth state, and workspace status.
- Summary cards for route inventory, storage health, backfill, and export actions.
- Dashboard page for summary cards and high-level overview only.
- Learned-routes page for route filters and the full route explorer table.
- Activity-feed page for route lifecycle events.
- Run-watch page for Trigger run visibility.
- Slack-hitl page for the latest tracked `SLACK_ADMIN_HITL_CHANNEL` messages, including direct Slack notifications, response counters, and route-added outcomes.
- Route inspection now opens in a modal instead of rendering inline under the table.

The shell is designed so new admin features can be added section by section without replacing the whole page.
