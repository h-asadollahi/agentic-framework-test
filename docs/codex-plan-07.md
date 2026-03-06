# Codex Plan 07 — Learned Routes as Single Source of Truth

Date: 2026-03-06
Status: Completed

1. Remove static cohort routing fallback
- Revert cohort-specific hardcoded safeguards added in `think.ts` / `execute-routing.ts` / `execute.ts`.
- Keep generic unknown-task flow driven by learned routes + fallback chain.

2. Extend learned-routes schema for dynamic sub-agent routes
- Add route target type support in `learned-routes-schema.ts`:
  - API route target (existing behavior)
  - Sub-agent route target (new behavior, e.g., `cohort-monitor`)
- Maintain backward compatibility for existing API-only route entries.

3. Wire execution to learned route target type
- In `execute.ts`, when a learned route matches:
  - If target is API → execute via `api-fetcher` (existing behavior)
  - If target is sub-agent → execute the specified sub-agent with mapped/default input

4. Add VIP cohort learned route entry
- Update `knowledge/learned-routes.json` to include a learned route for:
  - \"How is our VIP cohort performing this quarter?\"
  - target: `cohort-monitor` with suitable default input

5. Tests and docs
- Update unit tests for routing strategy and learned-route schema handling.
- Update `docs/HANDOVER.md` with the new source-of-truth routing model.

6. Validate and persist
- Run `npm test` and `npx tsc --noEmit`.
- Mark this plan completed, commit, and push to `main`.
