# Admin App

Separate admin observability UI for learned routes.

## Run

```bash
node admin/server.mjs
```

Open `http://localhost:4174`.

## Requirements

- API server running (`npm run dev` or built server)
- `DATABASE_URL` configured if you want DB-backed brands, LLM usage telemetry, and Slack HITL thread metrics/history to persist across refreshes
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

- Sidebar navigation for separate dashboard, admin-chat, token-usage, learned-routes, activity-feed, run-watch, and slack-hitl pages inside the admin workspace.
- Compact hero/header with a refresh action and an `i` info control for API base, auth state, and workspace status.
- Summary cards for route inventory, storage health, backfill, and export actions.
- Dashboard page for summary cards and high-level overview only.
- Admin-chat page for operator prompts, brand-scoped admin sessions, telemetry summary cards, and trace/raw-response inspection.
- Token-usage page for prompt-level token summaries, daily breakdown, recent prompt history, and telemetry filters.
- Learned-routes page for route filters and the full route explorer table.
- Activity-feed page for route lifecycle events.
- Run-watch page for Trigger run visibility.
- Slack-hitl page for the latest tracked `SLACK_ADMIN_HITL_CHANNEL` messages, including direct Slack notifications, response counters, and route-added outcomes.
- Route inspection now opens in a modal instead of rendering inline under the table.

The shell is designed so new admin features can be added section by section without replacing the whole page.

## Admin chat

- The admin UI now has an `Admin Chat` page that calls authenticated `/admin/chat/*` endpoints.
- Admin chat requests run through the same Trigger.dev orchestrator, but with admin request context:
  - global when no brand is selected
  - brand-scoped when the brand selector is set
- The first shipped admin capability is deterministic LLM token-usage reporting backed by forward-only Postgres telemetry.
- Prompt-level token telemetry is now stored in `llm_prompt_usage_runs`, while provider/model detail remains in `llm_usage_events`.
- Marketer demo/API traffic now sends `brandId` explicitly, with `acme-marketing` as the seeded local default brand.
- Admin token-usage prompts are now matched defensively in both Cognition and Agency, so wording like `LLMs`, `OpenAI`, `Claude`, and `Gemini` no longer falls into Slack `learn-route`.
- On 2026-03-17, the bad Slack-learned routes `route-012`, `route-013`, and `route-014` were deleted from the live store after they were confirmed to be invalid Anthropic usage-report routes.
- The admin token-usage page is prompt-centric:
  - one row per executed admin/marketer prompt
  - original prompt text
  - input/output/total token sums
  - prompt status and timestamps
- Provider-specific notes for future admin token reporting:
  - Anthropic: the official Usage & Cost API is the right external source, but it expects admin-level access and the current local key did not work for that endpoint.
  - OpenAI: the official organization Usage/Costs APIs are the right external sources, but the current local key did not have access in the live check.
  - Gemini: the public Gemini API already returns `usageMetadata` on generation responses, and `countTokens` can be used for preflight estimation.
