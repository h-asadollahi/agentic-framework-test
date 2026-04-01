# codex-plan-65

1. Add missing learned-routes DB environment variables from `.env.example` into `.env`.
2. Use a local default `DATABASE_URL` aligned with the local Trigger/Postgres stack.
3. Keep `LEARNED_ROUTES_DUAL_WRITE_JSON=false` to avoid accidental JSON overwrite.
4. Update `docs/HANDOVER.md` with this config sync change.
