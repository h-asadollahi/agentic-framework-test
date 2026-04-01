# codex-plan-80

Status: Implemented (2026-03-16)

1. Update `docs/usage-guide.md` to explain how to configure `ADMIN_API_TOKEN`.
2. Add practical examples:
   - how to generate a token
   - where to place it in `.env`
   - how the admin UI uses it
   - how to call `/admin/*` with `Authorization: Bearer ...`
3. Update `docs/HANDOVER.md` to record the documentation improvement.
4. Commit and push the docs-only change to `main`.

## Result

- Added a concrete `ADMIN_API_TOKEN` setup guide to `docs/usage-guide.md`.
- Documented:
  - token generation
  - `.env` configuration
  - bearer auth behavior
  - admin UI usage
  - direct `curl` example for `/admin/routes`
- Updated `docs/HANDOVER.md`.
