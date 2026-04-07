# Codex Plan 05 — Demo UI 405 Fix

Date: 2026-03-06
Status: Completed

1. Fix API base targeting in demo
- Update demo default API base from `http://localhost:3000` to `http://localhost:3001`.
- Add startup auto-detection (`/health`) across common local ports (`3001`, `3000`) and use the first healthy endpoint.

2. Improve trigger error diagnostics
- Include the active API base URL in the error text when `/message` fails.
- Keep existing behavior but make troubleshooting immediate for the user.

3. Documentation update
- Update `demo/README.md` with explicit API port guidance and fallback behavior.
- Update `docs/HANDOVER.md` with this fix.

4. Validate and persist
- Run `npm test` and `npx tsc --noEmit`.
- Mark plan complete, then commit and push to `main`.
