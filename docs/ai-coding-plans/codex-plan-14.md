# Codex Plan 14 — Fix `mapp-michel` MCP Configuration

Date: 2026-03-09
Status: Completed

1. Diagnose MCP config path
- Inspect current MCP client configuration behavior for named servers.
- Confirm why `mapp-michel` is missing at runtime.

2. Implement runtime fix
- Add auto-registration path for `mapp-michel` from `.env` credentials.
- Ensure it works with existing learned routes without manual JSON changes.

3. Verify and document
- Run typecheck/tests impacted by MCP changes.
- Update `docs/HANDOVER.md` with the fix and required env vars.

4. Persist
- Mark this plan completed.
- Commit and push to `main`.
