# Codex Plan 83

Status: Implemented (2026-03-17)

## Goal
Remove the manual admin token text input from the admin UI and let the admin app use `ADMIN_API_TOKEN` from `.env` automatically.

## Root Cause
- The current admin UI requires operators to paste the raw `ADMIN_API_TOKEN` into a browser input before it can call `/admin/*`.
- That creates unnecessary friction for local/admin use and encourages copying a sensitive token into the browser UI manually.
- Injecting the token directly into frontend code would work, but it would expose the secret to the browser.

## Changes
1. Update the admin UI server to load `.env` and proxy `/admin/*` requests server-side.
2. Attach `ADMIN_API_TOKEN` from the admin server process to proxied requests when configured.
3. Remove the token input from the browser UI and replace it with a server-auth status indicator.
4. Keep the API base configurable in the UI so the admin app can still target a chosen backend.
5. Update admin docs, usage guide, and handover to document the new server-side auth flow.

## Acceptance Criteria
- The admin UI no longer requires token entry in the browser.
- `ADMIN_API_TOKEN` is read from `.env` by the admin app when present.
- The token is not embedded in static frontend assets.
- The admin UI still supports route loading/backfill/export operations through the proxy path.

## Result
- `admin/server.mjs` now loads `.env`, serves `/admin-ui-config`, and proxies `/_admin_proxy/*` requests server-side.
- The admin proxy injects `Authorization: Bearer <ADMIN_API_TOKEN>` when configured.
- The manual token text input was removed from the browser UI and replaced with a server-auth status indicator.
- Admin docs, usage guide, and handover were updated to describe the new flow.
