# Codex Plan 60 — Learned Routes DB + Admin Observability

Date: 2026-03-10
Status: Implemented

## Summary
Implement the deferred plan from `codex-plan-xx-not-executed.md` by introducing a DB-backed learned-routes source of truth with migration tooling and admin observability endpoints/app, while preserving runtime compatibility.

## Implementation Steps
1. Add DB foundation (Drizzle + pg)
- Add dependencies and define learned-routes DB schema/tables:
  - `learned_routes`
  - `learned_route_events`
- Add DB config/env access helpers.

2. Refactor learned-routes persistence to DB-authoritative
- Update learned-routes store to:
  - read from DB when `DATABASE_URL` is set
  - keep in-memory cache for matching/summary
  - support `LEARNED_ROUTES_DUAL_WRITE_JSON` for temporary JSON dual-write
- Keep existing route-matching behavior and MCP-first tie-break.

3. Add migration/backfill and backup utilities
- Import `knowledge/learned-routes.json` into DB (preserve IDs).
- Export DB routes to JSON backup.

4. Add admin backend endpoints
- Add `/admin/*` endpoints with auth:
  - IP allowlist from `ADMIN_ALLOWED_IPS`
  - token fallback from `ADMIN_API_TOKEN`
- Endpoints for route CRUD, stats, events timeline, run-level summary.

5. Add separate admin app scaffold
- Add a small standalone admin app under `admin/` to inspect and manage routes/events.

6. Tests and docs
- Add tests for admin auth and migration utility.
- Extend learned-route store tests for DB/dual-write behavior (mocked repository path).
- Update docs (`usage-guide.md`, `HANDOVER.md`) and remove `codex-plan-xx-not-executed.md`.

## Acceptance
- DB becomes authoritative when configured.
- JSON dual-write works when enabled.
- Admin APIs return protected route/event/run observability data.
- Existing pipeline behavior remains compatible.
