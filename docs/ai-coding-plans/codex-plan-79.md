# codex-plan-79

Status: Implemented (2026-03-16)

1. Make the admin UI explicitly show the learned-route source:
   - Surface whether the store is DB-backed or JSON fallback using `/admin/health`.
   - Add a visible status badge/banner in the admin UI so an administrator can immediately tell they are viewing live DB routes.

2. Improve the routes browser in the admin UI:
   - Expand the routes table with higher-signal DB route fields such as `workflowType`, `lastUsedAt`, `matchPatterns`, and target details.
   - Keep search/filter support and make the table clearly administrator-oriented rather than a raw debug dump.

3. Add route inspection workflow:
   - Add row selection and a route details panel fed by `/admin/routes/:routeId`.
   - Show full route metadata from DB in a human-readable format, plus raw JSON in a collapsible section for administrators.

4. Preserve the existing admin API contract where possible:
   - Reuse `/admin/routes` and `/admin/routes/:routeId`.
   - Only extend response shaping if needed for UI clarity.

5. Verification:
   - Run focused tests for admin routes.
   - Smoke-check the admin UI flow against the current local API.

6. Documentation and handover:
   - Update `docs/HANDOVER.md` with the UI enhancement and behavior.
   - Commit and push after implementation.

## Result

- Added an explicit DB/JSON source indicator in the admin UI using `/admin/health`.
- Expanded the routes table for administrator use with workflow, last-used, target, and pattern preview fields.
- Added a route details inspector backed by `/admin/routes/:routeId`, including raw JSON.
- Verified with:
  - `node --check admin/public/app.js`
  - `npm run test -- tests/unit/admin-routes.test.ts`
  - local admin UI smoke check via `admin/server.mjs`
